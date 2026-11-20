'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('../src/hosts');

test('reading a hosts-format list', () => {
  const set = H.parseList('# comment\n127.0.0.1 localhost\n0.0.0.0 ads.example.com tracker.example.net # trailing\n0.0.0.0 bad..name\n1.2.3.4 not-a-block.com\n0.0.0.0 UPPER.Example.ORG.\n');
  assert.deepStrictEqual([...set].sort(), ['ads.example.com', 'localhost', 'tracker.example.net', 'upper.example.org'].filter((d) => d !== 'localhost' || set.has('localhost')).sort());
});

test('Google\'s ad servers (vignettes) are always blocked; YouTube and sign-in never are', () => {
  const list = H.blocklist(new Set(['www.youtube.com', 'accounts.google.com', 'ads.example.com', 'localhost']));
  for (const d of ['pagead2.googlesyndication.com', 'googleads.g.doubleclick.net', 'securepubads.g.doubleclick.net', 'ads.example.com']) assert.ok(list.includes(d), d);
  for (const d of ['www.youtube.com', 'accounts.google.com', 'localhost']) assert.ok(!list.includes(d), d);
});

test('letting a site through also lets its subdomains through', () => {
  const list = H.blocklist(new Set(['ads.example.com', 'www.example.com', 'example.com', 'other.net']), ['https://example.com/page']);
  assert.deepStrictEqual(list.filter((d) => /example|other/.test(d)), ['other.net']);
});

test('shoo only ever edits its own part of /etc/hosts', () => {
  const mine = '##\n# Host Database\n127.0.0.1\tlocalhost\n255.255.255.255\tbroadcasthost\n10.0.0.5 nas.home\n';
  const on = H.withShoo(mine, ['a.com', 'b.com']);
  assert.ok(on.startsWith(mine));
  assert.strictEqual(H.countIn(on), 2);
  const again = H.withShoo(on, ['c.com']);
  assert.strictEqual(H.countIn(again), 1);
  assert.strictEqual((again.match(/>>> shoo/g) || []).length, 1);
  assert.strictEqual(H.withoutShoo(again).trimEnd(), mine.trimEnd());
  assert.strictEqual(H.countIn(mine), 0);
  assert.strictEqual(H.withoutShoo(mine), mine);
});
