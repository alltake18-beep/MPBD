"use strict";

const assert = require("node:assert/strict");
const Generator = require("../server/boss-duel-story-generator.js");
const DiceCore = require("../src/core/boss-duel-random.js");
const NaturalCore = require("../src/core/boss-duel-natural-story-core.js");
const CurrentPreset = require("../data/story/boss-duel-story-preset-v1.js");
const CurrentSummaryPreset = require("../data/story/boss-duel-story-summary-preset-v1.js");

async function main() {
  const formalProfile = Generator.createBuildProfile();
  assert.equal(Generator.SERVICE_VERSION, "boss-duel-story-generator-v1");
  assert.equal(Generator.FORMAL_STORIES_PER_CLASS, 10000);
  assert.equal(Generator.FORMAL_STORIES_PER_STAR, 30000);
  assert.equal(Generator.FORMAL_TOTAL_STORIES, 240000);
  assert.deepEqual(Generator.CLASS_KEYS, ["win", "push", "lose"]);
  assert.equal(formalProfile.storiesPerClass, 10000);
  assert.equal(formalProfile.config.storiesPerStar, 30000);

  const expectedSeed = DiceCore.hash32(formalProfile.config.poolSeed, 0, 7001 + 1 * 97) >>> 0;
  assert.equal(Generator.deriveSeed(formalProfile.config, 1, 0), expectedSeed);

  assert.throws(
    () => Generator.createBuildProfile({ storyPool: { storiesPerClass: 1 } }),
    (error) => error.code === "INVALID_FORMAL_QUOTA"
  );

  const replayEntries = [];
  for (const classKey of Generator.CLASS_KEYS) {
    const seed = CurrentPreset.natural[1][classKey][0];
    const story = Generator.generateStory(formalProfile.config, 1, seed, { includePath: true });
    assert.equal(story.classKey, classKey);
    assert.ok(story.path.length > 0);
    replayEntries.push({
      star: 1,
      classKey,
      seed,
      summary: CurrentSummaryPreset.naturalSummaries[1][classKey][0]
    });
  }
  const replayReport = Generator.validateReplayBatch(formalProfile.config, replayEntries);
  assert.equal(replayReport.checked, 3);
  assert.match(replayReport.actionTraceSha256, /^[a-f0-9]{64}$/);

  const commonSeed = CurrentPreset.natural[1].win[0];
  const commonStory = Generator.generateStory(formalProfile.config, 1, commonSeed, { includePath: true });
  const beforePath = JSON.stringify(commonStory.path);
  const minimumBet = Generator.SUPPORTED_BETS[0];
  const maximumBet = Generator.SUPPORTED_BETS[Generator.SUPPORTED_BETS.length - 1];
  const minimumSettlement = Generator.materializeStoryForBet(commonStory, minimumBet);
  const maximumSettlement = Generator.materializeStoryForBet(commonStory, maximumBet);
  const futureBetSettlement = Generator.materializeStoryForBet(commonStory, 3333);
  assert.equal(minimumSettlement.storyId, maximumSettlement.storyId);
  assert.equal(minimumSettlement.seed, maximumSettlement.seed);
  assert.equal(minimumSettlement.classKey, maximumSettlement.classKey);
  assert.equal(maximumSettlement.totalSpendCredits, commonStory.spendX * maximumBet);
  assert.equal(maximumSettlement.totalPayoutCredits, commonStory.payoutX * maximumBet);
  assert.equal(futureBetSettlement.totalSpendCredits, commonStory.spendX * 3333, "新增 Bet 不得要求重產劇本");
  assert.equal(JSON.stringify(commonStory.path), beforePath, "套用 Bet 不得改變劇本路徑");
  assert.throws(
    () => Generator.materializeStoryForBet(commonStory, -1),
    (error) => error.code === "INVALID_BET"
  );

  assert.equal(NaturalCore.storyClass(3, formalProfile.config), "win");
  assert.equal(NaturalCore.storyClass(1, formalProfile.config), "push");
  assert.equal(NaturalCore.storyClass(0.999999, formalProfile.config), "lose");

  const smallProfile = Generator.createBuildProfile(
    { storyPool: { storiesPerClass: 1 } },
    { formal: false, storiesPerClass: 1, workerCount: 2, chunkAttempts: 100, maxAttemptsPerStar: 10000 }
  );
  const generatedStar = await Generator.buildStarClassCatalog(smallProfile, 1);
  assert.deepEqual(Generator.stateCounts(generatedStar), { win: 1, push: 1, lose: 1 });
  assert.equal(new Set(Object.values(generatedStar.seeds).flat()).size, 3);

  const states = [];
  for (let star = 1; star <= 8; star += 1) {
    const state = Generator.createStarState(smallProfile, star);
    for (const classKey of Generator.CLASS_KEYS) {
      state.seeds[classKey].push(CurrentPreset.natural[star][classKey][0]);
      state.summaries[classKey].push(CurrentSummaryPreset.naturalSummaries[star][classKey][0]);
    }
    states.push(Generator.validateStarState(smallProfile, state, { exact: true }));
  }
  const built = Generator.buildPreset(smallProfile, states, "2026-08-31T00:00:00.000Z");
  const structural = Generator.validatePreset(smallProfile, built.preset, built.summaryPreset);
  assert.equal(structural.totalStories, 24);
  assert.deepEqual(structural.counts[8], { win: 1, push: 1, lose: 1 });

  console.log(JSON.stringify({
    status: "ok",
    serviceVersion: Generator.SERVICE_VERSION,
    formalStories: Generator.FORMAL_TOTAL_STORIES,
    outcomeClasses: Generator.CLASS_KEYS,
    betIndependent: true,
    supportedBets: Generator.SUPPORTED_BETS,
    replayChecked: replayReport.checked,
    smallCatalogStories: structural.totalStories
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
