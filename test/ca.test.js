'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const tls = require('tls');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CA = require('../src/ca');

const authority = CA.makeAuthority();

test('the authority is a CA limited to YouTube', () => {
  const x = new crypto.X509Certificate(authority.cert);
  assert.ok(x.ca);
  assert.match(x.subject, /shoo YouTube-only/);
  assert.ok(x.verify(x.publicKey), 'self-signed');
});

test('it refuses to make certificates for anything but YouTube', () => {
  const certs = CA.issuer(authority);
  assert.throws(() => certs.certFor('www.google.com'), /only makes certificates for YouTube/);
  assert.throws(() => certs.certFor('youtube.com.evil.net'), /only/);
  assert.match(certs.certFor('www.youtube.com'), /BEGIN CERTIFICATE/);
});

test('a browser-style check accepts its YouTube certificate', async () => {
  const certs = CA.issuer(authority);
  const server = tls.createServer({ key: certs.key, cert: certs.certFor('www.youtube.com') }, (s) => s.end('hi'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const got = await new Promise((resolve, reject) => {
    const s = tls.connect({ port: server.address().port, host: '127.0.0.1', servername: 'www.youtube.com', ca: authority.cert }, () => {
      s.on('data', (d) => resolve(d.toString()));
    });
    s.on('error', reject);
  });
  assert.strictEqual(got, 'hi');
  server.close();
  server.unref();
});

test('even with its key, it can\'t vouch for another site (name constraints)', async () => {
  // make a certificate for google.com by hand with the authority's key (bypassing the refusal)
  const key = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  const fake = CA.makeLeaf('www.google.com', authority, key);
  const server = tls.createServer({ key: key.export({ type: 'pkcs8', format: 'pem' }), cert: fake + authority.cert }, (s) => s.end('nope'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const err = await new Promise((resolve) => {
    const s = tls.connect({ port: server.address().port, host: '127.0.0.1', servername: 'www.google.com', ca: authority.cert }, () => resolve(null));
    s.on('error', resolve);
  });
  assert.ok(err, 'the connection must be refused');
  assert.match(String(err.message), /permitted subtree/i);
  server.close();
  server.unref();
});

test('the authority is kept privately on disk and reused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoo-ca-'));
  const a = CA.loadAuthority(dir);
  const b = CA.loadAuthority(dir);
  assert.strictEqual(a.cert, b.cert);
  assert.strictEqual(fs.statSync(path.join(dir, 'youtube-only-ca.key')).mode & 0o777, 0o600);
  assert.match(a.fingerprint, /^[0-9A-F]{40}$/);
  fs.rmSync(dir, { recursive: true, force: true });
});
