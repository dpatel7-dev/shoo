'use strict';
// `shoo serve`: the small background part of shoo (started when you log in).
// It takes the ads out of YouTube and shows shoo's dashboard at
// http://127.0.0.1:8689. It only listens on this Mac, never on the network.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Proxy, Blocker, browserPac } = require('./proxy');
const Hosts = require('./hosts');
const Bloom = require('./bloom');
const CA = require('./ca');
const Control = require('./control');

const WEB = path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const FILES = new Set(['shoo.css', 'shoo.js', 'forest.js', 'sprites.js', 'favicon.svg']);

/** The block list as the blocker uses it, rebuilt when the saved list changes. */
function listKeeper() {
  let mtime = -1;
  let set = new Set();
  let filter = null;
  const load = () => {
    let m = 0;
    try { m = fs.statSync(Control.file('blocklist.txt')).mtimeMs; } catch { /* only the built-in list */ }
    if (m === mtime) return;
    mtime = m;
    let saved = [];
    try { saved = fs.readFileSync(Control.file('blocklist.txt'), 'utf8').split('\n').filter(Boolean); } catch { /* none yet */ }
    set = new Set(Hosts.blocklist(new Set(saved), []));
    filter = Bloom.build(set);
  };
  return {
    refresh: load,
    get filter() { load(); return filter; },
    /** Blocked: on the list (or under a listed name), not let through, and not one shoo must never block. */
    isBlocked(host, allow) {
      load();
      let h = host.replace(/\.$/, '');
      for (let n = 0; n < 8 && h.includes('.'); n++) {
        if (allow.has(h) || Hosts.NEVER.has(h)) return false;
        if (set.has(h)) {
          // let it through if you allowed a parent of it
          for (let p = host; p.includes('.'); p = p.slice(p.indexOf('.') + 1)) if (allow.has(p)) return false;
          return true;
        }
        h = h.slice(h.indexOf('.') + 1);
      }
      return false;
    },
  };
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

async function serve({ port: wantPort, quiet = false } = {}) {
  const state = Control.load();
  const port = wantPort || state.port;
  const token = crypto.randomBytes(18).toString('base64url');
  const authority = CA.loadAuthority(Control.home());
  const certs = CA.issuer(authority);
  let busy = null; // an action waiting for the administrator

  const hostOk = (req) => [`127.0.0.1:${port}`, `localhost:${port}`].includes(String(req.headers.host || '').toLowerCase());

  async function local(req, res) {
    // Only this Mac's own pages may talk to shoo (no other website, no tricks with addresses).
    if (!hostOk(req)) return send(res, 403, 'Not here.\n', 'text/plain');
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;
    if (p === '/version') return send(res, 200, `${Control.VERSION}\n`, 'text/plain');

    if (p === '/browser.pac') {
      const s = Control.load();
      const text = s.on ? browserPac(port, port + 1, proxy.youtubeOn, lists.filter) : 'function FindProxyForURL(url, host) { return "DIRECT"; }\n';
      return send(res, 200, text, 'application/x-ns-proxy-autoconfig');
    }
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      const page = fs.readFileSync(path.join(WEB, 'shoo.html'), 'utf8')
        .replace('__CONFIG__', () => JSON.stringify({ token, port }).replace(/</g, '\\u003c'));
      return send(res, 200, page, TYPES['.html'], {
        'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      });
    }
    if (req.method === 'GET' && FILES.has(p.slice(1))) {
      return send(res, 200, fs.readFileSync(path.join(WEB, p.slice(1))), TYPES[path.extname(p)]);
    }
    if (!p.startsWith('/api/')) return send(res, 404, 'Not found.\n', 'text/plain');

    // The API needs the page's token, and no other website may call it.
    const origin = req.headers.origin;
    if ((origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) || req.headers['x-shoo'] !== token) {
      return send(res, 403, { error: 'Not allowed.' });
    }

    if (p === '/api/status' && req.method === 'GET') {
      return send(res, 200, { ...Control.status(), youtubePaused: !!Control.load().youtubePaused, busy, served: proxy.served });
    }
    if (p === '/api/do' && req.method === 'POST') {
      if (busy) return send(res, 409, { error: 'shoo is still waiting for the last change. Look for the macOS password box.' });
      const body = await readBody(req).catch(() => ({}));
      const act = String(body.action || '');
      busy = act;
      try {
        let result = {};
        if (act === 'on') result = await Control.turnOn({ mode: 'browser', youtube: true });
        else if (act === 'whole-mac') result = await Control.turnOn({ mode: 'mac', youtube: true });
        else if (act === 'browser') result = await Control.openBrowser({ id: body.id, restart: !!body.restart });
        else if (act === 'off') await Control.turnOff();
        else if (act === 'list') result = await Control.rewriteHosts({ fresh: true });
        else if (act === 'allow') result = { site: await Control.allow(String(body.site || '')) };
        else if (act === 'block') result = { site: await Control.block(String(body.site || '')) };
        else if (act === 'youtube') { Control.setYoutube(!!body.on); refresh(); }
        else throw new Error('shoo doesn\'t know that.');
        refresh();
        send(res, 200, { ok: true, ...result });
      } catch (e) {
        send(res, 400, { error: e.message });
      } finally {
        busy = null;
      }
      return undefined;
    }
    return send(res, 404, { error: 'Not found.' });
  }

  const lists = listKeeper();
  const blocker = new Blocker({
    port: port + 1,
    isBlocked: (host) => cur.on && lists.isBlocked(host, cur.allowSet),
    onBlocked: () => Control.countAds(1, 'web'),
  });
  const proxy = new Proxy({ port, certs, local: (req, res) => { local(req, res).catch((e) => send(res, 500, { error: e.message })); }, onAds: (n) => Control.countAds(n) });

  // If the network keeps changing YouTube's certificate in a way shoo can't
  // check, shoo stops handling YouTube (it goes straight there, ads and all).
  let trustProblems = [];
  proxy.onTrustProblem = () => {
    const now = Date.now();
    trustProblems = trustProblems.filter((t) => now - t < 60000).concat(now);
    if (trustProblems.length >= 2 && proxy.youtubeOn) {
      Control.setYoutube(false, 'This network checks secure connections in a way shoo can\'t, so shoo is leaving YouTube alone. YouTube still works, with its ads.');
      refresh();
    }
  };
  let cur = { on: false, allowSet: new Set() };
  function refresh() {
    const s = Control.load();
    cur = { on: s.on, allowSet: new Set(s.allow) };
    proxy.youtubeOn = s.on && s.youtube && !s.youtubePaused;
    lists.refresh();
  }
  refresh();
  setInterval(refresh, 3000).unref();

  await proxy.listen();
  await blocker.listen().catch((e) => console.error(`shoo's blocker couldn't start on port ${port + 1}: ${e.message}`));
  if (!quiet) console.log(`shoo ${Control.VERSION} is listening on http://127.0.0.1:${port} (YouTube ${proxy.youtubeOn ? 'on' : 'off'})`);
  const stop = () => Promise.all([proxy.close(), blocker.close().catch(() => {})]).then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return proxy;
}

module.exports = { serve };
