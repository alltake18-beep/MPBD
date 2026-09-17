"use strict";

const assert = require("node:assert/strict");
const DiceCore = require("../src/core/boss-duel-random.js");
const Rules = require("../src/core/boss-duel-rules.js");
const Arrangement = require("../src/core/boss-duel-poker-arrangement-core.js");
const StoryCore = require("../src/core/boss-duel-natural-story-core.js");
const ActionCore = require("../src/probability/boss-duel-action-tree-core.js");

const config = StoryCore.normalizeConfig(ActionCore.DEFAULT_CONFIG);
assert.equal(Rules.VERSION, "rules-v11");
assert.equal(config.storiesPerClass, 10000);
assert.equal(config.storiesPerStar, 30000);
assert.equal(8 * config.storiesPerStar, 240000);
assert.equal(config.rewardFloorPct, 10);
assert.equal(config.rewardCeilingMultiple, 10);
assert.equal(config.playerBadHighRerollPct, 50);
assert.equal(config.bossBadHighRerollPct, 25);
assert(config.magicRows.every((row) => row[2] === row[3]), "magic ticket weights must use one shared value");
assert.equal(config.magicRows.find((row) => row[0] === "crit")[4], 1);
assert.equal(StoryCore.normalizeTargetRtpPct(undefined), 96);
assert.equal(StoryCore.normalizeTargetRtpPct(79), 80);
assert.equal(StoryCore.normalizeTargetRtpPct(100), 99);
assert.equal(StoryCore.MONEY_SCALE, 10000);
assert.equal(StoryCore.roundMoney(0.00005), 0.0001);
assert.equal(StoryCore.roundMoney(-0.00005), -0.0001);
assert.equal(DiceCore.hash32(20260824, 12345, 7098), 553687176);
const vectorRng = DiceCore.mulberry32(0x12345678);
assert.deepEqual(Array.from({ length: 5 }, () => Math.floor(vectorRng() * 4294967296)), [455919406, 4042750857, 4036713555, 1004527575, 3885174651]);
assert.deepEqual(DiceCore.inverseDiceOutcome(7, 2, 0.3141592653, DiceCore.hash32(20260824, 7, 901)), {
  normalDice: 4, multiplierDice: 3, normalFaces: [1, 3, 4, 5], multiplierFaces: [2, 2, 5],
  normalSum: 13, multiplierSum: 9, total: 117, maxTotal: 432
});

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

const redrawStraightFlushHand = [
  Arrangement.naturalCard(7, "C"),
  Arrangement.naturalCard(8, "C"),
  Arrangement.naturalCard(9, "C"),
  Arrangement.naturalCard(10, "C"),
  Arrangement.naturalCard(11, "H"),
  Arrangement.naturalCard(6, "C")
];
const redrawStraightFlush = Arrangement.reconcileAfterRedraw(redrawStraightFlushHand, redrawStraightFlushHand.slice(0, 5));
assert.equal(redrawStraightFlush.forcedOverride, true, "REDRAW 後形成同花順必須覆蓋舊保留");
assert.equal(redrawStraightFlush.plan.key, "straightFlush");
assert.deepEqual(new Set(redrawStraightFlush.keepCards.map(Arrangement.cardId)), new Set(["6C", "7C", "8C", "9C", "10C"]));

const redrawFourKindHand = [
  Arrangement.naturalCard(7, "S"),
  Arrangement.naturalCard(7, "H"),
  Arrangement.naturalCard(7, "D"),
  Arrangement.naturalCard(14, "S"),
  Arrangement.naturalCard(2, "C"),
  Arrangement.naturalCard(7, "C")
];
const redrawFourKind = Arrangement.reconcileAfterRedraw(redrawFourKindHand, redrawFourKindHand.slice(0, 5));
assert.equal(redrawFourKind.forcedOverride, true, "REDRAW 後形成四條必須覆蓋舊保留");
assert.equal(redrawFourKind.plan.key, "fourOfAKind");
assert.deepEqual(new Set(redrawFourKind.keepCards.map(Arrangement.cardId)), new Set(["7S", "7H", "7D", "7C"]));

const protectedPlayerHolds = redrawStraightFlushHand.slice(0, 5);
const nonOverrideFlush = Arrangement.reconcileAfterRedraw(
  [...protectedPlayerHolds, Arrangement.naturalCard(14, "C")],
  protectedPlayerHolds
);
assert.equal(nonOverrideFlush.forcedOverride, false, "皇家同花順、同花順、四條以外不得取消玩家保留");
assert.equal(nonOverrideFlush.plan.key, "straight");
assert(nonOverrideFlush.keepCards.some((card) => Arrangement.cardId(card) === "11H"));

const fourCardCoreHand = [
  Arrangement.naturalCard(6, "S"),
  Arrangement.naturalCard(7, "S"),
  Arrangement.naturalCard(8, "S"),
  Arrangement.naturalCard(9, "S"),
  Arrangement.naturalCard(2, "D"),
  Arrangement.naturalCard(3, "H")
];
fourCardCoreHand[4].magicEffects = { crit: 2, flatDamage: 3 };
fourCardCoreHand[5].magicEffects = { crit: 3 };
const fourCardCore = Arrangement.planHand(fourCardCoreHand);
assert.equal(fourCardCore.coreCards.length, 4);
assert.deepEqual(fourCardCore.extraCards.map(Arrangement.cardId), ["2D"], "四張核心只補一張，暴擊＋固傷優先");

const pairWithEffects = [
  Arrangement.naturalCard(14, "S"),
  Arrangement.naturalCard(14, "H"),
  Arrangement.naturalCard(11, "D"),
  Arrangement.naturalCard(6, "C"),
  Arrangement.naturalCard(3, "S"),
  Arrangement.naturalCard(9, "H")
];
pairWithEffects[2].magicEffects = { crit: 2 };
pairWithEffects[3].magicEffects = { flatDamage: 4 };
const pairPlan = Arrangement.planHand(pairWithEffects);
assert.equal(pairPlan.key, "onePair");
assert.deepEqual(new Set(pairPlan.extraCards.map(Arrangement.cardId)), new Set(["11D", "6C"]), "兩張核心要保留出現的暴擊與固傷牌");

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

const diceStory = {
  killed: true, netX: 5, spendX: 10, payoutX: 15, originalBossRewardX: 20,
  originalDice: { normalDice: 2, multiplierDice: 1, normalFaces: [2, 3], multiplierFaces: [4], normalSum: 5, multiplierSum: 4, total: 20 }
};
const rewardBounds = { rewardFloorPct: 10, rewardCeilingMultiple: 10 };
const increase = StoryCore.correctBossDiceReward(diceStory, 30, 1, rewardBounds, DiceCore.mulberry32(3));
assert.equal(increase.correctedRewardX, 30);
assert.equal(increase.deltaCredits, 10);
assert(increase.correctedRewardX <= 30);
assert.equal(increase.dice.normalFaces.length, 2);
assert.equal(increase.dice.multiplierFaces.length, 1);
assert(increase.dice.normalFaces.every((face) => face >= 1 && face <= 6));

const decrease = StoryCore.correctBossDiceReward(diceStory, 10, 1, rewardBounds, DiceCore.mulberry32(4));
assert.equal(decrease.correctedRewardX, 10);
assert.equal(decrease.deltaCredits, -10);
assert(decrease.correctedRewardX >= 10);

const minimumWhenUnaffordable = StoryCore.correctBossDiceReward(diceStory, -10, 1, rewardBounds, DiceCore.mulberry32(4));
assert.equal(minimumWhenUnaffordable.correctedRewardX, 2, "when no legal reward is affordable, use the minimum legal bounded dice result");
assert.equal(minimumWhenUnaffordable.deltaCredits, -18);

const cashflowStory = { ...diceStory, spendX: 100, payoutX: 80, netX: -20 };
const settlement = StoryCore.settleCommittedStory(
  { selectedStory: cashflowStory }, [0, 0, 0], 1,
  {
    actualSpendCredits: 100, organicPayoutCredits: 80, targetRtpPct: 96,
    rewardFloorPct: 10, rewardCeilingMultiple: 10, rng: DiceCore.mulberry32(5)
  }
);
assert.equal(settlement.storyBudgetCredits, 80);
assert.equal(settlement.plannedSpendCredits, 100);
assert.equal(settlement.spendDeltaCredits, 0);
assert.equal(settlement.spendDeltaTargetAccrualCredits, 0);
assert.equal(settlement.targetAccrualCredits, 80);
assert.equal(settlement.availableBossPoolCredits, 20);
assert.equal(settlement.correction.deltaCredits, 0);
assert.equal(settlement.actualPayoutCredits, 80);
assert.equal(settlement.endingPoolCredits, 0);

const noKill = { ...cashflowStory, killed: false, payoutX: 0, originalBossRewardX: 0 };
const noKillSettlement = StoryCore.settleCommittedStory(
  { selectedStory: noKill }, [0, 0, 0], 1,
  { actualSpendCredits: 100, organicPayoutCredits: 0, targetRtpPct: 96, actualKilled: false }
);
assert.equal(noKillSettlement.correction.applied, false);
assert.equal(noKillSettlement.endingPoolCredits, 0);

const fourStarEightXStory = StoryCore.simulateNaturalStory(config, 4, 3946032733, { includePath: true });
assert.deepEqual(
  [fourStarEightXStory.classKey, fourStarEightXStory.spendX, fourStarEightXStory.payoutX, fourStarEightXStory.originalBossRewardX],
  ["win", 1, 8, 8],
  "the regression must use the actual 4-star win story discussed in the settlement example"
);
const fourStarEightXSettlement = StoryCore.settleCommittedStory(
  { selectedStory: fourStarEightXStory }, [0, 0, 0], 1,
  { actualSpendCredits: 1, organicPayoutCredits: 8, targetRtpPct: 96, rng: DiceCore.mulberry32(8) }
);
assert.equal(fourStarEightXSettlement.storyBudgetCredits, 8, "the selected story payout becomes positive pending payout budget");
assert.equal(fourStarEightXSettlement.plannedSpendCredits, 1);
assert.equal(fourStarEightXSettlement.spendDeltaTargetAccrualCredits, 0, "a story that spends exactly its planned total wager needs no RTP adjustment");
assert.equal(fourStarEightXSettlement.correction.correctedRewardX, 8);
assert.equal(fourStarEightXSettlement.actualPayoutCredits, 8);
assert.equal(fourStarEightXSettlement.endingPoolCredits, 0, "Bet 1 / payout 8 must consume the exact story budget");

const paidRedrawSettlement = StoryCore.settleCommittedStory(
  { selectedStory: fourStarEightXStory }, [0, 0, 0], 1,
  { actualSpendCredits: 3, organicPayoutCredits: 8, targetRtpPct: 96, rng: DiceCore.mulberry32(9) }
);
assert.equal(paidRedrawSettlement.storyBudgetCredits, 8);
assert.equal(paidRedrawSettlement.spendDeltaCredits, 2);
assert.equal(paidRedrawSettlement.spendDeltaTargetAccrualCredits, 1.92, "actual spend above the selected story plan adds the signed RTP difference");
assert.equal(paidRedrawSettlement.correction.correctedRewardX, 9, "the dice reward consumes the largest legal amount that fits the available budget");
assert.equal(paidRedrawSettlement.endingPoolCredits, 0.92);

const shortSpendSettlement = StoryCore.settleCommittedStory(
  { selectedStory: { ...fourStarEightXStory, spendX: 3 } }, [0, 0, 0], 1,
  { actualSpendCredits: 1, organicPayoutCredits: 8, targetRtpPct: 96, rng: DiceCore.mulberry32(10) }
);
assert.equal(shortSpendSettlement.plannedSpendCredits, 3);
assert.equal(shortSpendSettlement.spendDeltaCredits, -2);
assert.equal(shortSpendSettlement.spendDeltaTargetAccrualCredits, -1.92, "actual spend below the selected story plan deducts the signed RTP difference");
assert.equal(shortSpendSettlement.targetAccrualCredits, 6.08);
assert(shortSpendSettlement.correction.correctedRewardX <= 6.08, "a killed Boss may only use a legal dice reward within the adjusted pool");

const longSpendNoKillSettlement = StoryCore.settleCommittedStory(
  { selectedStory: fourStarEightXStory }, [0, 0, 0], 1,
  { actualSpendCredits: 3, organicPayoutCredits: 0, targetRtpPct: 96, actualKilled: false }
);
assert.equal(longSpendNoKillSettlement.spendDeltaTargetAccrualCredits, 1.92);
assert.equal(longSpendNoKillSettlement.correction.applied, false, "a surviving Boss has no dice reward to correct");
assert.equal(longSpendNoKillSettlement.endingPoolCredits, 9.92, "unused adjusted budget carries to the next Boss");

const shortSpendNoKillSettlement = StoryCore.settleCommittedStory(
  { selectedStory: { ...fourStarEightXStory, spendX: 3 } }, [0, 0, 0], 1,
  { actualSpendCredits: 1, organicPayoutCredits: 0, targetRtpPct: 96, actualKilled: false }
);
assert.equal(shortSpendNoKillSettlement.spendDeltaTargetAccrualCredits, -1.92);
assert.equal(shortSpendNoKillSettlement.endingPoolCredits, 6.08);

const posted = StoryCore.addPoolCredits([0, 0, 9], 20, 96);
assert.deepEqual(posted.balances, [0, 96, 9], "target RTP spend must enter only the matching Bet bucket");
const debtStarted = {
  bucketIndex: 1, incomingPoolCredits: 0, targetRtpPct: 96,
  plannedSpendCredits: 100, storyBudgetCredits: 0,
  targetAccrualCredits: 0, actualSpendCredits: 100
};
const debtSettlement = StoryCore.settleStartedStory(
  { selectedStory: cashflowStory }, debtStarted, posted.balances, 20,
  {
    actualSpendCredits: 100, plannedSpendCredits: 100, storyBudgetCredits: 0, targetRtpPct: 96,
    organicPayoutCredits: 4000, actualKilled: true, actualBossRewardX: 20,
    actualDice: diceStory.originalDice, rewardFloorPct: 10, rewardCeilingMultiple: 10,
    rng: DiceCore.mulberry32(13)
  }
);
assert.equal(debtSettlement.bucketIndex, 1);
assert(debtSettlement.correction.deltaCredits < 0, "an unaffordable reward must reduce the current killed BOSS reward");
assert.equal(debtSettlement.correction.correctedRewardX >= 2, true, "reward may not fall below 10% of the original");
assert.equal(debtSettlement.balances[2], 9, "other Bet buckets must stay isolated");

const reservedA = StoryCore.reserveBossReward([], "A", diceStory, 1, { targetRtpPct: 96, releaseVersion: "release-a" });
const reservedAReplay = StoryCore.reserveBossReward(reservedA.reservations, "A", diceStory, 1, { targetRtpPct: 96, releaseVersion: "release-a" });
const reservedB = StoryCore.reserveBossReward(reservedAReplay.reservations, "B", diceStory, 10, { targetRtpPct: 96, releaseVersion: "release-a" });
assert.equal(reservedA.reservation.originalBossRewardCredits, 20);
assert.equal(reservedAReplay.idempotent, true, "same encounter reservation must be idempotent");
assert.equal(StoryCore.reservedCreditsForBucket(reservedB.reservations, 0), 220);
assert.deepEqual(StoryCore.availablePoolCredits([300, 0, 0], reservedB.reservations, 1), {
  bucketIndex: 0, bucketKey: "B1", bookBalanceCredits: 300, reservedCredits: 220, availableCredits: 80
});
const reservedSettlement = StoryCore.settleStartedStory(
  { selectedStory: diceStory }, { bucketIndex: 0, targetRtpPct: 96 }, [300, 0, 0], 10,
  {
    encounterId: "B", reservations: reservedB.reservations, actualSpendCredits: 0, plannedSpendCredits: 0,
    organicPayoutCredits: 200, actualKilled: true, actualBossRewardX: 20, actualDice: diceStory.originalDice,
    rewardFloorPct: 10, rewardCeilingMultiple: 10, rng: DiceCore.mulberry32(17)
  }
);
assert.equal(reservedSettlement.otherReservedCredits, 20);
assert.equal(reservedSettlement.preCorrectionBookCredits, 100);
assert.equal(reservedSettlement.preCorrectionPoolCredits, 80);
assert.equal(reservedSettlement.releasedReservation.encounterId, "B");
assert.deepEqual(reservedSettlement.reservations.map((row) => row.encounterId), ["A"]);
assert.equal(reservedSettlement.version, StoryCore.POOL_SETTLEMENT_VERSION);

console.log("natural-story-core: current-only contract passed");
