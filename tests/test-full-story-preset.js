"use strict";

const assert = require("node:assert/strict");
const ActionCore = require("../src/probability/boss-duel-action-tree-core.js");
const StoryCore = ActionCore.NaturalCore;
const Rules = require("../src/core/boss-duel-rules.js");
const preset = require("../data/story/boss-duel-story-preset-v17.js");
const summaryPreset = require("../data/story/boss-duel-story-summary-preset-v11.js");

const config = StoryCore.normalizeConfig(ActionCore.DEFAULT_CONFIG);
assert.equal(StoryCore.presetMatchesOutcomeRules(config, preset), true, "preset signature does not match the current story-generation rules");
assert.equal(summaryPreset.signature, preset.signature, "summary and seed preset signatures must match");
const alternateBirthTickets = [1000, 0, 0, 0, 0, 0, 0, 0];
const alternateBirthConfig = {
  ...config,
  bossRows: config.bossRows.map((row, index) => row.map((value, column) => column === 5 ? alternateBirthTickets[index] : value))
};
assert.equal(
  StoryCore.poolSignature(alternateBirthConfig),
  StoryCore.poolSignature(config),
  "Boss birth tickets must not change the formal story-preset signature"
);
assert.equal(StoryCore.presetMatchesOutcomeRules(alternateBirthConfig, preset), true, "existing preset must remain valid after birth-ticket changes");
const hpChangedConfig = {
  ...config,
  bossRows: config.bossRows.map((row, index) => row.map((value, column) => index === 0 && column === 1 ? value + 1 : value))
};
assert.notEqual(StoryCore.poolSignature(hpChangedConfig), StoryCore.poolSignature(config), "Boss HP must remain part of the story-preset signature");
assert.equal(StoryCore.presetMatchesOutcomeRules(hpChangedConfig, preset), false, "story-affecting Boss changes must still invalidate the preset");
const hydratedPreset = { ...preset, naturalSummaries: summaryPreset.naturalSummaries };
assert.equal(StoryCore.buildNaturalStoryPoolFromPreset(hpChangedConfig, hydratedPreset, { useCache: false }), null);
const pool = StoryCore.buildNaturalStoryPoolFromPreset(alternateBirthConfig, hydratedPreset, { useCache: false, includePath: false });
assert(pool, "preset did not hydrate");
assert.equal(pool.fromPreset, true);
assert.equal(preset.version, "natural-story-preset-v17");
assert.equal(summaryPreset.version, "natural-story-summary-preset-v11");
assert.equal(summaryPreset.format, "compact-summary-v1");
assert.equal(pool.naturalStories, 240000);
assert.equal(pool.totalStories, 240000);

const starEightOnlyConfig = ActionCore.sanitizeConfig({
  ...ActionCore.DEFAULT_CONFIG,
  bossRows: ActionCore.DEFAULT_CONFIG.bossRows.map((row, index) => row.map((value, column) => column === 5 ? (index === 7 ? 1000 : 0) : value)),
  simulation: {
    ...ActionCore.DEFAULT_CONFIG.simulation,
    playerCount: 1,
    bossesPerPlayer: 20,
    playerRoundLimit: 10000,
    playerBehavior: "OFFICIAL_FUNDED"
  }
});
const starEightOnlyReport = ActionCore.simulateNaturalModel(starEightOnlyConfig, { pool });
assert.equal(starEightOnlyReport.totals.bosses, 20);
assert.equal(starEightOnlyReport.starStats.find((row) => row.star === 8).count, 20, "birth tickets must still control which Boss star the player encounters");
assert.equal(starEightOnlyReport.starStats.filter((row) => row.star !== 8).reduce((sum, row) => sum + row.count, 0), 0);

const storyKeys = StoryCore.STORY_KEYS;
const globalIds = new Set();
let checked = 0;
let partialRewardStories = 0;
let boostedRewardStories = 0;
for (let star = 1; star <= 8; star += 1) {
  let starCount = 0;
  for (const classKey of storyKeys) {
    const natural = pool.naturalCells[star][classKey];
    assert.equal(natural.length, 10000, `${star} star ${classKey} count`);
    starCount += natural.length;
    for (const story of natural) {
      assert.equal(story.classKey, classKey);
      assert.equal(story.sourcePool, "NATURAL");
      assert.ok(Math.abs(story.returnX - story.payoutX / story.spendX) < 1e-12);
      assert.ok(Math.abs(story.netX - (story.payoutX - story.spendX)) < 1e-12);
      assert.equal(StoryCore.storyClass(story.returnX, config), classKey);
      const unlockedStars = Rules.bossStageProgress(star, story.hp, story.hpLeft).unlockedStars;
      const baseRewardX = Rules.rewardForUnlockedStars(story.originalDice, unlockedStars).total;
      assert.equal(story.unlockedStars, unlockedStars);
      assert.equal(story.unlockedBossRewardX, baseRewardX);
      assert.equal(story.payoutParts.boss, baseRewardX);
      assert(story.globalMultiplier >= 1 && story.globalMultiplier <= 5);
      assert.equal(story.payoutX, (baseRewardX + story.payoutParts.hand) * story.globalMultiplier);
      if (!story.killed && baseRewardX > 0) partialRewardStories += 1;
      if (story.globalMultiplier > 1 && story.payoutX > 0) boostedRewardStories += 1;
      assert(!globalIds.has(`N-${star}-${story.seed}`), "duplicate natural story seed within star");
      globalIds.add(`N-${star}-${story.seed}`);
      checked += 1;
    }
  }
  assert.equal(starCount, 30000, `${star} star total count`);
}

assert.equal(checked, 240000);
assert(partialRewardStories > 0, "the new formal release must include non-killed Bosses with earned stage rewards");
assert(boostedRewardStories > 0, "the new formal release must include coin multipliers applied to final scores");
assert.equal(StoryCore.storyClass(5, config), "win");
assert.equal(StoryCore.storyClass(4.999999, config), "push");
assert.equal(StoryCore.storyClass(1, config), "push");
assert.equal(StoryCore.storyClass(0.999999, config), "lose");
assert.equal(StoryCore.storyClass(1.5, config), "push");

console.log(JSON.stringify({
  status: "ok",
  checked,
  partialRewardStories,
  boostedRewardStories,
  naturalStories: pool.naturalStories,
  cells: 24,
  storiesPerClass: 10000,
  storiesPerStar: 30000,
  elapsedMs: pool.elapsedMs
}, null, 2));
