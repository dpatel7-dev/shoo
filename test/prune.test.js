'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pruneJson, pruneHtml, objectEnd } = require('../src/prune');

const player = {
  responseContext: {},
  playabilityStatus: { status: 'OK' },
  streamingData: { formats: [{ itag: 18 }] },
  adPlacements: [{ adPlacementRenderer: {} }, { adPlacementRenderer: {} }],
  playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
  adSlots: [{ adSlotRenderer: {} }],
  auxiliaryUi: { messageRenderers: { enforcementMessageViewModel: { title: 'Ad blockers violate...' } } },
  videoDetails: { videoId: 'abc', title: 'A video' },
};

test('video ads come out of the player data, the video stays', () => {
  const r = pruneJson(JSON.stringify(player));
  const d = JSON.parse(r.text);
  assert.ok(r.removed >= 3);
  for (const k of ['adPlacements', 'playerAds', 'adSlots']) assert.ok(!(k in d), k);
  assert.deepStrictEqual(d.streamingData, player.streamingData);
  assert.deepStrictEqual(d.videoDetails, player.videoDetails);
  assert.deepStrictEqual(d.auxiliaryUi.messageRenderers, {});
});

test('feed, search and up-next ads are removed as whole items', () => {
  const feed = { contents: [
    { richItemRenderer: { content: { videoRenderer: { videoId: 'v1' } } } },
    { richItemRenderer: { content: { adSlotRenderer: { fulfillmentContent: {} } } } },
    { richSectionRenderer: { content: { statementBannerRenderer: {} } } },
    { compactPromotedVideoRenderer: {} },
    { searchPyvRenderer: { ads: [] } },
    { compactVideoRenderer: { videoId: 'v2' } },
    { engagementPanelSectionListRenderer: { targetId: 'engagement-panel-ads' } },
    { engagementPanelSectionListRenderer: { targetId: 'engagement-panel-comments' } },
  ] };
  const r = pruneJson(JSON.stringify(feed));
  const d = JSON.parse(r.text);
  assert.strictEqual(r.removed, 5);
  assert.deepStrictEqual(d.contents.map((x) => Object.keys(x)[0]), ['richItemRenderer', 'compactVideoRenderer', 'engagementPanelSectionListRenderer']);
});

test('Shorts ads come out of the swipe list', () => {
  const reels = { entries: [
    { command: { reelWatchEndpoint: { videoId: 's1' } } },
    { command: { reelWatchEndpoint: { adClientParams: { isAd: true } } } },
    { command: { reelWatchEndpoint: { videoId: 's2' } } },
  ] };
  const r = pruneJson(JSON.stringify(reels));
  assert.strictEqual(r.removed, 1);
  assert.strictEqual(JSON.parse(r.text).entries.length, 2);
});

test('data without ads is passed on byte for byte', () => {
  const text = '{"a": 1,  "b": [1,2]}';
  assert.deepStrictEqual(pruneJson(text), { text, removed: 0 });
  assert.deepStrictEqual(pruneJson('not json'), { text: 'not json', removed: 0 });
});

test('ads come out of the data inside YouTube\'s HTML pages', () => {
  const html = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = {"x":"}"};</script>`
    + `<script nonce="n">var ytInitialData = {"contents":[{"adSlotRenderer":{}},{"videoRenderer":{"title":"has } and { and \\" inside"}}]};</script></html>`;
  const r = pruneHtml(html);
  assert.ok(r.removed >= 4);
  assert.ok(!r.text.includes('adPlacements') && !r.text.includes('adSlotRenderer'));
  assert.ok(r.text.includes('var meta = {"x":"}"};'));
  assert.ok(r.text.includes('has } and { and \\" inside'));
  const again = /var ytInitialData = (\{.*?\});<\/script>/.exec(r.text)[1];
  assert.strictEqual(JSON.parse(again).contents.length, 1);
});

test('a title containing </script> cannot break the page', () => {
  const html = '<script>var ytInitialData = {"t":"<\\/script><b>","adSlots":[]};</script>';
  const r = pruneHtml(html);
  assert.ok(!/<\/script><b>/.test(r.text.slice(0, r.text.lastIndexOf('</script>'))));
});

test('finding the end of a JSON object', () => {
  const s = 'x = {"a":"}{","b":{"c":[1,{}]}}; rest';
  assert.strictEqual(s.slice(4, objectEnd(s, 4)), '{"a":"}{","b":{"c":[1,{}]}}');
  assert.strictEqual(objectEnd('{"a":', 0), -1);
});
