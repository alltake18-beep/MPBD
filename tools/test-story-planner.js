"use strict";

const assert = require("node:assert/strict");
const DiceCore = require("../dice-first-core.js");
const ActionCore = require("../boss-duel-action-tree-core.js");
const StoryCore = ActionCore.NaturalCore;
const Planner = require("../boss-duel-story-planner.js");
const preset = require("../boss-duel-story-preset-v1.js");

const config = StoryCore.normalizeConfig(ActionCore.DEFAULT_CONFIG);
assert.equal(Planner.VERSION, "boss-plan-v10");

const userExampleCandidates = [
  { classKey: "win", spendX: 10, payoutX: 50 },
  { classKey: "push", spendX: 10, payoutX: 12 },
  { classKey: "lose", spendX: 10, payoutX: 0 }
];
const userExampleTickets = StoryCore.solveCandidateProbabilities(userExampleCandidates, 96, {
  ticketPreferencePct: { win: 1, push: 1, lose: 1 },
  ticketBasis: 1000000
});
assert.deepEqual(userExampleTickets.ticketCounts, [95106, 403725, 501169], "Bet 100 example must allocate the neutral full-class 1,000,000-ticket solution");
assert.deepEqual(userExampleTickets.scorePoints, [4040, 240, -960], "score must use actual payout minus target return on actual spend");
assert.equal(userExampleTickets.weightedSpendX, 10);
assert(Math.abs(userExampleTickets.weightedPayoutX - 9.6) < 1e-12);
assert(Math.abs(userExampleTickets.rtpPct - 96) < 1e-12);

const formerChase = StoryCore.simulateNaturalStory(config, 1, 1794219596, { includePath: true });
assert(formerChase.spendX <= 3, "former 1-star 22x chase must not return");
assert.equal(formerChase.behavior, "SMART_PROFIT_PLANNER");
for (const step of formerChase.path) {
  assert(Array.isArray(step.initialKeepCardIds));
  assert(Array.isArray(step.autoKeepCardIds));
  assert.equal(typeof step.decisionReason, "string");
  assert(step.totalBetAfter >= step.totalBetBefore);
}

const star8Commit = StoryCore.drawUniformPresetStoryCommit(
  preset, config, 8, 96, DiceCore.mulberry32(20260826), { includePath: false, ticketBasis: 1000000 }
);
assert.equal(star8Commit.candidates.length, 3);
assert.equal(star8Commit.slotWeights.length, 3);
assert.equal(star8Commit.ticketCounts.reduce((sum, value) => sum + value, 0), 1000000);
assert(star8Commit.ticketCounts.every((value) => value > 0));
assert(Math.abs(star8Commit.weightedRtpPct - 96) <= 0.01);
assert.equal(star8Commit.selectionPolicy, "FULL_CLASS_UNIFORM_THEN_SCORE_TICKETS");
assert(["win", "push", "lose"].includes(star8Commit.selectedClass));
assert.equal(star8Commit.candidates[star8Commit.candidates.findIndex((story) => story.classKey === "lose")].netX < 0, true);

let checked = 0;
let manual = 0;
for (let star = 1; star <= 8; star += 1) {
  for (let index = 0; index < 20; index += 1) {
    const seed = DiceCore.hash32(config.poolSeed, index, 7001 + star * 97);
    const story = StoryCore.simulateNaturalStory(config, star, seed, { includePath: true });
    assert.equal(story.classKey, StoryCore.storyClass(story.payoutX / story.spendX, config));
    assert.equal(story.netX, story.payoutX - story.spendX);
    assert(story.decisionMetrics.showdownConfidence >= 0 && story.decisionMetrics.showdownConfidence <= 1);
    assert(story.decisionMetrics.estimatedKillProbability >= 0 && story.decisionMetrics.estimatedKillProbability <= 1);
    assert(story.decisionMetrics.profitProbability >= 0 && story.decisionMetrics.profitProbability <= 1);
    assert.equal(typeof story.decisionMetrics.profitPossible, "boolean");
    manual += story.actions.manualAdjustments;
    for (const step of story.path) {
      assert(step.paidDraws <= 3, "single route must not chase indefinitely");
      assert(step.freeDraws <= 1, "a round can use at most one free redraw");
      assert(step.draws <= 4, "paid redraws plus one free redraw must stay bounded");
      assert.equal(step.drawLog.length, step.draws);
      for (const draw of step.drawLog) {
        assert(Array.isArray(draw.keepCardIds));
        assert(Array.isArray(draw.discardedCardIds));
        assert(Array.isArray(draw.discardedCards));
        assert(Array.isArray(draw.acceptedCardIds));
        assert(Array.isArray(draw.nextKeepCardIds));
      }
      assert.equal(step.manualAdjustment, step.changedCards > 0);
      assert(step.showdownWinProbability >= 0 && step.showdownWinProbability <= 1);
      assert(step.magicSynergyScore >= 0);
      assert.equal(typeof step.hasJoker, "boolean");
      assert.equal(typeof step.jokerBehavior, "string");
      if (step.hasJoker) assert(step.paidDraws <= 2, "Joker route must shorten paid redraw chase");
      if (step.manualAdjustment) {
        assert(step.showdownWinProbability >= step.autoShowdownWinProbability + (step.hasJoker ? 0.05 : 0.03)
          || step.expectedDamage >= step.autoExpectedDamage + (step.hasJoker ? 1 : 0.5)
          || step.magicSynergyScore >= step.autoMagicSynergyScore + 1,
        "manual adjustment must improve showdown odds, kill damage, or magic synergy");
      }
    }
    checked += 1;
  }
}

console.log(JSON.stringify({ status: "ok", checked, manualAdjustments: manual, formerChaseSpendX: formerChase.spendX, star8SelectedClass: star8Commit.selectedClass }, null, 2));
