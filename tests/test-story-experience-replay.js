"use strict";

const assert = require("node:assert/strict");
const DiceCore = require("../src/core/boss-duel-random.js");
const Rules = require("../src/core/boss-duel-rules.js");
const StoryCore = require("../src/core/boss-duel-natural-story-core.js");

const config = StoryCore.normalizeConfig({
  storyPool: { seed: 20260824, winMinReturnX: 3, pushMinReturnX: 1, smartMaxDraws: 9 }
});

function replay(story) {
  let hpLeft = story.hp;
  let spendX = 0;
  let coinX = 0;
  let rounds = 0;
  let killed = false;
  for (let round = 1; round <= story.rounds && !killed; round += 1) {
    rounds += 1;
    spendX += 1;
    let tieIndex = 0;
    let closed = false;
    while (!closed && tieIndex < 100) {
      const roundSeed = DiceCore.hash32(story.seed, round, 1201 + tieIndex * 17);
      const state = Rules.createNaturalRound({
        rng: DiceCore.mulberry32(roundSeed),
        magicEnabled: config.magicEnabled,
        magicRows: config.magicRows,
        magicCardsPerRound: config.magicCardsPerRound,
        useHighMagicTickets: story.star >= 7,
        playerBadHighRerollPct: config.playerBadHighRerollPct,
        bossBadHighRerollPct: config.bossBadHighRerollPct,
        initialRerollLimit: config.initialRerollLimit
      });
      coinX += state.coinX;
      const step = story.path.find((row) => row.round === round && row.tieIndex === tieIndex);
      assert(step, `missing path step for round ${round}, tie ${tieIndex}`);
      Rules.applyRecommendedKeepCards(state, step.initialKeepCardIds);
      for (let draw = 0; draw < step.draws; draw += 1) {
        const free = config.freeDrawEnabled && !state.freeUsed && state.magicCards.some((card) => card.key === "freeDraw");
        if (free) state.freeUsed = true;
        else {
          spendX += config.drawFeesX[Math.min(draw, config.drawFeesX.length - 1)] || 0;
        }
        const discardedIds = new Set(step.drawLog[draw].discardedCardIds);
        const discarded = new Set(state.playerCards.map((card, index) => discardedIds.has(Rules.cardId(card)) ? index : -1).filter((index) => index >= 0));
        Rules.redraw(state, discarded);
      }
      assert.equal(state.playerEval.key, step.finalHand, "player hand replay diverged");
      assert.equal(state.bossEval.key, step.bossHand, "boss hand replay diverged");
      if (step.action === "FOLD") {
        assert.equal(state.playerEval.key, "high");
        closed = true;
        continue;
      }
      const result = Rules.compare(state);
      if (result.tie && config.tieRedealEnabled) {
        assert.equal(step.result, "TIE");
        tieIndex += 1;
        continue;
      }
      if (result.playerWins) {
        hpLeft = Math.max(0, hpLeft - result.damage);
        killed = hpLeft === 0;
      }
      closed = true;
    }
    assert(closed, "tie replay safety exceeded");
  }
  const payoutX = (killed ? story.originalDice.total : 0) + (killed ? coinX : 0) + story.payoutParts.hand;
  assert.equal(rounds, story.rounds);
  assert.equal(hpLeft, story.hpLeft);
  assert.equal(killed, story.killed);
  assert.equal(spendX, story.spendX);
  assert.equal(payoutX, story.payoutX);
}

let checked = 0;
for (const star of [1, 4, 8]) {
  for (let index = 0; index < 8; index += 1) {
    const seed = DiceCore.hash32(20260824, index * 97 + star, 7301 + star);
    const story = StoryCore.simulateNaturalStory(config, star, seed, { includePath: true });
    replay(story);
    checked += 1;
  }
}

console.log(JSON.stringify({ status: "ok", replayedStories: checked }, null, 2));
