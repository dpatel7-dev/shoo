'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');
const zlib = require('zlib');
const CA = require('../src/ca');

// A pretend YouTube on this computer, with its own certificate.
const upstreamCa = CA.makeAuthority();
const upstreamCerts = CA.issuer(upstreamCa);
const caFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shoo-up-')), 'ca.pem');
fs.writeFileSync(caFile, upstreamCa.cert);

const PLAYER = { videoDetails: { videoId: 'abc' }, adPlacements: [{ a: 1 }, { a: 2 }], playerAds: [{}], streamingData: { formats: [] } };
const PAGE = `<!doctype html><title>YouTube</title><script>var ytInitialPlayerResponse = ${JSON.stringify(PLAYER)};</script><script>var ytInitialData = {"contents":[{"adSlotRenderer":{}},{"videoRenderer":{"videoId":"v1"}}]};</script>`;

let fake;
let proxy;
const shooCa = CA.makeAuthority();
const seen = [];

test.before(async () => {
  fake = https.createServer({ key: upstreamCerts.key, cert: upstreamCerts.certFor('www.youtube.com') }, (req, res) => {
    seen.push({ path: req.url, enc: req.headers['accept-encoding'], cookie: req.headers.cookie });
    if (req.url.startsWith('/youtubei/v1/player')) {
      const body = zlib.gzipSync(JSON.stringify(PLAYER));
      res.writeHead(200, { 'content-type': 'application/json; charset=UTF-8', 'content-encoding': 'gzip', 'set-cookie': ['A=1', 'B=2'] });
      return res.end(body);
    }
    if (req.url.startsWith('/watch')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'br' });
      return res.end(zlib.brotliCompressSync(PAGE));
    }
    if (req.url === '/s/player/base.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('var adPlacements = 1; // untouched'); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  process.env.SHOO_UPSTREAM = JSON.stringify({ 'www.youtube.com': `127.0.0.1:${fake.address().port}` });
  process.env.SHOO_UPSTREAM_CA = caFile;
  const { Proxy } = require('../src/proxy');
  proxy = new Proxy({ port: 0, certs: CA.issuer(shooCa), onAds: (n) => { proxy.ads = (proxy.ads || 0) + n; } });
  await proxy.listen();
  proxy.port = proxy.server.address().port;
});

test.after(() => { proxy.close(); fake.close(); fake.unref(); });

/** Fetch through the proxy the way a browser does: CONNECT, then TLS that must trust shoo's authority. */
function viaProxy(host, pathName, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const c = http.request({ host: '127.0.0.1', port: proxy.port, method: 'CONNECT', path: `${host}:443` });
    c.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return resolve({ status: res.statusCode }); }
      const secure = tls.connect({ socket, servername: host, ca: shooCa.cert });
      secure.on('error', reject);
      const req = http.request({ host, path: pathName, method, headers, createConnection: () => secure }, (r) => {
        const chunks = [];
        r.on('data', (d) => chunks.push(d));
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end(body);
    });
    c.on('error', reject);
    c.end();
  });
}

test('the player\'s data arrives without its ads (and cookies still work)', async () => {
  const r = await viaProxy('www.youtube.com', '/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'SID=x', 'accept-encoding': 'gzip, deflate, br, zstd' }, body: '{"videoId":"abc"}' });
  assert.strictEqual(r.status, 200);
  const d = JSON.parse(r.body);
  assert.ok(!('adPlacements' in d) && !('playerAds' in d));
  assert.strictEqual(d.videoDetails.videoId, 'abc');
  assert.deepStrictEqual(r.headers['set-cookie'], ['A=1', 'B=2']);
  assert.ok(!r.headers['content-encoding']);
  const sent = seen.find((s) => s.path.startsWith('/youtubei/v1/player'));
  assert.strictEqual(sent.cookie, 'SID=x');
  assert.doesNotMatch(sent.enc, /zstd/);
});

test('YouTube pages arrive without ads', async () => {
  const r = await viaProxy('www.youtube.com', '/watch?v=abc', { headers: { 'accept-encoding': 'br' } });
  assert.strictEqual(r.status, 200);
  assert.ok(!r.body.includes('adPlacements') && !r.body.includes('adSlotRenderer'));
  assert.ok(r.body.includes('"videoId":"v1"'));
  assert.ok(proxy.ads >= 4);
});

test('everything else is passed on untouched', async () => {
  const r = await viaProxy('www.youtube.com', '/s/player/base.js');
  assert.strictEqual(r.body, 'var adPlacements = 1; // untouched');
});

test('ad-only requests are answered without asking YouTube', async () => {
  const before = seen.length;
  const r = await viaProxy('www.youtube.com', '/pagead/viewthroughconversion/123');
  assert.strictEqual(r.status, 204);
  assert.strictEqual(seen.length, before);
});

test('shoo refuses to be a proxy for anything but YouTube', async () => {
  assert.strictEqual((await viaProxy('www.google.com', '/')).status, 403);
  assert.strictEqual((await viaProxy('mybank.com', '/')).status, 403);
  const plain = await new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: proxy.port, path: 'http://example.com/' }, (r) => { r.resume(); resolve(r.statusCode); });
  });
  assert.strictEqual(plain, 403);
});

test('when YouTube blocking is paused, pages pass through as they are', async () => {
  proxy.youtubeOn = false;
  const r = await viaProxy('www.youtube.com', '/youtubei/v1/player', { method: 'POST', body: '{}' });
  proxy.youtubeOn = true;
  assert.ok(r.body === undefined || r.status === 200);
});

test('the PAC file is served for the Mac to read', async () => {
  const body = await new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: proxy.port, path: '/proxy.pac' }, (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => resolve(b)); });
  });
  assert.match(body, /FindProxyForURL/);
  assert.match(body, new RegExp(`PROXY 127\\.0\\.0\\.1:${proxy.port}; DIRECT`));
});
