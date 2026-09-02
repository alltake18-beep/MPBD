"use strict";

const assert = require("node:assert/strict");
const Core = require("../src/core/boss-duel-random.js");
const Rules = require("../src/core/boss-duel-rules.js");
const NaturalCore = require("../src/core/boss-duel-natural-story-core.js");

const config = NaturalCore.normalizeConfig({
  storyPool: {
    seed: 20260824,
    storiesPerClass: 10000,
    maxGenerationAttemptsPerStar: 10000000,
    winMinReturnX: 3,
    pushMinReturnX: 1,
    smartMaxDraws: 9
  }
});
assert.deepEqual(config.suppressionPolicy.magic.tables.crit.outcomes, [
  { value: 1, weight: 69 }, { value: 2, weight: 25 }, { value: 3, weight: 3 }, { value: 4, weight: 2 }, { value: 5, weight: 1 }
]);
assert.deepEqual(config.suppressionPolicy.magic.tables.flatDamage.outcomes, [
  { value: 3, weight: 70 }, { value: 4, weight: 25 }, { value: 5, weight: 3 }, { value: 6, weight: 2 }
]);
assert.deepEqual(config.suppressionPolicy.magic.tables.handBoost.outcomes, [
  { value: 1, weight: 80 }, { value: 2, weight: 19 }, { value: 3, weight: 1 }
]);
assert.equal(NaturalCore.validateSuppressionPolicy(config.suppressionPolicy).pass, true);
assert.equal(NaturalCore.validateSuppressionPolicy({ magic: { tables: { crit: { outcomes: [{ value: 1, weight: 90 }, { value: 2, weight: 5 }] } } } }).pass, false);

let story = null;
for (let attempt = 0; attempt < 5000 && !story; attempt += 1) {
  const seed = Core.hash32(config.poolSeed, attempt, 7001 + 97);
  const candidate = NaturalCore.simulateNaturalStory(config, 1, seed, { includePath: true });
  if (!candidate.killed && candidate.path.some((step) => step.drawLog.length > 0)) story = candidate;
}
assert(story, "must find an un-killed story with at least one redraw");
const step = story.path.find((row) => row.drawLog.length > 0);
const roundSeed = Core.hash32(story.seed, step.round, 1201 + step.tieIndex * 17);
const createState = () => Rules.createNaturalRound({
  rng: Core.mulberry32(roundSeed),
  magicEnabled: config.magicEnabled,
  magicRows: config.magicRows,
  magicCardsPerRound: config.magicCardsPerRound,
  useHighMagicTickets: story.star >= 7,
  playerBadHighRerollPct: config.playerBadHighRerollPct,
  bossBadHighRerollPct: config.bossBadHighRerollPct,
  initialRerollLimit: config.initialRerollLimit
});

const plannedState = createState();
Rules.applyRecommendedKeepCards(plannedState, step.drawLog[0].keepCardIds);
const plannedAudit = NaturalCore.executeRuntimeRedraw(plannedState, {
  story,
  round: step.round,
  tieIndex: step.tieIndex,
  drawNumber: 1,
  actionSequence: 1,
  discardedIndexes: plannedState.discardIndexes,
  suppressionActive: false
});
assert.equal(plannedAudit.deviated, false);
assert.equal(plannedAudit.plannedRecordMissing, false);
assert.equal(plannedAudit.suppressionActive, false);
assert.deepEqual(plannedAudit.acceptedCardIds, step.drawLog[0].acceptedCardIds, "following the story must preserve the original redraw");

const deviatedRun = () => {
  const state = createState();
  const keepIds = state.playerCards.slice(0, 1).map(Rules.cardId);
  Rules.applyRecommendedKeepCards(state, keepIds);
  const audit = NaturalCore.executeRuntimeRedraw(state, {
    story,
    round: step.round,
    tieIndex: step.tieIndex,
    drawNumber: 1,
    actionSequence: 2,
    discardedIndexes: state.discardIndexes,
    suppressionActive: false
  });
  return { state, audit };
};
const deviatedA = deviatedRun();
const deviatedB = deviatedRun();
assert.equal(deviatedA.audit.deviated, true);
assert.equal(deviatedA.audit.suppressionActivatedNow, true);
assert.ok(deviatedA.audit.candidates.length >= 1 && deviatedA.audit.candidates.length <= 30);
assert.deepEqual(deviatedA.audit, deviatedB.audit, "suppression audit must be deterministic");
assert.deepEqual(deviatedA.state.playerCards.map(Rules.cardId), deviatedB.state.playerCards.map(Rules.cardId), "deviated redraw must replay exactly");

const missingPlanState = createState();
Rules.applyRecommendedKeepCards(missingPlanState, []);
const missingPlanAudit = NaturalCore.executeRuntimeRedraw(missingPlanState, {
  story,
  round: step.round,
  tieIndex: step.tieIndex,
  drawNumber: step.drawLog.length + 1,
  actionSequence: 5,
  discardedIndexes: missingPlanState.discardIndexes,
  suppressionActive: false
});
assert.equal(missingPlanAudit.plannedRecordMissing, true, "a legal redraw beyond the story path must be recorded as missing from the plan");
assert.equal(missingPlanAudit.deviated, true, "a missing planned redraw must count as deviation even when the actual keep set is empty");
assert.equal(missingPlanAudit.suppressionActive, true, "missing redraw after an un-killed story must activate suppression");

const extraTieState = createState();
Rules.applyRecommendedKeepCards(extraTieState, []);
const extraTieAudit = NaturalCore.executeRuntimeRedraw(extraTieState, {
  story,
  round: step.round,
  tieIndex: 10000,
  drawNumber: 1,
  actionSequence: 7,
  discardedIndexes: extraTieState.discardIndexes,
  suppressionActive: false
});
assert.equal(extraTieAudit.plannedRecordMissing, true, "redraw after an extra tie redeal must not borrow another tie segment's plan");
assert.equal(extraTieAudit.suppressionActive, true);

const killedMissingPlanState = createState();
Rules.applyRecommendedKeepCards(killedMissingPlanState, []);
const killedMissingPlanAudit = NaturalCore.executeRuntimeRedraw(killedMissingPlanState, {
  story: { ...story, killed: true },
  round: step.round,
  tieIndex: step.tieIndex,
  drawNumber: step.drawLog.length + 1,
  actionSequence: 6,
  discardedIndexes: killedMissingPlanState.discardIndexes,
  suppressionActive: false
});
assert.equal(killedMissingPlanAudit.plannedRecordMissing, true);
assert.equal(killedMissingPlanAudit.deviated, true);
assert.equal(killedMissingPlanAudit.suppressionActive, false, "originally killed stories must not activate suppression");

const magicState = createState();
const critCard = magicState.playerEval.cards[0];
critCard.magicEffects = { ...(critCard.magicEffects || {}), crit: 5, flatDamage: 6 };
magicState.magicCards = [{ key: `${magicState.playerEval.key}Boost`, target: magicState.playerEval.key, value: 3, label: "牌型倍率" }];
const magicA = NaturalCore.resolveRuntimeMagic(magicState, { story, actionSequence: 3, suppressionActive: true });
const magicB = NaturalCore.resolveRuntimeMagic(magicState, { story, actionSequence: 3, suppressionActive: true });
assert.deepEqual(magicA, magicB, "final magic suppression must replay exactly");
assert.ok(magicA.values.find((row) => row.kind === "crit" && row.tableKey === "crit" && row.sourceTable === "SUPPRESSION" && [1, 2, 3, 4, 5].includes(row.final)));
assert.ok(magicA.values.find((row) => row.kind === "flatDamage" && row.tableKey === "flatDamage" && row.sourceTable === "SUPPRESSION" && [3, 4, 5, 6].includes(row.final)));
assert.ok(magicA.values.find((row) => /Boost$/.test(row.kind) && row.tableKey === "handBoost" && row.sourceTable === "SUPPRESSION" && [1, 2, 3].includes(row.final)));

const customPolicy = NaturalCore.normalizeSuppressionPolicy({
  redraw: { improvedAcceptPct: 12.5, sameOrLowerAcceptPct: 87.5, maxCandidates: 44 },
  magic: {
    tables: {
      crit: { outcomes: [{ value: 7, weight: 1 }, { value: 8, weight: 0 }] },
      flatDamage: { outcomes: [{ value: 9, weight: 1 }, { value: 10, weight: 0 }] },
      handBoost: { outcomes: [{ value: 4, weight: 1 }, { value: 6, weight: 0 }] }
    }
  }
});
const customMagic = NaturalCore.resolveRuntimeMagic(magicState, {
  story,
  actionSequence: 4,
  suppressionActive: true,
  suppressionPolicy: customPolicy
});
assert.equal(customMagic.values.find((row) => row.kind === "crit").final, 7);
assert.equal(customMagic.values.find((row) => row.kind === "flatDamage").final, 9);
assert.equal(customMagic.values.find((row) => /Boost$/.test(row.kind)).final, 4, "all hand-type damage cards must share handBoost suppression table");
const normalMagic = NaturalCore.resolveRuntimeMagic(magicState, {
  story,
  actionSequence: 4,
  suppressionActive: false,
  suppressionPolicy: customPolicy
});
assert.equal(normalMagic.values.find((row) => row.kind === "crit").final, 5, "normal state must retain the hidden normal-table value");
assert.ok(normalMagic.values.every((row) => row.sourceTable === "NORMAL"));

const contract = NaturalCore.replayContract(story, config);
assert.equal(contract.version, "story-action-trace-v2");
assert.equal(contract.storySeed, story.seed);
assert.equal(contract.rulesVersion, Rules.VERSION);
assert.equal(contract.plannerVersion, "boss-plan-v11");
assert.equal(contract.suppressionPolicyVersion, NaturalCore.SUPPRESSION_POLICY_VERSION);
assert.equal(contract.suppressionPolicy.magic.mode, "SEPARATE_TABLE");
assert.equal(contract.suppressionPolicySignature, JSON.stringify(contract.suppressionPolicy));

console.log(JSON.stringify({
  status: "ok",
  storySeed: story.seed,
  plannedAccepted: plannedAudit.acceptedCardIds,
  suppressionCandidates: deviatedA.audit.candidates.length,
  finalMagic: magicA.values
}, null, 2));
