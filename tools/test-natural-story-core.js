"use strict";

const assert = require("node:assert/strict");
const DiceCore = require("../dice-first-core.js");
const Rules = require("../boss-duel-rules.js");
const StoryCore = require("../boss-duel-natural-story-core.js");
const ActionCore = require("../boss-duel-action-tree-core.js");

const config = StoryCore.normalizeConfig(ActionCore.DEFAULT_CONFIG);
assert.equal(config.storiesPerClass, 10000);
assert.equal(config.storiesPerStar, 30000);
assert.equal(8 * config.storiesPerStar, 240000);
assert.equal(config.rewardFloorPct, 10);
assert.equal(config.rewardCeilingMultiple, 1000);
assert.equal(config.playerBadHighRerollPct, 50);
assert.equal(config.bossBadHighRerollPct, 25);

assert.equal(StoryCore.storyClass(3, config), "win");
assert.equal(StoryCore.storyClass(2.999999, config), "push");
assert.equal(StoryCore.storyClass(1, config), "push");
assert.equal(StoryCore.storyClass(0.999999, config), "lose");
assert.equal(StoryCore.bucketIndexForBet(1), 0);
assert.equal(StoryCore.bucketIndexForBet(200), 1);
assert.equal(StoryCore.bucketIndexForBet(500), 2);
assert.equal(StoryCore.bucketIndexForBet(2000), 2);

const natural = Rules.createNaturalRound({ rng: DiceCore.mulberry32(123), magicEnabled: false, playerBadHighRerollPct: 0, bossBadHighRerollPct: 0 });
assert.equal(natural.playerCards.length, 6);
assert.equal(natural.playerDeck.length, 46);
assert.equal(natural.bossCards.length, 6);
assert.equal(new Set([...natural.playerCards, ...natural.playerDeck].map(Rules.cardId)).size, 52);
assert.equal(new Set(natural.bossCards.map(Rules.cardId)).size, 6);

const fullClassification = StoryCore.simulateNaturalStory(config, 1, 12345, { includePath: false });
const packedClassification = StoryCore.packStorySummary(fullClassification);
const unpackedClassification = StoryCore.unpackStorySummary(packedClassification, 1, fullClassification.classKey);
for (const key of ["seed", "star", "classKey", "hp", "hpLeft", "roundLimit", "rounds", "killed", "spendX", "payoutX", "originalBossRewardX", "diceStateIndex"]) {
  assert.deepEqual(unpackedClassification[key], fullClassification[key], `compact summary round-trip must preserve ${key}`);
}
assert.deepEqual(unpackedClassification.originalDice, fullClassification.originalDice, "compact summary round-trip must preserve the original dice");
assert.deepEqual(unpackedClassification.actions, fullClassification.actions, "compact summary round-trip must preserve the planned action totals");
const omittedClass = StoryCore.STORY_KEYS.find((key) => key !== fullClassification.classKey);
const classificationOnly = StoryCore.simulateNaturalStory(config, 1, 12345, { includePath: false, summaryClassKeys: [omittedClass], fastClassification: true });
assert.equal(classificationOnly.classKey, fullClassification.classKey, "classification-only generation must not change the natural result");
assert.deepEqual(Object.keys(classificationOnly).sort(), ["classKey", "seed", "star"], "unneeded classes may skip summary construction only after classification");

const critCard = { rank: 14, suit: "S", baseId: "14S", magicEffects: { crit: 5 } };
const flatCard = { rank: 13, suit: "S", baseId: "13S", magicEffects: { flatDamage: 6 } };
const straightFlushEval = { key: "straightFlush", damage: 30, cards: [critCard, flatCard] };
const straightFlushDamage = Rules.damageBreakdown(straightFlushEval, []);
assert.equal(straightFlushDamage.base, 30);
assert.equal(straightFlushDamage.multiplier, 5);
assert.equal(straightFlushDamage.flat, 6);
assert.equal(straightFlushDamage.total, 156);

const candidates = [
  { id: "W", classKey: "win", sourcePool: "NATURAL", spendX: 10, payoutX: 30, netX: 20 },
  { id: "P", classKey: "push", sourcePool: "NATURAL", spendX: 10, payoutX: 19, netX: 9 },
  { id: "L", classKey: "lose", sourcePool: "NATURAL", spendX: 10, payoutX: 0, netX: -10 }
];
const solved = StoryCore.solveCandidateProbabilities(candidates, 96);
assert(solved);
assert(Math.abs(solved.rtpPct - 96) < 1e-10);
assert(Object.values(solved.probabilities).every((probability) => probability > 0));

const naturalPool = {
  config: { maxCandidateAttempts: 10 },
  naturalCells: { 1: { win: [candidates[0]], push: [candidates[1]], lose: [candidates[2]] } }
};
const commit = StoryCore.drawStoryCommit(naturalPool, 1, 96, DiceCore.mulberry32(9));
assert.deepEqual(commit.candidateSources, ["NATURAL", "NATURAL", "NATURAL"]);
assert(Math.abs(commit.weightedRtpPct - 96) < 1e-10);

const diceStory = {
  killed: true, netX: 5, spendX: 10, payoutX: 15, originalBossRewardX: 20,
  originalDice: { normalDice: 2, multiplierDice: 1, normalFaces: [2, 3], multiplierFaces: [4], normalSum: 5, multiplierSum: 4, total: 20 }
};
const rewardBounds = { rewardFloorPct: 10, rewardCeilingMultiple: 1000 };
const increase = StoryCore.correctBossDiceReward(diceStory, 10, 1, rewardBounds, DiceCore.mulberry32(3));
assert.equal(increase.correctedRewardX, 30);
assert.equal(increase.deltaCredits, 10);
assert(increase.correctedRewardX <= 30);
assert.equal(increase.dice.normalFaces.length, 2);
assert.equal(increase.dice.multiplierFaces.length, 1);
assert(increase.dice.normalFaces.every((face) => face >= 1 && face <= 6));

const decrease = StoryCore.correctBossDiceReward(diceStory, -10, 1, rewardBounds, DiceCore.mulberry32(4));
assert.equal(decrease.correctedRewardX, 10);
assert.equal(decrease.deltaCredits, -10);
assert(decrease.correctedRewardX >= 10);

const cashflowStory = { ...diceStory, spendX: 100, payoutX: 80, netX: -20 };
const settlement = StoryCore.settleCommittedStory(
  { selectedStory: cashflowStory }, [0, 0, 0], 1,
  {
    actualSpendCredits: 100, organicPayoutCredits: 80, targetRtpPct: 96,
    rewardFloorPct: 10, rewardCeilingMultiple: 1000, rng: DiceCore.mulberry32(5)
  }
);
assert.equal(settlement.targetAccrualCredits, 96);
assert.equal(settlement.preCorrectionPoolCredits, 16);
assert.equal(settlement.correction.deltaCredits, 16);
assert.equal(settlement.actualPayoutCredits, 96);
assert.equal(settlement.endingPoolCredits, 0);

const noKill = { ...cashflowStory, killed: false, payoutX: 0, originalBossRewardX: 0 };
const noKillSettlement = StoryCore.settleCommittedStory(
  { selectedStory: noKill }, [0, 0, 0], 1,
  { actualSpendCredits: 100, organicPayoutCredits: 0, targetRtpPct: 96, actualKilled: false }
);
assert.equal(noKillSettlement.correction.applied, false);
assert.equal(noKillSettlement.endingPoolCredits, 96);

const posted = StoryCore.addPoolCredits([0, 0, 9], 20, 96);
assert.deepEqual(posted.balances, [0, 96, 9], "target RTP spend must enter only the matching Bet bucket");
const debtStarted = {
  bucketIndex: 1, incomingPoolCredits: 0, targetRtpPct: 96,
  targetAccrualCredits: 96, actualSpendCredits: 100
};
const debtSettlement = StoryCore.settleStartedStory(
  { selectedStory: cashflowStory }, debtStarted, posted.balances, 20,
  {
    actualSpendCredits: 100, targetAccrualCredits: 96, targetRtpPct: 96,
    organicPayoutCredits: 4000, actualKilled: true, actualBossRewardX: 20,
    actualDice: diceStory.originalDice, rewardFloorPct: 10, rewardCeilingMultiple: 1000,
    rng: DiceCore.mulberry32(13)
  }
);
assert.equal(debtSettlement.bucketIndex, 1);
assert(debtSettlement.correction.deltaCredits < 0, "negative pool must reduce the current killed BOSS reward");
assert.equal(debtSettlement.correction.correctedRewardX >= 2, true, "reward may not fall below 10% of the original");
assert.equal(debtSettlement.balances[2], 9, "other Bet buckets must stay isolated");

console.log("natural-story-core: current-only contract passed");
