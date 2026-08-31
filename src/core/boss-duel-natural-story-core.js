"use strict";

(function attachNaturalStoryCore(root, factory) {
  const DiceCore = root.BossDuelRandom || (
    typeof module === "object" && module.exports && typeof require === "function"
      ? require("./boss-duel-random.js")
      : null
  );
  const Rules = root.BossDuelRules || (
    typeof module === "object" && module.exports && typeof require === "function"
      ? require("./boss-duel-rules.js")
      : null
  );
  const StoryPlanner = root.BossDuelStoryPlanner || (
    typeof module === "object" && module.exports && typeof require === "function"
      ? require("./boss-duel-story-planner.js")
      : null
  );
  const api = factory(DiceCore, Rules, StoryPlanner);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BossDuelNaturalStoryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createNaturalStoryCore(DiceCore, Rules, StoryPlanner) {
  if (!DiceCore || !Rules || !StoryPlanner) throw new Error("自然劇本核心缺少骰獎、正式牌局規則或劇情規劃器");

  const STORY_KEYS = Object.freeze(["win", "push", "lose"]);
  const STORY_LABELS = Object.freeze({ win: "贏多", push: "贏少", lose: "輸" });
  const DEFAULT_TICKET_PREFERENCE_PCT = Object.freeze({ win: 1, push: 1, lose: 1 });
  const DEFAULT_TICKET_BASIS = 10000;
  const STORIES_PER_CLASS = 10000;
  const ACTION_TRACE_VERSION = "story-action-trace-v1";
  const SUPPRESSION_POLICY_VERSION = "deviation-suppression-v2-separate-tables";
  const SUPPRESSION_STORAGE_KEY = "boss-duel:suppression-policy:v2";
  const STORY_BET_CONTRACT_VERSION = "story-bet-scaling-v1";
  const BET_VALUES = Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500, 800, 1000, 1200, 1500, 1800, 2000]);
  const BET_BUCKETS = Object.freeze([
    Object.freeze({ key: "B1", label: "Bet 1–10", bets: Object.freeze([1, 2, 5, 10]) }),
    Object.freeze({ key: "B2", label: "Bet 20–200", bets: Object.freeze([20, 50, 100, 200]) }),
    Object.freeze({ key: "B3", label: "Bet 500–2000", bets: Object.freeze([500, 800, 1000, 1200, 1500, 1800, 2000]) })
  ]);
  const DEFAULT_SUPPRESSION_POLICY = Object.freeze({
    enabled: true,
    activation: Object.freeze({
      enabled: true,
      requireOriginalStoryMiss: true,
      requireKeepDeviation: true,
      latchForBoss: true
    }),
    redraw: Object.freeze({
      enabled: true,
      maxCandidates: 30,
      improvedAcceptPct: 50,
      sameOrLowerAcceptPct: 100,
      forceFinalCandidate: true
    }),
    magic: Object.freeze({
      enabled: true,
      mode: "SEPARATE_TABLE",
      tables: Object.freeze({
        crit: Object.freeze({
          enabled: true,
          label: "暴擊倍率",
          outcomes: Object.freeze([Object.freeze({ value: 1, weight: 50 }), Object.freeze({ value: 2, weight: 50 })])
        }),
        flatDamage: Object.freeze({
          enabled: true,
          label: "固定傷害",
          outcomes: Object.freeze([Object.freeze({ value: 3, weight: 50 }), Object.freeze({ value: 4, weight: 50 })])
        }),
        handBoost: Object.freeze({
          enabled: true,
          label: "共用牌型傷害倍率",
          outcomes: Object.freeze([Object.freeze({ value: 1, weight: 50 }), Object.freeze({ value: 2, weight: 50 })])
        })
      })
    })
  });
  const poolCache = new Map();
  const sumCache = new Map();
  const outcomeCache = new Map();

  const DEFAULT_BOSS_ROWS = Object.freeze([
    Object.freeze([1, 1, 2, 1, 3, 50, 100, 0, 0, 0]),
    Object.freeze([2, 7, 15, 3, 5, 75, 0, 100, 0, 0]),
    Object.freeze([3, 16, 24, 4, 6, 125, 0, 100, 0, 0]),
    Object.freeze([4, 21, 29, 5, 7, 200, 0, 60, 40, 0]),
    Object.freeze([5, 27, 36, 6, 8, 175, 0, 60, 40, 0]),
    Object.freeze([6, 34, 43, 7, 9, 150, 0, 60, 40, 0]),
    Object.freeze([7, 36, 45, 7, 9, 125, 20, 70, 10, 0]),
    Object.freeze([8, 36, 45, 7, 9, 100, 20, 70, 10, 0])
  ]);
  const DEFAULT_MAGIC_ROWS = Object.freeze([
    Object.freeze(["threeBoost", "三條傷害", 75, 50, 1, 3, "three", 1]),
    Object.freeze(["fourBoost", "四條傷害", 75, 75, 1, 3, "four", 1]),
    Object.freeze(["straightBoost", "順子傷害", 100, 125, 1, 3, "straight", 1]),
    Object.freeze(["flushBoost", "同花傷害", 150, 175, 1, 3, "flush", 1]),
    Object.freeze(["fullHouseBoost", "葫蘆傷害", 150, 175, 1, 3, "fullHouse", 1]),
    Object.freeze(["joker", "Joker", 75, 50, 1, 1, "joker", 1]),
    Object.freeze(["crit", "暴擊", 100, 100, 0, 5, "crit", 1]),
    Object.freeze(["flatDamage", "固傷", 150, 175, 3, 6, "flat", 1]),
    Object.freeze(["coin", "金幣", 100, 25, 3, 6, "coin", 1]),
    Object.freeze(["freeDraw", "免費換牌", 50, 50, 1, 1, "freeDraw", 1])
  ]);
  const DEFAULT_HAND_ROWS = Object.freeze([
    Object.freeze(["high", "高牌", 0, 0, 0]), Object.freeze(["pair", "對子", 1, 0, 1]),
    Object.freeze(["twoPair", "兩對", 2, 0, 2]), Object.freeze(["three", "三條", 3, 0, 3]),
    Object.freeze(["straight", "順子", 4, 0, 4]), Object.freeze(["flush", "同花", 5, 0, 5]),
    Object.freeze(["fullHouse", "葫蘆", 6, 0, 8]), Object.freeze(["four", "四條", 7, 0, 15]),
    Object.freeze(["straightFlush", "同花順", 8, 0, 30])
  ]);
  const SUMMARY_HAND_KEYS = Object.freeze(DEFAULT_HAND_ROWS.map((row) => row[0]));
  const SUMMARY_MAGIC_KEYS = Object.freeze(DEFAULT_MAGIC_ROWS.map((row) => row[0]));

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, finite(value, min)));
  }

  function integer(value, fallback, min, max) {
    return Math.round(clamp(finite(value, fallback), min, max));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeSuppressionOutcomes(input, fallback) {
    const source = Array.isArray(input) && input.length ? input : fallback;
    const outcomes = source.slice(0, 16).map((row, index) => ({
      value: clamp(finite(row?.value, fallback[index]?.value ?? fallback[0].value), 0, 1000000),
      weight: clamp(finite(row?.weight, fallback[index]?.weight ?? 0), 0, 1000000000)
    }));
    if (!outcomes.some((row) => row.weight > 0)) return fallback.map((row) => ({ ...row }));
    return outcomes;
  }

  function normalizeSuppressionPolicy(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const activation = source.activation || {};
    const redraw = source.redraw || {};
    const magic = source.magic || {};
    const inputTables = magic.tables || {};
    const tables = {};
    for (const key of ["crit", "flatDamage", "handBoost"]) {
      const fallback = DEFAULT_SUPPRESSION_POLICY.magic.tables[key];
      const table = inputTables[key] || {};
      tables[key] = {
        enabled: table.enabled !== false,
        label: String(table.label || fallback.label),
        outcomes: normalizeSuppressionOutcomes(table.outcomes, fallback.outcomes)
      };
    }
    return {
      enabled: source.enabled !== false,
      activation: {
        enabled: activation.enabled !== false,
        requireOriginalStoryMiss: activation.requireOriginalStoryMiss !== false,
        requireKeepDeviation: activation.requireKeepDeviation !== false,
        latchForBoss: activation.latchForBoss !== false
      },
      redraw: {
        enabled: redraw.enabled !== false,
        maxCandidates: integer(redraw.maxCandidates, 30, 1, 1000),
        improvedAcceptPct: clamp(finite(redraw.improvedAcceptPct, 50), 0, 100),
        sameOrLowerAcceptPct: clamp(finite(redraw.sameOrLowerAcceptPct, 100), 0, 100),
        forceFinalCandidate: redraw.forceFinalCandidate !== false
      },
      magic: {
        enabled: magic.enabled !== false,
        mode: "SEPARATE_TABLE",
        tables
      }
    };
  }

  function randomInt(min, max, rng) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function weightedIndex(weights, rng) {
    const safe = weights.map((weight) => Math.max(0, finite(weight, 0)));
    const total = safe.reduce((sum, weight) => sum + weight, 0);
    if (!(total > 0)) return 0;
    let cursor = rng() * total;
    for (let index = 0; index < safe.length; index += 1) {
      cursor -= safe[index];
      if (cursor < 0) return index;
    }
    return safe.length - 1;
  }

  function normalizeConfig(input = {}) {
    const story = input.storyPool || {};
    const rules = input.ruleSettings || {};
    const mechanics = input.mechanics || {};
    const carry = input.carry || {};
    const handRows = (Array.isArray(input.handRows) && input.handRows.length ? input.handRows : DEFAULT_HAND_ROWS)
      .map((row) => Array.isArray(row) ? row.slice() : row);
    const straightFlushRow = handRows.find((row) => Array.isArray(row) && row[0] === "straightFlush");
    if (straightFlushRow) straightFlushRow[4] = 30;
    return {
      seed: integer(input.seed, 20260824, 0, 0xffffffff) >>> 0,
      poolSeed: integer(story.seed, 20260824, 0, 0xffffffff) >>> 0,
      targetRtpPct: clamp(finite(input.targetCoreRtpPct ?? input.targetRtpPct, 96), 1, 500),
      bossRows: (Array.isArray(input.bossRows) && input.bossRows.length ? input.bossRows : DEFAULT_BOSS_ROWS).map((row) => row.slice()),
      magicRows: (Array.isArray(input.magicRows) && input.magicRows.length ? input.magicRows : DEFAULT_MAGIC_ROWS).map((row) => Array.isArray(row) ? row.slice() : row),
      handRows,
      drawFeesX: (Array.isArray(input.drawFeesX) && input.drawFeesX.length ? input.drawFeesX : [1, 2, 3]).map((value) => Math.max(0, finite(value, 0))),
      storiesPerClass: integer(story.storiesPerClass, STORIES_PER_CLASS, 1, 10000000),
      storiesPerStar: integer(story.storiesPerClass, STORIES_PER_CLASS, 1, 10000000) * STORY_KEYS.length,
      winMinReturnX: Math.max(0, finite(story.winMinReturnX, 3)),
      pushMinReturnX: Math.max(0, finite(story.pushMinReturnX, 1)),
      ticketBasis: integer(story.ticketBasis, DEFAULT_TICKET_BASIS, 100, 1000000),
      smartMaxDraws: integer(story.smartMaxDraws, 9, 0, 100),
      maxGenerationAttemptsPerStar: integer(story.maxGenerationAttemptsPerStar, 10000000, 100, 100000000),
      maxCandidateAttempts: integer(story.maxCandidateAttempts, 10000, 1, 1000000),
      rewardFloorPct: clamp(finite(carry.rewardFloorPct ?? story.rewardFloorPct, 10), 0, 100),
      rewardCeilingMultiple: clamp(finite(carry.rewardCeilingMultiple ?? story.rewardCeilingMultiple, 1000), 1, 1000),
      refreshCostX: Math.max(0, finite(rules.refreshCostX, 1)),
      deckStopCount: integer(rules.deckStopCount, 10, 1, 54),
      playerBadHighRerollPct: clamp(finite(rules.playerBadHighRerollPct, 50), 0, 100),
      bossBadHighRerollPct: clamp(finite(rules.bossBadHighRerollPct, 25), 0, 100),
      initialRerollLimit: integer(rules.initialRerollLimit, 50, 0, 1000000),
      magicCardsPerRound: integer(rules.magicCardsPerRound, 2, 0, 10),
      magicEnabled: mechanics.magicEnabled !== false,
      freeDrawEnabled: mechanics.freeDrawEnabled !== false,
      coinEnabled: mechanics.coinEnabled !== false,
      paidDrawEnabled: mechanics.paidDrawEnabled !== false,
      tieRedealEnabled: mechanics.tieRedealEnabled !== false,
      pokerBoostEnabled: mechanics.pokerBoostEnabled !== false,
      chainEnabled: mechanics.chainEnabled === true,
      suppressionPolicy: normalizeSuppressionPolicy(input.suppressionPolicy || input.suppression)
    };
  }

  function normalizeTicketPreferencePct(input = {}) {
    const raw = STORY_KEYS.map((key) => Math.max(0, finite(input?.[key], DEFAULT_TICKET_PREFERENCE_PCT[key])));
    const total = raw.reduce((sum, value) => sum + value, 0);
    const safe = total > 0 ? raw : STORY_KEYS.map((key) => DEFAULT_TICKET_PREFERENCE_PCT[key]);
    const safeTotal = safe.reduce((sum, value) => sum + value, 0);
    return Object.fromEntries(STORY_KEYS.map((key, index) => [key, Number((safe[index] / safeTotal * 100).toFixed(7))]));
  }

  function bossRowForStar(config, star) {
    return config.bossRows.find((row) => Number(row[0]) === Number(star)) || config.bossRows[Math.max(0, Number(star) - 1)] || DEFAULT_BOSS_ROWS[0].slice();
  }

  function handPayoutX(config, key) {
    const row = config.handRows.find((item) => Array.isArray(item) && item[0] === key);
    return Math.max(0, finite(row?.[3], 0));
  }

  function storyClass(returnX, configInput = {}) {
    const config = configInput.winMinReturnX === undefined ? normalizeConfig(configInput) : configInput;
    if (returnX >= config.winMinReturnX) return "win";
    if (returnX >= config.pushMinReturnX) return "push";
    return "lose";
  }

  function materializeStoryForBet(story, betInput, options = {}) {
    const bet = Number(betInput);
    const spendX = Number(story?.spendX);
    const payoutX = Number(story?.payoutX);
    if (!(bet > 0) || !Number.isFinite(bet)) throw new Error("Bet 必須是大於 0 的有限數字");
    if (!(spendX > 0) || !Number.isFinite(spendX)) throw new Error("劇本 spendX 必須是大於 0 的有限數字");
    if (!(payoutX >= 0) || !Number.isFinite(payoutX)) throw new Error("劇本 payoutX 必須是非負有限數字");
    if (Array.isArray(options.allowedBets) && options.allowedBets.length && !options.allowedBets.map(Number).includes(bet)) {
      throw new Error(`Bet ${bet} 不在呼叫端允許清單`);
    }
    const netX = payoutX - spendX;
    const totalSpendCredits = spendX * bet;
    const totalPayoutCredits = payoutX * bet;
    const netCredits = netX * bet;
    return Object.freeze({
      version: STORY_BET_CONTRACT_VERSION,
      betIndependent: true,
      storyId: story.id || "",
      star: Number(story.star) || 0,
      seed: Number(story.seed) >>> 0,
      classKey: story.classKey || "",
      bet,
      spendX,
      payoutX,
      netX,
      totalSpendCredits,
      totalPayoutCredits,
      spendCredits: totalSpendCredits,
      payoutCredits: totalPayoutCredits,
      netCredits,
      originalBossRewardCredits: Number(story.originalBossRewardX || 0) * bet
    });
  }

  function countVector(source, keys) {
    return keys.map((key) => Math.max(0, integer(source?.[key], 0, 0, 1000000)));
  }

  function vectorCounts(values, keys) {
    return Object.fromEntries(keys.map((key, index) => [key, Math.max(0, integer(values?.[index], 0, 0, 1000000))]).filter((entry) => entry[1] > 0));
  }

  function packStorySummary(story) {
    const actions = story.actions || {};
    const moments = story.storyMoments || {};
    return [
      Number(story.seed) >>> 0,
      story.hp,
      story.hpLeft,
      story.roundLimit,
      story.rounds,
      story.killed ? 1 : 0,
      story.spendX,
      story.payoutX,
      story.originalBossRewardX,
      story.diceStateIndex,
      story.originalDice?.normalDice || 0,
      story.originalDice?.multiplierDice || 0,
      (story.originalDice?.normalFaces || []).slice(),
      (story.originalDice?.multiplierFaces || []).slice(),
      story.originalDice?.total || 0,
      [
        actions.fights, actions.folds, actions.ties,
        actions.playerRoundWins, actions.playerRoundLosses,
        actions.totalDraws, actions.paidDraws, actions.freeDraws,
        actions.manualAdjustments, actions.changedCards
      ].map((value) => Math.max(0, integer(value, 0, 0, 1000000))),
      story.totalDamage,
      story.playerBadHighRerolls,
      story.bossBadHighRerolls,
      story.payoutParts?.hand || 0,
      story.payoutParts?.coin || 0,
      countVector(story.magicCounts, SUMMARY_MAGIC_KEYS),
      countVector(story.playerStartHandCounts, SUMMARY_HAND_KEYS),
      countVector(story.playerFinalHandCounts, SUMMARY_HAND_KEYS),
      countVector(story.bossHandCounts, SUMMARY_HAND_KEYS),
      [
        moments.excitementScore, moments.pokerRounds, moments.fastRedrawUpgrades,
        moments.maxActiveCrit, moments.maxActiveBoost, moments.drawnCritMax,
        moments.drawnBoostMax, moments.maxDamage, moments.bestHandRank,
        Math.max(0, SUMMARY_HAND_KEYS.indexOf(moments.bestHandKey))
      ].map((value) => Math.max(0, finite(value, 0))),
      story.terminationReason || ""
    ];
  }

  function unpackStorySummary(row, starInput, classKeyInput) {
    if (!Array.isArray(row)) return clone(row);
    const star = integer(starInput, 1, 1, 8);
    const classKey = STORY_KEYS.includes(classKeyInput) ? classKeyInput : "lose";
    const seed = Number(row[0]) >>> 0;
    const spendX = Math.max(0, finite(row[6], 0));
    const payoutX = Math.max(0, finite(row[7], 0));
    const normalFaces = (row[12] || []).slice();
    const multiplierFaces = (row[13] || []).slice();
    const action = row[15] || [];
    const moment = row[25] || [];
    const originalBossRewardX = Math.max(0, finite(row[8], 0));
    const handPayoutX = Math.max(0, finite(row[19], 0));
    const coinPayoutX = Math.max(0, finite(row[20], 0));
    return {
      id: storyId(star, seed),
      seed,
      star,
      classKey,
      classLabel: STORY_LABELS[classKey],
      behavior: "SMART_PROFIT_PLANNER",
      plannerVersion: "boss-plan-v10",
      hp: row[1],
      hpLeft: row[2],
      roundLimit: row[3],
      rounds: row[4],
      killed: Boolean(row[5]),
      spendX,
      payoutX,
      netX: payoutX - spendX,
      returnX: payoutX / Math.max(spendX, 1e-12),
      rtpPct: payoutX / Math.max(spendX, 1e-12) * 100,
      payoutParts: { boss: originalBossRewardX, hand: handPayoutX, coin: coinPayoutX, chain: 0 },
      originalBossRewardX,
      diceStateIndex: row[9],
      originalDice: {
        normalDice: row[10],
        multiplierDice: row[11],
        normalFaces,
        multiplierFaces,
        normalSum: normalFaces.reduce((sum, value) => sum + Number(value || 0), 0),
        multiplierSum: multiplierFaces.reduce((sum, value) => sum + Number(value || 0), 0),
        total: row[14]
      },
      actions: {
        fights: action[0] || 0,
        folds: action[1] || 0,
        ties: action[2] || 0,
        playerRoundWins: action[3] || 0,
        playerRoundLosses: action[4] || 0,
        totalDraws: action[5] || 0,
        paidDraws: action[6] || 0,
        freeDraws: action[7] || 0,
        manualAdjustments: action[8] || 0,
        changedCards: action[9] || 0
      },
      terminationReason: row[26] || "",
      totalDamage: row[16] || 0,
      playerBadHighRerolls: row[17] || 0,
      bossBadHighRerolls: row[18] || 0,
      magicCounts: vectorCounts(row[21], SUMMARY_MAGIC_KEYS),
      playerStartHandCounts: vectorCounts(row[22], SUMMARY_HAND_KEYS),
      playerFinalHandCounts: vectorCounts(row[23], SUMMARY_HAND_KEYS),
      bossHandCounts: vectorCounts(row[24], SUMMARY_HAND_KEYS),
      storyMoments: {
        tags: [],
        excitementScore: moment[0] || 0,
        pokerRounds: moment[1] || 0,
        fastRedrawUpgrades: moment[2] || 0,
        maxActiveCrit: moment[3] || 0,
        maxActiveBoost: moment[4] || 0,
        drawnCritMax: moment[5] || 0,
        drawnBoostMax: moment[6] || 0,
        maxDamage: moment[7] || 0,
        bestHandRank: moment[8] || 0,
        bestHandKey: SUMMARY_HAND_KEYS[Math.max(0, Math.min(SUMMARY_HAND_KEYS.length - 1, integer(moment[9], 0, 0, SUMMARY_HAND_KEYS.length - 1)))]
      },
      decisionMetrics: {},
      sourcePool: "NATURAL"
    };
  }

  function presetMatchesOutcomeRules(config, preset) {
    if (!preset?.signature) return false;
    try {
      const runtime = JSON.parse(poolSignature(config));
      const stored = JSON.parse(preset.signature);
      delete runtime.winMinReturnX;
      delete runtime.pushMinReturnX;
      delete stored.winMinReturnX;
      delete stored.pushMinReturnX;
      // 抑制只在玩家偏離後的線上執行期生效，不參與 240,000 劇本生成與分類。
      delete runtime.suppressionPolicyVersion;
      delete stored.suppressionPolicyVersion;
      return JSON.stringify(runtime) === JSON.stringify(stored);
    } catch (_error) {
      return false;
    }
  }

  function bucketIndexForBet(bet) {
    const value = Number(bet);
    const exact = BET_BUCKETS.findIndex((bucket) => bucket.bets.includes(value));
    if (exact >= 0) return exact;
    if (value <= 10) return 0;
    if (value <= 200) return 1;
    return 2;
  }

  function emptyBucketBalances() {
    return [0, 0, 0];
  }

  function sortedCardIds(cards) {
    return (cards || []).map((card) => typeof card === "string" ? card : Rules.cardId(card)).sort();
  }

  function sameCardIds(left, right) {
    const a = sortedCardIds(left);
    const b = sortedCardIds(right);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function storyStepAt(story, roundInput, tieIndexInput = 0) {
    const round = integer(roundInput, 1, 1, 10000);
    const tieIndex = integer(tieIndexInput, 0, 0, 10000);
    return (story?.path || []).find((step) => step.round === round && step.tieIndex === tieIndex) || null;
  }

  function plannedKeepIdsAt(story, round, tieIndex, drawNumberInput) {
    const drawNumber = integer(drawNumberInput, 1, 1, 1000);
    const step = storyStepAt(story, round, tieIndex);
    const draw = step?.drawLog?.[drawNumber - 1];
    if (Array.isArray(draw?.keepCardIds)) return draw.keepCardIds.slice().sort();
    if (drawNumber === 1 && Array.isArray(step?.initialKeepCardIds)) return step.initialKeepCardIds.slice().sort();
    return [];
  }

  function replayContract(story, configInput = {}) {
    const config = configInput.storiesPerStar === undefined ? normalizeConfig(configInput) : configInput;
    const suppressionPolicy = normalizeSuppressionPolicy(config.suppressionPolicy || config.suppression);
    return {
      version: ACTION_TRACE_VERSION,
      storyId: story?.id || storyId(story?.star || 1, story?.seed || 0),
      storySeed: Number(story?.seed) >>> 0,
      star: integer(story?.star, 1, 1, 8),
      storyClass: story?.classKey || "",
      originalKilled: Boolean(story?.killed),
      rulesVersion: Rules.VERSION,
      plannerVersion: story?.plannerVersion || StoryPlanner.VERSION,
      suppressionPolicyVersion: SUPPRESSION_POLICY_VERSION,
      suppressionPolicy,
      suppressionPolicySignature: JSON.stringify(suppressionPolicy),
      poolSignature: poolSignature(config)
    };
  }

  function deterministicSample(deck, count, seed) {
    const rows = (deck || []).slice();
    const rng = DiceCore.mulberry32(seed >>> 0);
    for (let index = rows.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      [rows[index], rows[swap]] = [rows[swap], rows[index]];
    }
    return rows.slice(0, count);
  }

  function executeRuntimeRedraw(state, context = {}) {
    const story = context.story;
    const discarded = new Set(context.discardedIndexes || state?.discardIndexes || []);
    const drawNumber = integer(context.drawNumber, (state?.draws || 0) + 1, 1, 1000);
    const round = integer(context.round, 1, 1, 10000);
    const tieIndex = integer(context.tieIndex, 0, 0, 10000);
    const actionSequence = integer(context.actionSequence, 1, 1, 1000000000);
    const actualKeepIds = sortedCardIds(state.playerCards.filter((_card, index) => !discarded.has(index)));
    const plannedKeepIds = plannedKeepIdsAt(story, round, tieIndex, drawNumber);
    const deviated = !sameCardIds(actualKeepIds, plannedKeepIds);
    const policy = normalizeSuppressionPolicy(context.suppressionPolicy);
    const suppressionWasActive = policy.enabled && Boolean(context.suppressionActive);
    const activationEligible = policy.enabled && policy.activation.enabled
      && (!policy.activation.requireOriginalStoryMiss || !story?.killed)
      && (!policy.activation.requireKeepDeviation || deviated);
    const suppressionActive = policy.enabled && (policy.activation.latchForBoss
      ? suppressionWasActive || activationEligible
      : activationEligible);
    const beforeRank = Number(state?.playerEval?.rank) || 0;
    const beforeIds = new Set(sortedCardIds(state.playerCards));
    const candidateAudit = [];
    let acceptedCards = [];

    if (!suppressionActive || !policy.redraw.enabled) {
      Rules.redraw(state, discarded);
      acceptedCards = state.playerCards.filter((card) => !beforeIds.has(Rules.cardId(card)));
      candidateAudit.push({
        attempt: 1,
        cardIds: sortedCardIds(acceptedCards),
        beforeRank,
        afterRank: Number(state.playerEval?.rank) || 0,
        improved: (Number(state.playerEval?.rank) || 0) > beforeRank,
        gate: null,
        sourceTable: "NORMAL_REDRAW",
        accepted: true
      });
    } else {
      const count = discarded.size;
      for (let attempt = 1; attempt <= policy.redraw.maxCandidates; attempt += 1) {
        const candidateSeed = DiceCore.hash32(Number(story?.seed) >>> 0, actionSequence, 31000 + attempt * 17);
        const replacements = deterministicSample(state.playerDeck, count, candidateSeed);
        const candidateState = Rules.cloneRuntimeRoundState(state);
        Rules.applyRuntimeReplacements(candidateState, discarded, replacements);
        const afterRank = Number(candidateState.playerEval?.rank) || 0;
        const improved = afterRank > beforeRank;
        const acceptPct = improved ? policy.redraw.improvedAcceptPct : policy.redraw.sameOrLowerAcceptPct;
        const gateRollPct = DiceCore.mulberry32(DiceCore.hash32(Number(story?.seed) >>> 0, actionSequence, 32000 + attempt * 19))() * 100;
        const acceptedByTable = gateRollPct < acceptPct;
        const forced = attempt === policy.redraw.maxCandidates && policy.redraw.forceFinalCandidate;
        const accepted = acceptedByTable || forced;
        candidateAudit.push({
          attempt,
          cardIds: sortedCardIds(replacements),
          beforeRank,
          afterRank,
          improved,
          sourceTable: improved ? "IMPROVED_HAND" : "SAME_OR_LOWER_HAND",
          acceptPct,
          gateRollPct,
          gate: acceptedByTable,
          forced,
          accepted
        });
        if (!accepted) continue;
        acceptedCards = replacements;
        Rules.applyRuntimeReplacements(state, discarded, replacements);
        break;
      }
    }

    return {
      version: SUPPRESSION_POLICY_VERSION,
      policy,
      round,
      tieIndex,
      drawNumber,
      actionSequence,
      originalKilled: Boolean(story?.killed),
      plannedKeepIds,
      actualKeepIds,
      deviated,
      suppressionWasActive,
      suppressionActivatedNow: !suppressionWasActive && suppressionActive,
      suppressionActive,
      candidates: candidateAudit,
      acceptedCardIds: sortedCardIds(acceptedCards)
    };
  }

  function resolveRuntimeMagic(state, context = {}) {
    const storySeed = Number(context.story?.seed) >>> 0;
    const actionSequence = integer(context.actionSequence, 1, 1, 1000000000);
    const suppressionActive = Boolean(context.suppressionActive);
    const policy = normalizeSuppressionPolicy(context.suppressionPolicy);
    const evaluation = {
      ...state.playerEval,
      cards: (state.playerEval?.cards || []).map((card) => ({
        ...card,
        magicEffects: card.magicEffects ? { ...card.magicEffects } : undefined
      }))
    };
    const magicCards = (state.magicCards || []).map((card) => ({ ...card }));
    const values = [];
    let effectIndex = 0;
    const pick = (kind, original, tableKey) => {
      const table = policy.magic.tables[tableKey];
      const eligible = policy.enabled && suppressionActive && policy.magic.enabled && table?.enabled;
      const random = DiceCore.mulberry32(DiceCore.hash32(storySeed, actionSequence, 33000 + effectIndex * 23));
      const outcomeIndex = eligible ? weightedIndex(table.outcomes.map((row) => row.weight), random) : -1;
      const final = eligible ? table.outcomes[outcomeIndex].value : original;
      values.push({
        kind,
        tableKey,
        sourceTable: eligible ? "SUPPRESSION" : "NORMAL",
        original,
        final,
        eligible,
        outcomeIndex,
        outcomes: eligible ? table.outcomes.map((row) => ({ ...row })) : []
      });
      effectIndex += 1;
      return final;
    };
    for (const card of evaluation.cards) {
      if (Number.isFinite(Number(card.magicEffects?.crit))) {
        card.magicEffects.crit = pick("crit", Number(card.magicEffects.crit), "crit");
      }
      if (Number.isFinite(Number(card.magicEffects?.flatDamage))) {
        card.magicEffects.flatDamage = pick("flatDamage", Number(card.magicEffects.flatDamage), "flatDamage");
      }
    }
    for (const card of magicCards) {
      if (card.target === evaluation.key && /Boost$/.test(card.key) && Number.isFinite(Number(card.value))) {
        card.value = pick(card.key, Number(card.value), "handBoost");
      }
    }
    return {
      version: SUPPRESSION_POLICY_VERSION,
      actionSequence,
      suppressionActive,
      policy,
      values,
      breakdown: Rules.damageBreakdown(evaluation, magicCards)
    };
  }

  function rollBossProfile(config, star, rng, seed) {
    const row = bossRowForStar(config, star);
    const hp = randomInt(integer(row[1], 1, 1, 1000000), integer(row[2], row[1], 1, 1000000), rng);
    const roundLimit = randomInt(integer(row[3], 1, 1, 10000), integer(row[4], row[3], 1, 10000), rng);
    const stateIndex = weightedIndex([row[6], row[7], row[8], row[9]], rng);
    const dice = DiceCore.inverseDiceOutcome(star, stateIndex, rng(), DiceCore.hash32(seed, stateIndex, 901));
    return { row, hp, roundLimit, stateIndex, dice };
  }

  function storyId(star, seed) {
    return `S${star}-${(seed >>> 0).toString(16).padStart(8, "0")}`;
  }

  function simulateNaturalStory(configInput, starInput, seedInput, options = {}) {
    const config = configInput.storiesPerStar === undefined ? normalizeConfig(configInput) : configInput;
    const star = integer(starInput, 1, 1, 8);
    const seed = integer(seedInput, config.seed, 0, 0xffffffff) >>> 0;
    const profileRng = DiceCore.mulberry32(seed);
    const profile = rollBossProfile(config, star, profileRng, seed);
    const initialHp = profile.hp;
    const handRank = Object.fromEntries(Rules.HANDS.map((hand) => [hand.key, hand.rank]));
    const createRound = (roundNumber, tieIndex) => {
      const roundSeed = DiceCore.hash32(seed, roundNumber, 1201 + tieIndex * 17);
      return Rules.createNaturalRound({
        rng: DiceCore.mulberry32(roundSeed),
        magicEnabled: config.magicEnabled,
        magicRows: config.magicRows,
        magicCardsPerRound: config.magicCardsPerRound,
        useHighMagicTickets: star >= 7,
        playerBadHighRerollPct: config.playerBadHighRerollPct,
        bossBadHighRerollPct: config.bossBadHighRerollPct,
        initialRerollLimit: config.initialRerollLimit
      });
    };
    const fastClassification = options.fastClassification === true && Array.isArray(options.summaryClassKeys);
    let outcome = StoryPlanner.planBossStory({
      config,
      initialHp,
      roundLimit: profile.roundLimit,
      bossRewardX: profile.dice.total,
      createRound,
      handPayoutX: (key) => handPayoutX(config, key),
      includePath: !fastClassification
    });

    let spendX = Math.max(0, finite(outcome.spendX, 0));
    let payoutX = Math.max(0, finite(outcome.payoutX, 0));
    let netX = payoutX - spendX;
    let returnX = payoutX / Math.max(spendX, 1e-12);
    let classKey = storyClass(returnX, config);
    if (Array.isArray(options.summaryClassKeys) && !options.summaryClassKeys.includes(classKey)) {
      return { seed, star, classKey };
    }
    if (fastClassification) {
      const classified = { classKey, spendX, payoutX, killed: Boolean(outcome.killed), rounds: outcome.rounds };
      outcome = StoryPlanner.planBossStory({
        config,
        initialHp,
        roundLimit: profile.roundLimit,
        bossRewardX: profile.dice.total,
        createRound,
        handPayoutX: (key) => handPayoutX(config, key),
        includePath: true
      });
      spendX = Math.max(0, finite(outcome.spendX, 0));
      payoutX = Math.max(0, finite(outcome.payoutX, 0));
      netX = payoutX - spendX;
      returnX = payoutX / Math.max(spendX, 1e-12);
      classKey = storyClass(returnX, config);
      if (classKey !== classified.classKey || spendX !== classified.spendX || payoutX !== classified.payoutX || Boolean(outcome.killed) !== classified.killed || outcome.rounds !== classified.rounds) {
        throw new Error(`快速分類與完整重播不一致：${star} 星 seed ${seed}`);
      }
    }

    const handCounts = {};
    const playerStartHandCounts = {};
    const playerFinalHandCounts = {};
    const bossHandCounts = {};
    const magicCounts = {};
    const magicMoments = [];
    let playerBadHighRerolls = 0;
    let bossBadHighRerolls = 0;
    let pokerRounds = 0;
    let fastRedrawUpgrades = 0;
    let maxActiveCrit = 0;
    let maxActiveBoost = 0;
    let maxDamage = 0;
    let bestHandRank = 0;
    let bestHandKey = "high";
    for (const step of outcome.path) {
      handCounts[step.startHand] = (handCounts[step.startHand] || 0) + 1;
      handCounts[step.finalHand] = (handCounts[step.finalHand] || 0) + 1;
      playerStartHandCounts[step.startHand] = (playerStartHandCounts[step.startHand] || 0) + 1;
      playerFinalHandCounts[step.finalHand] = (playerFinalHandCounts[step.finalHand] || 0) + 1;
      bossHandCounts[step.bossHand] = (bossHandCounts[step.bossHand] || 0) + 1;
      playerBadHighRerolls += Math.max(0, finite(step.playerBadHighRerolls, 0));
      bossBadHighRerolls += Math.max(0, finite(step.bossBadHighRerolls, 0));
      maxActiveCrit = Math.max(maxActiveCrit, finite(step.activeCrit, 0));
      maxActiveBoost = Math.max(maxActiveBoost, finite(step.activeBoost, 0));
      maxDamage = Math.max(maxDamage, finite(step.damage, 0));
      const finalRank = handRank[step.finalHand] || 0;
      if (finalRank > bestHandRank) {
        bestHandRank = finalRank;
        bestHandKey = step.finalHand;
      }
      if (step.draws > 0 && step.draws <= 2 && finalRank > (handRank[step.startHand] || 0)) fastRedrawUpgrades += 1;
      if (step.action === "FIGHT") pokerRounds += 1;
      for (const card of step.magicCards || []) {
        magicCounts[card.key] = (magicCounts[card.key] || 0) + 1;
        magicMoments.push({ round: step.round, tieIndex: step.tieIndex, key: card.key, value: card.value, target: card.target });
      }
    }

    const drawnCritMax = magicMoments
      .filter((item) => item.key === "crit")
      .reduce((max, item) => Math.max(max, finite(item.value, 0)), 0);
    const drawnBoostMax = magicMoments
      .filter((item) => /Boost$/.test(item.key))
      .reduce((max, item) => Math.max(max, finite(item.value, 0)), 0);
    const tags = [];
    if (maxActiveBoost >= 3) tags.push("MAX_HAND_BOOST");
    if (maxActiveCrit >= 5) tags.push("CRIT_5X");
    else if (maxActiveCrit >= 4) tags.push("CRIT_4X");
    else if (maxActiveCrit >= 3) tags.push("CRIT_3X");
    if (fastRedrawUpgrades > 0) tags.push("FAST_REDRAW");
    if (outcome.rounds >= 2 && pokerRounds === outcome.rounds) tags.push("POKER_EVERY_ROUND");
    if (outcome.killed && outcome.rounds === profile.roundLimit) tags.push("FINAL_ROUND_KILL");
    if (outcome.killed && outcome.rounds <= 2) tags.push("QUICK_KILL");
    if (bestHandRank >= 6) tags.push("BIG_HAND");
    if (maxDamage >= Math.max(12, initialHp * 0.6)) tags.push("DAMAGE_SPIKE");
    let excitementScore = 0;
    excitementScore += maxActiveBoost >= 3 ? 7 : maxActiveBoost >= 2 ? 3 : 0;
    excitementScore += maxActiveCrit >= 5 ? 10 : maxActiveCrit >= 4 ? 7 : maxActiveCrit >= 3 ? 4 : 0;
    excitementScore += Math.min(3, fastRedrawUpgrades) * 3;
    excitementScore += outcome.rounds >= 2 && pokerRounds === outcome.rounds ? 7 : 0;
    excitementScore += outcome.killed && outcome.rounds === profile.roundLimit ? 6 : 0;
    excitementScore += outcome.killed && outcome.rounds <= 2 ? 5 : 0;
    excitementScore += bestHandRank >= 8 ? 10 : bestHandRank >= 7 ? 7 : bestHandRank >= 6 ? 4 : 0;
    excitementScore += maxDamage >= Math.max(12, initialHp * 0.6) ? 4 : 0;

    const originalBossRewardX = outcome.killed ? profile.dice.total : 0;
    return {
      id: storyId(star, seed), seed, star, classKey, classLabel: STORY_LABELS[classKey],
      behavior: options.behavior || "SMART_PROFIT_PLANNER",
      plannerVersion: outcome.plannerVersion,
      hp: initialHp, hpLeft: outcome.hpLeft, roundLimit: profile.roundLimit, rounds: outcome.rounds, killed: outcome.killed,
      spendX, payoutX, netX, returnX, rtpPct: returnX * 100,
      payoutParts: { boss: originalBossRewardX, hand: outcome.handPayoutX, coin: outcome.coinPayoutX, chain: 0 },
      originalBossRewardX, diceStateIndex: profile.stateIndex,
      originalDice: {
        normalDice: profile.dice.normalDice, multiplierDice: profile.dice.multiplierDice,
        normalFaces: profile.dice.normalFaces.slice(), multiplierFaces: profile.dice.multiplierFaces.slice(),
        normalSum: profile.dice.normalSum, multiplierSum: profile.dice.multiplierSum, total: profile.dice.total
      },
      actions: {
        fights: outcome.fights, folds: outcome.folds, ties: outcome.ties,
        playerRoundWins: outcome.playerRoundWins, playerRoundLosses: outcome.playerRoundLosses,
        totalDraws: outcome.totalDraws, paidDraws: outcome.paidDraws, freeDraws: outcome.freeDraws,
        manualAdjustments: outcome.manualAdjustments, changedCards: outcome.changedCards
      },
      decisionMetrics: { ...outcome.decisionMetrics },
      terminationReason: outcome.terminationReason,
      totalDamage: outcome.totalDamage, playerBadHighRerolls, bossBadHighRerolls,
      handCounts, playerStartHandCounts, playerFinalHandCounts, bossHandCounts, magicCounts,
      storyMoments: {
        tags, excitementScore, pokerRounds, fastRedrawUpgrades, maxActiveCrit, maxActiveBoost,
        drawnCritMax, drawnBoostMax, maxDamage, bestHandRank, bestHandKey
      },
      magicMoments: options.includePath === false ? [] : magicMoments,
      path: options.includePath === false ? [] : outcome.path
    };
  }

  function poolSignature(config) {
    return JSON.stringify({
      rulesVersion: Rules.VERSION, plannerVersion: StoryPlanner.VERSION,
      poolSeed: config.poolSeed, bossRows: config.bossRows, magicRows: config.magicRows, handRows: config.handRows,
      drawFeesX: config.drawFeesX, storiesPerClass: config.storiesPerClass, storiesPerStar: config.storiesPerClass * STORY_KEYS.length,
      actionTraceVersion: ACTION_TRACE_VERSION,
      classificationBasis: "TOTAL_PAYOUT_OVER_TOTAL_SPEND",
      winMinReturnX: config.winMinReturnX, pushMinReturnX: config.pushMinReturnX, smartMaxDraws: config.smartMaxDraws,
      deckStopCount: config.deckStopCount, playerBadHighRerollPct: config.playerBadHighRerollPct,
      bossBadHighRerollPct: config.bossBadHighRerollPct, initialRerollLimit: config.initialRerollLimit,
      magicCardsPerRound: config.magicCardsPerRound, magicEnabled: config.magicEnabled,
      freeDrawEnabled: config.freeDrawEnabled, coinEnabled: config.coinEnabled,
      paidDrawEnabled: config.paidDrawEnabled, tieRedealEnabled: config.tieRedealEnabled
    });
  }

  function buildNaturalStoryPoolFromPreset(configInput, preset, options = {}) {
    const config = configInput.storiesPerStar === undefined ? normalizeConfig(configInput) : configInput;
    const signature = poolSignature(config);
    if (!preset || (preset.signature !== signature && !presetMatchesOutcomeRules(config, preset))) return null;
    const cacheKey = `natural-preset:${signature}`;
    if (options.useCache !== false && poolCache.has(cacheKey)) return poolCache.get(cacheKey);
    const startedAt = Date.now();
    const cells = {};
    for (let star = 1; star <= 8; star += 1) {
      cells[star] = { win: [], push: [], lose: [] };
      for (const storedClassKey of STORY_KEYS) {
        const summaries = preset.naturalSummaries?.[star]?.[storedClassKey];
        if (Array.isArray(summaries) && options.includePath !== true) {
          for (const storedSummary of summaries) {
            const summary = unpackStorySummary(storedSummary, star, storedClassKey);
            const classKey = storyClass(summary.payoutX / summary.spendX, config);
            cells[star][classKey].push({
              ...clone(summary), classKey, classLabel: STORY_LABELS[classKey],
              sourcePool: "NATURAL", path: [], magicMoments: []
            });
          }
        } else {
          for (const seed of preset.natural?.[star]?.[storedClassKey] || []) {
            const story = simulateNaturalStory(config, star, seed, { includePath: options.includePath === true });
            story.sourcePool = "NATURAL";
            cells[star][story.classKey].push(story);
          }
        }
      }
      const starCount = STORY_KEYS.reduce((sum, classKey) => sum + cells[star][classKey].length, 0);
      if (starCount !== config.storiesPerStar) throw new Error(`${star} 星自然故事不是 ${config.storiesPerStar} 個`);
    }
    const pool = {
      version: "natural-story-runtime-classification-v1", signature, config: clone(config),
      cells, naturalCells: cells,
      naturalDiagnostics: Array.from({ length: 8 }, (_, index) => {
        const star = index + 1;
        const observed = Object.fromEntries(STORY_KEYS.map((key) => [key, cells[star][key].length]));
        return { star, attempts: config.storiesPerStar, totalStories: config.storiesPerStar, observed, accepted: clone(observed), missing: STORY_KEYS.filter((key) => !observed[key]) };
      }),
      storiesPerStar: config.storiesPerStar, naturalStories: 8 * config.storiesPerStar,
      totalStories: 8 * config.storiesPerStar,
      generatedAt: preset.generatedAt || new Date().toISOString(), hydratedAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
      fromPreset: true
    };
    if (options.useCache !== false) poolCache.set(cacheKey, pool);
    return pool;
  }

  function ticketPreferenceProbabilities(input = {}) {
    const normalized = normalizeTicketPreferencePct(input);
    return STORY_KEYS.map((key) => normalized[key] / 100);
  }

  function targetScorePoints(story, targetRtpPct = 96) {
    return finite(story?.payoutX, 0) * 100 - finite(targetRtpPct, 96) * finite(story?.spendX, 0);
  }

  function addUniqueProbabilityPoint(points, point) {
    if (point.some((value) => value < -1e-9 || value > 1 + 1e-9)) return;
    const normalized = point.map((value) => Math.max(0, Math.min(1, value)));
    if (!points.some((existing) => existing.every((value, index) => Math.abs(value - normalized[index]) < 1e-9))) points.push(normalized);
  }

  function closestRtpProbabilityPoint(scorePoints, preferred) {
    const endpoints = [];
    for (let index = 0; index < scorePoints.length; index += 1) {
      if (Math.abs(scorePoints[index]) < 1e-9) {
        const point = [0, 0, 0];
        point[index] = 1;
        addUniqueProbabilityPoint(endpoints, point);
      }
    }
    for (let left = 0; left < scorePoints.length; left += 1) {
      for (let right = left + 1; right < scorePoints.length; right += 1) {
        const leftScore = scorePoints[left];
        const rightScore = scorePoints[right];
        if (leftScore * rightScore > 0 || Math.abs(leftScore - rightScore) < 1e-12) continue;
        const leftProbability = -rightScore / (leftScore - rightScore);
        const point = [0, 0, 0];
        point[left] = leftProbability;
        point[right] = 1 - leftProbability;
        addUniqueProbabilityPoint(endpoints, point);
      }
    }
    if (!endpoints.length) return null;
    let start = endpoints[0];
    let end = endpoints[0];
    let largestDistance = -1;
    endpoints.forEach((first) => endpoints.forEach((second) => {
      const distance = first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0);
      if (distance > largestDistance) {
        largestDistance = distance;
        start = first;
        end = second;
      }
    }));
    const direction = end.map((value, index) => value - start[index]);
    const lengthSquared = direction.reduce((sum, value) => sum + value * value, 0);
    const position = lengthSquared > 0
      ? clamp(direction.reduce((sum, value, index) => sum + value * (preferred[index] - start[index]), 0) / lengthSquared, 0, 1)
      : 0;
    return start.map((value, index) => value + direction[index] * position);
  }

  function integerizeTicketProbabilities(candidates, targetRtpPct, continuous, ticketBasis) {
    const basis = integer(ticketBasis, DEFAULT_TICKET_BASIS, 100, 1000000);
    const scores = candidates.map((story) => targetScorePoints(story, targetRtpPct));
    const center = Math.round(continuous[0] * basis);
    let best = null;
    const left = Math.max(0, center - 96);
    const right = Math.min(basis, center + 96);
    for (let first = left; first <= right; first += 1) {
      const denominator = scores[1] - scores[2];
      const idealSecond = Math.abs(denominator) > 1e-12
        ? (-basis * scores[2] - first * (scores[0] - scores[2])) / denominator
        : continuous[1] * basis;
      const secondCenter = Math.round(idealSecond);
      for (let offset = -3; offset <= 3; offset += 1) {
        const second = secondCenter + offset;
        const third = basis - first - second;
        if (second < 0 || third < 0) continue;
        const counts = [first, second, third];
        const probabilities = counts.map((value) => value / basis);
        const weightedSpendX = probabilities.reduce((sum, probability, index) => sum + probability * finite(candidates[index].spendX, 0), 0);
        const weightedPayoutX = probabilities.reduce((sum, probability, index) => sum + probability * finite(candidates[index].payoutX, 0), 0);
        const rtpPct = weightedPayoutX / Math.max(weightedSpendX, 1e-12) * 100;
        const errorPp = Math.abs(rtpPct - targetRtpPct);
        const distanceFromContinuous = probabilities.reduce((sum, value, index) => sum + (value - continuous[index]) ** 2, 0);
        if (!best || errorPp < best.errorPp - 1e-12 || (Math.abs(errorPp - best.errorPp) < 1e-12 && distanceFromContinuous < best.distanceFromContinuous)) {
          best = { counts, probabilities, weightedSpendX, weightedPayoutX, rtpPct, errorPp, distanceFromContinuous };
        }
      }
    }
    return best;
  }

  function solveCandidateProbabilities(candidates, targetRtpPct = 96, options = {}) {
    if (!Array.isArray(candidates) || candidates.length !== 3) return null;
    const scorePoints = candidates.map((story) => targetScorePoints(story, targetRtpPct));
    if (!(Math.min(...scorePoints) <= 0 && Math.max(...scorePoints) >= 0) || scorePoints.every((value) => Math.abs(value) < 1e-12)) return null;
    const preferredSlotProbabilities = ticketPreferenceProbabilities(options.ticketPreferencePct);
    const continuous = closestRtpProbabilityPoint(scorePoints, preferredSlotProbabilities);
    if (!continuous) return null;
    const integerized = integerizeTicketProbabilities(candidates, targetRtpPct, continuous, options.ticketBasis);
    if (!integerized) return null;
    const probabilities = Object.fromEntries(STORY_KEYS.map((key) => [key, 0]));
    candidates.forEach((story, index) => {
      if (STORY_KEYS.includes(story.classKey)) probabilities[story.classKey] += integerized.probabilities[index];
    });
    const preferredProbabilities = Object.fromEntries(STORY_KEYS.map((key, index) => [key, preferredSlotProbabilities[index]]));
    const mixDistance = STORY_KEYS.reduce((sum, key) => sum + (probabilities[key] - preferredProbabilities[key]) ** 2, 0);
    const mixDeviationPpMax = Math.max(...STORY_KEYS.map((key) => Math.abs(probabilities[key] - preferredProbabilities[key]) * 100));
    return {
      probabilities,
      slotProbabilities: integerized.probabilities,
      ticketCounts: integerized.counts,
      ticketBasis: integerized.counts.reduce((sum, value) => sum + value, 0),
      scorePoints,
      scoreBalancePoints: integerized.counts.reduce((sum, value, index) => sum + value * scorePoints[index], 0),
      preferredProbabilities,
      mixDistance,
      mixDeviationPpMax,
      weightedSpendX: integerized.weightedSpendX,
      weightedPayoutX: integerized.weightedPayoutX,
      rtpPct: integerized.rtpPct,
      errorPp: integerized.errorPp
    };
  }

  // 正式遊戲抽法：三個分類各自從完整自然故事池等機率抽一個，
  // 再只依這三個故事的實際總押／總派彩配成目標 RTP。
  // 不使用分類配比，也不在分類內以分數錦標賽偏挑靠近目標的故事。
  function drawUniformPresetStoryCommit(preset, configInput, starInput, targetRtpPct, rng = Math.random, options = {}) {
    const config = configInput?.storiesPerStar === undefined ? normalizeConfig(configInput) : configInput;
    const star = integer(starInput, 1, 1, 8);
    const naturalCells = preset?.natural?.[star];
    const seedRows = STORY_KEYS.flatMap((key) => naturalCells?.[key] || []);
    if (!naturalCells || seedRows.length !== config.storiesPerStar) throw new Error(`${star} 星遊戲故事 seed 不是 ${config.storiesPerStar} 個`);
    const invalidCells = STORY_KEYS.filter((key) => (naturalCells[key] || []).length !== config.storiesPerClass);
    if (invalidCells.length) throw new Error(`${star} 星${invalidCells.map((key) => STORY_LABELS[key]).join("、")}不是各 ${config.storiesPerClass} 個，無法抽正式三候選`);

    const maxAttempts = integer(options.maxCandidateAttempts, config.maxCandidateAttempts || 10000, 1, 1000000);
    const ticketBasis = integer(options.ticketBasis, config.ticketBasis || DEFAULT_TICKET_BASIS, 100, 1000000);
    const replayCache = new Map();
    const replay = (seedInput) => {
      const seed = Number(seedInput) >>> 0;
      if (!replayCache.has(seed)) {
        const story = simulateNaturalStory(config, star, seed, { includePath: options.includePath === true, behavior: "SMART_PROFIT_PLANNER" });
        story.sourcePool = "NATURAL";
        replayCache.set(seed, story);
      }
      return replayCache.get(seed);
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const candidates = STORY_KEYS.map((key) => {
        const rows = naturalCells[key];
        return replay(rows[Math.floor(rng() * rows.length)]);
      });
      // 三分類沒有預設占比；等權只用來解決三個候選在同一條 96% 解線上的自由度。
      const solved = solveCandidateProbabilities(candidates, targetRtpPct, {
        ticketPreferencePct: { win: 1, push: 1, lose: 1 },
        ticketBasis
      });
      if (!solved || solved.ticketCounts.some((count) => count <= 0)) continue;
      const selectedIndex = weightedIndex(solved.ticketCounts, rng);
      const selected = candidates[selectedIndex];
      return {
        star, attempt, candidateSetsEvaluated: attempt, candidates,
        weights: solved.probabilities, weightedRtpPct: solved.rtpPct, rtpErrorPp: solved.errorPp,
        slotWeights: solved.slotProbabilities, ticketCounts: solved.ticketCounts, ticketBasis: solved.ticketBasis,
        scorePoints: solved.scorePoints, scoreBalancePoints: solved.scoreBalancePoints,
        preferredWeights: null, mixDeviationPpMax: null,
        candidateSources: candidates.map(() => "NATURAL"),
        selectedClass: selected.classKey, selectedStory: selected,
        committedNetX: selected.netX,
        committedSpendX: selected.spendX,
        committedPayoutX: selected.payoutX,
        selectionPolicy: "FULL_CLASS_UNIFORM_THEN_SCORE_TICKETS"
      };
    }
    throw new Error(`${star} 星在 ${maxAttempts} 次完整分類等機率抽取內找不到可配成 ${targetRtpPct}% 的三候選`);
  }

  function diceSumRows(count) {
    if (sumCache.has(count)) return sumCache.get(count);
    if (count <= 0) return [{ sum: 0, ways: 1 }];
    let map = new Map([[0, 1]]);
    for (let die = 0; die < count; die += 1) {
      const next = new Map();
      for (const [sum, ways] of map.entries()) {
        for (let face = 1; face <= 6; face += 1) next.set(sum + face, (next.get(sum + face) || 0) + ways);
      }
      map = next;
    }
    const rows = [...map.entries()].map(([sum, ways]) => ({ sum, ways }));
    sumCache.set(count, rows);
    return rows;
  }

  function legalDiceOutcomes(normalDice, multiplierDice) {
    const key = `${normalDice}:${multiplierDice}`;
    if (outcomeCache.has(key)) return outcomeCache.get(key);
    const byTotal = new Map();
    for (const normal of diceSumRows(normalDice)) {
      for (const multiplier of diceSumRows(multiplierDice)) {
        const total = multiplierDice > 0 ? normal.sum * multiplier.sum : normal.sum;
        const row = { total, normalSum: normal.sum, multiplierSum: multiplier.sum, ways: normal.ways * multiplier.ways };
        const existing = byTotal.get(total);
        if (!existing || row.ways > existing.ways) byTotal.set(total, row);
      }
    }
    const outcomes = [...byTotal.values()].sort((left, right) => left.total - right.total);
    outcomeCache.set(key, outcomes);
    return outcomes;
  }

  function facesForSum(count, sum, rng) {
    const faces = [];
    let remaining = sum;
    for (let left = count; left > 0; left -= 1) {
      const minFace = Math.max(1, remaining - 6 * (left - 1));
      const maxFace = Math.min(6, remaining - (left - 1));
      const face = randomInt(minFace, maxFace, rng);
      faces.push(face);
      remaining -= face;
    }
    return faces;
  }

  function correctBossDiceReward(story, incomingPoolCredits, bet = 1, boundsInput = {}, rng = Math.random) {
    const original = Math.max(0, finite(story?.originalBossRewardX, 0));
    const incoming = finite(incomingPoolCredits, 0);
    const wager = Math.max(1e-12, finite(bet, 1));
    const bounds = typeof boundsInput === "object" && boundsInput
      ? boundsInput
      : { rewardFloorPct: Math.max(0, 100 - finite(boundsInput, 0)), rewardCeilingMultiple: 1 + Math.max(0, finite(boundsInput, 0)) / 100 };
    const rewardFloorPct = clamp(finite(bounds.rewardFloorPct, 10), 0, 100);
    const rewardCeilingMultiple = clamp(finite(bounds.rewardCeilingMultiple, 1000), 1, 1000);
    const minimumRewardX = original * rewardFloorPct / 100;
    const maximumRewardX = original * rewardCeilingMultiple;
    const requestedAbsCredits = Math.abs(incoming);
    const capCredits = (incoming >= 0 ? maximumRewardX - original : original - minimumRewardX) * wager;
    const base = {
      applied: false, direction: "none", reason: "",
      originalRewardX: original, correctedRewardX: original,
      deltaX: 0, deltaCredits: 0, dice: clone(story?.originalDice || {}),
      rewardFloorPct, rewardCeilingMultiple, minimumRewardX, maximumRewardX,
      requestedAbsCredits, capCredits, usableCredits: Math.min(requestedAbsCredits, capCredits),
      appliedAbsCredits: 0, unappliedAbsCredits: requestedAbsCredits,
      limitedByCap: requestedAbsCredits > capCredits + 1e-9,
      limitedByPool: requestedAbsCredits <= capCredits + 1e-9,
      legalOutcomeCount: 0
    };
    if (!story?.killed) {
      return { ...base, reason: "NOT_KILLED" };
    }
    if (original <= 0) {
      return { ...base, reason: "NO_ORIGINAL_REWARD" };
    }
    if (Math.abs(incoming) < 1e-9) {
      return { ...base, reason: "ZERO_POOL" };
    }
    const normalDice = integer(story.originalDice?.normalDice, 1, 1, 8);
    const multiplierDice = integer(story.originalDice?.multiplierDice, 0, 0, 8);
    const poolLimitX = Math.abs(incoming) / wager;
    const outcomes = legalDiceOutcomes(normalDice, multiplierDice);
    let selected = null;
    if (incoming > 0) {
      const ceiling = Math.min(maximumRewardX, original + poolLimitX) + 1e-12;
      selected = outcomes.filter((row) => row.total > original && row.total <= ceiling).pop() || null;
    } else {
      const floor = Math.max(minimumRewardX, original - poolLimitX) - 1e-12;
      selected = outcomes.find((row) => row.total < original && row.total >= floor) || null;
    }
    if (!selected) {
      return { ...base, reason: "NO_LEGAL_OUTCOME", legalOutcomeCount: outcomes.length };
    }
    const deltaX = selected.total - original;
    const deltaCredits = deltaX * wager;
    const appliedAbsCredits = Math.abs(deltaCredits);
    return {
      ...base,
      applied: true, direction: deltaX > 0 ? "increase" : "decrease", reason: "APPLIED",
      originalRewardX: original, correctedRewardX: selected.total, deltaX, deltaCredits,
      appliedAbsCredits, unappliedAbsCredits: Math.max(0, requestedAbsCredits - appliedAbsCredits),
      legalOutcomeCount: outcomes.length,
      dice: {
        normalDice, multiplierDice,
        normalFaces: facesForSum(normalDice, selected.normalSum, rng),
        multiplierFaces: facesForSum(multiplierDice, selected.multiplierSum, rng),
        normalSum: selected.normalSum, multiplierSum: selected.multiplierSum, total: selected.total
      }
    };
  }

  function addPoolCredits(bucketBalancesInput, bet = 1, credits = 0) {
    const balances = Array.isArray(bucketBalancesInput) ? bucketBalancesInput.slice(0, 3) : emptyBucketBalances();
    while (balances.length < 3) balances.push(0);
    const wager = Math.max(1e-12, finite(bet, 1));
    const bucketIndex = bucketIndexForBet(wager);
    const incomingPoolCredits = finite(balances[bucketIndex], 0);
    const deltaCredits = finite(credits, 0);
    const endingPoolCredits = incomingPoolCredits + deltaCredits;
    balances[bucketIndex] = Math.abs(endingPoolCredits) < 1e-9 ? 0 : endingPoolCredits;
    return {
      bucketIndex, bucketKey: BET_BUCKETS[bucketIndex].key, bet: wager,
      incomingPoolCredits, deltaCredits, endingPoolCredits: balances[bucketIndex], balances
    };
  }

  function commitStoryToBuckets(commit, bucketBalancesInput, bet = 1, options = {}) {
    if (!commit?.selectedStory) throw new Error("StoryCommit 缺少 selectedStory");
    const actualSpendCredits = Math.max(0, finite(options.actualSpendCredits, commit.selectedStory.spendX * bet));
    const targetRtpPct = clamp(finite(options.targetRtpPct, 96), 0, 500);
    const targetAccrualCredits = actualSpendCredits * targetRtpPct / 100;
    const posted = addPoolCredits(bucketBalancesInput, bet, targetAccrualCredits);
    return {
      ...posted,
      actualSpendCredits, targetRtpPct, targetAccrualCredits,
      afterCommitCredits: posted.endingPoolCredits,
      commitNetCredits: targetAccrualCredits
    };
  }

  function settleStartedStory(commit, startedCommit, bucketBalancesInput, bet = 1, options = {}) {
    const balances = Array.isArray(bucketBalancesInput) ? bucketBalancesInput.slice(0, 3) : emptyBucketBalances();
    while (balances.length < 3) balances.push(0);
    const wager = Math.max(1e-12, finite(bet, startedCommit?.bet || 1));
    const bucketIndex = Number.isInteger(startedCommit?.bucketIndex)
      ? integer(startedCommit.bucketIndex, bucketIndexForBet(wager), 0, 2)
      : bucketIndexForBet(wager);
    const story = commit?.selectedStory;
    if (!story) throw new Error("StoryCommit 缺少 selectedStory");
    const actualSpendCredits = Math.max(0, finite(options.actualSpendCredits, startedCommit?.actualSpendCredits ?? story.spendX * wager));
    const targetRtpPct = clamp(finite(options.targetRtpPct, startedCommit?.targetRtpPct ?? 96), 0, 500);
    const targetAccrualCredits = Math.max(0, finite(options.targetAccrualCredits, startedCommit?.targetAccrualCredits ?? actualSpendCredits * targetRtpPct / 100));
    const afterSpendCredits = finite(balances[bucketIndex], 0);
    const organicPayoutCredits = Math.max(0, finite(
      options.organicPayoutCredits ?? options.actualPayoutCredits,
      story.payoutX * wager
    ));
    // 所有付費事件依鎖定 RTP 正向入桶；自然派彩在擊殺補正前從同桶扣除。
    const preCorrectionPoolCredits = afterSpendCredits - organicPayoutCredits;
    const correctionStory = {
      ...story,
      killed: options.actualKilled === undefined ? story.killed : Boolean(options.actualKilled),
      originalBossRewardX: options.actualBossRewardX === undefined ? story.originalBossRewardX : Math.max(0, finite(options.actualBossRewardX, 0)),
      originalDice: options.actualDice ? clone(options.actualDice) : story.originalDice
    };
    const correction = correctBossDiceReward(
      correctionStory,
      preCorrectionPoolCredits,
      wager,
      {
        rewardFloorPct: options.rewardFloorPct ?? commit.poolConfig?.rewardFloorPct ?? 10,
        rewardCeilingMultiple: options.rewardCeilingMultiple ?? commit.poolConfig?.rewardCeilingMultiple ?? 1000
      },
      options.rng || Math.random
    );
    const actualPayoutCredits = organicPayoutCredits + correction.deltaCredits;
    const organicActualNetCredits = organicPayoutCredits - actualSpendCredits;
    const actualNetCredits = actualPayoutCredits - actualSpendCredits;
    const endingPoolCredits = preCorrectionPoolCredits - correction.deltaCredits;
    balances[bucketIndex] = Math.abs(endingPoolCredits) < 1e-9 ? 0 : endingPoolCredits;
    return {
      bucketIndex, bucketKey: BET_BUCKETS[bucketIndex].key,
      incomingPoolCredits: finite(startedCommit?.incomingPoolCredits, afterSpendCredits - targetAccrualCredits),
      targetRtpPct, targetAccrualCredits, commitNetCredits: targetAccrualCredits,
      afterSpendCredits, afterCommitCredits: afterSpendCredits,
      organicPayoutCredits, organicActualNetCredits, preCorrectionPoolCredits, actualNetCredits,
      endingPoolCredits: balances[bucketIndex], balances, correction,
      actualPayoutCredits, actualSpendCredits
    };
  }

  function settleCommittedStory(commit, bucketBalancesInput, bet = 1, options = {}) {
    const started = commitStoryToBuckets(commit, bucketBalancesInput, bet, options);
    return settleStartedStory(commit, started, started.balances, bet, options);
  }

  return {
    STORY_KEYS, STORY_LABELS, BET_VALUES, BET_BUCKETS,
    STORIES_PER_CLASS, ACTION_TRACE_VERSION, SUPPRESSION_POLICY_VERSION, SUPPRESSION_STORAGE_KEY, STORY_BET_CONTRACT_VERSION,
    DEFAULT_SUPPRESSION_POLICY: clone(DEFAULT_SUPPRESSION_POLICY), normalizeSuppressionPolicy,
    DEFAULT_TICKET_PREFERENCE_PCT, DEFAULT_TICKET_BASIS,
    DEFAULT_BOSS_ROWS: clone(DEFAULT_BOSS_ROWS), DEFAULT_MAGIC_ROWS: clone(DEFAULT_MAGIC_ROWS), DEFAULT_HAND_ROWS: clone(DEFAULT_HAND_ROWS),
    normalizeConfig, storyClass, materializeStoryForBet, bucketIndexForBet, emptyBucketBalances,
    sortedCardIds, sameCardIds, storyStepAt, plannedKeepIdsAt, replayContract, executeRuntimeRedraw, resolveRuntimeMagic,
    packStorySummary, unpackStorySummary,
    simulateNaturalStory, poolSignature, presetMatchesOutcomeRules, buildNaturalStoryPoolFromPreset,
    targetScorePoints, solveCandidateProbabilities, drawUniformPresetStoryCommit,
    legalDiceOutcomes, correctBossDiceReward, addPoolCredits, commitStoryToBuckets, settleStartedStory, settleCommittedStory,
    clearPoolCache() { poolCache.clear(); }
  };
});
