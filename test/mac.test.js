'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const M = require('../src/mac');
const { pac } = require('../src/proxy');

const OURS = 'http://127.0.0.1:8689/proxy.pac';

test('reading which network services are on', () => {
  const text = 'An asterisk (*) denotes that a network service is disabled.\nWi-Fi\n*Bluetooth PAN\nThunderbolt Bridge\nUSB 10/100/1000 LAN\n';
  assert.deepStrictEqual(M.parseServices(text), ['Wi-Fi', 'Thunderbolt Bridge', 'USB 10/100/1000 LAN']);
});

test('spotting a Mac a school or company manages', () => {
  assert.strictEqual(M.parseEnrollment('Enrolled via DEP: No\nMDM enrollment: No'), false);
  assert.strictEqual(M.parseEnrollment('Enrolled via DEP: Yes\nMDM enrollment: Yes (User Approved)'), true);
  assert.strictEqual(M.parseEnrollment('MDM enrollment: Yes'), true);
  assert.strictEqual(M.parseEnrollment('profiles: something went wrong'), null);
});

test('spotting a proxy or filter that is already set up', () => {
  const none = M.parseScutil('<dictionary> {\n  ExceptionsList : <array> {\n    0 : *.local\n  }\n  FTPPassive : 1\n  HTTPEnable : 0\n  HTTPSEnable : 0\n}\n');
  assert.strictEqual(M.foreignProxy(none, OURS), false);
  const school = M.parseScutil('<dictionary> {\n  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : http://filter.school.example/proxy.pac\n}\n');
  assert.strictEqual(M.foreignProxy(school, OURS), true);
  const ours = M.parseScutil(`<dictionary> {\n  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : ${OURS}\n}\n`);
  assert.strictEqual(M.foreignProxy(ours, OURS), false);
  assert.strictEqual(M.foreignProxy(M.parseScutil('HTTPSEnable : 1\nHTTPSProxy : 10.0.0.1'), OURS), true);
  assert.strictEqual(M.foreignProxy(M.parseScutil('ProxyAutoDiscoveryEnable : 1'), OURS), true);
});

test('reading networksetup answers', () => {
  assert.strictEqual(M.parseOnOff('Enabled: Yes\nServer: 10.0.0.1\nPort: 8080'), true);
  assert.strictEqual(M.parseOnOff('Enabled: No\nServer: \nPort: 0'), false);
  assert.strictEqual(M.parseOnOff('Auto Proxy Discovery: On'), true);
  assert.strictEqual(M.parseOnOff('URL: (null)\nEnabled: No'), false);
  assert.strictEqual(M.parseUrl(`URL: ${OURS}\nEnabled: Yes`), OURS);
  assert.strictEqual(M.parseUrl('URL: (null)\nEnabled: No'), '');
});

test('the administrator script does only what it says, with safe quoting', () => {
  const s = M.adminScript({ hostsFile: "/Users/o'neil/.shoo/hosts.next", youtube: true, caFile: '/Users/x/.shoo/youtube-only-ca.pem', pacUrl: OURS, services: ['Wi-Fi', "Bob's USB"] });
  assert.match(s, /cat '\/Users\/o'\\''neil\/\.shoo\/hosts\.next' > \/etc\/hosts \|\| exit 11/);
  assert.match(s, /hosts\.before-shoo/);
  assert.match(s, /add-trusted-cert -d -r trustRoot -p ssl -k \/Library\/Keychains\/System\.keychain '[^']+' \|\| true/);
  assert.match(s, /-setautoproxyurl 'Wi-Fi' 'http:\/\/127\.0\.0\.1:8689\/proxy\.pac'/);
  assert.match(s, /-setautoproxystate 'Bob'\\''s USB' on/);
  const hostsOnly = M.adminScript({ hostsFile: '/tmp/h' });
  assert.doesNotMatch(hostsOnly, /security|networksetup/);
  const off = M.adminScript({ hostsFile: '/tmp/clean', pacOff: ['Wi-Fi'], removeCa: true, caFile: '/tmp/ca.pem', caSha1: 'ABCDEF' });
  assert.match(off, /-setautoproxystate 'Wi-Fi' off/);
  assert.match(off, /remove-trusted-cert -d '\/tmp\/ca\.pem'/);
  assert.match(off, /delete-certificate -Z 'ABCDEF'/);
  assert.doesNotMatch(off, /add-trusted-cert|setautoproxyurl/);
});

test('the login helper runs `shoo serve` and restarts if it stops', () => {
  const p = M.plist('/usr/local/bin/node', '/Users/x/.shoo/app/bin/shoo.js', '/Users/x/.shoo/shoo.log');
  assert.match(p, /<string>dev\.dpatel7\.shoo<\/string>/);
  assert.match(p, /<string>serve<\/string>/);
  assert.match(p, /<key>KeepAlive<\/key><true\/>/);
});

test('the PAC file sends only YouTube through shoo, with a way around if shoo is down', () => {
  const run = (text, host) => {
    const box = { dnsDomainIs: (h, d) => h.endsWith(d) };
    vm.runInNewContext(text, box);
    return box.FindProxyForURL(`https://${host}/`, host);
  };
  const p = pac(8689);
  assert.strictEqual(run(p, 'www.youtube.com'), 'PROXY 127.0.0.1:8689; DIRECT');
  assert.strictEqual(run(p, 'WWW.YouTube.com'), 'PROXY 127.0.0.1:8689; DIRECT');
  for (const h of ['accounts.youtube.com', 'rr1---sn-abc.googlevideo.com', 'www.google.com', 'mybank.com', 'youtube.com.evil.net', 'i.ytimg.com']) {
    assert.strictEqual(run(p, h), 'DIRECT', h);
  }
  assert.strictEqual(run(pac(8689, false), 'www.youtube.com'), 'DIRECT');
});
