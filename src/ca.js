'use strict';
// shoo's YouTube-only certificate authority.
//
// To take ads out of YouTube pages, shoo has to read them, and YouTube pages
// are encrypted. So shoo makes its own certificate authority on your Mac and
// asks an administrator to trust it. That authority is *name constrained*: it
// can only vouch for youtube.com and youtube-nocookie.com (and never for an IP
// address), so even if its key leaked it couldn't be used to fake your bank,
// your email or anything else. The key never leaves ~/.shoo.
//
// Node can make keys and signatures but not certificates, so this file writes
// the certificate bytes (ASN.1 DER) itself. It's small and fully tested.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALLOWED = ['youtube.com', 'youtube-nocookie.com'];

// ── ASN.1 DER ──────────────────────────────────────────────────────────────────

function len(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...parts) => tlv(0x30, Buffer.concat(parts));
const set = (...parts) => tlv(0x31, Buffer.concat(parts));
const ctx = (n, body, constructed = true) => tlv((constructed ? 0xa0 : 0x80) | n, body);
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const octets = (b) => tlv(0x04, b);
const bits = (b) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const ia5 = (s) => tlv(0x16, Buffer.from(s, 'ascii'));

function int(value) {
  let b = Buffer.isBuffer(value) ? value : Buffer.from([value]);
  while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function oid(dotted) {
  const p = dotted.split('.').map(Number);
  const out = [40 * p[0] + p[1]];
  for (const n of p.slice(2)) {
    const stack = [n & 0x7f];
    let v = Math.floor(n / 128);
    while (v > 0) { stack.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}

function time(d) {
  const z = (n, w = 2) => String(n).padStart(w, '0');
  const y = d.getUTCFullYear();
  const s = `${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
  return y < 2050 ? tlv(0x17, Buffer.from(z(y % 100) + s)) : tlv(0x18, Buffer.from(z(y, 4) + s));
}

const OID = {
  ecdsaSha256: '1.2.840.10045.4.3.2',
  cn: '2.5.4.3', org: '2.5.4.10',
  basicConstraints: '2.5.29.19', keyUsage: '2.5.29.15', extKeyUsage: '2.5.29.37',
  subjectAltName: '2.5.29.17', nameConstraints: '2.5.29.30',
  subjectKeyId: '2.5.29.14', authorityKeyId: '2.5.29.35', serverAuth: '1.3.6.1.5.5.7.3.1',
};

const name = (cn, org) => seq(set(seq(oid(OID.cn), utf8(cn))), ...(org ? [set(seq(oid(OID.org), utf8(org)))] : []));
const ext = (id, critical, value) => seq(oid(id), ...(critical ? [bool(true)] : []), octets(value));

/** KeyUsage bits, most significant first: digitalSignature(0) ... keyCertSign(5), cRLSign(6). */
function keyUsage(bitsOn) {
  let byte = 0;
  for (const b of bitsOn) byte |= 0x80 >> b;
  const unused = 7 - Math.max(...bitsOn);
  return tlv(0x03, Buffer.from([unused, byte]));
}

function keyId(publicKey) {
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  // the key's bits are the last part of the SPKI; hashing the whole SPKI is fine too (RFC 7093)
  return crypto.createHash('sha1').update(spki).digest();
}

function serial() {
  const b = crypto.randomBytes(16);
  b[0] = (b[0] & 0x7f) | 0x01; // positive and not zero
  return b;
}

function signCert(tbs, signingKey) {
  const sig = crypto.sign('sha256', tbs, signingKey); // DER ECDSA signature
  return seq(tbs, seq(oid(OID.ecdsaSha256)), bits(sig));
}

const pem = (der, label = 'CERTIFICATE') =>
  `-----BEGIN ${label}-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;

// ── the authority and its certificates ─────────────────────────────────────────

function nameConstraints() {
  const permitted = ALLOWED.map((d) => seq(ctx(2, Buffer.from(d, 'ascii'), false)));
  // and no IP addresses at all (v4 and v6): DNS limits alone don't cover them
  const noIp = [
    seq(ctx(7, Buffer.alloc(8), false)),
    seq(ctx(7, Buffer.alloc(32), false)),
  ];
  return seq(ctx(0, Buffer.concat(permitted)), ctx(1, Buffer.concat(noIp)));
}

function makeAuthority(now = new Date()) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const id = crypto.randomBytes(3).toString('hex');
  const subject = name(`shoo YouTube-only ${id}`, 'shoo on this Mac');
  const from = new Date(now.getTime() - 24 * 3600e3);
  const until = new Date(now.getTime() + 10 * 365 * 24 * 3600e3);
  const tbs = seq(
    ctx(0, int(2)),
    int(serial()),
    seq(oid(OID.ecdsaSha256)),
    subject,
    seq(time(from), time(until)),
    subject,
    publicKey.export({ type: 'spki', format: 'der' }),
    ctx(3, seq(
      ext(OID.basicConstraints, true, seq(bool(true), int(0))),
      ext(OID.keyUsage, true, keyUsage([5, 6])),
      ext(OID.nameConstraints, true, nameConstraints()),
      ext(OID.subjectKeyId, false, octets(keyId(publicKey))),
    )),
  );
  const der = signCert(tbs, privateKey);
  return { cert: pem(der), key: privateKey.export({ type: 'pkcs8', format: 'pem' }), name: `shoo YouTube-only ${id}` };
}

/** A certificate for one YouTube host, signed by the authority. Valid for 30 days. */
function makeLeaf(host, authority, leafKey, now = new Date()) {
  const caCert = new crypto.X509Certificate(authority.cert);
  const caKey = crypto.createPrivateKey(authority.key);
  const issuerName = subjectOf(caCert.raw); // the authority's own name, byte for byte
  const pub = crypto.createPublicKey(leafKey);
  const from = new Date(now.getTime() - 24 * 3600e3);
  const until = new Date(now.getTime() + 30 * 24 * 3600e3);
  const tbs = seq(
    ctx(0, int(2)),
    int(serial()),
    seq(oid(OID.ecdsaSha256)),
    issuerName,
    seq(time(from), time(until)),
    name(host),
    pub.export({ type: 'spki', format: 'der' }),
    ctx(3, seq(
      ext(OID.basicConstraints, true, seq()),
      ext(OID.keyUsage, true, keyUsage([0])),
      ext(OID.extKeyUsage, false, seq(oid(OID.serverAuth))),
      ext(OID.subjectAltName, false, seq(ctx(2, Buffer.from(host, 'ascii'), false))),
      ext(OID.subjectKeyId, false, octets(keyId(pub))),
      ext(OID.authorityKeyId, false, seq(ctx(0, keyId(caCert.publicKey), false))),
    )),
  );
  return pem(signCert(tbs, caKey));
}

// ── reading DER back (just enough to copy the authority's subject name) ───────

function readTlv(buf, at) {
  const tag = buf[at];
  let n = buf[at + 1];
  let head = 2;
  if (n & 0x80) {
    const k = n & 0x7f;
    n = 0;
    for (let i = 0; i < k; i++) n = n * 256 + buf[at + 2 + i];
    head += k;
  }
  return { tag, start: at, body: at + head, end: at + head + n };
}

function subjectOf(certDer) {
  const cert = readTlv(certDer, 0);
  const tbs = readTlv(certDer, cert.body);
  let at = tbs.body;
  const fields = [];
  while (at < tbs.end && fields.length < 6) { const f = readTlv(certDer, at); fields.push(f); at = f.end; }
  // version [0], serial, signature alg, issuer, validity, subject
  const subject = fields[0].tag === 0xa0 ? fields[5] : fields[4];
  return certDer.subarray(subject.start, subject.end);
}

// ── keeping it on disk ─────────────────────────────────────────────────────────

/** The authority kept in this folder (made the first time). Files are private to you. */
function loadAuthority(dir) {
  const certFile = path.join(dir, 'youtube-only-ca.pem');
  const keyFile = path.join(dir, 'youtube-only-ca.key');
  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    const cert = fs.readFileSync(certFile, 'utf8');
    const x = new crypto.X509Certificate(cert);
    return { cert, key: fs.readFileSync(keyFile, 'utf8'), name: (/CN=([^\n]+)/.exec(x.subject) || [])[1], file: certFile, fingerprint: x.fingerprint.replace(/:/g, '') };
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const made = makeAuthority();
  fs.writeFileSync(keyFile, made.key, { mode: 0o600 });
  fs.writeFileSync(certFile, made.cert, { mode: 0o644 });
  const x = new crypto.X509Certificate(made.cert);
  return { ...made, file: certFile, fingerprint: x.fingerprint.replace(/:/g, '') };
}

/** Makes (and remembers) host certificates for the proxy. */
function issuer(authority) {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const leafKey = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const made = new Map();
  return {
    key: leafKey,
    certFor(host) {
      host = host.toLowerCase();
      if (!allowedHost(host)) throw new Error(`shoo only makes certificates for YouTube, not ${host}`);
      if (!made.has(host)) made.set(host, makeLeaf(host, authority, privateKey) + authority.cert);
      return made.get(host);
    },
  };
}

function allowedHost(host) {
  return ALLOWED.some((d) => host === d || host.endsWith('.' + d));
}

module.exports = { makeAuthority, makeLeaf, loadAuthority, issuer, allowedHost, ALLOWED, _der: { seq, int, oid, time, subjectOf } };
