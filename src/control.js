'use strict';
// Turning shoo on and off, updating the block list and letting sites through.
// Used by the `shoo` command and by its dashboard.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Hosts = require('./hosts');
const Mac = require('./mac');
const CA = require('./ca');

const APP = path.join(__dirname, '..');
const VERSION = require('../package.json').version;
const home = () => process.env.SHOO_HOME || path.join(os.homedir(), '.shoo');
const file = (name) => path.join(home(), name);
const HOSTS = process.env.SHOO_HOSTS_FILE || '/etc/hosts';

const DEFAULTS = { on: false, youtube: true, port: 8689, allow: [], listCount: 0, listUpdated: null, note: '' };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file('state.json'), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}

function save(state) {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file('state.json'), JSON.stringify(state, null, 2) + '\n');
  return state;
}

const pacUrl = (state) => `http://127.0.0.1:${state.port}/proxy.pac`;

// ── today's count of YouTube ads taken out ────────────────────────────────────

function today() { return new Date().toLocaleDateString('en-CA'); }

function readStats() {
  try { return JSON.parse(fs.readFileSync(file('stats.json'), 'utf8')); } catch { return { days: {}, total: 0 }; }
}

let pending = null;
let saveTimer = null;
function countAds(n) {
  if (!pending) pending = readStats();
  const d = today();
  pending.days[d] = (pending.days[d] || 0) + n;
  pending.total = (pending.total || 0) + n;
  // keep a month of days
  const keys = Object.keys(pending.days).sort();
  while (keys.length > 31) delete pending.days[keys.shift()];
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(file('stats.json'), JSON.stringify(pending)); } catch { /* next time */ }
  }, 1500);
  saveTimer.unref?.();
}

function stats() {
  const s = pending || readStats();
  return { today: s.days[today()] || 0, total: s.total || 0 };
}

// ── the block list ─────────────────────────────────────────────────────────────

/** The downloaded list (fresh if asked, else the saved copy). Never fails: falls back to the built-in list. */
async function getList(fresh) {
  const cache = file('blocklist.txt');
  if (fresh || !fs.existsSync(cache)) {
    try {
      const set = await Hosts.download();
      fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
      fs.writeFileSync(cache, [...set].join('\n') + '\n');
      return { set, fresh: true };
    } catch (e) {
      if (!fs.existsSync(cache)) return { set: new Set(), fresh: false, problem: `Couldn't download the big block list (${e.message}), so shoo is using its own shorter list for now.` };
    }
  }
  return { set: new Set(fs.readFileSync(cache, 'utf8').split('\n').filter(Boolean)), fresh: false };
}

function hostsNow() {
  try { return fs.readFileSync(HOSTS, 'utf8'); } catch { return ''; }
}

function blockedCount() {
  return Hosts.countIn(hostsNow());
}

// ── what shoo is doing right now ───────────────────────────────────────────────

function status() {
  const state = load();
  const authority = fs.existsSync(file('youtube-only-ca.pem')) ? CA.loadAuthority(home()) : null;
  return {
    version: VERSION,
    on: state.on,
    blocked: blockedCount(),
    youtube: state.on && state.youtube,
    youtubeWhy: state.note,
    allow: state.allow,
    listUpdated: state.listUpdated,
    port: state.port,
    caName: authority ? authority.name : '',
    stats: stats(),
  };
}

// ── changes ────────────────────────────────────────────────────────────────────

function writeScript(text) {
  const f = file('admin.sh');
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(f, text, { mode: 0o700 });
  return f;
}

/** Refuses on a managed Mac. Returns the checks for the caller to show. */
function preflight(state) {
  const checks = Mac.checkMac(pacUrl(state));
  if (!checks.mac) throw new Error('shoo works on macOS for now.');
  if (checks.managed) {
    const e = new Error(`This Mac is managed by an organization (like a school): ${checks.managedWhy}. shoo won't change its settings. Blocking ads on it is up to whoever manages it.`);
    e.managed = true;
    throw e;
  }
  return checks;
}

/**
 * Turn shoo on: block the ad addresses, and (if allowed) take the ads out of YouTube.
 * `say` gets progress lines.
 */
async function turnOn({ youtube = true, say = () => {} } = {}) {
  const state = load();
  const checks = preflight(state);
  let youtubeOk = youtube;
  state.note = '';
  if (youtube && checks.proxy) {
    youtubeOk = false;
    state.note = `This Mac already sends web traffic through a proxy or filter (${checks.proxyWhere.join(', ')}), often set up by a school or a parent. shoo won't change that, so it's skipping YouTube video ads.`;
    say(state.note);
  }

  say('Getting the list of ad and tracker addresses...');
  const list = await getList(!state.listUpdated || Date.now() - Date.parse(state.listUpdated) > 7 * 864e5);
  if (list.problem) say(list.problem);
  const domains = Hosts.blocklist(list.set, state.allow);
  const next = file('hosts.next');
  fs.writeFileSync(next, Hosts.withShoo(hostsNow(), domains));

  let authority = null;
  if (youtubeOk) authority = CA.loadAuthority(home());

  // Start the part that handles YouTube (and the dashboard) before pointing the Mac at it.
  Mac.startAgent(process.execPath, path.join(APP, 'bin', 'shoo.js'), file('shoo.log'));

  const script = writeScript(Mac.adminScript({
    hostsFile: next,
    youtube: youtubeOk,
    caFile: authority && authority.file,
    pacUrl: pacUrl(state),
    services: checks.services,
  }));
  say('macOS will ask for an administrator\'s password now.');
  const r = Mac.asAdmin(script, 'shoo wants to block ads on this Mac. An administrator of this Mac needs to approve it.');
  if (!r.ok) throw new Error(r.message);

  // Check that macOS really trusts the YouTube-only certificate. If it doesn't, YouTube
  // simply goes straight to the internet (shoo serves a "DIRECT" PAC file), so nothing breaks.
  if (youtubeOk) {
    const works = () => {
      const leaf = file('check-leaf.pem');
      fs.writeFileSync(leaf, CA.issuer(authority).certFor('www.youtube.com').split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----\n');
      return Mac.trustWorks(leaf, authority.file);
    };
    if (!works()) {
      say('macOS will ask for your password to trust shoo\'s YouTube-only certificate.');
      state.userTrust = Mac.trustAsUser(authority.file);
      if (!works()) {
        youtubeOk = false;
        state.note = 'macOS didn\'t trust shoo\'s YouTube-only certificate, so YouTube ads aren\'t being blocked. Try "shoo on" again.';
        say(state.note);
      }
    }
  }

  state.on = true;
  state.youtube = youtubeOk;
  state.listCount = domains.length;
  if (list.fresh) state.listUpdated = new Date().toISOString();
  save(state);
  return { blocked: domains.length, youtube: youtubeOk, note: state.note };
}

/** Turn shoo off: put the hosts file and network settings back. */
async function turnOff() {
  const state = load();
  if (process.platform !== 'darwin') throw new Error('shoo works on macOS for now.');
  const services = Mac.parseServices(require('child_process').spawnSync('/usr/sbin/networksetup', ['-listallnetworkservices'], { encoding: 'utf8' }).stdout || '');
  const ours = services.filter((s) => {
    const t = require('child_process').spawnSync('/usr/sbin/networksetup', ['-getautoproxyurl', s], { encoding: 'utf8' }).stdout || '';
    return Mac.parseUrl(t) === pacUrl(state);
  });
  const clean = file('hosts.clean');
  fs.writeFileSync(clean, Hosts.withoutShoo(hostsNow()));
  const authority = fs.existsSync(file('youtube-only-ca.pem')) ? CA.loadAuthority(home()) : null;
  const script = writeScript(Mac.adminScript({
    hostsFile: clean,
    pacOff: ours,
    removeCa: !!authority,
    caFile: authority && authority.file,
    caSha1: authority && authority.fingerprint,
  }));
  const r = Mac.asAdmin(script, 'shoo wants to stop blocking ads and put this Mac\'s settings back. An administrator needs to approve it.');
  if (!r.ok) throw new Error(r.message);
  if (authority && state.userTrust) Mac.untrustAsUser(authority.file, authority.fingerprint);
  state.on = false;
  save(state);
}

/** Rewrite just the blocked addresses (after a new list or a change to the sites you let through). */
async function rewriteHosts({ fresh = false } = {}) {
  const state = load();
  if (!state.on) { save(state); return { blocked: 0 }; }
  preflight(state);
  const list = await getList(fresh);
  const domains = Hosts.blocklist(list.set, state.allow);
  const next = file('hosts.next');
  fs.writeFileSync(next, Hosts.withShoo(hostsNow(), domains));
  const r = Mac.asAdmin(writeScript(Mac.adminScript({ hostsFile: next })), 'shoo wants to update the ad addresses it blocks. An administrator needs to approve it.');
  if (!r.ok) throw new Error(r.message);
  state.listCount = domains.length;
  if (list.fresh) state.listUpdated = new Date().toISOString();
  save(state);
  return { blocked: domains.length, problem: list.problem };
}

/** Let a site through (if blocking it broke something). */
async function allow(site) {
  const d = Hosts.normal(site);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new Error(`"${site}" doesn't look like a website address. Try something like example.com`);
  const state = load();
  if (!state.allow.includes(d)) state.allow.push(d);
  save(state);
  await rewriteHosts();
  return d;
}

/** Block a site again. */
async function block(site) {
  const d = Hosts.normal(site);
  const state = load();
  state.allow = state.allow.filter((x) => x !== d);
  save(state);
  await rewriteHosts();
  return d;
}

/** Turn just the YouTube part on or off (no password: the PAC file shoo serves changes). */
function setYoutube(on) {
  const state = load();
  state.youtubePaused = !on;
  save(state);
  return state;
}

module.exports = { load, save, status, turnOn, turnOff, rewriteHosts, allow, block, setYoutube, countAds, stats, getList, pacUrl, home, file, VERSION, APP };
