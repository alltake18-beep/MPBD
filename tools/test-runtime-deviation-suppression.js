"use strict";

const assert = require("node:assert/strict");
const Core = require("../dice-first-core.js");
const Rules = require("../boss-duel-rules.js");
const NaturalCore = require("../boss-duel-natural-story-core.js");

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

const magicState = createState();
const critCard = magicState.playerEval.cards[0];
critCard.magicEffects = { ...(critCard.magicEffects || {}), crit: 5, flatDamage: 6 };
magicState.magicCards = [{ key: `${magicState.playerEval.key}Boost`, target: magicState.playerEval.key, value: 3, label: "牌型倍率" }];
const magicA = NaturalCore.resolveRuntimeMagic(magicState, { story, actionSequence: 3, suppressionActive: true });
const magicB = NaturalCore.resolveRuntimeMagic(magicState, { story, actionSequence: 3, suppressionActive: true });
assert.deepEqual(magicA, magicB, "final magic suppression must replay exactly");
assert.ok(magicA.values.find((row) => row.kind === "crit" && [1, 2].includes(row.final)));
assert.ok(magicA.values.find((row) => row.kind === "flatDamage" && [3, 4].includes(row.final)));
assert.ok(magicA.values.find((row) => /Boost$/.test(row.kind) && [1, 2].includes(row.final)));

const contract = NaturalCore.replayContract(story, config);
assert.equal(contract.storySeed, story.seed);
assert.equal(contract.rulesVersion, Rules.VERSION);
assert.equal(contract.plannerVersion, "boss-plan-v10");
assert.equal(contract.suppressionPolicyVersion, NaturalCore.SUPPRESSION_POLICY_VERSION);

console.log(JSON.stringify({
  status: "ok",
  storySeed: story.seed,
  plannedAccepted: plannedAudit.acceptedCardIds,
  suppressionCandidates: deviatedA.audit.candidates.length,
  finalMagic: magicA.values
}, null, 2));
