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
 *     scene: 'forest' | 'closeup' | 'hedgerow',
 *       // forest: rows of trees (scout); closeup: down among big trunks, ferns
 *       // and a mossy log (den); hedgerow: a bramble hedge by a meadow (shoo)
 *   });
 *   f.redraw()   after a theme change      f.hush(ms)   hold still briefly (while typing)
 */
(function (root) {
  'use strict';

  // ── colours ──
  var NIGHT = { // moonlit: the trees lean blue
    layers: [
      { c: '#28344f', s: '#222d45', h: '#33425f', g: '#222d45' },
      { c: '#1c263d', s: '#172034', h: '#283754', g: '#172034' },
      { c: '#111a2d', s: '#0d1424', h: '#1f2c48', g: '#0d1424' },
      { c: '#080d1a', s: '#060a14', h: '#16223c', g: '#060a14' },
    ],
    trunk: ['#121a2c', '#0a0f1b'], birch: ['#263149', '#121a2c'],
    grass: '#080d18', tip: '#17233d', flower: null,
    star: ['#ffffff', '#dfe6ff', '#ffe8c2', '#cfd8ff'],
    moon: '#f1f0ea', moonShade: '#d5d6d6', crater: '#bfc3c9', glow: 'rgba(214,226,255,',
    mist: '56,74,116', bird: '#c3cde6', firefly: '#ffd36b',
    deer: ['#0b1122', '#070b16'], eye: '#ffe9a8', rabbit: '#0b1122',
    bark: ['#060a14', '#0c1222', '#162038'], moss: ['#12233f', '#1b3256'], fern: ['#0a1426', '#14223d'],
    cap: '#1c3456', stem: '#2a3c5c', spot: '#7fe3ff', shine: '#7fe3ff',
    hill: '#121b2f', hedge: { s: '#070c18', c: '#0c1426', h: '#152140', d: '#060a14' },
    berry: ['#232a44', '#2e3756'], bloom: ['#6f82a8', '#8a9bbd'], cane: '#141d33',
    fence: ['#1a2338', '#121a2b', '#26314c'], field: ['#08101f', '#0b1426', '#101b33'], meadow: ['#3b4a6c', '#46587e', '#55678c'], puff: '#9fb0cf', moth: '#c8d1e6',
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
    bark: ['#3d2a1f', '#56402f', '#76583f'], moss: ['#5c9645', '#86b85a'], fern: ['#3c7a3e', '#69a84e'],
    cap: '#d9473a', stem: '#efe6d2', spot: '#ffffff', shine: null,
    hill: '#dbe8d3', hedge: { s: '#2a5232', c: '#3a7240', h: '#5a9a50', d: '#1f4127' },
    berry: ['#3b1f4a', '#5a2d6e'], bloom: ['#ffffff', '#ffd34d'], cane: '#7a4a3a',
    fence: ['#9a7a58', '#7a5c40', '#bfa07c'], field: ['#5c9246', '#6ea655', '#82b866'], meadow: ['#ffffff', '#ffd34d', '#e8453c', '#d98ad1'], puff: '#ffffff', moth: null,
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

  // ── close-up pieces: a giant trunk, a fallen log ──
  function makeGiant(rnd, w, h, P) {
    var c = canvas(w + 8, h), g = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      var flare = y > h - 7 ? Math.round(Math.pow((y - (h - 7)) / 7, 2) * 4) : 0; // roots spread at the bottom
      for (var x = -flare; x < w + flare; x++) {
        var f = (x + flare) / (w + flare * 2);
        var col = f < 0.25 ? P.bark[0] : f > 0.7 ? P.bark[2] : P.bark[1];
        // grooves run up the bark and wander a little
        var gx = x + Math.round(Math.sin(y * 0.15 + x) * 0.6);
        if (hash(gx * 7 + 3, Math.floor(y / 14)) < 0.3 && gx % 3 === 0) col = P.bark[0];
        else if (f > 0.35 && f < 0.75 && hash(gx + 19, Math.floor(y / 9)) > 0.93) col = P.bark[2];
        g.fillStyle = col;
        g.fillRect(x + 4, y, 1, 1);
      }
    }
    // moss creeping up the shady side, and a knot
    for (var m = 0; m < h * 0.5; m++) {
      var my = h - 1 - Math.floor(rnd() * h * 0.45), mx = 4 + Math.floor(rnd() * w * 0.45);
      g.fillStyle = P.moss[rnd() < 0.6 ? 0 : 1]; g.fillRect(mx, my, 1 + (rnd() < 0.4 ? 1 : 0), 1);
    }
    var ky = Math.floor(h * (0.3 + rnd() * 0.3)), kx = 4 + Math.floor(w * 0.5);
    g.fillStyle = P.bark[0]; g.fillRect(kx - 1, ky, 3, 2); g.fillRect(kx, ky - 1, 1, 4);
    return c;
  }
  function makeLog(rnd, w, P) {
    var h = 8, c = canvas(w + 2, h + 2), g = c.getContext('2d');
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var f = y / h, col = f < 0.3 ? P.bark[2] : f > 0.7 ? P.bark[0] : P.bark[1];
      if (hash(Math.floor(x / 3) + 5, y) < 0.15) col = P.bark[0];
      g.fillStyle = col; g.fillRect(x + 1, y + 2, 1, 1);
    }
    // the cut end, with rings
    g.fillStyle = P.bark[2]; g.fillRect(w, 2, 2, h);
    g.fillStyle = P.bark[0]; g.fillRect(w + 1, 4, 1, 2);
    // moss along the top
    for (var mx = 1; mx < w; mx++) if (hash(mx, 3) < 0.6) { g.fillStyle = P.moss[hash(mx, 9) < 0.5 ? 0 : 1]; g.fillRect(mx, 1 + (hash(mx, 4) < 0.4 ? 0 : 1), 1, 1 + (hash(mx, 5) < 0.3 ? 1 : 0)); }
    return c;
  }

  // ── hedgerow pieces: a hill with little trees, the bramble hedge, a fence ──
  function buildHedgerow(W, H, P, rnd, night, forestTop) {
    var band = H - forestTop;
    var hillTop = forestTop + Math.round(band * 0.34);
    var far = canvas(W, H), fg = far.getContext('2d');
    var hillY = [];
    for (var x = 0; x < W; x++) hillY.push(hillTop + Math.round(Math.sin(x * 0.011 + 1.3) * 3 + Math.sin(x * 0.031) * 1.5));
    fg.fillStyle = P.hill;
    for (var x1 = 0; x1 < W; x1++) fg.fillRect(x1, hillY[x1], 1, H - hillY[x1]);
    for (var tx = Math.floor(rnd() * 20); tx < W; tx += 14 + Math.floor(rnd() * 30)) {
      var th = Math.max(6, Math.round(band * (0.14 + rnd() * 0.12)));
      var tr = makeTree(rnd, th, P.layers[1], Object.assign({}, P, { trunk: [P.layers[1].s, P.layers[1].s] }), !night, rnd() < 0.8 ? 'round' : 'pine');
      fg.drawImage(tr.frames[2], tx - tr.cx, hillY[Math.max(0, Math.min(W - 1, tx))] - th + 1);
    }
    // the hedge: leafy clumps along a wavy top
    var base = forestTop + Math.round(band * 0.8);
    var hedge = canvas(W, H), hg = hedge.getContext('2d');
    var top = [];
    for (var x2 = 0; x2 < W; x2++) top.push(base - Math.round(band * (0.3 + 0.07 * Math.sin(x2 * 0.045 + 2) + 0.04 * Math.sin(x2 * 0.13))));
    var hp = P.hedge;
    for (var x3 = 0; x3 < W; x3++) { hg.fillStyle = hp.s; hg.fillRect(x3, top[x3] + 3, 1, base - top[x3] - 2); }
    for (var cx = -4; cx < W + 4; cx += 3 + Math.floor(rnd() * 4)) {
      var tt = top[Math.max(0, Math.min(W - 1, cx))];
      var layersDown = 1 + Math.floor((base - tt) / 7);
      for (var k = 0; k < layersDown; k++) {
        var r = 3 + rnd() * 3, cy = tt + 3 + k * 6 + rnd() * 2;
        if (cy > base - 2) continue;
        for (var yy = Math.floor(cy - r); yy <= cy + r; yy++) for (var xx = Math.floor(cx - r); xx <= cx + r; xx++) {
          var dx = xx - cx, dy = yy - cy;
          if (dx * dx + dy * dy > r * r || yy > base || xx < 0 || xx >= W) continue;
          var lit = (dx - dy) / (r * 1.4);
          var col = lit > 0.35 ? hp.h : lit < -0.4 ? hp.s : hp.c;
          if (k > 0 && col === hp.h) col = hp.c; // lower clumps sit in the shade of the top ones
          if (hash(xx + 3, yy) < 0.08) col = col === hp.h ? hp.c : hp.h;
          hg.fillStyle = col; hg.fillRect(xx, yy, 1, 1);
        }
      }
    }
    hg.fillStyle = hp.d; hg.fillRect(0, base, W, 1);
    // blackberries and bramble flowers in the hedge
    var spots = [];
    for (var b = 0; b < W / 6; b++) {
      var bx = Math.floor(rnd() * W), by = top[bx] + 3 + Math.floor(rnd() * Math.max(1, base - top[bx] - 6));
      if (rnd() < 0.62) {
        hg.fillStyle = P.berry[0]; hg.fillRect(bx, by, 2, 2);
        hg.fillStyle = P.berry[1]; hg.fillRect(bx, by, 1, 1);
      } else {
        hg.fillStyle = P.bloom[0]; hg.fillRect(bx - 1, by, 3, 1); hg.fillRect(bx, by - 1, 1, 3);
        hg.fillStyle = P.bloom[1]; hg.fillRect(bx, by, 1, 1);
      }
      spots.push({ x: bx, y: by });
    }
    // bramble canes arching out of the top (they sway)
    var canes = [];
    for (var c = 0; c < W / 26; c++) {
      var cx2 = Math.floor(rnd() * W);
      canes.push({ x: cx2, y: top[cx2] + 2, len: 6 + Math.floor(rnd() * 8), dir: rnd() < 0.5 ? -1 : 1, ph: rnd() * 6, berry: rnd() < 0.5 });
    }
    // a wooden fence in front of part of the hedge
    var fence = canvas(W, H), fc = fence.getContext('2d');
    var fy = base + 1, fh = Math.max(7, Math.round(band * 0.2));
    var from = Math.floor(W * (rnd() < 0.5 ? 0.02 : 0.55)), to = from + Math.floor(W * (0.3 + rnd() * 0.12));
    for (var px2 = from; px2 < to; px2 += 13 + Math.floor(rnd() * 5)) {
      var lean = rnd() < 0.2 ? 1 : 0;
      for (var py = 0; py < fh; py++) {
        fc.fillStyle = P.fence[1]; fc.fillRect(px2 + (py < fh / 2 ? lean : 0), fy - py, 2, 1);
        fc.fillStyle = P.fence[2]; fc.fillRect(px2 + 2 + (py < fh / 2 ? lean : 0), fy - py, 1, 1);
      }
      fc.fillStyle = P.fence[2]; fc.fillRect(px2, fy - fh, 2, 1);
    }
    [0.35, 0.72].forEach(function (f) { fc.fillStyle = P.fence[0]; fc.fillRect(from, fy - Math.round(fh * f), to - from, 1); fc.fillStyle = P.fence[1]; fc.fillRect(from, fy - Math.round(fh * f) + 1, to - from, 1); });
    // the meadow in front: tall grass, flowers, dandelion clocks
    var grass = [], flowers = [], puffs = [];
    for (var gx = 0; gx < W; gx++) grass.push({ h: 1 + Math.floor(rnd() * rnd() * 8), flower: null });
    for (var f2 = 0; f2 < W / 9; f2++) flowers.push({ x: Math.floor(rnd() * W), h: 3 + Math.floor(rnd() * 6), c: P.meadow[Math.floor(rnd() * P.meadow.length)], kind: rnd() < 0.5 ? 'daisy' : 'dot', ph: rnd() * 6 });
    for (var d = 0; d < Math.max(2, W / 90); d++) puffs.push({ x: Math.floor(W * (0.05 + rnd() * 0.9)), h: 6 + Math.floor(rnd() * 4), seeds: 6 });
    var bees = [];
    if (!night) for (var e = 0; e < 3; e++) bees.push({ x: rnd() * W, y: base + 3 + rnd() * (H - base - 6), vx: 0, vy: 0, ph: rnd() * 6 });
    var moths = [];
    if (night) for (var mo = 0; mo < 3; mo++) moths.push({ x: rnd() * W, y: forestTop + rnd() * band * 0.6, vx: 0, vy: 0, ph: rnd() * 6 });
    // the field in front of the hedge
    var field = canvas(W, H), fd = field.getContext('2d');
    for (var fy2 = base + 1; fy2 < H; fy2++) for (var fx2 = 0; fx2 < W; fx2++) {
      var n2 = hash(fx2 + 31, fy2);
      fd.fillStyle = n2 < 0.12 ? P.field[0] : n2 > 0.9 ? P.field[2] : P.field[1];
      fd.fillRect(fx2, fy2, 1, 1);
    }
    return { field: field, far: far, hedge: hedge, hedgeTop: top, hedgeBase: base, spots: spots, canes: canes, fence: fence, grass: grass, flowers: flowers, puffs: puffs, bees: bees, moths: moths, hillTop: hillTop };
  }

  function start(cv, opts) {
    opts = opts || {};
    var isNight = opts.night || function () { return true; };
    var clear = opts.clear || [0.26, 0.74];
    var share = opts.share || 0.44;
    var fps = opts.fps || 24;
    var scene = opts.scene || 'forest';
    var calm = root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var S = null; // the scene for this size and time of day
    var t0 = performance.now(), last = 0, raf = 0, hushUntil = 0, stopped = false;
    var actors = { birds: [], leaves: [], walkers: [], shooting: null, owl: null, seeds: [] };
    var timers = { bird: 3, walker: 8, star: 6, owl: 25, gust: 12 };
    var gust = { at: -100, len: 3, power: 0 };

    function build() {
      var px = (innerWidth > 1700 ? 4 : 3) * (scene === 'closeup' ? 2 : 1);
      var W = Math.ceil(cv.clientWidth / px), H = Math.ceil(cv.clientHeight / px);
      if (!W || !H) return;
      cv.width = W; cv.height = H;
      var night = isNight();
      var P = night ? NIGHT : DAY;
      var rnd = rng(W * 7919 + (night ? 1 : 2));
      var forestTop = Math.round(H * (1 - share));
      var bases = [0.7, 0.8, 0.9, 1].map(function (f) { return Math.round(forestTop + (H - forestTop) * f); });
      if (scene === 'hedgerow') {
        var hr = buildHedgerow(W, H, P, rnd, night, forestTop);
        S = { scene: scene, W: W, H: H, px: px, night: night, P: P, forestTop: forestTop, bases: [hr.hillTop, hr.hedgeBase - 6, H - 2, H - 1], near: [{ list: [] }, { list: [] }], walkY: H - 2 };
        Object.assign(S, hr, sky(W, H, P, rnd, night, forestTop, [hr.hillTop, hr.hedgeBase - 8, hr.hedgeBase, H]));
        actors = { birds: [], leaves: [], walkers: [], shooting: null, owl: null, seeds: [] };
        return;
      }
      // the two far rows: one picture each, they barely move
      var far = canvas(W, H), fg = far.getContext('2d');
      [[0, 5, 0.18, 0.32], [1, 8, 0.28, 0.5]].filter(function (L) { return scene !== 'closeup' || L[0] === 1; }).forEach(function (L) {
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
      var lives = sky(W, H, P, rnd, night, forestTop, bases);
      // close up: giant trunks at the sides, a fallen log, ferns in front
      var giants = [], log = null, ferns = [];
      if (scene === 'closeup') {
        var gw = Math.max(7, Math.round(W * 0.05));
        [[-Math.round(gw * 0.35), 1.25], [Math.round(W * 0.075), 0.7], [Math.round(W * 0.9), 0.75], [W - Math.round(gw * 0.9), 1.3]].forEach(function (sp) {
          var w = Math.round(gw * sp[1] * (0.9 + rnd() * 0.2));
          giants.push({ x: sp[0], img: makeGiant(rnd, w, H, P), top: 0 });
        });
        // the canopy overhead: leaves hanging into the top corners
        var canopy = canvas(W, H), cpg = canopy.getContext('2d'), cl = P.layers[3];
        [[0, W * 0.2], [W * 0.8, W]].forEach(function (span) {
          for (var cx0 = span[0] - 6; cx0 < span[1] + 6; cx0 += 4 + Math.floor(rnd() * 5)) {
            var rr = 4 + rnd() * 6, cy0 = -2 + rnd() * (H * 0.06) * (1 - Math.abs((cx0 - (span[0] + span[1]) / 2) / (span[1] - span[0])));
            for (var yy0 = Math.floor(cy0 - rr); yy0 <= cy0 + rr; yy0++) for (var xx0 = Math.floor(cx0 - rr); xx0 <= cx0 + rr; xx0++) {
              var ddx = xx0 - cx0, ddy = yy0 - cy0;
              if (ddx * ddx + ddy * ddy > rr * rr || yy0 < 0) continue;
              var lit0 = (ddx - ddy) / (rr * 1.4);
              var col0 = lit0 > 0.35 ? cl.h : lit0 < -0.4 ? cl.s : cl.c;
              if (hash(xx0 + 5, yy0) < 0.08) col0 = cl.h;
              cpg.fillStyle = col0; cpg.fillRect(xx0, yy0, 1, 1);
            }
          }
        });
        giants.canopy = canopy;
        var lw = Math.round(W * (0.1 + rnd() * 0.05)), onLeft = rnd() < 0.5;
        log = { x: onLeft ? Math.round(W * clear[0] * 0.15) : Math.round(W * (clear[1] + 0.04)), img: makeLog(rnd, lw, P), w: lw, shrooms: [] };
        for (var s3 = 0; s3 < 3; s3++) log.shrooms.push(Math.round(lw * (0.15 + s3 * 0.28 + rnd() * 0.1)));
        for (var fn = 0; fn < 5; fn++) {
          var fx = fn < 2 ? Math.round(W * clear[0] * (0.3 + fn * 0.4)) : fn < 4 ? Math.round(W * (clear[1] + (1 - clear[1]) * (0.2 + (fn - 2) * 0.45))) : Math.round(W * (0.35 + rnd() * 0.3));
          ferns.push({ x: fx, size: fn === 4 ? 7 : 10 + Math.floor(rnd() * 5), ph: rnd() * 6 });
        }
      }
      // the owl's branch: on a big tree on the left at night
      var perch = null;
      if (night && opts.mascot === 'owl' && near[1].list.length) {
        var tr2 = near[1].list[Math.min(1, near[1].list.length - 1)];
        perch = { tree: tr2, x: tr2.x + tr2.tree.cx - 3, y: tr2.base - tr2.tree.H + Math.round(tr2.tree.H * 0.42) };
      }
      S = { scene: scene, W: W, H: H, px: px, night: night, P: P, forestTop: forestTop, bases: bases, far: far, near: near, bush: bush, grass: grass, shrooms: shrooms, perch: perch,
        giants: giants, log: log, ferns: ferns, walkY: scene === 'closeup' ? H - 2 : bases[2] };
      Object.assign(S, lives);
      actors = { birds: [], leaves: [], walkers: [], shooting: null, owl: null, seeds: [] };
    }

    /** Stars, clouds, fireflies and butterflies for a scene. */
    function sky(W, H, P, rnd, night, forestTop, bases) {
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
        return { stars: stars, clouds: clouds, flies: flies, bflies: bflies };
    }

    function wind(t, x) {
      var w = Math.sin(t * 0.45 - x * 0.012) * 0.6 + Math.sin(t * 1.3 + 2 - x * 0.03) * 0.25;
      var gt = t - gust.at;
      if (gt >= 0 && gt < gust.len) w += gust.power * Math.sin(Math.PI * gt / gust.len) * (1 + 0.3 * Math.sin(t * 6 - x * 0.05));
      return w;
    }

    function spawnBird(t) {
      if (S.scene === 'hedgerow') {
        var sx = Math.floor(Math.random() * S.W), dir0 = Math.random() < 0.5 ? -1 : 1;
        S.rustle = { x: sx, t: t };
        var n0 = !S.night && Math.random() < 0.4 ? 2 + Math.floor(Math.random() * 2) : 1;
        for (var i0 = 0; i0 < n0; i0++) actors.birds.push({ x: sx + i0 * 3 * -dir0, y: S.hedgeTop[sx] + 2 + i0, vx: dir0 * (22 + Math.random() * 14), vy: -(12 + Math.random() * 10), t: t + 0.55 + i0 * 0.18, ph: Math.random() * 6 });
        return;
      }
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
      var own = (opts.mascot === 'fox' || opts.mascot === 'hedgehog') && Math.random() < (S.scene === 'forest' ? 0.6 : 0.8);
      var kind = own ? opts.mascot : S.scene !== 'hedgerow' && Math.random() < 0.55 ? 'deer' : 'rabbit';
      var w = kind === 'deer' ? 13 : kind === 'fox' ? 12 : kind === 'hedgehog' ? 10 : 6;
      actors.walkers.push({ kind: kind, dir: dir, x: dir > 0 ? -w - 2 : S.W + 2, y: S.walkY + (kind === 'rabbit' ? 1 : 0), v: kind === 'deer' ? 7 : kind === 'fox' ? 10 : kind === 'hedgehog' ? 6 : 0, t: t, grazeAt: (kind === 'deer' || kind === 'hedgehog') && Math.random() < 0.7 ? t + 3 + Math.random() * 6 : -1, hop: 0 });
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

      if (S.scene === 'hedgerow') drawHedgerow(g, t, dt);
      else drawForest(g, t, dt);
      lives(g, t, dt);
    }

    function drawForest(g, t, dt) {
      var W = S.W, H = S.H, P = S.P;
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
      // walkers wander between the bushes and the big trees (close up: right in front)
      if (S.scene !== 'closeup') actors.walkers = actors.walkers.filter(function (w) { return drawWalker(g, w, t, dt); });
      drawRow(g, S.near[1], t);
      if (S.scene === 'closeup') {
        S.giants.forEach(function (gi) { g.drawImage(gi.img, gi.x - 4, gi.top); });
        if (S.giants.canopy) g.drawImage(S.giants.canopy, 0, 0);
        var lg = S.log;
        if (lg) {
          g.drawImage(lg.img, lg.x - 1, H - 11);
          lg.shrooms.forEach(function (sx, i) {
            var x = lg.x + sx, y = H - 10;
            g.fillStyle = P.stem; g.fillRect(x, y - 1, 1, 2);
            g.fillStyle = P.cap; g.fillRect(x - 1, y - 2, 3, 1); g.fillRect(x, y - 3, 1, 1);
            if (S.night) { // they glow, softly, in turn
              var gl = 0.45 + 0.35 * Math.sin(t * 1.3 + i * 2.1);
              g.globalAlpha = gl * 0.25; g.fillStyle = P.shine; g.fillRect(x - 2, y - 4, 5, 4);
              g.globalAlpha = gl; g.fillRect(x, y - 2, 1, 1);
              g.globalAlpha = 1;
            } else { g.fillStyle = P.spot; g.fillRect(x - 1, y - 2, 1, 1); }
          });
        }
        actors.walkers = actors.walkers.filter(function (w) { return drawWalker(g, w, t, dt); });
      }
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
      S.shrooms.forEach(function (x) { g.fillStyle = S.night ? '#18213a' : '#e9e2d0'; g.fillRect(x, gy - 1, 1, 2); g.fillStyle = S.night ? '#25324f' : '#d9473a'; g.fillRect(x - 1, gy - 2, 3, 1); if (!S.night) { g.fillStyle = '#ffffff'; g.fillRect(x, gy - 2, 1, 1); } });
      // ferns right in front (close up)
      S.ferns.forEach(function (f) { drawFern(g, f, t, gy); });
    }

    function drawFern(g, f, t, gy) {
      var P = S.P, bend = calm ? 0 : wind(t, f.x) * 0.8 + Math.sin(t * 1.1 + f.ph) * 0.3;
      for (var k = -2; k <= 2; k++) {
        var len = f.size - Math.abs(k) * 1.5, dir = k === 0 ? 0 : k < 0 ? -1 : 1;
        for (var i = 0; i < len; i++) {
          var p = i / len;
          var x = Math.round(f.x + dir * (i * 0.9) * (0.4 + Math.abs(k) * 0.3) + bend * p * p * 2);
          var y = Math.round(gy - i * (1 - Math.abs(k) * 0.18) + (Math.abs(k) > 1 ? p * p * 3 : p * p * 1.5));
          g.fillStyle = P.fern[0]; g.fillRect(x, y, 1, 1);
          if (i % 2 === 0 && i < len - 1) { g.fillStyle = P.fern[1]; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); }
        }
      }
    }

    function drawHedgerow(g, t, dt) {
      var W = S.W, H = S.H, P = S.P;
      g.drawImage(S.far, 0, 0);
      if (S.night) { // low mist over the field
        var my = S.hillTop + 3;
        for (var mx = 0; mx < W; mx += 2) {
          var m = Math.sin((mx + t * 3) * 0.04) * 0.5 + Math.sin((mx - t * 2) * 0.09) * 0.5;
          if (m > 0.15) { g.fillStyle = 'rgba(' + P.mist + ',' + (0.14 * m) + ')'; g.fillRect(mx, my + Math.round(m * 2), 2, 3); }
        }
      }
      g.drawImage(S.hedge, 0, 0);
      // a rustle where a bird is about to leave
      if (S.rustle && t - S.rustle.t < 0.6) {
        var rx = S.rustle.x, ry = S.hedgeTop[rx];
        for (var r = 0; r < 6; r++) { g.fillStyle = r % 2 ? P.hedge.h : P.hedge.c; g.fillRect(rx - 3 + r + Math.round(Math.sin((t - S.rustle.t) * 40 + r) * 1.2), ry + 1 + (r % 3), 1, 1); }
      }
      // bramble canes sway above the hedge
      S.canes.forEach(function (c) {
        var bend = calm ? 0 : wind(t, c.x) + Math.sin(t * 0.9 + c.ph) * 0.4;
        var x = c.x, y = c.y;
        for (var i = 0; i < c.len; i++) {
          var p = i / c.len;
          x = c.x + Math.round(c.dir * i * 0.7 + bend * p * 2);
          y = c.y - Math.round(Math.sin(p * Math.PI * 0.85) * c.len * 0.45);
          g.fillStyle = P.cane; g.fillRect(x, y, 1, 1);
          if (i % 3 === 1) { g.fillStyle = P.hedge.c; g.fillRect(x, y - 1, 1, 1); }
        }
        if (c.berry) { g.fillStyle = P.berry[0]; g.fillRect(x, y + 1, 2, 2); g.fillStyle = P.berry[1]; g.fillRect(x, y + 1, 1, 1); }
      });
      g.drawImage(S.fence, 0, 0);
      // the ground in front
      var gy = H - 1;
      g.drawImage(S.field, 0, 0);
      actors.walkers = actors.walkers.filter(function (w) { return drawWalker(g, w, t, dt); });
      for (var x = 0; x < W; x++) {
        var bl = S.grass[x];
        var bend = calm ? 0 : Math.round(wind(t, x) * (bl.h > 4 ? 1.3 : 0.8));
        g.fillStyle = P.grass; g.fillRect(x, gy - bl.h + 1, 1, bl.h);
        g.fillStyle = P.tip; g.fillRect(x + (bl.h > 3 ? bend : 0), gy - bl.h, 1, 1);
      }
      S.flowers.forEach(function (f) {
        var bend = calm ? 0 : Math.round(wind(t, f.x) * 1.1);
        g.fillStyle = P.grass; for (var i = 0; i < f.h; i++) g.fillRect(f.x + Math.round(bend * i / f.h), gy - i, 1, 1);
        var hx = f.x + bend, hy = gy - f.h;
        g.fillStyle = f.c;
        if (f.kind === 'daisy') { g.fillRect(hx - 1, hy, 3, 1); g.fillRect(hx, hy - 1, 1, 3); g.fillStyle = S.night ? P.meadow[1] : '#ffd34d'; g.fillRect(hx, hy, 1, 1); }
        else g.fillRect(hx, hy, 2, 2);
      });
      // dandelion clocks: a gust takes their seeds
      var gusty = !calm && t - gust.at < gust.len;
      S.puffs.forEach(function (d) {
        var bend = calm ? 0 : Math.round(wind(t, d.x));
        g.fillStyle = P.grass; for (var i = 0; i < d.h; i++) g.fillRect(d.x + Math.round(bend * i / d.h), gy - i, 1, 1);
        var hx = d.x + bend, hy = gy - d.h;
        if (d.seeds > 0) {
          g.fillStyle = P.puff; g.globalAlpha = 0.9;
          g.fillRect(hx - 1, hy - 1, 3, 3); g.globalAlpha = 1;
          if (gusty && Math.random() < 0.08) { d.seeds--; actors.seeds.push({ x: hx, y: hy - 1, vx: 6 + Math.random() * 8, vy: -(2 + Math.random() * 4), ph: Math.random() * 6 }); }
        } else if (!calm && Math.random() < 0.0015) d.seeds = 6; // a new one has grown
      });
      actors.seeds = actors.seeds.filter(function (sd) {
        sd.x += (sd.vx + wind(t, sd.x) * 6) * dt; sd.y += (sd.vy + Math.sin(t * 2 + sd.ph) * 3) * dt; sd.vy += 0.5 * dt;
        if (sd.x > W + 2 || sd.y > H || sd.y < 0) return false;
        g.fillStyle = P.puff; g.fillRect(Math.round(sd.x), Math.round(sd.y), 1, 1);
        return true;
      });
      // bees by day, moths at night
      (S.night ? S.moths : S.bees).forEach(function (b) {
        if (!calm) {
          b.vx = (b.vx + (Math.random() - 0.5) * 40 * dt) * 0.95; b.vy = (b.vy + (Math.random() - 0.5) * 40 * dt) * 0.95;
          b.x += b.vx * dt * 3; b.y += b.vy * dt * 3;
          if (b.x < 2) b.vx = Math.abs(b.vx); if (b.x > W - 3) b.vx = -Math.abs(b.vx);
          var lo = S.night ? S.forestTop : S.hedgeBase, hi = S.night ? S.hedgeBase : H - 4;
          if (b.y < lo) b.vy = Math.abs(b.vy); if (b.y > hi) b.vy = -Math.abs(b.vy);
        }
        var bx = Math.round(b.x), by = Math.round(b.y);
        if (S.night) { g.fillStyle = P.moth; g.fillRect(bx, by, 1, 1); if (Math.floor(t * 10 + b.ph) % 2) { g.fillRect(bx - 1, by - 1, 1, 1); g.fillRect(bx + 1, by - 1, 1, 1); } }
        else { g.fillStyle = '#2a2216'; g.fillRect(bx, by, 1, 1); g.fillStyle = '#ffcc33'; g.fillRect(bx + 1, by, 1, 1); if (Math.floor(t * 14 + b.ph) % 2) { g.fillStyle = '#ffffff'; g.fillRect(bx, by - 1, 1, 1); } }
      });
    }

    function lives(g, t, dt) {
      var W = S.W, H = S.H, P = S.P;
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
        if (!calm && S.scene !== 'hedgerow' && Math.random() < (gusty ? 0.5 : 0.06)) {
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
        var rows = w.kind === 'fox' ? FOXW[Math.floor(t * 6) % 2] : w.kind === 'hedgehog' ? HEDGEW[Math.floor(t * (grazing ? 2.5 : 8)) % 2] : grazing ? DEER_GRAZE : DEER[Math.floor(t * 4) % 2];
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
