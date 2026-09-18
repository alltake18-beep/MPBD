"use strict";

const assert = require("node:assert/strict");
const DiceCore = require("../src/core/boss-duel-random.js");
const ActionCore = require("../src/probability/boss-duel-action-tree-core.js");
const StoryCore = ActionCore.NaturalCore;
const Planner = require("../src/core/boss-duel-story-planner.js");
const Rules = require("../src/core/boss-duel-rules.js");

const config = StoryCore.normalizeConfig(ActionCore.DEFAULT_CONFIG);
assert.equal(Planner.VERSION, "boss-plan-v12");
assert.equal(Planner.PLAYER_POLICY_VERSION, "story-player-policy-v1");

const policyCard = (rank, suit, id, magicEffects) => ({ rank, suit, id, baseId: id, joker: false, magicEffects });
function policyRoutes(playerCards, magicCards = []) {
  const automatic = Rules.autoLockPlan(playerCards);
  return Planner.routeCandidates({
    playerCards,
    magicCards,
    arrangementPlan: automatic.arrangementPlan,
    discardIndexes: automatic.discardIndexes
  });
}

const pairVersusCritFlush = policyRoutes([
  policyCard(10, "H", "10H"), policyCard(10, "S", "10S"),
  policyCard(13, "C", "KC", { crit: 2 }), policyCard(12, "C", "QC"),
  policyCard(7, "C", "7C"), policyCard(4, "D", "4D")
], [{ key: "crit", target: "crit" }]);
assert.equal(pairVersusCritFlush[0].key, "threeFlush");
assert.deepEqual(pairVersusCritFlush[0].keepCardIds, ["7C", "KC", "QC"], "same-band critical route must replace the unrelated pair instead of mixing both routes");
assert.deepEqual(pairVersusCritFlush[0].activeMagicKeys, ["crit"]);

const pairVersusSingleCrit = policyRoutes([
  policyCard(10, "H", "10H"), policyCard(10, "S", "10S"),
  policyCard(13, "C", "KC", { crit: 2 }), policyCard(8, "D", "8D"),
  policyCard(5, "S", "5S"), policyCard(3, "H", "3H")
], [{ key: "crit", target: "crit" }]);
assert.equal(pairVersusSingleCrit[0].key, "onePair");
assert.deepEqual(pairVersusSingleCrit[0].keepCardIds, ["10H", "10S"], "a pair must beat a singleton critical route");

const critInsidePair = policyRoutes([
  policyCard(10, "H", "10H", { crit: 2 }), policyCard(10, "S", "10S"),
  policyCard(13, "C", "KC"), policyCard(8, "D", "8D"),
  policyCard(5, "S", "5S"), policyCard(3, "H", "3H")
], [{ key: "crit", target: "crit" }]);
assert.equal(critInsidePair[0].key, "onePair");
assert.deepEqual(critInsidePair[0].keepCardIds, ["10H", "10S"]);
assert.deepEqual(critInsidePair[0].activeMagicKeys, ["crit"], "an effect already inside the normal core must activate without an extra keep");

const twoPairVersusCritFlush = policyRoutes([
  policyCard(6, "C", "6C"), policyCard(6, "H", "6H"),
  policyCard(2, "D", "2D"), policyCard(2, "S", "2S"),
  policyCard(13, "C", "KC", { crit: 2 }), policyCard(9, "C", "9C")
], [{ key: "crit", target: "crit" }]);
assert.equal(twoPairVersusCritFlush[0].key, "twoPair");
assert.deepEqual(twoPairVersusCritFlush[0].keepCardIds, ["2D", "2S", "6C", "6H"], "a lower-band critical route must not replace two pair");

const userExampleCandidates = [
  { classKey: "win", spendX: 10, payoutX: 50 },
  { classKey: "push", spendX: 10, payoutX: 12 },
  { classKey: "lose", spendX: 10, payoutX: 0 }
];
const userExampleTickets = StoryCore.solveCandidateProbabilities(userExampleCandidates, 96, {
  ticketBasis: 1000000
});
assert.deepEqual(userExampleTickets.ticketCounts, [95106, 403725, 501169], "Bet 100 example must allocate the neutral full-class 1,000,000-ticket solution");
assert.deepEqual(userExampleTickets.scorePoints, [4040, 240, -960], "score must use actual payout minus target return on actual spend");
assert.equal(userExampleTickets.weightedSpendX, 10);
assert(Math.abs(userExampleTickets.weightedPayoutX - 9.6) < 1e-12);
assert(Math.abs(userExampleTickets.rtpPct - 96) < 1e-12);

const formerChase = StoryCore.simulateNaturalStory(config, 1, 1794219596, { includePath: true });
assert.equal(formerChase.behavior, "RULE_PLAYER_V1");
assert.equal(formerChase.playerPolicyVersion, "story-player-policy-v1");
assert.notEqual(formerChase.terminationReason, "STOP_LOSS");
for (const step of formerChase.path) {
  assert(Array.isArray(step.initialKeepCardIds));
  assert(Array.isArray(step.autoKeepCardIds));
  assert.equal(typeof step.decisionReason, "string");
  assert.equal(step.playerPolicyVersion, "story-player-policy-v1");
  assert.equal(step.routeCandidates.filter((route) => route.selected).length, 1);
  assert(step.totalBetAfter >= step.totalBetBefore);
}

const entryOnlyBudget = StoryCore.simulateNaturalStory(config, 1, 927000383, {
  includePath: true,
  maxSpendX: 1
});
assert.equal(entryOnlyBudget.spendX, 1, "an affordable START must execute even when the next scripted paid redraw is unaffordable");
assert.equal(entryOnlyBudget.rounds, 1, "the funded round must resolve before the story stops for insufficient funds");
assert.equal(entryOnlyBudget.path[0].freeDraws, 1, "an affordable free redraw must still execute");
assert.equal(entryOnlyBudget.path[0].paidDraws, 0, "an unaffordable paid redraw must not execute");
assert.equal(entryOnlyBudget.terminationReason, "INSUFFICIENT_FUNDS");
assert(entryOnlyBudget.spendX <= 1, "cashout replay must never exceed the available score");

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
      for (const [drawIndex, draw] of step.drawLog.entries()) {
        assert(Array.isArray(draw.keepCardIds));
        assert(Array.isArray(draw.discardedCardIds));
        assert(Array.isArray(draw.discardedCards));
        assert(Array.isArray(draw.acceptedCardIds));
        assert(Array.isArray(draw.nextKeepCardIds));
        assert.equal(draw.feeX, draw.free ? 0 : config.drawFeesX[Math.min(drawIndex, config.drawFeesX.length - 1)], "redraw fee must follow total redraw count");
      }
      assert.equal(step.manualAdjustment, step.changedCards > 0);
      assert(step.showdownWinProbability >= 0 && step.showdownWinProbability <= 1);
      assert(step.magicSynergyScore >= 0);
      assert.equal(typeof step.hasJoker, "boolean");
      assert.equal(typeof step.jokerBehavior, "string");
      if (step.hasJoker) assert(step.paidDraws <= 2, "Joker route must shorten paid redraw chase");
      assert.equal(step.routeCandidates.filter((route) => route.selected).length, 1, "each round must select exactly one initial route");
    }
    checked += 1;
  }
}

console.log(JSON.stringify({ status: "ok", checked, manualAdjustments: manual, formerChaseSpendX: formerChase.spendX }, null, 2));
