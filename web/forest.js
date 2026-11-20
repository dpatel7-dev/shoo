/* forest.js: a living pixel forest at the bottom of the page.
 *
 *   night (dark themes): stars that twinkle, the moon, a shooting star now and
 *   then, mist drifting between the rows of trees, fireflies, an owl.
 *   day (light themes): the sun, clouds drifting by, falling leaves,
 *   butterflies, a deer or a rabbit wandering through.
 *   always: the trees sway in the wind (with gusts), and every so often the
 *   leaves of a tree rustle and a bird flies off.
 *
 * The page's own background shows through (plain white or black: no painted
 * sky). Everything is drawn small and scaled up, so it's crisp pixel art and
 * cheap to draw. It pauses when the tab is hidden, and holds still for people
 * who ask for less motion.
 *
 *   const f = Forest.start(canvas, {
 *     night: () => true,          // night or day
 *     clear: [0.24, 0.76],        // keep the tall trees out of this part (the middle)
 *     share: 0.44,                // how much of the height the forest takes
 *     fps: 24,
 *     mascot: 'owl' | 'fox' | 'hedgehog',  // who lives here
 *   });
 *   f.redraw()   after a theme change      f.hush(ms)   hold still briefly (while typing)
 */
(function (root) {
  'use strict';

  // ── colours ──
  var NIGHT = {
    layers: [
      { c: '#2b303b', s: '#262a34', h: '#353b48', g: '#262a34' },
      { c: '#20242c', s: '#1b1e25', h: '#2c323e', g: '#1b1e25' },
      { c: '#13161b', s: '#0f1115', h: '#262c38', g: '#0f1115' },
      { c: '#08090b', s: '#060708', h: '#1d222c', g: '#060708' },
    ],
    trunk: ['#14161a', '#0b0c0e'], birch: ['#2a2d33', '#14161a'],
    grass: '#0a0b0d', tip: '#161a20', flower: null,
    star: ['#ffffff', '#dfe6ff', '#ffe8c2', '#cfd8ff'],
    moon: '#f3efe2', moonShade: '#d9d3c0', crater: '#c4bda8', glow: 'rgba(243,239,226,',
    mist: '58,66,82', bird: '#c9cdd6', firefly: '#ffd36b',
    deer: ['#0d0e11', '#08090b'], eye: '#ffe9a8', rabbit: '#0d0e11',
  };
  var DAY = {
    layers: [
      { c: '#d3dfd6', s: '#c7d6cb', h: '#e1eae3', g: '#c7d6cb' },
      { c: '#a9c4b0', s: '#98b6a0', h: '#bdd3c3', g: '#98b6a0' },
      { c: '#6c9878', s: '#5a8566', h: '#88b292', g: '#5a8566' },
      { c: '#3d6a4a', s: '#2d573a', h: '#58916a', g: '#2d573a' },
    ],
    trunk: ['#6b4f3a', '#4e3829'], birch: ['#ece8df', '#3b3a36'],
    grass: '#4c8a47', tip: '#78b45e', flower: ['#ff6b6b', '#ffd34d', '#b18cff', '#ffffff', '#ff9ad5'],
    sun: '#ffd34d', sunRim: '#ffb12e', ray: '#ffcf5a',
    cloud: '#ffffff', cloudShade: '#e4e9ee', cloudEdge: '#d2d9e1',
    bird: '#3a3d44', leaf: ['#7fb35a', '#a6c94b', '#e3b341', '#d9822b', '#5f9a48'],
    butterfly: [['#ff8a3d', '#ffd08a'], ['#5b8cff', '#bcd2ff'], ['#ffd34d', '#fff1a8']],
    deer: ['#9a6a3e', '#7a5230'], belly: '#e8d6bd', rabbit: '#a8988a',
  };
  var FOX = { o: '#f0843c', d: '#c45f22', w: '#fff3e2', k: '#2a1a12' };
  var OWL = { D: '#4a2f1f', B: '#8a5a3c', W: '#f3e6cc', Y: '#f2b632', K: '#1b1410', O: '#e8792b', C: '#e2c391' };

  // ── little pictures ──
  var BIRD = [['X...X', '.X.X.', '..X..'], ['.....', 'XX.XX', '..X..']];
  var OWL_SIT = ['.D...D.', '.DBBBD.', 'DWYKYWD'.replace(/Y/g, 'Y'), 'DBWOWBD', '.BCCCB.', '.BCBCB.', '..F.F..'];
  var OWL_FLY = [['D.......D', 'DD.BBB.DD', '.DDBCBDD.', '...BBB...'], ['.........', 'DDDBBBDDD', '.D.BCB.D.', '...BBB...']];
  var DEER = [
    ['..A.A........', '...AA........', '..HHH........', '.HHHH........', '..HH.BBBBBBB.', '...BBBBBBBBBT', '...BBLLLLBBB.', '...L.L...L.L.', '...L.L...L.L.'],
    ['..A.A........', '...AA........', '..HHH........', '.HHHH........', '..HH.BBBBBBB.', '...BBBBBBBBBT', '...BBLLLLBBB.', '....L.L.L.L..', '....L.L.L.L..'],
  ];
  var DEER_GRAZE = ['.............', '.............', '.............', '.............', '.....BBBBBBB.', '..A.BBBBBBBBT', '.AHHBLLLLBBB.', 'HHH.L.L...L.L', 'HH..L.L...L.L'];
  var RABBIT = [['.E.E..', '.E.E..', 'HHHH..', 'HKHHBB', '.BBBBB', '.L..L.'], ['......', '.E.E..', 'HHHH..', 'HKHHBB', 'BBBBBB', 'L....L']];
  var FOXW = [
    ['o.o.........', 'ooo.........', 'okoo........', 'woood.ooooo.', '.woooooooooo', '..oooooooodw', '..d.d...d.d.', '..k.k...k.k.'],
    ['o.o.........', 'ooo.........', 'okoo........', 'woood.ooooo.', '.woooooooooo', '..oooooooodw', '...d.d.d.d..', '...k.k.k.k..'],
  ];
  var HEDGEW = [
    ['....k.k.k.', '...kSkSkSk', '.fFSSsSSSS', 'NEFFSSSSsS', '.FFFFFFFFf', '..L..L..L.'],
    ['....k.k.k.', '...kSkSkSk', '.fFSSsSSSS', 'NEFFSSSSsS', '.FFFFFFFFf', '.L..L..L..'],
  ];
  var HEDGE = { S: '#5e4030', s: '#7d5a40', k: '#b08a64', F: '#f2dcb8', f: '#dcbc90', E: '#1d1410', N: '#2a1a14', L: '#a8784e' };
  var BFLY = [['X.X', '.B.', 'X.X'], ['.X.', '.B.', '.X.']];

  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  function sprite(g, rows, x, y, ink, flip) {
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var i = 0; i < row.length; i++) {
        var ch = row[flip ? row.length - 1 - i : i];
        if (ch !== '.' && ink[ch]) { g.fillStyle = ink[ch]; g.fillRect(x + i, y + r, 1, 1); }
      }
    }
  }

  // ── trees, drawn once in five lean positions (-2..2) ──
  function pineRows(rnd, H) {
    var W = Math.max(5, Math.round(H * (0.42 + rnd() * 0.12))) | 1;
    var trunk = Math.max(2, Math.round(H * 0.1));
    var tiers = H > 40 ? 5 : H > 22 ? 4 : 3;
    var body = H - trunk, rows = [];
    var tierH = body / tiers;
    for (var y = 0; y < body; y++) {
      var t = Math.min(tiers - 1, Math.floor(y / tierH));
      var p = (y - t * tierH) / tierH;
      var reach = (0.3 + 0.7 * (t + 1) / tiers) * (W / 2) * (0.35 + 0.65 * p);
      if (y === 0) reach = 0.5;
      var hw = Math.max(0, Math.round(reach + (rnd() - 0.5) * 1.2));
      rows.push({ hw: hw, edge: p > 0.82 });
    }
    return { W: W, H: H, trunk: trunk, rows: rows };
  }
  function hash(x, y) { return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000; }
  function drawPine(g, shape, pal, trunkPal, lean, ox) {
    var cx = Math.floor(shape.W / 2) + ox, H = shape.H, body = shape.rows.length;
    for (var y = 0; y < body; y++) {
      var r = shape.rows[y];
      var off = Math.round(lean * Math.pow(1 - y / H, 1.6));
      for (var x = -r.hw; x <= r.hw; x++) {
        var f = r.hw ? (x + r.hw) / (2 * r.hw) : 0.5; // 0 on the shady left, 1 on the lit right
        var col = f < 0.3 ? pal.s : f > 0.7 ? pal.h : pal.c;
        if (r.edge && Math.abs(x) > r.hw * 0.45) col = pal.s; // the shadow under each tier
        var n = hash(x + 40, y);
        if (n < 0.1) col = col === pal.h ? pal.c : col === pal.c ? (x > 0 ? pal.h : pal.s) : pal.c; // needles
        g.fillStyle = col;
        g.fillRect(cx + x + off, y, 1, 1);
      }
    }
    g.fillStyle = trunkPal[1];
    g.fillRect(cx, body, 1, shape.trunk);
    if (shape.W > 9) { g.fillStyle = trunkPal[0]; g.fillRect(cx + 1, body, 1, shape.trunk); }
  }
  function roundShape(rnd, H) {
    var Rx = Math.max(3, Math.round(H * (0.22 + rnd() * 0.05))), Ry = Math.max(3, Math.round(Rx * 0.85));
    var W = Rx * 2 + 6, cx = W / 2, cy = Ry + 2;
    var n = Math.round(Rx * Ry / 4) + 5, leaves = [];
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
      leaves.push({ x: cx + Math.cos(a) * d * (Rx - 2), y: cy + Math.sin(a) * d * (Ry - 2), r: Math.max(1.6, Rx * (0.3 + rnd() * 0.14)) });
    }
    // shady bottom-left clusters first, sunlit top-right ones on top
    leaves.sort(function (p, q) { return (p.x - p.y) - (q.x - q.y); });
    return { W: W, H: H, Rx: Rx, Ry: Ry, cx: cx, cy: cy, leaves: leaves, birch: rnd() < 0.18 };
  }
  function drawRound(g, s, pal, trunkPal, birchPal, lean, ox, day) {
    var trunkTop = s.cy + Math.round(s.Ry * 0.5);
    var tp = s.birch && day ? birchPal : trunkPal;
    var tx = Math.round(s.cx) + ox;
    for (var y = trunkTop; y < s.H; y++) {
      g.fillStyle = tp[0]; g.fillRect(tx - 1, y, 2, 1);
      g.fillStyle = tp[1];
      if (s.birch && day) { if (y % 4 === 1) g.fillRect(tx - 1, y, 1, 1); }
      else g.fillRect(tx, y, 1, 1);
    }
    g.fillStyle = tp[1];
    g.fillRect(tx + 1, trunkTop + 1, 2, 1); g.fillRect(tx - 3, trunkTop + 3, 2, 1);
    s.leaves.forEach(function (l) {
      var r = l.r;
      for (var yy = Math.floor(l.y - r); yy <= Math.ceil(l.y + r); yy++) {
        var off = Math.round(lean * Math.pow(Math.max(0, 1 - yy / s.H), 1.4));
        for (var xx = Math.floor(l.x - r); xx <= Math.ceil(l.x + r); xx++) {
          var dx = xx - l.x, dy = yy - l.y;
          if (dx * dx + dy * dy > r * r) continue;
          var lit = (dx - dy) / (r * 1.4);
          var col = lit > 0.3 ? pal.h : lit < -0.45 ? pal.s : pal.c;
          if (yy > s.cy + s.Ry * 0.45 && col === pal.c) col = pal.s; // the underside is in shade
          if (hash(xx + 7, yy) < 0.07) col = col === pal.h ? pal.c : pal.h;
          g.fillStyle = col;
          g.fillRect(xx + off + ox, yy, 1, 1);
        }
      }
    });
  }
  /** A tree in five lean positions: { W, H, frames: [canvas x5] }. */
  function makeTree(rnd, H, pal, P, day, kind) {
    var round = kind === 'round';
    var shape = round ? roundShape(rnd, H) : pineRows(rnd, H);
    var pad = 3, frames = [];
    for (var lean = -2; lean <= 2; lean++) {
      var c = canvas(shape.W + pad * 2, H);
      var g = c.getContext('2d');
      if (round) drawRound(g, shape, pal, P.trunk, P.birch, lean, pad, day);
      else drawPine(g, shape, pal, P.trunk, lean, pad);
      frames.push(c);
    }
    return { W: shape.W + pad * 2, H: H, frames: frames, top: round ? shape.cy - shape.Ry : 0, cx: Math.round(shape.W / 2) + pad };
  }

  function start(cv, opts) {
    opts = opts || {};
    var isNight = opts.night || function () { return true; };
    var clear = opts.clear || [0.26, 0.74];
    var share = opts.share || 0.44;
    var fps = opts.fps || 24;
    var calm = root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var S = null; // the scene for this size and time of day
    var t0 = performance.now(), last = 0, raf = 0, hushUntil = 0, stopped = false;
    var actors = { birds: [], leaves: [], walkers: [], shooting: null, owl: null };
    var timers = { bird: 3, walker: 8, star: 6, owl: 25, gust: 12 };
    var gust = { at: -100, len: 3, power: 0 };

    function build() {
      var px = innerWidth > 1700 ? 4 : 3;
      var W = Math.ceil(cv.clientWidth / px), H = Math.ceil(cv.clientHeight / px);
      if (!W || !H) return;
      cv.width = W; cv.height = H;
      var night = isNight();
      var P = night ? NIGHT : DAY;
      var rnd = rng(W * 7919 + (night ? 1 : 2));
      var forestTop = Math.round(H * (1 - share));
      var bases = [0.7, 0.8, 0.9, 1].map(function (f) { return Math.round(forestTop + (H - forestTop) * f); });
      // the two far rows: one picture each, they barely move
      var far = canvas(W, H), fg = far.getContext('2d');
      [[0, 5, 0.18, 0.32], [1, 8, 0.28, 0.5]].forEach(function (L) {
        var pal = P.layers[L[0]], base = bases[L[0]];
        fg.fillStyle = pal.g; fg.fillRect(0, base - 1, W, H - base + 1);
        for (var x = -6; x < W + 6; x += L[1] + Math.floor(rnd() * L[1] * 0.6)) {
          var th = Math.round((H - forestTop) * (L[2] + rnd() * (L[3] - L[2])));
          var tr = makeTree(rnd, th, pal, P, !night, rnd() < (L[0] ? 0.3 : 0.12) ? 'round' : 'pine');
          fg.drawImage(tr.frames[2], x - tr.cx, base - th);
        }
        if (night) { // mist sits in front of the far trees
          fg.fillStyle = 'rgba(' + P.mist + ',' + (L[0] ? 0.16 : 0.22) + ')';
          fg.fillRect(0, base - Math.round((H - forestTop) * 0.12), W, Math.round((H - forestTop) * 0.12) + 2);
        }
      });
      // the near rows sway, so each tree keeps its five lean positions
      var near = [];
      [[2, 13, 0.42, 0.7, false], [3, 0, 0.75, 1.12, true]].forEach(function (L) {
        var pal = P.layers[L[0]], base = bases[L[0]], list = [];
        if (!L[4]) {
          for (var x = -8; x < W + 8; x += L[1] + Math.floor(rnd() * 10)) {
            var th = Math.round((H - forestTop) * (L[2] + rnd() * (L[3] - L[2])));
            list.push({ x: x, base: base, tree: makeTree(rnd, th, pal, P, !night, rnd() < 0.45 ? 'round' : 'pine'), phase: rnd() * 6, amp: 0.8 });
          }
        } else {
          // big trees at the sides, framing the middle
          var spots = [];
          for (var x2 = -10; x2 < W * clear[0]; x2 += 14 + Math.floor(rnd() * 16)) spots.push(x2);
          for (var x3 = Math.round(W * clear[1]); x3 < W + 10; x3 += 14 + Math.floor(rnd() * 16)) spots.push(x3);
          spots.forEach(function (sx) {
            var th2 = Math.min(H - 6, Math.round((H - forestTop) * (L[2] + rnd() * (L[3] - L[2]))));
            list.push({ x: sx, base: base, tree: makeTree(rnd, th2, pal, P, !night, rnd() < 0.5 ? 'round' : 'pine'), phase: rnd() * 6, amp: 1.4 });
          });
        }
        near.push({ pal: pal, base: base, list: list });
      });
      // bushes along the third row
      var bush = canvas(W, H), bg = bush.getContext('2d');
      var pal2 = P.layers[2];
      bg.fillStyle = pal2.g; bg.fillRect(0, bases[2] - 1, W, H - bases[2] + 1);
      for (var bx = 0; bx < W; bx += 9 + Math.floor(rnd() * 16)) {
        var r = 2 + Math.floor(rnd() * 3);
        for (var yy = -r; yy <= 0; yy++) for (var xx = -r * 2; xx <= r * 2; xx++) {
          if ((xx * xx) / 4 + yy * yy > r * r) continue;
          bg.fillStyle = yy < -r * 0.5 && xx > 0 ? pal2.h : pal2.c;
          bg.fillRect(bx + xx, bases[2] + yy, 1, 1);
        }
      }
      // grass, flowers and a few mushrooms along the front
      var grass = [];
      for (var gx = 0; gx < W; gx++) grass.push({ h: 1 + Math.floor(rnd() * rnd() * 5), flower: !night && rnd() < 0.05 ? P.flower[Math.floor(rnd() * P.flower.length)] : null });
      var shrooms = [];
      for (var m = 0; m < 3; m++) shrooms.push(Math.floor(W * (0.1 + rnd() * 0.8)));
      // the sky
      var stars = [];
      if (night) {
        var n = Math.round(W * forestTop / 260);
        for (var i = 0; i < n; i++) stars.push({ x: Math.floor(rnd() * W), y: Math.floor(rnd() * forestTop * 0.95), c: P.star[Math.floor(rnd() * P.star.length)], ph: rnd() * 6.3, sp: 0.6 + rnd() * 2.2, big: rnd() < 0.06 });
      }
      var clouds = [];
      if (!night) {
        for (var c2 = 0; c2 < 4; c2++) {
          var cw = 24 + Math.floor(rnd() * 26), ch = 10 + Math.floor(rnd() * 5);
          var cc = canvas(cw + 2, ch + 2), cg = cc.getContext('2d');
          var puffs = [], k = 3 + Math.floor(rnd() * 3);
          for (var p = 0; p < k; p++) { var mid = 1 - Math.abs((p + 0.5) / k - 0.5) * 1.4; var pr = 2.5 + (0.45 + 0.55 * mid) * (ch * 0.6) * (0.75 + rnd() * 0.25); puffs.push([4 + (p + 0.5) / k * (cw - 8) + (rnd() - 0.5) * 3, ch - 2 - pr * 0.55, pr]); }
          var inside = (function (puffs, k, ch) { return function (x, y) {
            if (y > ch - 1 || y < 0) return false;
            if (y >= ch - 4 && x >= puffs[0][0] - 2 && x <= puffs[k - 1][0] + 2) return true;
            for (var q = 0; q < k; q++) { var dx = (x - puffs[q][0]) / 1.25, dy = y - puffs[q][1]; if (dx * dx + dy * dy <= puffs[q][2] * puffs[q][2]) return true; }
            return false;
          }; })(puffs, k, ch);
          for (var y2 = 0; y2 < ch; y2++) for (var x4 = 0; x4 <= cw; x4++) {
            if (!inside(x4, y2)) continue;
            var edge = !inside(x4, y2 - 1) || !inside(x4 - 1, y2) || !inside(x4 + 1, y2);
            cg.fillStyle = y2 >= ch - 2 ? P.cloudEdge : y2 >= ch - 4 ? P.cloudShade : edge ? P.cloudShade : P.cloud;
            cg.fillRect(x4 + 1, y2 + 1, 1, 1);
          }
          clouds.push({ img: cc, x: rnd() * W, y: Math.floor(forestTop * (0.08 + rnd() * 0.55)), v: 0.6 + rnd() * 1.4 });
        }
      }
      var flies = [];
      if (night) for (var f = 0; f < Math.round(W / 22) + 6; f++) flies.push({ x: rnd() * W, y: forestTop + rnd() * (H - forestTop), vx: 0, vy: 0, ph: rnd() * 6.3, sp: 1 + rnd() * 2 });
      var bflies = [];
      if (!night) for (var b2 = 0; b2 < 3; b2++) bflies.push({ x: rnd() * W, y: H - 6 - rnd() * (H - bases[2]), vx: 0, vy: 0, c: P.butterfly[b2 % P.butterfly.length], ph: rnd() * 6 });
      // the owl's branch: on a big tree on the left at night
      var perch = null;
      if (night && opts.mascot === 'owl' && near[1].list.length) {
        var tr2 = near[1].list[Math.min(1, near[1].list.length - 1)];
        perch = { tree: tr2, x: tr2.x + tr2.tree.cx - 3, y: tr2.base - tr2.tree.H + Math.round(tr2.tree.H * 0.42) };
      }
      S = { W: W, H: H, px: px, night: night, P: P, forestTop: forestTop, bases: bases, far: far, near: near, bush: bush, grass: grass, shrooms: shrooms, stars: stars, clouds: clouds, flies: flies, bflies: bflies, perch: perch };
      actors = { birds: [], leaves: [], walkers: [], shooting: null, owl: null };
    }

    function wind(t, x) {
      var w = Math.sin(t * 0.45 - x * 0.012) * 0.6 + Math.sin(t * 1.3 + 2 - x * 0.03) * 0.25;
      var gt = t - gust.at;
      if (gt >= 0 && gt < gust.len) w += gust.power * Math.sin(Math.PI * gt / gust.len) * (1 + 0.3 * Math.sin(t * 6 - x * 0.05));
      return w;
    }

    function spawnBird(t) {
      var rows = S.near[S.near.length - 1].list.concat(S.near[0].list);
      if (!rows.length) return;
      var tr = rows[Math.floor(Math.random() * rows.length)];
      tr.rustle = t; // the leaves shake a moment before it goes
      var dir = Math.random() < 0.5 ? -1 : 1;
      var n = !S.night && Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 3) : 1;
      for (var i = 0; i < n; i++) actors.birds.push({ x: tr.x + tr.tree.cx + i * 3 * -dir, y: tr.base - tr.tree.H + tr.tree.top + 2 + i, vx: dir * (22 + Math.random() * 14), vy: -(10 + Math.random() * 10), t: t + 0.55 + i * 0.18, ph: Math.random() * 6 });
    }
    function spawnWalker(t) {
      var dir = Math.random() < 0.5 ? 1 : -1;
      var own = (opts.mascot === 'fox' || opts.mascot === 'hedgehog') && Math.random() < 0.6;
      var kind = own ? opts.mascot : Math.random() < 0.55 ? 'deer' : 'rabbit';
      var w = kind === 'deer' ? 13 : kind === 'fox' ? 12 : kind === 'hedgehog' ? 10 : 6;
      actors.walkers.push({ kind: kind, dir: dir, x: dir > 0 ? -w - 2 : S.W + 2, y: S.bases[2] + (kind === 'rabbit' ? 1 : 0), v: kind === 'deer' ? 7 : kind === 'fox' ? 10 : kind === 'hedgehog' ? 6 : 0, t: t, grazeAt: kind === 'deer' && Math.random() < 0.7 ? t + 3 + Math.random() * 6 : -1, hop: 0 });
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (stopped || document.hidden || !cv.offsetWidth) return; // hidden: nothing to draw
      if (now - last < 1000 / fps || now < hushUntil) return;
      var dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      draw((now - t0) / 1000, dt);
    }

    function draw(t, dt) {
      if (!S) return;
      var g = cv.getContext('2d');
      var W = S.W, H = S.H, P = S.P;
      g.clearRect(0, 0, W, H);
      // ── timers ──
      if (!calm) {
        timers.bird -= dt; timers.walker -= dt; timers.star -= dt; timers.owl -= dt; timers.gust -= dt;
        if (timers.bird <= 0) { spawnBird(t); timers.bird = 5 + Math.random() * 9; }
        if (timers.walker <= 0) { if (!actors.walkers.length) spawnWalker(t); timers.walker = 22 + Math.random() * 40; }
        if (timers.gust <= 0) { gust = { at: t, len: 2.5 + Math.random() * 2, power: 1.1 + Math.random() * 0.8 }; timers.gust = 14 + Math.random() * 20; }
        if (S.night && timers.star <= 0) { actors.shooting = { x: W * (0.1 + Math.random() * 0.6), y: S.forestTop * (0.05 + Math.random() * 0.3), vx: 70 + Math.random() * 40, vy: 22 + Math.random() * 16, t: t }; timers.star = 9 + Math.random() * 20; }
        if (S.night && timers.owl <= 0 && opts.mascot === 'owl') { var d = Math.random() < 0.5 ? 1 : -1; actors.owl = { x: d > 0 ? -10 : W + 2, y: S.forestTop * (0.3 + Math.random() * 0.4), d: d, t: t }; timers.owl = 40 + Math.random() * 50; }
      }

      // ── the sky ──
      if (S.night) {
        S.stars.forEach(function (s) {
          var b = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
          g.globalAlpha = calm ? 0.8 : b * b;
          g.fillStyle = s.c;
          g.fillRect(s.x, s.y, 1, 1);
          if (s.big && b > 0.75) { g.globalAlpha = (b - 0.75) * 2; g.fillRect(s.x - 1, s.y, 3, 1); g.fillRect(s.x, s.y - 1, 1, 3); }
        });
        g.globalAlpha = 1;
        // the moon, with a soft halo
        var mx = Math.round(W * 0.8), my = Math.round(S.forestTop * 0.3), mr = Math.max(5, Math.round(Math.min(W, H) * 0.045));
        for (var ring = 3; ring >= 1; ring--) { g.fillStyle = P.glow + (0.035 * (4 - ring)) + ')'; disc(g, mx, my, mr + ring * 3); }
        g.fillStyle = P.moon; disc(g, mx, my, mr);
        g.fillStyle = P.moonShade; for (var yy = -mr; yy <= mr; yy++) for (var xx = -mr; xx <= mr; xx++) if (xx * xx + yy * yy <= mr * mr && xx - yy < -mr * 0.9) g.fillRect(mx + xx, my + yy, 1, 1);
        g.fillStyle = P.crater; [[-0.35, -0.2, 0.22], [0.25, 0.3, 0.16], [0.3, -0.35, 0.12], [-0.1, 0.45, 0.1]].forEach(function (c) { disc(g, mx + Math.round(c[0] * mr), my + Math.round(c[1] * mr), Math.max(1, Math.round(c[2] * mr))); });
        // a shooting star
        var sh = actors.shooting;
        if (sh) {
          var age = t - sh.t;
          if (age > 1.1) actors.shooting = null;
          else {
            var hx = sh.x + sh.vx * age, hy = sh.y + sh.vy * age;
            for (var k = 0; k < 14; k++) { g.globalAlpha = Math.max(0, (1 - k / 14) * (1 - age / 1.1)); g.fillStyle = '#ffffff'; g.fillRect(Math.round(hx - sh.vx * k * 0.012), Math.round(hy - sh.vy * k * 0.012), 1, 1); }
            g.globalAlpha = 1;
          }
        }
      } else {
        // the sun, with slowly turning rays
        var sx = Math.round(W * 0.8), sy = Math.round(S.forestTop * 0.28), sr = Math.max(5, Math.round(Math.min(W, H) * 0.04));
        g.fillStyle = P.sunRim; disc(g, sx, sy, sr + 1);
        g.fillStyle = P.sun; disc(g, sx, sy, sr);
        g.fillStyle = P.ray;
        for (var a = 0; a < 12; a++) {
          var ang = a / 12 * Math.PI * 2 + (calm ? 0 : t * 0.08);
          var len = 2 + (a % 2) + (calm ? 0 : Math.round(Math.sin(t * 2 + a) * 0.8 + 0.8));
          for (var l = 0; l < len; l++) g.fillRect(Math.round(sx + Math.cos(ang) * (sr + 3 + l)), Math.round(sy + Math.sin(ang) * (sr + 3 + l)), 1, 1);
        }
        S.clouds.forEach(function (c) {
          if (!calm) c.x += c.v * dt;
          if (c.x > W + 4) c.x = -c.img.width - 4;
          g.drawImage(c.img, Math.round(c.x), c.y);
        });
      }
      // the owl crossing the sky
      var ow = actors.owl;
      if (ow) {
        var oa = t - ow.t;
        ow.x += ow.d * 16 * dt;
        if (ow.x < -14 || ow.x > W + 14) actors.owl = null;
        else sprite(g, OWL_FLY[Math.floor(oa * 3) % 2], Math.round(ow.x), Math.round(ow.y + Math.sin(oa * 2) * 2), OWL, ow.d < 0);
      }

      // ── the forest, back to front ──
      g.drawImage(S.far, 0, 0);
      if (S.night) { // mist drifting
        var mistY = S.bases[1] - 4;
        for (var mxx = 0; mxx < W; mxx += 2) {
          var m = Math.sin((mxx + t * 4) * 0.05) * 0.5 + Math.sin((mxx - t * 2.5) * 0.11) * 0.5;
          if (m > 0.2) { g.fillStyle = 'rgba(' + P.mist + ',' + (0.12 * m) + ')'; g.fillRect(mxx, mistY + Math.round(m * 2), 2, 3); }
        }
      }
      drawRow(g, S.near[0], t);
      g.drawImage(S.bush, 0, 0);
      // walkers wander between the bushes and the big trees
      actors.walkers = actors.walkers.filter(function (w) { return drawWalker(g, w, t, dt); });
      drawRow(g, S.near[1], t);
      // the owl on its branch (night)
      if (S.perch) {
        var pr = S.perch, lean = pr.tree.lean || 0;
        var blink = (t % 6) < 0.18;
        sprite(g, blink ? OWL_SIT.map(function (r) { return r.replace(/[YK]/g, 'B'); }) : OWL_SIT, pr.x + lean, pr.y, Object.assign({ F: '#e8792b' }, OWL));
      }
      // grass along the front
      var gy = H - 1;
      g.fillStyle = P.layers[3].g; g.fillRect(0, gy - 1, W, 2);
      for (var x = 0; x < W; x++) {
        var bl = S.grass[x];
        if (!bl.h) continue;
        var bend = calm ? 0 : Math.round(wind(t, x) * 0.9);
        g.fillStyle = P.grass;
        g.fillRect(x, gy - bl.h + 1, 1, bl.h);
        g.fillStyle = bl.flower || P.tip;
        g.fillRect(x + (bl.h > 2 ? bend : 0), gy - bl.h, 1, 1);
      }
      S.shrooms.forEach(function (x) { g.fillStyle = S.night ? '#1a1c22' : '#e9e2d0'; g.fillRect(x, gy - 1, 1, 2); g.fillStyle = S.night ? '#2a2d35' : '#d9473a'; g.fillRect(x - 1, gy - 2, 3, 1); if (!S.night) { g.fillStyle = '#ffffff'; g.fillRect(x, gy - 2, 1, 1); } });

      // ── small lives ──
      if (S.night) {
        S.flies.forEach(function (f) {
          if (!calm) {
            f.vx = (f.vx + (Math.random() - 0.5) * 6 * dt) * 0.98; f.vy = (f.vy + (Math.random() - 0.5) * 6 * dt) * 0.98;
            f.x += f.vx * dt * 6; f.y += f.vy * dt * 6;
            if (f.x < 0) f.x += W; if (f.x > W) f.x -= W;
            if (f.y < S.forestTop) f.vy += 0.3; if (f.y > H - 3) f.vy -= 0.3;
          }
          var gl = Math.pow(Math.max(0, Math.sin(t * f.sp + f.ph)), 3);
          if (gl < 0.05) return;
          var fx = Math.round(f.x), fy = Math.round(f.y);
          g.fillStyle = P.firefly;
          g.globalAlpha = gl * 0.18; g.fillRect(fx - 1, fy - 1, 3, 3);
          g.globalAlpha = gl * 0.35; g.fillRect(fx - 1, fy, 3, 1); g.fillRect(fx, fy - 1, 1, 3);
          g.globalAlpha = gl; g.fillRect(fx, fy, 1, 1);
        });
        g.globalAlpha = 1;
      } else {
        // leaves falling, more in a gust
        var gusty = t - gust.at < gust.len;
        if (!calm && Math.random() < (gusty ? 0.5 : 0.06)) {
          var row = S.near[Math.random() < 0.6 ? 1 : 0].list;
          var tr = row.length && row[Math.floor(Math.random() * row.length)];
          if (tr) actors.leaves.push({ x: tr.x + Math.random() * tr.tree.W, y: tr.base - tr.tree.H * (0.4 + Math.random() * 0.5), c: P.leaf[Math.floor(Math.random() * P.leaf.length)], ph: Math.random() * 6, floor: tr.base });
        }
        actors.leaves = actors.leaves.filter(function (lf) {
          lf.y += 7 * dt; lf.x += (Math.sin(t * 2 + lf.ph) * 6 + wind(t, lf.x) * 6) * dt;
          if (lf.y > H - 1) return false;
          g.fillStyle = lf.c; g.fillRect(Math.round(lf.x), Math.round(lf.y), Math.sin(t * 5 + lf.ph) > 0 ? 2 : 1, 1);
          return true;
        });
        S.bflies.forEach(function (b) {
          if (!calm) {
            b.vx = (b.vx + (Math.random() - 0.5) * 30 * dt) * 0.96; b.vy = (b.vy + (Math.random() - 0.5) * 30 * dt) * 0.96;
            b.x += b.vx * dt * 3; b.y += b.vy * dt * 3;
            if (b.x < 2) b.vx = Math.abs(b.vx); if (b.x > W - 3) b.vx = -Math.abs(b.vx);
            if (b.y < S.bases[1]) b.vy = Math.abs(b.vy); if (b.y > H - 4) b.vy = -Math.abs(b.vy);
          }
          sprite(g, BFLY[Math.floor(t * 8 + b.ph) % 2], Math.round(b.x), Math.round(b.y), { X: b.c[0], B: '#3a2e26' });
        });
      }
      // birds flying off
      actors.birds = actors.birds.filter(function (b) {
        if (t < b.t) return true; // still in the tree, rustling
        var age = t - b.t;
        b.x += b.vx * dt; b.y += b.vy * dt; b.vy -= 2 * dt;
        if (b.x < -8 || b.x > W + 8 || b.y < -6) return false;
        sprite(g, BIRD[Math.floor(age * 7 + b.ph) % 2], Math.round(b.x), Math.round(b.y), { X: P.bird }, b.vx < 0);
        return true;
      });
    }

    function drawRow(g, row, t) {
      row.list.forEach(function (tr) {
        var w = calm ? 0 : wind(t, tr.x) * tr.amp;
        if (!calm && tr.rustle && t - tr.rustle < 0.6) w += Math.sin((t - tr.rustle) * 40) * 1.6;
        var lean = Math.max(-2, Math.min(2, Math.round(w + Math.sin(t * 0.7 + tr.phase) * 0.25)));
        tr.lean = lean;
        g.drawImage(tr.tree.frames[lean + 2], tr.x - 3, tr.base - tr.tree.H);
      });
    }

    function drawWalker(g, w, t, dt) {
      var P = S.P;
      if (w.kind === 'rabbit') {
        w.hop -= dt;
        if (w.hop <= 0) { w.hop = 0.5 + Math.random() * 0.9; w.jump = t; }
        var ja = t - (w.jump || -9);
        var up = ja < 0.35 ? Math.round(Math.sin(ja / 0.35 * Math.PI) * 3) : 0;
        if (ja < 0.35) w.x += w.dir * 26 * dt;
        sprite(g, RABBIT[up ? 1 : 0], Math.round(w.x), w.y - 6 - up, S.night ? { E: P.rabbit, H: P.rabbit, B: P.rabbit, L: P.rabbit, K: P.eye } : { E: '#8a7a6c', H: P.rabbit, B: P.rabbit, L: '#8a7a6c', K: '#2a1a12' }, w.dir > 0);
      } else {
        var grazing = w.grazeAt > 0 && t > w.grazeAt && t < w.grazeAt + 2.6;
        if (!grazing) w.x += w.dir * w.v * dt;
        var rows = w.kind === 'fox' ? FOXW[Math.floor(t * 6) % 2] : w.kind === 'hedgehog' ? HEDGEW[Math.floor(t * 8) % 2] : grazing ? DEER_GRAZE : DEER[Math.floor(t * 4) % 2];
        var ink = w.kind === 'fox' ? FOX : w.kind === 'hedgehog' ? HEDGE : S.night ? { A: P.deer[1], H: P.deer[0], B: P.deer[0], L: P.deer[1], T: P.deer[0] } : { A: '#6a4a2a', H: P.deer[0], B: P.deer[0], L: P.deer[1], T: P.belly };
        var oy = w.y - rows.length;
        sprite(g, rows, Math.round(w.x), oy, ink, w.dir > 0);
        if (S.night && w.kind === 'deer' && !grazing) { g.fillStyle = P.eye; g.fillRect(Math.round(w.x) + (w.dir > 0 ? 11 : 1), oy + 3, 1, 1); }
      }
      return w.x > -20 && w.x < S.W + 20;
    }

    function disc(g, cx, cy, r) { for (var y = -r; y <= r; y++) { var hw = Math.floor(Math.sqrt(r * r - y * y)); g.fillRect(cx - hw, cy + y, hw * 2 + 1, 1); } }

    var resizeT;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { build(); draw((performance.now() - t0) / 1000, 0); }, 120); }
    addEventListener('resize', onResize);
    build();
    draw(0, 0);
    if (!calm) raf = requestAnimationFrame(frame);
    return {
      redraw: function () { build(); draw((performance.now() - t0) / 1000, 0); },
      hush: function (ms) { hushUntil = performance.now() + (ms || 600); },
      stop: function () { stopped = true; cancelAnimationFrame(raf); removeEventListener('resize', onResize); },
    };
  }

  root.Forest = { start: start };
})(typeof window !== 'undefined' ? window : this);
