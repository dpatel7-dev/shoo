'use strict';
// A compact "is this address on the block list?" check for the browser's PAC file.
//
// Browsers only accept a PAC file of about 1 MB, and the block list has around
// 100,000 addresses: too big to write out. So the PAC file carries a Bloom
// filter instead: a few hundred KB of bits that answer "definitely not on the
// list" or "probably on it". "Probably" goes to shoo's blocker, which checks
// the real list and lets the rare mistake straight through, so nothing is
// blocked by accident.

/** 32-bit FNV-1a. The PAC file has the same function, so both agree. */
function fnv(str, basis) {
  let h = basis >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const B1 = 0x811c9dc5;
const B2 = 0x9747b28c;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function probes(str, m, k) {
  const h1 = fnv(str, B1);
  const h2 = fnv(str, B2) | 1;
  const out = [];
  for (let i = 0; i < k; i++) out.push(((h1 + Math.imul(i, h2)) >>> 0) % m);
  return out;
}

/** Build the filter for these addresses. About 1 wrong "probably" in 1,000. */
function build(domains, falsePositive = 0.001) {
  const list = [...domains];
  const n = Math.max(1, list.length);
  const m = Math.ceil((-n * Math.log(falsePositive)) / (Math.LN2 * Math.LN2) / 6) * 6;
  const k = Math.max(1, Math.round((m / n) * Math.LN2));
  const bits = new Uint8Array(m / 6);
  for (const d of list) for (const p of probes(d, m, k)) bits[(p / 6) | 0] |= 1 << (p % 6);
  let text = '';
  for (let i = 0; i < bits.length; i++) text += ALPHABET[bits[i]];
  return { m, k, bits: text, count: list.length };
}

/** The same check the PAC file does (used by the tests). */
function has(filter, str) {
  for (const p of probes(str, filter.m, filter.k)) {
    const v = ALPHABET.indexOf(filter.bits[(p / 6) | 0]);
    if (!((v >> (p % 6)) & 1)) return false;
  }
  return true;
}

/** The PAC-file version of the check, as JavaScript source. */
function pacSource(filter) {
  return [
    `var BITS = "${filter.bits}";`,
    `var M = ${filter.m}, K = ${filter.k};`,
    `var A = {}; (function () { var s = "${ALPHABET}"; for (var i = 0; i < s.length; i++) A[s.charAt(i)] = i; })();`,
    'function fnv(s, h) { h = h >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }',
    `function listed(s) { var h1 = fnv(s, ${B1}), h2 = fnv(s, ${B2}) | 1; for (var i = 0; i < K; i++) { var p = ((h1 + Math.imul(i, h2)) >>> 0) % M; if (!((A[BITS.charAt((p / 6) | 0)] >> (p % 6)) & 1)) return false; } return true; }`,
  ].join('\n');
}

module.exports = { build, has, pacSource, fnv };
