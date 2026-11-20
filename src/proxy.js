'use strict';
// The YouTube part of shoo: a tiny proxy that only YouTube goes through.
//
// The Mac is told (with a proxy auto-config file, "PAC") to send just YouTube's
// own addresses here; everything else goes straight to the internet as usual.
// If shoo isn't running, browsers skip it and go straight to YouTube, so the
// internet never stops working because of shoo.
//
// For YouTube pages and the player's data, shoo reads the response, takes the
// ads out (see prune.js) and passes the rest on unchanged. Videos themselves
// come from other addresses and never pass through shoo.

const http = require('http');
const https = require('https');
const tls = require('tls');
const zlib = require('zlib');
const fs = require('fs');
const { pruneJson, pruneHtml } = require('./prune');

// The only addresses shoo looks at. Sign-in (accounts.youtube.com) and Studio go straight through.
const YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'www.youtube-nocookie.com', 'youtube-nocookie.com']);

const HOP = new Set(['connection', 'proxy-connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'proxy-authenticate']);

// Requests whose only job is ads: answer "nothing here" without asking YouTube.
const AD_ONLY = /^\/(pagead\/|api\/stats\/ads|get_midroll_info)/;

function kindOf(method, url) {
  const p = url.split('?')[0];
  if (/^\/youtubei\/v1\/(player|next|browse|search|guide|reel\/reel_watch_sequence|reel\/reel_item_watch)$/.test(p)) return 'json';
  if ((method === 'GET' || method === 'HEAD') && (p === '/' || /^\/(watch|results|feed\/|shorts\/|@|channel\/|c\/|user\/|embed\/|playlist|tv)/.test(p))) return 'html';
  return null;
}

/** The proxy auto-config file the Mac reads. */
function pac(port, youtubeOn = true) {
  if (!youtubeOn) return 'function FindProxyForURL(url, host) { return "DIRECT"; }\n';
  const hosts = [...YOUTUBE].map((h) => JSON.stringify(h)).join(', ');
  return [
    '// shoo: only YouTube goes through shoo (to take its ads out). Everything else goes straight to the internet.',
    '// If shoo is not running, YouTube goes straight there too ("DIRECT").',
    'function FindProxyForURL(url, host) {',
    `  var youtube = [${hosts}];`,
    '  host = host.toLowerCase();',
    '  for (var i = 0; i < youtube.length; i++) if (host === youtube[i]) return "PROXY 127.0.0.1:' + port + '; DIRECT";',
    '  return "DIRECT";',
    '}',
    '',
  ].join('\n');
}

function cleanHeaders(raw, drop = []) {
  const out = [];
  const skip = new Set([...HOP, ...drop]);
  for (let i = 0; i < raw.length; i += 2) if (!skip.has(raw[i].toLowerCase())) out.push(raw[i], raw[i + 1]);
  return out;
}

function decode(body, encoding) {
  switch ((encoding || '').trim().toLowerCase()) {
    case '': case 'identity': return body;
    case 'gzip': case 'x-gzip': return zlib.gunzipSync(body);
    case 'deflate': try { return zlib.inflateSync(body); } catch { return zlib.inflateRawSync(body); }
    case 'br': return zlib.brotliDecompressSync(body);
    default: return null; // something we can't read: pass it on untouched
  }
}

class Proxy {
  /**
   * @param {object} o
   * @param {number} o.port
   * @param {{certFor(host: string): string, key: string}} o.certs  host certificates (see ca.js)
   * @param {(req, res) => void} [o.local]  handles requests for shoo's own pages
   * @param {(n: number, where: string) => void} [o.onAds]  told each time ads are taken out
   */
  constructor({ port, certs, local, onAds }) {
    this.port = port;
    this.certs = certs;
    this.local = local || ((req, res) => { res.writeHead(404); res.end(); });
    this.onAds = onAds || (() => {});
    this.youtubeOn = true;
    this.contexts = new Map();
    this.served = 0;
    // For the tests only: where to find "YouTube", and an extra authority to trust for it.
    this.upstreamMap = process.env.SHOO_UPSTREAM ? JSON.parse(process.env.SHOO_UPSTREAM) : null;
    const extraCa = process.env.SHOO_UPSTREAM_CA ? fs.readFileSync(process.env.SHOO_UPSTREAM_CA, 'utf8') : null;
    this.agent = new https.Agent({ keepAlive: true, maxSockets: 32, ...(extraCa ? { ca: [...tls.rootCertificates, extraCa] } : {}) });

    this.server = http.createServer((req, res) => this.onRequest(req, res));
    this.server.on('connect', (req, socket, head) => this.onConnect(req, socket, head));
    this.server.on('clientError', (err, socket) => socket.destroy());
    this.mitm = http.createServer((req, res) => this.onYouTube(req, res));
    this.mitm.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head));
    this.mitm.on('clientError', (err, socket) => socket.destroy());
    this.mitm.keepAliveTimeout = 60000;
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => { this.server.off('error', reject); resolve(this); });
    });
  }

  close() {
    this.agent.destroy();
    this.mitm.close();
    return new Promise((r) => this.server.close(() => r()));
  }

  pac() { return pac(this.port, this.youtubeOn); }

  // Plain requests: shoo's own pages, the PAC file, or (rarely) http:// YouTube.
  onRequest(req, res) {
    if (/^https?:\/\//i.test(req.url)) {
      let u;
      try { u = new URL(req.url); } catch { res.writeHead(400); return res.end(); }
      if (!YOUTUBE.has(u.hostname.toLowerCase())) { res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('shoo only handles YouTube.\n'); }
      // http:// YouTube just says "use https", so send the browser there.
      res.writeHead(301, { location: `https://${u.host}${u.pathname}${u.search}` });
      return res.end();
    }
    if (req.url.split('?')[0] === '/proxy.pac') {
      res.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig', 'cache-control': 'no-cache' });
      return res.end(this.pac());
    }
    return this.local(req, res);
  }

  context(host) {
    if (!this.contexts.has(host)) {
      this.contexts.set(host, tls.createSecureContext({ key: this.certs.key, cert: this.certs.certFor(host), minVersion: 'TLSv1.2' }));
    }
    return this.contexts.get(host);
  }

  onConnect(req, socket, head) {
    socket.on('error', () => {});
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url || '');
    const host = m ? m[1].toLowerCase() : '';
    if (!m || m[2] !== '443' || !YOUTUBE.has(host)) {
      socket.end('HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain\r\n\r\nshoo only handles YouTube.\n');
      return;
    }
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) socket.unshift(head);
    let secure;
    try {
      secure = new tls.TLSSocket(socket, { isServer: true, secureContext: this.context(host), ALPNProtocols: ['http/1.1'] });
    } catch {
      socket.destroy();
      return;
    }
    secure.shooHost = host;
    secure.on('error', () => secure.destroy());
    this.mitm.emit('connection', secure);
  }

  target(host) {
    const mapped = this.upstreamMap && this.upstreamMap[host];
    if (!mapped) return { host, port: 443 };
    const [h, p] = mapped.split(':');
    return { host: h, port: Number(p) || 443 };
  }

  onYouTube(req, res) {
    const host = String(req.headers.host || req.socket.shooHost || '').split(':')[0].toLowerCase();
    if (!YOUTUBE.has(host)) { res.writeHead(421); return res.end(); }
    this.served++;
    if (this.youtubeOn && AD_ONLY.test(req.url)) { req.resume(); res.writeHead(204); return res.end(); }

    const kind = this.youtubeOn ? kindOf(req.method, req.url) : null;
    const headers = {};
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i];
      if (HOP.has(k.toLowerCase())) continue;
      headers[k] = headers[k] ? `${headers[k]}, ${req.rawHeaders[i + 1]}` : req.rawHeaders[i + 1];
    }
    if (kind) {
      for (const k of Object.keys(headers)) if (k.toLowerCase() === 'accept-encoding') delete headers[k];
      headers['accept-encoding'] = 'gzip, deflate, br';
    }
    const to = this.target(host);
    const up = https.request({ host: to.host, port: to.port, servername: host, method: req.method, path: req.url, headers, agent: this.agent });
    up.on('error', (e) => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`shoo couldn't reach YouTube: ${e.message}\nIf this keeps happening, turn off YouTube blocking in shoo.\n`);
    });
    req.pipe(up);

    up.on('response', (ur) => {
      const type = String(ur.headers['content-type'] || '');
      const readable = kind && ur.statusCode === 200 && (kind === 'json' ? /json/i.test(type) : /html/i.test(type));
      if (!readable || req.method === 'HEAD') {
        res.writeHead(ur.statusCode, ur.statusMessage, cleanHeaders(ur.rawHeaders));
        ur.pipe(res);
        return;
      }
      const chunks = [];
      let size = 0;
      ur.on('data', (c) => { size += c.length; chunks.push(c); });
      ur.on('error', () => res.destroy());
      ur.on('end', () => {
        let body = Buffer.concat(chunks);
        const raw = size < 40e6 ? decode(body, ur.headers['content-encoding']) : null;
        if (!raw) {
          res.writeHead(ur.statusCode, ur.statusMessage, cleanHeaders(ur.rawHeaders));
          return res.end(body);
        }
        const done = kind === 'json' ? pruneJson(raw.toString('utf8')) : pruneHtml(raw.toString('utf8'));
        if (done.removed) this.onAds(done.removed, req.url.split('?')[0]);
        body = Buffer.from(done.text, 'utf8');
        const out = cleanHeaders(ur.rawHeaders, ['content-length', 'content-encoding']);
        out.push('content-length', String(body.length));
        res.writeHead(ur.statusCode, ur.statusMessage, out);
        res.end(body);
      });
    });
  }

  // Live connections (rare on YouTube's pages): pass them straight through.
  onUpgrade(req, socket, head) {
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (!YOUTUBE.has(host)) return socket.destroy();
    const to = this.target(host);
    const up = tls.connect({ host: to.host, port: to.port, servername: host, ...(this.agent.options.ca ? { ca: this.agent.options.ca } : {}) }, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head && head.length) up.write(head);
      up.pipe(socket).pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  }
}

module.exports = { Proxy, pac, kindOf, YOUTUBE, decode };
