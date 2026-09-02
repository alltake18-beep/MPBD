"use strict";

const assert = require("node:assert/strict");
const ActionCore = require("../src/probability/boss-duel-action-tree-core.js");
const StoryCore = ActionCore.NaturalCore;
const DiceCore = require("../src/core/boss-duel-random.js");
const preset = require("../data/story/boss-duel-story-preset-v1.js");
const summaryPreset = require("../data/story/boss-duel-story-summary-preset-v1.js");

const config = StoryCore.normalizeConfig(ActionCore.DEFAULT_CONFIG);
assert.equal(summaryPreset.signature, preset.signature, "summary and seed preset signatures must match");
const pool = StoryCore.buildNaturalStoryPoolFromPreset(config, { ...preset, naturalSummaries: summaryPreset.naturalSummaries }, { useCache: false, includePath: false });
assert(pool?.fromPreset, "natural preset did not hydrate");
assert.equal(preset.version, "natural-story-preset-v13");
assert.equal(summaryPreset.version, "natural-story-summary-preset-v8");
assert.equal(summaryPreset.format, "compact-summary-v1");
assert.equal("ticketGroups" in preset, false, "obsolete prebuilt ticket groups must not remain in the formal catalog");
assert.equal(pool.totalStories, 240000);
assert.equal(pool.naturalStories, 240000);

const averages = {};
const residualSides = {};
const pushReturnValues = new Set();
let checked = 0;
let exactTargetResiduals = 0;
for (let star = 1; star <= 8; star += 1) {
  averages[star] = {};
  residualSides[star] = {};
  let starCount = 0;
  for (const classKey of StoryCore.STORY_KEYS) {
    const stories = pool.naturalCells[star][classKey];
    residualSides[star][classKey] = { below: 0, exact: 0, above: 0 };
    starCount += stories.length;
    for (const story of stories) {
      assert.equal(story.sourcePool, "NATURAL");
      assert.equal(story.classKey, classKey);
      assert.ok(Number.isFinite(story.spendX) && story.spendX > 0, "story spendX must be positive and finite");
      assert.ok(Number.isFinite(story.payoutX) && story.payoutX >= 0, "story payoutX must be non-negative and finite");
      assert.ok(Number.isFinite(story.returnX) && story.returnX >= 0, "story returnX must be non-negative and finite");
      assert.ok(Math.abs(story.returnX - story.payoutX / story.spendX) < 1e-12, "returnX must equal total payout / total spend");
      assert.ok(Math.abs(story.netX - (story.payoutX - story.spendX)) < 1e-12, "netX must remain payout minus spend for accounting");
      assert.equal(StoryCore.storyClass(story.returnX, config), classKey, "classification must use returnX");
      const residual = story.payoutX - 0.96 * story.spendX;
      if (Math.abs(residual) < 1e-12) {
        exactTargetResiduals += 1;
        residualSides[star][classKey].exact += 1;
      } else if (residual < 0) residualSides[star][classKey].below += 1;
      else residualSides[star][classKey].above += 1;
      if (classKey === "push") pushReturnValues.add(story.returnX);
      checked += 1;
    }
    assert.equal(stories.length, 10000, `${star} star ${classKey} count`);
    averages[star][classKey] = stories.length ? stories.reduce((sum, story) => sum + story.returnX, 0) / stories.length : null;
  }
  assert.equal(starCount, 30000, `${star} star total count`);
}

assert.equal(checked, 240000);
assert.equal(StoryCore.storyClass(3, config), "win");
assert.equal(StoryCore.storyClass(2.999999, config), "push");
assert.equal(StoryCore.storyClass(1, config), "push");
assert.equal(StoryCore.storyClass(0.999999, config), "lose");
assert.equal(StoryCore.storyClass(2000 / 1000, config), "push", "2000 payout / 1000 wager must be 2x win-small");
assert.equal(StoryCore.storyClass(3000 / 1000, config), "win", "3000 payout / 1000 wager must be 3x win-big");
assert.equal(exactTargetResiduals, 0, "target-edge assumption changed; revisit solver policy and documentation");
assert([...pushReturnValues].every((value) => value >= 1 && value < 3), "all win-small stories must be inside the configured return-ratio interval");
for (let star = 1; star <= 8; star += 1) {
  const commit = StoryCore.drawUniformPresetStoryCommit(preset, config, star, 96, DiceCore.mulberry32(20260827 + star));
  assert.deepEqual(commit.candidates.map((story) => story.classKey), ["win", "push", "lose"], `${star} star candidates must contain win-big, win-small, and lose in order`);
}
console.log(JSON.stringify({ status: "ok", checked, exactTargetResiduals, pushReturnValueCount: pushReturnValues.size, residualSides, averageReturnX: averages, elapsedMs: pool.elapsedMs }, null, 2));
