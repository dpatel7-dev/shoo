'use strict';
// Bramble, shoo's hedgehog. Every letter is one pixel and '.' is see-through.

const BIG = [
  '..........................',
  '..........................',
  '.........k...k............',
  '......k.kSk.kSk.k.........',
  '.....kSkSSSkSSSkSk........',
  '...k.SSSSsSSSSsSSSk.......',
  '..kSSSsSSSSSsSSSSSSk......',
  '.kSSsSSSSsSSSSSsSSSSFf....',
  '.SSSSSSsSSSSsSSSSSSFFFFf..',
  'kSsSSSSSSSSSSSSsSSFFEHFFf.',
  'SSSSSsSSSsSSSSSSSSFFEEFFFN',
  'SSsSSSSSSSSSsSSSSFFFFFFFFN',
  '.SSSSSSsSSSSSSSSFFPPFFFFf.',
  '..fFFFFFFFFFFFFFFFFFFFFf..',
  '...fFFFFFFFFFFFFFFFFFff...',
  '....LL..LL.......LL..LL...',
  '..........................',
];

// the small picture, made of whole cells (macOS Terminal)
const MINI = [
  '............',
  '...k.k.k....',
  '..kSkSkSk...',
  '.kSSSSSSSFf.',
  'kSSsSSSSFEFN',
  'SSSSSSSFFFFN',
  '.fFFFFFFPFf.',
  '..L.L..L.L..',
  '............',
];

const INK = { S: '#5e4030', s: '#7d5a40', k: '#b08a64', F: '#f2dcb8', f: '#dcbc90', E: '#1d1410', N: '#2a1a14', P: '#f2a0a6', L: '#a8784e', H: '#ffffff' };

module.exports = { BIG, MINI, INK, NAME: 'Bramble' };
