'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const net = require('net');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Bloom = require('../src/bloom');
const { browserPac, Blocker } = require('../src/proxy');

const LIST = ['pagead2.googlesyndication.com', 'doubleclick.net', 'ads.example.com', 'tracker.example.net'];
const filter = Bloom.build(LIST);

function decide(pacText, host) {
  const box = {};
  vm.runInNewContext(pacText, box);
  return box.FindProxyForURL(`https://${host}/`, host);
}

test('the compact list finds every listed address and almost nothing else', () => {
  for (const d of LIST) assert.ok(Bloom.has(filter, d), d);
  const big = Bloom.build(Array.from({ length: 50000 }, (_, i) => `ad${i}.example.org`));
  let wrong = 0;
  for (let i = 0; i < 20000; i++) if (Bloom.has(big, `site${i}.example.com`)) wrong++;
  assert.ok(wrong < 60, `${wrong} false matches`);
  assert.ok(big.bits.length < 150000, 'small enough for a PAC file');
});

test('the browser PAC file: ads to the blocker, YouTube through shoo, the rest straight there', () => {
  const pac = browserPac(8689, 8690, true, filter);
  assert.strictEqual(decide(pac, 'pagead2.googlesyndication.com'), 'PROXY 127.0.0.1:8690; DIRECT');
  assert.strictEqual(decide(pac, 'securepubads.g.doubleclick.net'), 'PROXY 127.0.0.1:8690; DIRECT'); // under a listed name
  assert.strictEqual(decide(pac, 'ADS.Example.com'), 'PROXY 127.0.0.1:8690; DIRECT');
  assert.strictEqual(decide(pac, 'www.youtube.com'), 'PROXY 127.0.0.1:8689; DIRECT');
  for (const h of ['www.google.com', 'example.com', 'news.example.com', 'mybank.com', 'rr3---sn-x.googlevideo.com']) assert.strictEqual(decide(pac, h), 'DIRECT', h);
  // YouTube paused: it goes straight there too
  assert.strictEqual(decide(browserPac(8689, 8690, false, filter), 'www.youtube.com'), 'DIRECT');
  assert.ok(Buffer.byteLength(pac) < 1024 * 1024);
});

function connectVia(port, target) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'CONNECT', path: target });
    req.on('connect', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0));
    req.end();
  });
}

test('the blocker stops listed addresses and lets everything else through', async () => {
  // a pretend "real" site the blocker can reach
  const site = net.createServer((s) => s.end());
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  let blocked = 0;
  const allow = new Set(['ads.example.com']);
  const listed = new Set(['localhost.ads.test', 'ads.example.com']);
  const b = new Blocker({ port: 0, isBlocked: (h) => listed.has(h) && !allow.has(h), onBlocked: () => { blocked++; } });
  await b.listen();
  const port = b.server.address().port;
  assert.strictEqual(await connectVia(port, 'localhost.ads.test:443'), 403);
  assert.strictEqual(blocked, 1);
  assert.strictEqual(await connectVia(port, `127.0.0.1:${site.address().port}`), 200); // not on the list: straight through
  await b.close();
  site.close();
});

test('the apps shoo puts in Applications', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'shoo-apps-'));
  const was = process.env.HOME;
  process.env.HOME = home;
  try {
    delete require.cache[require.resolve('../src/mac')];
    const Mac = require('../src/mac');
    const app = Mac.makeApp({ name: 'Chrome with shoo', id: 'dev.dpatel7.shoo.chrome', args: ['browser', 'chrome'], icon: path.join(__dirname, '..', 'assets', 'browser.icns'), node: '/usr/local/bin/node', script: '/Users/x/.shoo/app/bin/shoo.js', version: '1.1.0' });
    assert.strictEqual(app, path.join(home, 'Applications', 'Chrome with shoo.app'));
    const plist = fs.readFileSync(path.join(app, 'Contents', 'Info.plist'), 'utf8');
    assert.match(plist, /<key>CFBundleExecutable<\/key><string>run<\/string>/);
    assert.match(plist, /<key>CFBundleIconFile<\/key><string>icon<\/string>/);
    const run = fs.readFileSync(path.join(app, 'Contents', 'MacOS', 'run'), 'utf8');
    assert.match(run, /^#!\/bin\/sh\n/);
    assert.match(run, /exec '\/usr\/local\/bin\/node' '\/Users\/x\/\.shoo\/app\/bin\/shoo\.js' 'browser' 'chrome'/);
    assert.ok(fs.statSync(path.join(app, 'Contents', 'MacOS', 'run')).mode & 0o100, 'it can run');
    assert.ok(fs.statSync(path.join(app, 'Contents', 'Resources', 'icon.icns')).size > 1000);
    Mac.removeApp('Chrome with shoo');
    assert.ok(!fs.existsSync(app));
  } finally {
    process.env.HOME = was;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('the app icons are real .icns files', () => {
  for (const f of ['shoo.icns', 'browser.icns']) {
    const b = fs.readFileSync(path.join(__dirname, '..', 'assets', f));
    assert.strictEqual(b.subarray(0, 4).toString(), 'icns');
    assert.strictEqual(b.readUInt32BE(4), b.length);
    assert.ok(b.includes(Buffer.from('ic10')), '1024px image');
  }
});
