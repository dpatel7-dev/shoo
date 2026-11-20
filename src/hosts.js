'use strict';
// Blocking ad and tracker addresses for the whole Mac, with /etc/hosts.
//
// Every app asks the Mac where an address like pagead2.googlesyndication.com
// lives. With shoo on, the Mac answers "nowhere" (0.0.0.0) for ad and tracker
// addresses, so the ads never load: in every browser and every app. This is
// also what stops Google's full-page "vignette" ads, which need Google's ad
// script to appear. shoo keeps its lines between two markers and never touches
// anything else in the file.

const https = require('https');

const START = '# >>> shoo: ad blocking. Turn it off with: shoo off >>>';
const END = '# <<< shoo <<<';

// The big public list: ads, trackers and malware, kept up to date by its community.
const LIST_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts';

// Always blocked, even if the download fails: Google's ad servers (these show
// the vignettes, banners and "sponsored" boxes on other sites) and common ad networks.
const BUILT_IN = [
  'pagead2.googlesyndication.com', 'tpc.googlesyndication.com', 'googlesyndication.com',
  'googleads.g.doubleclick.net', 'ad.doubleclick.net', 'securepubads.g.doubleclick.net',
  'pubads.g.doubleclick.net', 'static.doubleclick.net', 'stats.g.doubleclick.net', 'cm.g.doubleclick.net',
  'pagead.l.doubleclick.net', 'adclick.g.doubleclick.net', 'doubleclick.net', 'www.doubleclick.net',
  'adservice.google.com', 'partner.googleadservices.com', 'www.googleadservices.com', 'googleadservices.com',
  'www.googletagservices.com', 'fundingchoicesmessages.google.com', 'ep1.adtrafficquality.google',
  'ep2.adtrafficquality.google', 's0.2mdn.net',
  'ads.youtube.com',
  'adnxs.com', 'ib.adnxs.com', 'secure.adnxs.com', 'ads.pubmatic.com', 'image6.pubmatic.com',
  'c.amazon-adsystem.com', 'aax.amazon-adsystem.com', 'fls-na.amazon-adsystem.com',
  'ads.yahoo.com', 'tags.crwdcntrl.net', 'cdn.taboola.com', 'trc.taboola.com', 'widgets.outbrain.com',
  'odb.outbrain.com', 'static.criteo.net', 'bidder.criteo.com', 'ads.rubiconproject.com',
  'fastlane.rubiconproject.com', 'ads.servenobid.com', 'cdn.adsafeprotected.com', 'pixel.adsafeprotected.com',
  'ad.360yield.com', 'ads.betweendigital.com', 'casalemedia.com', 'as-sec.casalemedia.com',
];

// Never blocked, whatever a list says: blocking these would break YouTube,
// Google sign-in, or the Mac itself.
const NEVER = new Set([
  'localhost', 'localhost.localdomain', 'local', 'broadcasthost', '0.0.0.0', 'ip6-localhost', 'ip6-loopback',
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtubei.googleapis.com',
  'i.ytimg.com', 's.ytimg.com', 'yt3.ggpht.com', 'googlevideo.com', 'accounts.google.com', 'accounts.youtube.com',
  'www.google.com', 'google.com', 'www.gstatic.com', 'fonts.gstatic.com', 'fonts.googleapis.com',
  'apis.google.com', 'ssl.gstatic.com', 'play.google.com', 'apple.com', 'www.apple.com', 'icloud.com',
  'raw.githubusercontent.com', 'github.com',
]);

const DOMAIN = /^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z][a-z0-9-]{0,62}$/;

/** The addresses in a hosts-format list (lines like "0.0.0.0 ads.example.com"). */
function parseList(text) {
  const out = new Set();
  for (let line of String(text).split('\n')) {
    const hash = line.indexOf('#');
    if (hash >= 0) line = line.slice(0, hash);
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    if (parts[0] !== '0.0.0.0' && parts[0] !== '127.0.0.1' && parts[0] !== '::' && parts[0] !== '::1') continue;
    for (const name of parts.slice(1)) {
      const d = name.toLowerCase().replace(/\.$/, '');
      if (DOMAIN.test(d)) out.add(d);
    }
  }
  return out;
}

const normal = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/\.$/, '');

/** Everything to block: the downloaded list plus the built-in one, minus what you've let through. */
function blocklist(downloaded, allowed = []) {
  const allow = new Set(allowed.map(normal));
  const all = new Set([...BUILT_IN, ...(downloaded || [])]);
  const out = [];
  for (const d of all) {
    if (NEVER.has(d) || allow.has(d)) continue;
    // letting a site through also lets its subdomains through (allow example.com -> www.example.com works)
    let parent = d;
    let skip = false;
    while (parent.includes('.')) {
      parent = parent.slice(parent.indexOf('.') + 1);
      if (allow.has(parent)) { skip = true; break; }
    }
    if (!skip) out.push(d);
  }
  return out.sort();
}

/** The hosts file without shoo's part. */
function withoutShoo(hosts) {
  const s = hosts.indexOf(START);
  if (s < 0) return hosts;
  const e = hosts.indexOf(END, s);
  const after = e < 0 ? '' : hosts.slice(e + END.length).replace(/^\r?\n/, '');
  return (hosts.slice(0, s).replace(/\n+$/, '\n') + after).replace(/\n{3,}$/, '\n\n');
}

/** The hosts file with shoo's part (put back fresh at the end). */
function withShoo(hosts, domains) {
  const base = withoutShoo(hosts).replace(/\s*$/, '\n');
  const lines = domains.map((d) => `0.0.0.0 ${d}`);
  return `${base}\n${START}\n# ${domains.length} ad and tracker addresses. Updated ${new Date().toISOString().slice(0, 10)}.\n${lines.join('\n')}\n${END}\n`;
}

/** How many addresses shoo is blocking in this hosts file (0 if shoo isn't in it). */
function countIn(hosts) {
  const s = hosts.indexOf(START);
  if (s < 0) return 0;
  const e = hosts.indexOf(END, s);
  const part = hosts.slice(s, e < 0 ? undefined : e);
  return (part.match(/^0\.0\.0\.0 /gm) || []).length;
}

/** Download the big list. Resolves to a Set, or rejects with a friendly message. */
function download(url = process.env.SHOO_LIST_URL || LIST_URL, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'shoo' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`the block list server answered ${res.statusCode}`)); }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => { size += c.length; if (size > 40e6) req.destroy(new Error('the block list is too big')); else chunks.push(c); });
      res.on('end', () => {
        const set = parseList(Buffer.concat(chunks).toString('utf8'));
        if (set.size < 1000) return reject(new Error('the block list looked empty'));
        resolve(set);
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('the block list took too long to download')));
    req.on('error', reject);
  });
}

module.exports = { START, END, LIST_URL, BUILT_IN, NEVER, parseList, blocklist, withShoo, withoutShoo, countIn, download, normal };
