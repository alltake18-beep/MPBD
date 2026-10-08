"use strict";

const assert = require("node:assert/strict");
const Natural = require("../src/core/boss-duel-natural-story-core.js");
const Rules = require("../src/core/boss-duel-rules.js");

const dice = { normalDice: 3, multiplierDice: 1, normalFaces: [2, 3, 4], multiplierFaces: [4], normalSum: 9, multiplierSum: 4, total: 36 };
const story = {
  star: 4, seed: 1, killed: false, hp: 40, hpLeft: 20, spendX: 4,
  originalDice: dice, originalBossRewardX: 5, unlockedBossRewardX: 5,
  globalMultiplier: 3, unlockedStars: 2, baseHandPayoutX: 2,
  payoutParts: { boss: 5, hand: 2, coin: 14, chain: 0 }, payoutX: 21
};
const restored = Natural.unpackStorySummary(Natural.packStorySummary(story), story.star, "win");
for (const key of ["globalMultiplier", "unlockedStars", "unlockedBossRewardX", "baseHandPayoutX", "payoutX"]) {
  assert.equal(restored[key], story[key], `summary must preserve ${key}`);
}

const partial = Natural.settleCommittedStory({ selectedStory: story }, [0, 0, 0], 2, { targetRtpPct: 96 });
assert.equal(partial.correction.reason, "NOT_KILLED");
assert.equal(partial.originalBossRewardCredits, 30);
assert.equal(partial.fixedPayoutCredits, 12);
assert.equal(partial.actualPayoutCredits, 42, "escaped Boss pays all unlocked dice and hand awards times final multiplier");
assert.equal(partial.endingPoolCredits, 0);

const killed = { ...story, killed: true, hpLeft: 0, unlockedStars: 4, originalBossRewardX: 36, unlockedBossRewardX: 36, payoutX: 114 };
const lowPool = Natural.correctBossDiceReward(killed, -100, 3);
assert.deepEqual(lowPool.dice.normalFaces, dice.normalFaces, "earned normal stars cannot change in final correction");
assert.equal(lowPool.correctedRewardX, 9);
assert.equal(lowPool.correctedRewardX, Rules.rewardForUnlockedStars(dice, 3).total);
const highPool = Natural.correctBossDiceReward(killed, 1000, 3);
assert.deepEqual(highPool.dice.normalFaces, dice.normalFaces);
assert.deepEqual(highPool.dice.multiplierFaces, [6]);
assert.equal(highPool.correctedRewardX, 54);
assert.equal(highPool.deltaCredits, (54 - 36) * 3);
const full = Natural.settleCommittedStory({ selectedStory: killed }, [54, 0, 0], 1);
assert.equal(full.actualPayoutCredits, (54 + 2) * 3);
assert.equal(full.endingPoolCredits, 0);

let reservations = Natural.reserveBossReward([], "current", story, 1).reservations;
reservations = Natural.reserveBossReward(reservations, "other", story, 1, { originalBossRewardCredits: 50 }).reservations;
const funded = Natural.assistanceBudgetForBoss([164, 999, 999], reservations, 1, story, {
  encounterId: "current", globalMultiplier: 3, earnedHandPayoutX: 2
});
assert.equal(funded.requiredCredits, 114);
assert.equal(funded.reservedCredits, 50);
assert.equal(funded.availableCredits, 114);
assert.equal(funded.eligible, true);
const short = Natural.assistanceBudgetForBoss([163.9999, 999, 999], reservations, 1, story, {
  encounterId: "current", globalMultiplier: 3, earnedHandPayoutX: 2
});
assert.equal(short.eligible, false, "other rooms and the entire amplified current award must be covered before assistance");
const updated = Natural.updateBossRewardReservation(reservations, "current", story, 1, { globalMultiplier: 3, earnedHandPayoutX: 2 });
assert.equal(updated.reservation.originalBossRewardCredits, 114);
assert.equal(updated.reservations.length, 2);
assert.equal(Natural.reservedCreditsForBucket(updated.reservations, 0), 164);

const reroll = Natural.tryBossReroll([2, 3, 4], 2000, { playerCredits: 0 });
assert.equal(reroll.success, true, "preview reroll stays available at zero player balance");
assert.equal(reroll.chargedFeeCredits, 0);
assert.equal(reroll.poolAccrualCredits, 0);
assert.equal(reroll.remainingPlayerCredits, 0);
assert.deepEqual(reroll.balances, [2, 3, 4]);
assert.equal(Natural.tryBossReroll([2, 3, 4], 1, { bossStarted: true }).failureReason, "BOSS_ALREADY_STARTED");

for (let star = 1; star <= 8; star += 1) {
  const average = Natural.DEFAULT_AVERAGE_SPEND_X_BY_STAR[star - 1];
  assert.equal(Natural.betLimitForAssets(average - 0.0001, star).maxBet, 0);
  assert.deepEqual(Natural.betLimitForAssets(average, star).allowedBets, [1]);
  assert.equal(Natural.betLimitForAssets(average * 5, star).maxBet, 5);
  assert.equal(Natural.betLimitForAssets(average * 7, star).maxBet, 5);
  assert.equal(Natural.betLimitForAssets(average * 1000000, star).maxBet, 2000);
}
assert.equal(Natural.betLimitForAssets(0, 1).maxBet, 0, "insufficient assets must not invent an affordable Bet 1");
assert.equal(Natural.betLimitForAssets(-100, 8).maxBet, 0);

const roundedStory = { ...story, spendX: 3 };
const roundedCommit = { selectedStory: roundedStory };
const started = Natural.commitStoryToBuckets(roundedCommit, [0, 0, 0], 1, { targetRtpPct: 96.123 });
let liveBalances = started.balances;
let postedAccrual = 0;
for (let index = 0; index < 3; index += 1) {
  const posted = Natural.postStorySpendToBuckets(started, liveBalances, 1, 1);
  liveBalances = posted.balances;
  postedAccrual = Natural.roundMoney(postedAccrual + posted.actualSpendTargetAccrualCredits);
}
const roundedSettlement = Natural.settleStartedStory(roundedCommit, started, liveBalances, 1, {
  actualSpendCredits: 3, actualSpendTargetAccrualCredits: postedAccrual
});
assert.equal(postedAccrual, 2.8836);
assert.equal(roundedSettlement.actualSpendTargetAccrualCredits, 2.8836, "reported accrual must equal the sum of individually rounded events");
assert.equal(roundedSettlement.endingPoolCredits, -0.0001);
assert.equal(Natural.roundMoney(roundedSettlement.targetAccrualCredits - roundedSettlement.actualPayoutCredits), roundedSettlement.endingPoolCredits);

console.log("stage-pool-accounting: partial rewards, protected stars, multipliers, funded assistance, and free preview reroll passed");
