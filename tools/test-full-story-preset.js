"use strict";

const assert = require("node:assert/strict");
const ActionCore = require("../boss-duel-action-tree-core.js");
const StoryCore = ActionCore.NaturalCore;
const preset = require("../boss-duel-story-preset-v1.js");
const summaryPreset = require("../boss-duel-story-summary-preset-v1.js");

const config = StoryCore.normalizeConfig(ActionCore.DEFAULT_CONFIG);
assert.equal(preset.signature, StoryCore.poolSignature(config), "preset signature does not match the current formal rules");
assert.equal(summaryPreset.signature, preset.signature, "summary and seed preset signatures must match");
const pool = StoryCore.buildNaturalStoryPoolFromPreset(config, { ...preset, naturalSummaries: summaryPreset.naturalSummaries }, { useCache: false, includePath: false });
assert(pool, "preset did not hydrate");
assert.equal(pool.fromPreset, true);
assert.equal(preset.version, "natural-story-preset-v10");
assert.equal(summaryPreset.version, "natural-story-summary-preset-v5");
assert.equal(summaryPreset.format, "compact-summary-v1");
assert.equal(preset.directed, undefined);
assert.equal(preset.directedDiagnostics, undefined);
assert.equal(pool.naturalStories, 240000);
assert.equal(pool.directedStories, 0);
assert.equal(pool.totalStories, 240000);

const storyKeys = StoryCore.STORY_KEYS;
const globalIds = new Set();
let checked = 0;
for (let star = 1; star <= 8; star += 1) {
  let starCount = 0;
  for (const classKey of storyKeys) {
    const natural = pool.naturalCells[star][classKey];
    assert.equal(natural.length, 10000, `${star} star ${classKey} count`);
    starCount += natural.length;
    for (const story of natural) {
      assert.equal(story.classKey, classKey);
      assert.equal(story.sourcePool, "NATURAL");
      assert.equal(story.director, null);
      assert.ok(Math.abs(story.returnX - story.payoutX / story.spendX) < 1e-12);
      assert.ok(Math.abs(story.netX - (story.payoutX - story.spendX)) < 1e-12);
      assert.equal(StoryCore.storyClass(story.returnX, config), classKey);
      assert(!globalIds.has(`N-${star}-${story.seed}`), "duplicate natural story seed within star");
      globalIds.add(`N-${star}-${story.seed}`);
      checked += 1;
    }
  }
  assert.equal(starCount, 30000, `${star} star total count`);
}

assert.equal(checked, 240000);
assert.equal(StoryCore.storyClass(3, config), "win");
assert.equal(StoryCore.storyClass(2.999999, config), "push");
assert.equal(StoryCore.storyClass(1, config), "push");
assert.equal(StoryCore.storyClass(0.999999, config), "lose");
assert.equal(StoryCore.storyClass(2, config), "push");

console.log(JSON.stringify({
  status: "ok",
  checked,
  naturalStories: pool.naturalStories,
  cells: 24,
  storiesPerClass: 10000,
  storiesPerStar: 30000,
  elapsedMs: pool.elapsedMs
}, null, 2));
