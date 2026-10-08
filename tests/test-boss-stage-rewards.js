"use strict";

const assert = require("node:assert/strict");
const Rules = require("../src/core/boss-duel-rules.js");
const Planner = require("../src/core/boss-duel-story-planner.js");

const dice = { normalFaces: [2, 3], multiplierFaces: [4, 5], normalDice: 2, multiplierDice: 2, total: 45 };
assert.deepEqual(Rules.bossStageProgress(4, 100, 100).thresholds, [75, 50, 25, 0]);
for (const [hp, expected] of [[100, 0], [76, 0], [75, 1], [50, 2], [25, 3], [1, 3], [0, 4], [-20, 4]]) {
  assert.equal(Rules.bossStageProgress(4, 100, hp).unlockedStars, expected);
}
for (let star = 1; star <= 8; star += 1) {
  assert.equal(Rules.bossStageProgress(star, 31, 31).unlockedStars, 0);
  assert.equal(Rules.bossStageProgress(star, 31, 1).unlockedStars, star - 1);
  assert.equal(Rules.bossStageProgress(star, 31, 0).unlockedStars, star);
}
assert.equal(Rules.bossStageProgress(3, 100, 100 / 3).unlockedStars, 2, "fractional HP boundary must unlock exactly once");
for (const [unlocked, expected] of [[0, 0], [1, 2], [2, 5], [3, 20], [4, 45], [8, 45]]) {
  const reward = Rules.rewardForUnlockedStars(dice, unlocked);
  assert.equal(reward.total, expected);
  assert.equal(reward.normalDice + reward.multiplierDice, Math.min(4, unlocked));
}
assert.deepEqual(dice.normalFaces, [2, 3], "reward calculation must not alter the locked dice");
assert.equal(Rules.combineCoinMultiplier(1, 1), 1);
assert.equal(Rules.combineCoinMultiplier(4, 1), 4, "neutral card must not lower an existing global multiplier");
assert.equal(Rules.combineCoinMultiplier(2, 5), 5);
assert.equal(Rules.combineCoinMultiplier(5, 2), 5);

function drawOne(selector, valueRoll) {
  const draws = [selector, valueRoll, 0];
  return Rules.drawMagicCardsFromTable(() => draws.shift(), undefined, 1)[0];
}
for (const [selector, key] of [[0, "threeBoost"], [0.2, "straightBoost"], [0.93, "coin"]]) {
  assert.equal(drawOne(selector, 0).key, key);
  assert.equal(drawOne(selector, 0).value, 1);
  assert.equal(drawOne(selector, 0.999999).value, 5);
}
assert.equal(drawOne(0.08, 0.999999).value, 3, "four-of-a-kind magic retains its original range");
assert.equal(drawOne(0.3, 0.999999).value, 3, "flush magic retains its original range");
assert.equal(drawOne(0.5, 0.999999).value, 3, "full-house magic retains its original range");

const card = (rank, suit) => ({ rank, suit, baseId: `${rank}${suit}` });
function createRound(coinValue = 1, tie = false) {
  const playerCards = [card(14, "S"), card(14, "H"), card(14, "D"), card(14, "C"), card(10, "S"), card(9, "H")];
  const bossCards = tie ? playerCards.map((value) => ({ ...value })) : [card(6, "S"), card(6, "H"), card(7, "D"), card(8, "C"), card(10, "S"), card(12, "H")];
  const plan = Rules.autoLockPlan(playerCards);
  return {
    playerCards, bossCards, playerDeck: [],
    magicCards: [{ key: "coin", target: "coin", value: coinValue }],
    coinX: coinValue, draws: 0, freeUsed: false, plan: null,
    discardIndexes: plan.discardIndexes,
    lockedCardIds: new Set(), arrangementPlan: plan.arrangementPlan
  };
}
const common = {
  config: { drawFeesX: [1, 2, 3] }, star: 4, initialHp: 60,
  originalDice: dice, bossRewardX: dice.total, handPayoutX: () => 2,
  createRound: (round) => createRound(round === 2 ? 5 : 2)
};
for (const [roundLimit, unlockedStars, expected] of [[1, 1, 8], [2, 2, 45], [3, 3, 130], [4, 4, 265]]) {
  const full = Planner.planBossStory({ ...common, roundLimit });
  const summary = Planner.planBossStory({ ...common, roundLimit, includePath: false });
  assert.equal(full.unlockedStars, unlockedStars);
  assert.equal(full.payoutX, expected, "terminal payout must multiply hand and unlocked Boss rewards together");
  assert.equal(full.killed, roundLimit === 4);
  assert.equal(full.payoutX, full.handPayoutX + full.bossPayoutX + full.coinPayoutX);
  for (const field of ["spendX", "payoutX", "handPayoutX", "bossPayoutX", "coinPayoutX", "unlockedStars", "globalMultiplier", "hpLeft", "rounds"]) {
    assert.equal(summary[field], full[field], `summary/full mismatch for ${field}`);
  }
  assert.deepEqual(full.path.map((step) => step.unlockedStars), Array.from({ length: roundLimit }, (_value, index) => index + 1));
}
const stopped = Planner.planBossStory({ ...common, roundLimit: 4, maxSpendX: 1 });
assert.equal(stopped.terminationReason, "INSUFFICIENT_FUNDS");
assert.equal(stopped.payoutX, 8, "already unlocked stars must settle when the next entry is unaffordable");
const unopened = Planner.planBossStory({ ...common, roundLimit: 4, maxSpendX: 0 });
assert.equal(unopened.payoutX, 0);
assert.equal(unopened.globalMultiplier, 1);
const tied = Planner.planBossStory({ ...common, roundLimit: 1, createRound: (_round, tieIndex) => createRound(tieIndex === 0 ? 5 : 1, tieIndex === 0) });
assert.equal(tied.spendX, 1, "tie replay retains the paid entry");
assert.equal(tied.globalMultiplier, 5);
assert.equal(tied.payoutX, 20);
assert.equal(tied.unlockedStars, 1);
console.log("Boss 分段星星、最終倍率、牌型倍率與完整／摘要結算測試通過。");
