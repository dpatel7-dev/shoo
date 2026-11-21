'use strict';
// On a Mac a school manages: the browser way is fine (it changes nothing on the
// Mac), the whole-Mac way is refused, and the school's browser settings win.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const tls = require('tls');

const Mac = require('../src/mac');
const Control = require('../src/control');
const Browsers = require('../src/browsers');

function fakeMac(over) {
  Mac.checkMac = () => ({ mac: true, version: '15.1', managed: false, managedWhy: '', proxy: false, proxyWhere: [], admin: false, services: ['Wi-Fi'], ...over });
}

test('a managed Mac: the whole-Mac way is refused, the browser way is allowed', () => {
  fakeMac({ managed: true, managedWhy: 'it is enrolled in device management (MDM)' });
  const state = Control.load();
  assert.throws(() => Control.preflight(state, 'mac'), /managed by an organization.*stays off.*shoo on/s);
  const checks = Control.preflight(state, 'browser');
  assert.strictEqual(checks.managed, true);
});

test('a browser whose network settings the school controls is left alone', () => {
  const real = { installed: Browsers.installed, policy: Mac.browserProxyPolicy };
  Browsers.installed = () => Browsers.LIST.slice(0, 2); // Chrome and Edge
  Mac.browserProxyPolicy = (bundle) => bundle === 'com.google.Chrome';
  try {
    assert.deepStrictEqual(Control.usableBrowsers().map((b) => b.id), ['edge']);
  } finally {
    Browsers.installed = real.installed;
    Mac.browserProxyPolicy = real.policy;
  }
});

test('every browser knows its settings name', () => {
  for (const b of Browsers.LIST) assert.match(b.bundle, /^com\.[a-z]+\.[A-Za-z]+$/);
  assert.ok(Mac.PROXY_POLICIES.includes('ProxyPacUrl') && Mac.PROXY_POLICIES.includes('ProxyMode'));
});

test('when the network breaks YouTube\'s certificate, shoo notices (and can step aside)', async () => {
  const CA = require('../src/ca');
  const other = CA.makeAuthority(); // a certificate shoo has never heard of, like a network that inspects connections
  const certs = CA.issuer(other);
  const fake = https.createServer({ key: certs.key, cert: certs.certFor('www.youtube.com') }, (req, res) => res.end('{}'));
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  process.env.SHOO_UPSTREAM = JSON.stringify({ 'www.youtube.com': `127.0.0.1:${fake.address().port}` });
  delete process.env.SHOO_UPSTREAM_CA;
  const { Proxy } = require('../src/proxy');
  const shooCa = CA.makeAuthority();
  const proxy = new Proxy({ port: 0, certs: CA.issuer(shooCa) });
  let problems = 0;
  proxy.onTrustProblem = () => { problems++; };
  await proxy.listen();
  const status = await new Promise((resolve, reject) => {
    const c = http.request({ host: '127.0.0.1', port: proxy.server.address().port, method: 'CONNECT', path: 'www.youtube.com:443' });
    c.on('connect', (res, socket) => {
      const secure = tls.connect({ socket, servername: 'www.youtube.com', ca: shooCa.cert });
      const req = http.request({ host: 'www.youtube.com', path: '/youtubei/v1/player', method: 'POST', createConnection: () => secure }, (r) => { r.resume(); r.on('end', () => resolve(r.statusCode)); });
      req.on('error', reject);
      req.end('{}');
    });
    c.end();
  });
  assert.strictEqual(status, 502);
  assert.strictEqual(problems, 1);
  await proxy.close();
  fake.close();
  fake.unref();
});
