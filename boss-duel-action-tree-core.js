"use strict";

(function attachActionTreeCore(root) {
  const NaturalCore = root.BossDuelNaturalStoryCore || (
    typeof module === "object" && module.exports && typeof require === "function"
      ? require("./boss-duel-natural-story-core.js")
      : null
  );
  if (!NaturalCore) throw new Error("新機率工具缺少自然／導演劇本核心");
  const TREE_KEYS = ["win", "push", "lose"];
  const TREE_LABELS = { win: "贏多", push: "贏少", lose: "輸" };
  const SPEND_FACTORS = { win: 0.90, push: 1.00, lose: 1.18 };
  const STORAGE_KEY = "boss-duel:action-tree-carry:config:v1";
  const CHANNEL_NAME = "boss-duel:action-tree-carry:hot-update:v1";
  // 舊版三個統計玩家沿用原本 10,000 基點；新版故事配籤另讀 storyPool.ticketBasis。
  const TICKET_BASIS = 10000;
  const PAYOUT_BUCKETS = [0, 1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 500, 1000];
  const BET_VALUES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 800, 1000, 1200, 1500, 1800, 2000];
  const STORY_BET_CONTRACT_VERSION = NaturalCore.STORY_BET_CONTRACT_VERSION;
  const PLAYER_BEHAVIORS = ["SMART", "OFFICIAL_FUNDED", "FREE_RIDE", "EXTREME"];
  const NATURAL_HAND_WEIGHTS = { high: 180, pair: 300, twoPair: 220, three: 120, straight: 80, flush: 50, fullHouse: 30, four: 15, straightFlush: 5 };

  const DEFAULT_STARS = [
    { star: 1, baseSpendX: 1.9, bossTickets: 50, preferredLoseBps: 1369, conditionalRtpPct: { win: 122, push: 96, lose: 72 } },
    { star: 2, baseSpendX: 4.4, bossTickets: 75, preferredLoseBps: 1450, conditionalRtpPct: { win: 124, push: 96, lose: 69 } },
    { star: 3, baseSpendX: 6.9, bossTickets: 125, preferredLoseBps: 1600, conditionalRtpPct: { win: 126, push: 96, lose: 66 } },
    { star: 4, baseSpendX: 9.6, bossTickets: 200, preferredLoseBps: 1750, conditionalRtpPct: { win: 128, push: 96, lose: 63 } },
    { star: 5, baseSpendX: 12.2, bossTickets: 175, preferredLoseBps: 1900, conditionalRtpPct: { win: 130, push: 96, lose: 60 } },
    { star: 6, baseSpendX: 14.9, bossTickets: 150, preferredLoseBps: 2050, conditionalRtpPct: { win: 132, push: 96, lose: 57 } },
    { star: 7, baseSpendX: 18.2, bossTickets: 125, preferredLoseBps: 2200, conditionalRtpPct: { win: 134, push: 96, lose: 54 } },
    { star: 8, baseSpendX: 21.8, bossTickets: 100, preferredLoseBps: 2350, conditionalRtpPct: { win: 136, push: 96, lose: 51 } }
  ];

  const DEFAULT_BOSS_ROWS = [
    [1, 1, 2, 1, 3, 50, 100, 0, 0, 0], [2, 7, 15, 3, 5, 75, 0, 100, 0, 0],
    [3, 16, 24, 4, 6, 125, 0, 100, 0, 0], [4, 21, 29, 5, 7, 200, 0, 60, 40, 0],
    [5, 27, 36, 6, 8, 175, 0, 60, 40, 0], [6, 34, 43, 7, 9, 150, 0, 60, 40, 0],
    [7, 36, 45, 7, 9, 125, 20, 70, 10, 0], [8, 36, 45, 7, 9, 100, 20, 70, 10, 0]
  ];

  const DEFAULT_MAGIC_ROWS = [
    ["threeBoost", "三條傷害", 75, 50, 1, 3, "three", 1], ["fourBoost", "四條傷害", 75, 75, 1, 3, "four", 1],
    ["straightBoost", "順子傷害", 100, 125, 1, 3, "straight", 1], ["flushBoost", "同花傷害", 150, 175, 1, 3, "flush", 1],
    ["fullHouseBoost", "葫蘆傷害", 150, 175, 1, 3, "fullHouse", 1], ["joker", "Joker", 75, 50, 1, 1, "joker", 1],
    ["crit", "暴擊", 100, 100, 0, 5, "crit", 1], ["flatDamage", "固傷", 150, 175, 3, 6, "flat", 1],
    ["coin", "金幣", 100, 25, 3, 6, "coin", 1], ["freeDraw", "免費換牌", 50, 50, 1, 1, "freeDraw", 1]
  ];

  const DEFAULT_HAND_ROWS = [
    ["high", "高牌", 0, 0, 0], ["pair", "對子", 1, 0, 1], ["twoPair", "兩對", 2, 0, 2], ["three", "三條", 3, 0, 3],
    ["straight", "順子", 4, 0, 4], ["flush", "同花", 5, 0, 5], ["fullHouse", "葫蘆", 6, 0, 8],
    ["four", "四條", 7, 0, 15], ["straightFlush", "同花順", 8, 0, 30]
  ];

  const DEFAULT_CONFIG = {
    revision: 1,
    modelId: "natural-story-v4-full-class-ticket",
    targetCoreRtpPct: 96,
    tolerancePp: 0.01,
    ticketBasis: TICKET_BASIS,
    ticketMode: "DYNAMIC",
    minPushBps: 0,
    treeSpendFactors: { win: 0.90, push: 1.00, lose: 1.18 },
    seed: 20260820,
    seedMode: "FIXED",
    stars: DEFAULT_STARS,
    carry: {
      enabled: true,
      deviationBasis: "BASELINE_SPEND_DELTA",
      baselineRecognitionMode: "FULL_STORY_COMMIT",
      correctionBothWays: true,
      eligibleTermination: { explicitAbandon: true, bossReroll: true, betSwitch: true, roundExhausted: true },
      disconnectMode: "RESUME",
      deviationBandPctOfPlannedSpend: 0,
      maxDeductionPctOfGross: 50,
      maxDeductionX: 1000000,
      minGuaranteedNetPctOfGross: 50,
      maxCreditPctOfGross: 50,
      maxCreditX: 1000000,
      debtExpiryBosses: 0,
      rewardCorrectionPct: 50,
      rewardFloorPct: 10,
      rewardCeilingMultiple: 1000
    },
    storyPool: {
      seed: 20260824,
      storiesPerClass: 10000, storiesPerStar: 30000, directedStoriesPerCell: 0, directedMixPct: 0,
      directedSearchMultiplier: 1, recentArchetypeCooldown: 3,
      winMinReturnX: 3, pushMinReturnX: 1, smartMaxDraws: 9,
      candidateDrawMode: "FULL_CLASS_UNIFORM",
      ticketPreferencePct: { win: 1, push: 1, lose: 1 },
      ticketBasis: 1000000, ticketSearchAttempts: 1, ticketCandidateTournamentSize: 1, ticketEarlyExitDeviationPp: 0.05,
      dailyMinStoriesPerClass: 10000,
      maxGenerationAttemptsPerStar: 100000000, maxCandidateAttempts: 10000
    },
    naturality: { floorPct: 70, massCoveragePct: null, strataCoveragePct: null, essRatioPct: null },
    simulation: {
      playerCount: 100, bossesPerPlayer: 500, playerRoundLimit: 500, earlyTerminationPct: 0, fixedBet: 1, roundSlice: 10,
      betMode: "FIXED", playerBehavior: "SMART", cashoutPlayerCount: 1000,
      cashoutStartX: 200, cashoutTargetX: 300, decimalPlaces: 2,
      rtpTolerancePp: 0.50, poolTailTolerancePp: 0.05,
      volatilityScale: 1.15, highStarVolatilityStep: 0.045, payoutCapX: 1000
    },
    mechanics: {
      actionTreeEnabled: true, storyCarryEnabled: true, magicEnabled: true, jokerEnabled: true,
      freeDrawEnabled: true, coinEnabled: true, critEnabled: true, flatEnabled: true,
      pokerBoostEnabled: true, chainEnabled: false, bossRerollEnabled: true,
      paidDrawEnabled: true, tieRedealEnabled: true, strictNaturalGate: true
    },
    versions: { policy: "full-class-uniform-score-ticket-v2", settlement: "target-rtp-personal-pool-v1", bossTable: "dice-first-0806", storyPool: "natural-240000-boss-plan-v10-score-ticket" },
    ruleSettings: {
      refreshCostX: 1, deckStopCount: 10,
      playerBadHighRerollPct: 50, bossBadHighRerollPct: 25, initialRerollLimit: 50,
      magicCardsPerRound: 2
    },
    bossRows: DEFAULT_BOSS_ROWS,
    magicRows: DEFAULT_MAGIC_ROWS,
    handRows: DEFAULT_HAND_ROWS,
    drawFeesX: [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function finite(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function integer(value, fallback, min, max) { return Math.round(clamp(finite(value, fallback), min, max)); }
  function minOf(values, fallback = 0) {
    let result = Infinity;
    for (const value of values) if (Number.isFinite(Number(value))) result = Math.min(result, Number(value));
    return result === Infinity ? fallback : result;
  }
  function maxOf(values, fallback = 0) {
    let result = -Infinity;
    for (const value of values) if (Number.isFinite(Number(value))) result = Math.max(result, Number(value));
    return result === -Infinity ? fallback : result;
  }

  function merge(defaultValue, value) {
    if (Array.isArray(defaultValue)) return Array.isArray(value) ? value.map((item) => clone(item)) : clone(defaultValue);
    if (!defaultValue || typeof defaultValue !== "object") return value === undefined ? defaultValue : value;
    const result = {};
    Object.keys(defaultValue).forEach((key) => { result[key] = merge(defaultValue[key], value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined); });
    return result;
  }

  function sanitizeConfig(input) {
    const config = merge(DEFAULT_CONFIG, input || {});
    config.revision = integer(config.revision, 1, 1, 999999);
    config.targetCoreRtpPct = clamp(finite(config.targetCoreRtpPct, 96), 80, 110);
    config.tolerancePp = clamp(finite(config.tolerancePp, 0.01), 0, 2);
    config.minPushBps = 0;
    config.ticketMode = "DYNAMIC";
    config.seed = integer(config.seed, 20260820, 0, 4294967295);
    config.seedMode = config.seedMode === "RANDOM" ? "RANDOM" : "FIXED";
    config.treeSpendFactors = TREE_KEYS.reduce((rows, key) => {
      rows[key] = clamp(finite(config.treeSpendFactors?.[key], SPEND_FACTORS[key]), 0.05, 10);
      return rows;
    }, {});
    config.stars = DEFAULT_STARS.map((fallback, index) => {
      const source = Array.isArray(input?.stars) ? (input.stars.find((row) => Number(row?.star) === fallback.star) || input.stars[index] || {}) : {};
      const bossTicketFromTable = Array.isArray(input?.bossRows?.[index]) ? input.bossRows[index][5] : undefined;
      return {
        star: fallback.star,
        baseSpendX: clamp(finite(source.baseSpendX, fallback.baseSpendX), 0.01, 100000),
        bossTickets: integer(bossTicketFromTable, source.bossTickets ?? fallback.bossTickets, 0, 1000000),
        preferredLoseBps: integer(source.preferredLoseBps, fallback.preferredLoseBps, 800, 5000),
        conditionalRtpPct: TREE_KEYS.reduce((rows, key) => {
          rows[key] = clamp(finite(source.conditionalRtpPct?.[key], fallback.conditionalRtpPct[key]), 0, 500);
          return rows;
        }, {}),
        ticketsBps: source.ticketsBps ? TREE_KEYS.reduce((rows, key) => { rows[key] = integer(source.ticketsBps[key], 0, 0, TICKET_BASIS); return rows; }, {}) : null
      };
    });
    const c = config.carry;
    c.enabled = Boolean(c.enabled && config.mechanics.storyCarryEnabled);
    config.mechanics.storyCarryEnabled = c.enabled;
    c.deviationBandPctOfPlannedSpend = clamp(finite(c.deviationBandPctOfPlannedSpend, 0), 0, 100);
    c.maxDeductionPctOfGross = clamp(finite(c.maxDeductionPctOfGross, 25), 0, 100);
    c.maxDeductionX = clamp(finite(c.maxDeductionX, 100), 0, 1000000);
    c.minGuaranteedNetPctOfGross = clamp(finite(c.minGuaranteedNetPctOfGross, 50), 0, 100);
    c.maxCreditPctOfGross = clamp(finite(c.maxCreditPctOfGross, 25), 0, 1000);
    c.maxCreditX = clamp(finite(c.maxCreditX, 100), 0, 1000000);
    c.debtExpiryBosses = integer(c.debtExpiryBosses, 0, 0, 1000000);
    c.rewardCorrectionPct = clamp(finite(c.rewardCorrectionPct, 50), 0, 100);
    c.rewardFloorPct = clamp(finite(c.rewardFloorPct, 10), 0, 100);
    c.rewardCeilingMultiple = clamp(finite(c.rewardCeilingMultiple, 1000), 1, 1000);
    const story = config.storyPool;
    story.seed = integer(story.seed, 20260824, 0, 4294967295) >>> 0;
    story.storiesPerClass = integer(story.storiesPerClass ?? story.dailyMinStoriesPerClass, 10000, 1, 10000000);
    story.storiesPerStar = story.storiesPerClass * TREE_KEYS.length;
    delete story.storiesPerCell;
    story.directedStoriesPerCell = integer(story.directedStoriesPerCell, 0, 0, 10000);
    story.directedMixPct = clamp(finite(story.directedMixPct, 0), 0, 100);
    story.directedSearchMultiplier = clamp(finite(story.directedSearchMultiplier, 1), 1, 20);
    story.recentArchetypeCooldown = integer(story.recentArchetypeCooldown, 3, 0, 100);
    story.winMinReturnX = clamp(finite(story.winMinReturnX, 3), 0.001, 1000000);
    story.pushMinReturnX = clamp(finite(story.pushMinReturnX, 1), 0, 999999.999);
    if (story.winMinReturnX <= story.pushMinReturnX) story.winMinReturnX = Math.min(1000000, story.pushMinReturnX + 0.001);
    story.candidateDrawMode = "FULL_CLASS_UNIFORM";
    const preferredTicketRaw = TREE_KEYS.map((key) => Math.max(0, finite(story.ticketPreferencePct?.[key], DEFAULT_CONFIG.storyPool.ticketPreferencePct[key])));
    const preferredTicketTotal = preferredTicketRaw.reduce((sum, value) => sum + value, 0) || 100;
    story.ticketPreferencePct = Object.fromEntries(TREE_KEYS.map((key, index) => [key, Math.round(preferredTicketRaw[index] / preferredTicketTotal * 1000000000) / 10000000]));
    story.ticketBasis = integer(story.ticketBasis, 1000000, 100, 1000000);
    story.ticketSearchAttempts = 1;
    story.ticketCandidateTournamentSize = 1;
    story.ticketEarlyExitDeviationPp = clamp(finite(story.ticketEarlyExitDeviationPp, 0.05), 0, 100);
    story.dailyMinStoriesPerClass = integer(story.dailyMinStoriesPerClass, 10000, 1, 10000000);
    story.smartMaxDraws = integer(story.smartMaxDraws, 9, 0, 100);
    story.maxGenerationAttemptsPerStar = integer(story.maxGenerationAttemptsPerStar, 100000000, 100, 100000000);
    story.maxCandidateAttempts = integer(story.maxCandidateAttempts, 10000, 1, 1000000);
    const n = config.naturality;
    n.floorPct = clamp(finite(n.floorPct, 70), 50, 100);
    ["massCoveragePct", "strataCoveragePct", "essRatioPct"].forEach((key) => {
      n[key] = n[key] === null || n[key] === "" || n[key] === undefined ? null : clamp(finite(n[key], 0), 0, 100);
    });
    const s = config.simulation;
    s.playerCount = integer(s.playerCount, 100, 1, 5000);
    s.bossesPerPlayer = integer(s.bossesPerPlayer, s.playerRoundLimit || 500, 1, 8192);
    s.playerRoundLimit = integer(s.playerRoundLimit, s.bossesPerPlayer, 1, 1000000);
    s.earlyTerminationPct = clamp(finite(s.earlyTerminationPct, 0), 0, 100);
    s.fixedBet = clamp(finite(s.fixedBet, 1), 0.01, 1000000);
    s.roundSlice = integer(s.roundSlice, 10, 1, 8192);
    s.cashoutPlayerCount = integer(s.cashoutPlayerCount, 1000, 1, 5000);
    s.cashoutStartX = clamp(finite(s.cashoutStartX, 200), 0.01, 1000000000);
    s.cashoutTargetX = clamp(finite(s.cashoutTargetX, 300), 0.01, 1000000000);
    s.decimalPlaces = integer(s.decimalPlaces, 2, 0, 8);
    s.rtpTolerancePp = clamp(finite(s.rtpTolerancePp, 0.50), 0.001, 20);
    s.poolTailTolerancePp = clamp(finite(s.poolTailTolerancePp, 0.05), 0.001, 20);
    s.volatilityScale = clamp(finite(s.volatilityScale, 1.15), 0.25, 3);
    s.highStarVolatilityStep = clamp(finite(s.highStarVolatilityStep, 0.045), 0, 0.25);
    s.payoutCapX = clamp(finite(s.payoutCapX, 1000), 1, 1000000);
    s.playerBehavior = PLAYER_BEHAVIORS.includes(String(s.playerBehavior)) ? String(s.playerBehavior) : "SMART";
    config.ruleSettings.refreshCostX = clamp(finite(config.ruleSettings.refreshCostX, 1), 0, 1000000);
    config.ruleSettings.deckStopCount = integer(config.ruleSettings.deckStopCount, 10, 1, 54);
    config.ruleSettings.playerBadHighRerollPct = clamp(finite(config.ruleSettings.playerBadHighRerollPct, 50), 0, 100);
    config.ruleSettings.bossBadHighRerollPct = clamp(finite(config.ruleSettings.bossBadHighRerollPct, 25), 0, 100);
    config.ruleSettings.initialRerollLimit = integer(config.ruleSettings.initialRerollLimit, 50, 0, 1000000);
    config.ruleSettings.magicCardsPerRound = integer(config.ruleSettings.magicCardsPerRound, 2, 0, 10);
    config.magicRows = config.magicRows.map((row, index) => {
      const fallback = DEFAULT_MAGIC_ROWS[index] || row;
      const normalized = Array.isArray(row) ? row.slice(0, 8) : fallback.slice();
      while (normalized.length < 8) normalized.push(fallback?.[normalized.length] ?? (normalized.length === 7 ? 1 : 0));
      normalized[2] = Math.max(0, finite(normalized[2], fallback?.[2] || 0));
      normalized[3] = Math.max(0, finite(normalized[3], fallback?.[3] || 0));
      normalized[4] = finite(normalized[4], fallback?.[4] || 0);
      normalized[5] = finite(normalized[5], fallback?.[5] || 0);
      normalized[7] = normalized[7] === false || Number(normalized[7]) === 0 ? 0 : 1;
      return normalized;
    });
    config.handRows = config.handRows.map((row, index) => {
      const fallback = DEFAULT_HAND_ROWS[index] || row;
      const normalized = Array.isArray(row) ? row.slice(0, 5) : fallback.slice();
      if (normalized.length === 4) normalized.splice(3, 0, 0);
      while (normalized.length < 5) normalized.push(fallback?.[normalized.length] ?? 0);
      normalized[2] = integer(normalized[2], fallback?.[2] || index, 0, 100);
      normalized[3] = Math.max(0, finite(normalized[3], fallback?.[3] || 0));
      normalized[4] = Math.max(0, finite(normalized[4], fallback?.[4] || 0));
      return normalized;
    });
    const straightFlush = config.handRows.find((row) => row[0] === "straightFlush");
    if (straightFlush) straightFlush[4] = 30;
    config.bossRows = config.bossRows.map((row, index) => {
      const fallback = DEFAULT_BOSS_ROWS[index];
      const normalized = Array.isArray(row) ? row.slice(0, 10) : fallback.slice();
      while (normalized.length < 10) normalized.push(fallback[normalized.length]);
      normalized[0] = index + 1;
      for (let column = 1; column < 10; column += 1) normalized[column] = Math.max(0, finite(normalized[column], fallback[column]));
      normalized[5] = config.stars[index].bossTickets;
      return normalized;
    });
    return config;
  }

  function mixedRtpPct(star, ticketsBps, spendFactors = SPEND_FACTORS) {
    const total = TREE_KEYS.reduce((sum, key) => sum + finite(ticketsBps?.[key], 0), 0);
    if (total <= 0) return NaN;
    let spend = 0;
    let payout = 0;
    TREE_KEYS.forEach((key) => {
      const probability = finite(ticketsBps[key], 0) / total;
      const cost = star.baseSpendX * finite(spendFactors[key], SPEND_FACTORS[key]);
      spend += probability * cost;
      payout += probability * cost * star.conditionalRtpPct[key] / 100;
    });
    return payout / spend * 100;
  }

  function solveStarTickets(star, targetRtpPct, minPushBps = 4000, tolerancePp = 0.01, spendFactors = SPEND_FACTORS) {
    const target = targetRtpPct / 100;
    const rtp = TREE_KEYS.reduce((rows, key) => { rows[key] = star.conditionalRtpPct[key] / 100; return rows; }, {});
    let best = null;
    for (let lose = 800; lose <= 5000; lose += 1) {
      const loseShare = lose / TICKET_BASIS;
      const pushDelta = rtp.push - target;
      const winCoefficient = finite(spendFactors.win, SPEND_FACTORS.win) * (rtp.win - target) - pushDelta;
      const loseCoefficient = finite(spendFactors.lose, SPEND_FACTORS.lose) * (rtp.lose - target) - pushDelta;
      if (Math.abs(winCoefficient) < 1e-12) continue;
      const win = Math.round(-(pushDelta + loseShare * loseCoefficient) / winCoefficient * TICKET_BASIS);
      const push = TICKET_BASIS - win - lose;
      if (win < 800 || win > 5000 || push < minPushBps || push > 8500) continue;
      const ticketsBps = { win, push, lose };
      const rtpPct = mixedRtpPct(star, ticketsBps, spendFactors);
      const errorPp = Math.abs(rtpPct - targetRtpPct);
      const preferenceDistance = Math.abs(lose - star.preferredLoseBps);
      const withinTolerance = errorPp <= tolerancePp;
      const score = withinTolerance
        ? preferenceDistance * 1000000 + errorPp
        : 1000000000000 + errorPp * 1000000 + preferenceDistance;
      if (!best || score < best.score) best = { ticketsBps, rtpPct, errorPp, score };
    }
    return best;
  }

  function solveAllStars(configInput) {
    const config = sanitizeConfig(configInput);
    const rows = config.stars.map((star) => ({ star, solution: null }));
    return {
      config,
      rows,
      valid: true,
      mode: "DYNAMIC_THREE_CANDIDATES",
      overallRtpPct: config.targetCoreRtpPct,
      maxErrorPp: 0
    };
  }

  function naturalityStatus(naturality) {
    const floor = finite(naturality?.floorPct, 70);
    const keys = ["massCoveragePct", "strataCoveragePct", "essRatioPct"];
    const pending = keys.some((key) => naturality?.[key] === null || naturality?.[key] === undefined || naturality?.[key] === "");
    const pass = !pending && keys.every((key) => finite(naturality[key], -1) >= floor);
    return { floorPct: floor, pending, pass, minimumPct: pending ? null : Math.min(...keys.map((key) => finite(naturality[key], 0))) };
  }

  function storyDeviation(input, carryConfigInput) {
    const carry = { ...DEFAULT_CONFIG.carry, ...(carryConfigInput || {}) };
    const actualSpendX = Math.max(0, finite(input.actualSpendX, 0));
    const actualPayoutX = Math.max(0, finite(input.actualPayoutX, 0));
    const conditionalRtp = Math.max(0, finite(input.conditionalRtpPct, 96)) / 100;
    let plannedSpendX = Math.max(0, finite(input.plannedSpendX, actualSpendX));
    let plannedPayoutX = Math.max(0, finite(input.plannedPayoutX, plannedSpendX * conditionalRtp));
    if (carry.deviationBasis === "ACTUAL_CASH_TARGET") plannedPayoutX = actualSpendX * conditionalRtp;
    const plannedNetX = plannedPayoutX - plannedSpendX;
    const actualNetX = actualPayoutX - actualSpendX;
    const rawSpendDeltaX = actualSpendX - plannedSpendX;
    const bandX = plannedSpendX * clamp(finite(carry.deviationBandPctOfPlannedSpend, 0), 0, 100) / 100;
    const recognizedSpendDeltaX = Math.sign(rawSpendDeltaX) * Math.max(0, Math.abs(rawSpendDeltaX) - bandX);
    const correctionX = carry.enabled ? recognizedSpendDeltaX * conditionalRtp : 0;
    return {
      plannedSpendX, plannedPayoutX, plannedNetX, actualSpendX, actualPayoutX, actualNetX,
      rawSpendDeltaX, recognizedSpendDeltaX, bandX, correctionX,
      futureCreditAddedX: Math.max(0, correctionX),
      recoveryDebtAddedX: Math.max(0, -correctionX)
    };
  }

  function settleCarry(grossRewardX, signedCarryBalanceX, carryConfigInput) {
    const carry = { ...DEFAULT_CONFIG.carry, ...(carryConfigInput || {}) };
    const gross = Math.max(0, finite(grossRewardX, 0));
    const before = finite(signedCarryBalanceX, 0);
    if (!carry.enabled) return { grossRewardX: gross, carryBeforeX: before, deductionX: 0, bonusX: 0, netRewardX: gross, carryAfterX: before };
    const minNet = gross * clamp(finite(carry.minGuaranteedNetPctOfGross, 50), 0, 100) / 100;
    const deductible = Math.max(0, gross - minNet);
    const bonus = before > 0 && carry.correctionBothWays ? Math.min(before, gross * carry.maxCreditPctOfGross / 100, carry.maxCreditX) : 0;
    const deduction = before < 0 ? Math.min(-before, gross * carry.maxDeductionPctOfGross / 100, carry.maxDeductionX, deductible) : 0;
    const net = gross - deduction + bonus;
    return { grossRewardX: gross, carryBeforeX: before, deductionX: deduction, bonusX: bonus, netRewardX: net, carryAfterX: before - bonus + deduction };
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function weightedPick(rows, weight, random) {
    const total = rows.reduce((sum, row) => sum + Math.max(0, weight(row)), 0);
    if (total <= 0) return rows[0];
    let cursor = random() * total;
    for (const row of rows) { cursor -= Math.max(0, weight(row)); if (cursor < 0) return row; }
    return rows[rows.length - 1];
  }

  function normal(random) {
    const a = Math.max(1e-9, random());
    const b = random();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }

  function normalCdf(value) {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * x);
    const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    const erf = sign * (1 - polynomial * Math.exp(-x * x));
    return 0.5 * (1 + erf);
  }

  function cappedLognormalMean(amplitude, cap, sigma) {
    const a = Math.max(0, finite(amplitude, 0));
    const c = Math.max(0, finite(cap, 0));
    if (a <= 0 || c <= 0) return 0;
    if (sigma <= 1e-9) return Math.min(a, c);
    const logRatio = Math.log(c / a);
    const d1 = (logRatio - sigma * sigma / 2) / sigma;
    const d2 = (logRatio + sigma * sigma / 2) / sigma;
    return a * normalCdf(d1) + c * (1 - normalCdf(d2));
  }

  function cappedLognormalAmplitude(targetMean, cap, sigma) {
    const target = Math.max(0, finite(targetMean, 0));
    const c = Math.max(0, finite(cap, 0));
    if (target <= 0 || c <= 0) return 0;
    if (target >= c * 0.999999) return c * 1000000;
    let low = 0;
    let high = Math.max(target, 1e-9);
    while (cappedLognormalMean(high, c, sigma) < target && high < c * 1000000) high *= 2;
    for (let index = 0; index < 24; index += 1) {
      const middle = (low + high) / 2;
      if (cappedLognormalMean(middle, c, sigma) < target) low = middle;
      else high = middle;
    }
    return high;
  }

  function percentile(values, ratio) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * ratio;
    const low = Math.floor(index);
    const fraction = index - low;
    return sorted[low] + (sorted[low + 1] === undefined ? 0 : fraction * (sorted[low + 1] - sorted[low]));
  }

  function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

  function standardDeviation(values) {
    if (!values.length) return 0;
    const mean = average(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  }

  function upperTailMean(values, ratio = 0.99) {
    if (!values.length) return 0;
    const threshold = percentile(values, ratio);
    return average(values.filter((value) => value >= threshold));
  }

  function payoutBucket(value) {
    const amount = Math.max(0, finite(value, 0));
    let bucket = PAYOUT_BUCKETS[0];
    for (const threshold of PAYOUT_BUCKETS) {
      if (amount < threshold) break;
      bucket = threshold;
    }
    return bucket;
  }

  function simulationBet(config, playerIndex, bossIndex, random) {
    const mode = config.simulation.betMode;
    if (mode === "RANDOM_B1") return [1, 2, 5, 10][Math.floor(random() * 4)];
    if (mode === "RANDOM_ALL") return BET_VALUES[Math.floor(random() * BET_VALUES.length)];
    if (mode === "SCHEDULED") return BET_VALUES[(playerIndex + bossIndex) % BET_VALUES.length];
    return config.simulation.fixedBet;
  }

  function materializeStoryCredits(story, betInput) {
    const result = NaturalCore.materializeStoryForBet(story, betInput);
    if (result.version !== STORY_BET_CONTRACT_VERSION) throw new Error("劇本 Bet 換算版本不一致");
    return result;
  }

  function drawFullClassStoryCommit(pool, config, star, random) {
    const cells = pool?.naturalCells?.[star] || pool?.cells?.[star];
    if (!cells || TREE_KEYS.some((key) => !(cells[key] || []).length)) throw new Error(`${star} 星三分類故事池不完整`);
    const maxAttempts = config.storyPool.maxCandidateAttempts;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const candidates = TREE_KEYS.map((key) => {
        const rows = cells[key];
        return rows[Math.floor(random() * rows.length)];
      });
      const solved = NaturalCore.solveCandidateProbabilities(candidates, config.targetCoreRtpPct, {
        ticketPreferencePct: { win: 1, push: 1, lose: 1 },
        ticketBasis: config.storyPool.ticketBasis
      });
      if (!solved || solved.ticketCounts.some((ticket) => ticket <= 0)) continue;
      const indexes = candidates.map((_story, index) => index);
      const selectedIndex = weightedPick(indexes, (index) => solved.ticketCounts[index], random);
      const selectedStory = candidates[selectedIndex];
      return {
        star, attempt, candidateSetsEvaluated: attempt, candidates,
        weights: solved.probabilities, slotWeights: solved.slotProbabilities,
        ticketCounts: solved.ticketCounts, ticketBasis: solved.ticketBasis,
        scorePoints: solved.scorePoints, scoreBalancePoints: solved.scoreBalancePoints,
        weightedRtpPct: solved.rtpPct, rtpErrorPp: solved.errorPp,
        preferredWeights: null, mixDeviationPpMax: null,
        candidateSources: candidates.map(() => "NATURAL"),
        selectedClass: selectedStory.classKey, selectedStory,
        committedNetX: selectedStory.netX,
        committedSpendX: selectedStory.spendX,
        committedPayoutX: selectedStory.payoutX,
        selectionPolicy: "FULL_CLASS_UNIFORM_THEN_SCORE_TICKETS"
      };
    }
    throw new Error(`${star} 星在 ${maxAttempts} 次完整分類等機率抽取內找不到可配籤的三候選`);
  }

  function simulateFullClassNaturalPopulation(config, options = {}) {
    const pool = options.pool;
    if (!pool?.naturalCells && !pool?.cells) throw new Error("缺少已實跑的三分類故事池");
    const players = [];
    const records = [];
    const starStats = Array.from({ length: 8 }, (_, index) => ({ star: index + 1, count: 0, spend: 0, payout: 0, kills: 0, corrections: 0 }));
    const classStats = Object.fromEntries(TREE_KEYS.map((key) => [key, { key, label: TREE_LABELS[key], count: 0, spend: 0, payout: 0, kills: 0, corrections: 0 }]));
    const totals = { bosses: 0, spend: 0, payout: 0, kills: 0, corrections: 0, correctionCredits: 0, ticketErrorPpMax: 0 };
    for (let playerIndex = 0; playerIndex < config.simulation.playerCount; playerIndex += 1) {
      const random = mulberry32((config.seed ^ Math.imul(playerIndex + 1, 0x9E3779B1)) >>> 0);
      let previousStar = 0;
      let bucketBalances = [0, 0, 0];
      let spend = 0, payout = 0, kills = 0, rounds = 0, bosses = 0;
      for (let bossIndex = 0; bossIndex < config.simulation.bossesPerPlayer && rounds < config.simulation.playerRoundLimit; bossIndex += 1) {
        const enabledRows = config.bossRows.filter((row) => finite(row[5], 0) > 0);
        const starRows = enabledRows.length > 1 ? enabledRows.filter((row) => Number(row[0]) !== previousStar) : enabledRows;
        const bossRow = weightedPick(starRows.length ? starRows : enabledRows, (row) => finite(row[5], 0), random);
        const star = integer(bossRow?.[0], 1, 1, 8);
        previousStar = star;
        const bet = simulationBet(config, playerIndex, bossIndex, random);
        const commit = drawFullClassStoryCommit(pool, config, star, random);
        const story = commit.selectedStory;
        const storyCredits = materializeStoryCredits(story, bet);
        const actualSpendCredits = storyCredits.spendCredits;
        const organicPayoutCredits = storyCredits.payoutCredits;
        const settlement = NaturalCore.settleCommittedStory(commit, bucketBalances, bet, {
          actualSpendCredits,
          organicPayoutCredits,
          targetRtpPct: config.targetCoreRtpPct,
          actualKilled: story.killed,
          actualBossRewardX: finite(story.originalBossRewardX, 0),
          actualDice: story.originalDice,
          rewardFloorPct: config.carry.rewardFloorPct,
          rewardCeilingMultiple: config.carry.rewardCeilingMultiple,
          rng: random
        });
        bucketBalances = settlement.balances;
        const actualPayoutCredits = settlement.actualPayoutCredits;
        spend += actualSpendCredits;
        payout += actualPayoutCredits;
        kills += story.killed ? 1 : 0;
        rounds += story.rounds;
        bosses += 1;
        totals.bosses += 1;
        totals.spend += actualSpendCredits;
        totals.payout += actualPayoutCredits;
        totals.kills += story.killed ? 1 : 0;
        totals.corrections += settlement.correction.applied ? 1 : 0;
        totals.correctionCredits += settlement.correction.deltaCredits;
        totals.ticketErrorPpMax = Math.max(totals.ticketErrorPpMax, commit.rtpErrorPp);
        const starRow = starStats[star - 1];
        starRow.count += 1; starRow.spend += actualSpendCredits; starRow.payout += actualPayoutCredits; starRow.kills += story.killed ? 1 : 0; starRow.corrections += settlement.correction.applied ? 1 : 0;
        const classRow = classStats[commit.selectedClass];
        classRow.count += 1; classRow.spend += actualSpendCredits; classRow.payout += actualPayoutCredits; classRow.kills += story.killed ? 1 : 0; classRow.corrections += settlement.correction.applied ? 1 : 0;
        records.push({ player: playerIndex + 1, bossIndex: bossIndex + 1, star, bet, classKey: commit.selectedClass, commit, settlement, story });
      }
      players.push({ player: playerIndex + 1, bosses, rounds, spend, payout, net: payout - spend, rtpPct: payout / Math.max(spend, 1e-12) * 100, kills, bucketBalances });
    }
    totals.rtpPct = totals.payout / Math.max(totals.spend, 1e-12) * 100;
    totals.killRatePct = totals.kills / Math.max(totals.bosses, 1) * 100;
    totals.correctionRatePct = totals.corrections / Math.max(totals.bosses, 1) * 100;
    totals.endingBucketBalances = NaturalCore.BET_BUCKETS.map((_bucket, index) => players.reduce((sum, player) => sum + player.bucketBalances[index], 0));
    return { version: "full-class-uniform-story-v1", config, pool, totals, players, records, starStats, classStats: TREE_KEYS.map((key) => classStats[key]) };
  }

  function drawCost(draws, config, bet) {
    if (!config.mechanics.paidDrawEnabled || draws <= 0) return 0;
    let total = 0;
    for (let index = 0; index < draws; index += 1) total += finite(config.drawFeesX[Math.min(index, config.drawFeesX.length - 1)], 0) * bet;
    return total;
  }

  function pickHand(config, treeKey, star, random) {
    const candidates = config.handRows.map((row, index) => ({ row, index, key: String(row[0]), rank: finite(row[2], index) }));
    return weightedPick(candidates, (item) => {
      const natural = NATURAL_HAND_WEIGHTS[item.key] || 1;
      const treeTilt = treeKey === "win" ? Math.pow(1.18, item.rank) : treeKey === "lose" ? Math.pow(0.84, item.rank) : 1;
      const starTilt = Math.pow(1 + (star - 4.5) * 0.006, item.rank);
      return natural * treeTilt * starTilt;
    }, random);
  }

  function pickHandWithNaturalReroll(config, treeKey, star, rerollPct, random) {
    let picked = pickHand(config, treeKey, star, random);
    let rerolls = 0;
    const limit = Math.max(0, config.ruleSettings.initialRerollLimit);
    const probability = clamp(finite(rerollPct, 0), 0, 100) / 100;
    while (picked.key === "high" && rerolls < limit && random() < probability) {
      picked = pickHand(config, treeKey, star, random);
      rerolls += 1;
    }
    return { picked, rerolls };
  }

  function magicValue(item, random) {
    const minimum = finite(item?.row?.[4], 0);
    const maximum = Math.max(minimum, finite(item?.row?.[5], minimum));
    if (Number.isInteger(minimum) && Number.isInteger(maximum)) return Math.floor(minimum + random() * (maximum - minimum + 1));
    return minimum + random() * (maximum - minimum);
  }

  function rollDiceSum(count, random) {
    let total = 0;
    for (let index = 0; index < count; index += 1) total += 1 + Math.floor(random() * 6);
    return total;
  }

  function pickMagicCards(config, star, random) {
    if (!config.mechanics.magicEnabled || config.ruleSettings.magicCardsPerRound <= 0) return [];
    const enabledByMechanic = (key) => {
      if (key === "joker") return config.mechanics.jokerEnabled;
      if (key === "freeDraw") return config.mechanics.freeDrawEnabled;
      if (key === "coin") return config.mechanics.coinEnabled;
      if (key === "crit") return config.mechanics.critEnabled;
      if (key === "flatDamage") return config.mechanics.flatEnabled;
      if (/Boost$/.test(key)) return config.mechanics.pokerBoostEnabled;
      return true;
    };
    const pool = config.magicRows.filter((row) => row[7] !== 0 && enabledByMechanic(String(row[0]))).map((row) => ({ row, key: String(row[0]) }));
    const selected = [];
    const count = Math.min(config.ruleSettings.magicCardsPerRound, pool.length);
    for (let index = 0; index < count; index += 1) {
      const remaining = pool.filter((item) => !selected.some((picked) => picked.key === item.key));
      if (!remaining.length) break;
      selected.push(weightedPick(remaining, (item) => finite(item.row[star >= 7 ? 3 : 2], 0), random));
    }
    return selected;
  }

  function makeBucketStats() {
    return PAYOUT_BUCKETS.reduce((rows, bucket) => { rows[bucket] = { bucket, count: 0, spend: 0, gross: 0, net: 0 }; return rows; }, {});
  }

  function addBucket(stats, multiple, spend, gross, net) {
    const row = stats[payoutBucket(multiple)];
    row.count += 1; row.spend += spend; row.gross += gross; row.net += net;
  }

  function behaviorProfile(key) {
    const profiles = {
      OFFICIAL_FUNDED: { abort: 1, draws: 1, kill: 0, volatility: 1 },
      FREE_RIDE: { abort: 1.18, draws: 0.62, kill: -0.05, volatility: 0.92 },
      EXTREME: { abort: 0.92, draws: 1.55, kill: 0.02, volatility: 1.18 },
      KILL_FOCUS: { abort: 0.66, draws: 1.28, kill: 0.08, volatility: 1.08 },
      SAVE_DRAWS: { abort: 1.08, draws: 0.68, kill: -0.03, volatility: 0.95 },
      HEAVY_DRAWS: { abort: 0.84, draws: 1.48, kill: 0.04, volatility: 1.12 }
    };
    return profiles[key] || profiles.OFFICIAL_FUNDED;
  }

  function simulate(configInput, options = {}) {
    const solved = solveAllStars(configInput);
    const config = solved.config;
    if (!solved.valid) throw new Error("目前 target 與三樹限制無法解出八星配籤。");
    const random = mulberry32(config.seed);
    const solvedRows = solved.rows.map((row) => {
      const solution = row.solution || solveStarTickets(
        row.star,
        solved.config.targetCoreRtpPct,
        solved.config.minPushBps,
        solved.config.tolerancePp,
        solved.config.treeSpendFactors
      );
      if (!solution) throw new Error(`${row.star.star}★ 無法解出原版統計模型配籤。`);
      return { ...row.star, ticketsBps: solution.ticketsBps };
    });
    const startedAt = Date.now();
    const totals = {
      baselineSpend: 0, spend: 0, entrySpend: 0, drawSpend: 0, refreshSpend: 0,
      gross: 0, net: 0, deviation: 0, deduction: 0, bonus: 0,
      kills: 0, aborts: 0, corrections: 0, bosses: 0, rounds: 0, draws: 0,
      compares: 0, folds: 0, ties: 0, playerWins: 0, playerLosses: 0,
      freeDraws: 0, paidDraws: 0, bossRefreshes: 0, damage: 0,
      playerBadHighRerolls: 0, bossBadHighRerolls: 0, maxStoryGrossX: 0, maxStoryNetX: 0,
      bossGross: 0, handGross: 0, magicGross: 0, chainGross: 0,
      bossRewardXSum: 0, bossRewardCount: 0, jokerDraws: 0
    };
    const players = [];
    const starStats = solvedRows.map((row) => ({
      star: row.star, count: 0, baselineSpend: 0, spend: 0, gross: 0, net: 0,
      kills: 0, aborts: 0, rounds: 0, draws: 0, drawSpendX: 0, refreshes: 0,
      bossGross: 0, bossRewardXSum: 0, bossRewardCount: 0,
      minBossRewardX: Infinity, maxBossRewardX: 0, jokerDraws: 0, straightFlushKills: 0,
      minGrossX: Infinity, maxGrossX: 0, maxNetX: 0
    }));
    const treeStats = TREE_KEYS.reduce((rows, key) => { rows[key] = { key, count: 0, baselineSpend: 0, spend: 0, gross: 0, net: 0, kills: 0, aborts: 0, rounds: 0, draws: 0, profits: [] }; return rows; }, {});
    const cellStats = new Map();
    solvedRows.forEach((star) => TREE_KEYS.forEach((key) => cellStats.set(`${star.star}:${key}`, { star: star.star, key, count: 0, baselineSpend: 0, spend: 0, gross: 0, net: 0, kills: 0, aborts: 0, rounds: 0, draws: 0 })));
    const handStats = config.handRows.map((row, index) => ({ key: String(row[0]), label: String(row[1]), rank: finite(row[2], index), directPayoutX: finite(row[3], 0), baseDamage: finite(row[4], 0), playerStart: 0, playerFinal: 0, bossFinal: 0, playerWins: 0, payout: 0, damage: 0, compareDraws: 0 }));
    const handStatsByKey = Object.fromEntries(handStats.map((row) => [row.key, row]));
    const magicStats = config.magicRows.map((row) => ({ key: String(row[0]), label: String(row[1]), draws: 0, effective: 0, killRounds: 0, grossAttributed: 0 }));
    const magicStatsByKey = Object.fromEntries(magicStats.map((row) => [row.key, row]));
    const chainStats = [0, 1, 2, 3].map((level) => ({ level, count: 0, kills: 0, payoutAttributed: 0 }));
    const killStreakStats = Array.from({ length: 10 }, (_, index) => ({
      level: index + 1, count: 0, payoutAttributed: 0, payoutXSum: 0
    }));
    const roundSlices = Array.from({ length: Math.ceil(config.simulation.bossesPerPlayer / config.simulation.roundSlice) }, (_, index) => ({
      startBoss: index * config.simulation.roundSlice + 1,
      endBoss: Math.min((index + 1) * config.simulation.roundSlice, config.simulation.bossesPerPlayer),
      count: 0, baselineSpend: 0, spend: 0, gross: 0, net: 0, kills: 0, aborts: 0, bonus: 0, deduction: 0, endingCarryTotal: 0
    }));
    const storyBuckets = makeBucketStats();
    const roundBuckets = makeBucketStats();
    const playerBossBuckets = makeBucketStats();
    const terminationStats = { KILLED: 0, BOSS_ESCAPED: 0, USER_EXIT: 0, REROLL: 0, DISCONNECT_EXPIRED: 0, INSUFFICIENT_FUNDS: 0 };
    const earlyBase = config.simulation.earlyTerminationPct / 100;
    const behavior = behaviorProfile(config.simulation.playerBehavior);
    for (let playerIndex = 0; playerIndex < config.simulation.playerCount; playerIndex += 1) {
      let carryBalance = 0;
      let baselineTotal = 0;
      let spendTotal = 0;
      let grossTotal = 0;
      let netTotal = 0;
      let currentWin = 0;
      let currentLoss = 0;
      let currentKillStreak = 0;
      let maxKillStreak = 0;
      let maxWinStreak = 0;
      let maxLossStreak = 0;
      let killsForPlayer = 0;
      let roundsForPlayer = 0;
      let firstKillBoss = 0;
      let maxNoKillStreak = 0;
      let currentNoKillStreak = 0;
      for (let bossIndex = 0; bossIndex < config.simulation.bossesPerPlayer; bossIndex += 1) {
        const bet = simulationBet(config, playerIndex, bossIndex, random);
        const star = weightedPick(solvedRows, (row) => row.bossTickets, random);
        const bossRule = config.bossRows[star.star - 1];
        const treeKey = config.mechanics.actionTreeEnabled ? weightedPick(TREE_KEYS, (key) => star.ticketsBps[key], random) : "push";
        const spendFactor = config.treeSpendFactors[treeKey];
        const baselineSpend = star.baseSpendX * spendFactor * bet * (0.94 + 0.12 * random());
        const abortScale = treeKey === "lose" ? 1.35 : treeKey === "win" ? 0.72 : 1;
        const abortProbability = Math.min(0.9, earlyBase * abortScale * behavior.abort);
        const aborted = random() < abortProbability;
        const roundMin = Math.max(1, Math.trunc(finite(bossRule?.[3], 1)));
        const roundMax = Math.max(roundMin, Math.trunc(finite(bossRule?.[4], roundMin)));
        const roundBase = roundMin + Math.floor(random() * (roundMax - roundMin + 1));
        let rounds = aborted
          ? Math.max(1, Math.round(roundBase * (0.30 + random() * 0.45)))
          : Math.max(1, Math.round(roundBase * (treeKey === "win" ? 0.76 : treeKey === "lose" ? 1.24 : 1) * (0.72 + random() * 0.52)));
        const drawableCards = Math.max(0, 52 - 12 - config.ruleSettings.deckStopCount);
        const draws = Math.min(drawableCards, Math.max(0, Math.round(rounds * (treeKey === "win" ? 0.78 : treeKey === "lose" ? 1.25 : 1) * behavior.draws * (0.55 + random() * 0.55))));
        const magicCardsByRound = Array.from({ length: rounds }, (_, roundIndex) =>
          pickMagicCards(config, star.star, random).map((item) => ({ ...item, value: magicValue(item, random), roundIndex }))
        );
        const allMagicCards = magicCardsByRound.flat();
        const magicCards = magicCardsByRound[magicCardsByRound.length - 1] || [];
        const playerStartPick = pickHandWithNaturalReroll(config, "push", Math.max(1, star.star - 1), config.ruleSettings.playerBadHighRerollPct, random);
        let playerFinalPick = pickHandWithNaturalReroll(config, treeKey, star.star, config.ruleSettings.playerBadHighRerollPct, random);
        let bossFinalPick = pickHandWithNaturalReroll(config, "push", Math.min(8, star.star + 1), config.ruleSettings.bossBadHighRerollPct, random);
        const tieRound = !aborted && config.mechanics.tieRedealEnabled && random() < 0.018;
        if (tieRound) {
          rounds += 1;
          playerFinalPick = pickHandWithNaturalReroll(config, treeKey, star.star, config.ruleSettings.playerBadHighRerollPct, random);
          bossFinalPick = pickHandWithNaturalReroll(config, "push", Math.min(8, star.star + 1), config.ruleSettings.bossBadHighRerollPct, random);
        }
        const playerStartHand = playerStartPick.picked;
        const playerFinalHand = playerFinalPick.picked;
        const bossFinalHand = bossFinalPick.picked;
        const handStat = handStatsByKey[playerFinalHand.key];
        const matchingBoost = magicCards.find((item) => String(item.row[6]) === playerFinalHand.key);
        const critEffect = magicCards.find((item) => item.key === "crit");
        const flatEffect = magicCards.find((item) => item.key === "flatDamage");
        const coinEffect = magicCards.find((item) => item.key === "coin");
        const jokerEffect = magicCards.find((item) => item.key === "joker");
        const multiplier = playerFinalHand.key === "straightFlush" ? 1 : Math.max(1, Math.trunc((critEffect?.value ?? 0) + (matchingBoost?.value ?? 0)) || 1);
        const damagePotential = playerFinalHand.key === "straightFlush" ? handStat.baseDamage : handStat.baseDamage * multiplier + Math.trunc(flatEffect?.value ?? 0);
        const hasFreeDraw = magicCards.some((item) => item.key === "freeDraw") && config.mechanics.freeDrawEnabled;
        const freeDraws = hasFreeDraw ? Math.min(draws, 1) : 0;
        const paidDraws = Math.max(0, draws - freeDraws);
        const paidDrawCost = drawCost(paidDraws, config, bet);
        const refreshProbability = config.mechanics.bossRerollEnabled ? clamp(0.015 + star.star * 0.002 + (treeKey === "lose" ? 0.015 : 0), 0, 0.12) : 0;
        const refreshed = !aborted && random() < refreshProbability;
        const refreshSpend = refreshed ? config.ruleSettings.refreshCostX * bet : 0;
        const actionSpend = bet + paidDrawCost + refreshSpend;
        const actualSpend = Math.max(bet, (baselineSpend * 0.72 + actionSpend * 0.28) * (aborted ? 0.30 + 0.52 * random() : 0.88 + 0.24 * random()));
        const plannedPayout = baselineSpend * star.conditionalRtpPct[treeKey] / 100;
        const hpMin = Math.max(1, finite(bossRule?.[1], 1));
        const hpMax = Math.max(hpMin, finite(bossRule?.[2], hpMin));
        const bossHp = hpMin + random() * (hpMax - hpMin);
        const killBase = clamp(0.92 - bossHp / Math.max(roundBase, 1) * 0.07, 0.12, 0.92);
        const killBias = treeKey === "win" ? 0.17 : treeKey === "lose" ? -0.18 : 0;
        const chainLevel = config.mechanics.chainEnabled ? Math.min(3, currentKillStreak) : 0;
        const damageLift = Math.min(0.18, damagePotential / Math.max(bossHp, 1) * 0.16);
        const killProbability = clamp(killBase + killBias + behavior.kill + damageLift + chainLevel * 0.018, 0.06, 0.95);
        const rankDelta = finite(playerFinalHand.rank, 0) - finite(bossFinalHand.rank, 0);
        const playerWinProbability = clamp(0.52 - star.star * 0.014 + (treeKey === "win" ? 0.16 : treeKey === "lose" ? -0.16 : 0) + rankDelta * 0.035 + (jokerEffect ? 0.05 : 0), 0.08, 0.92);
        const playerWins = !aborted && !refreshed && random() < playerWinProbability;
        const killed = playerWins && random() < killProbability;
        const terminatedEarly = aborted || refreshed;
        const starVolatility = 0.34 + star.star * config.simulation.highStarVolatilityStep;
        const treeVolatility = treeKey === "push" ? 0.72 : treeKey === "win" ? 1.08 : 1.16;
        const diceWeightTotal = [bossRule?.[6], bossRule?.[7], bossRule?.[8], bossRule?.[9]].reduce((sum, value) => sum + finite(value, 0), 0);
        const averageMultiplierDice = diceWeightTotal > 0 ? (finite(bossRule?.[7], 0) + 2 * finite(bossRule?.[8], 0) + 3 * finite(bossRule?.[9], 0)) / diceWeightTotal : 0;
        const sigma = starVolatility * treeVolatility * config.simulation.volatilityScale * behavior.volatility * (1 + averageMultiplierDice * 0.08);
        const completionProbability = (1 - abortProbability) * (1 - refreshProbability);
        const payoutHitProbability = Math.max(0.001, completionProbability * playerWinProbability * killProbability);
        const playerWinHitProbability = Math.max(0.001, completionProbability * playerWinProbability);
        const directHandPayoutX = finite(playerFinalHand.row?.[3], 0) * bet;
        const coinPayoutX = Math.max(0, finite(coinEffect?.value, 0)) * bet;
        const expectedChainPayoutX = chainLevel * 3.5 * bet;
        const reservedSideExpectation = playerWinHitProbability * directHandPayoutX + payoutHitProbability * (coinPayoutX + expectedChainPayoutX);
        const plannedBossPayout = Math.max(0, plannedPayout - reservedSideExpectation);
        const maxMultiplierDice = finite(bossRule?.[9], 0) > 0 ? 3 : finite(bossRule?.[8], 0) > 0 ? 2 : finite(bossRule?.[7], 0) > 0 ? 1 : 0;
        const bossFormulaCapX = 18 * Math.pow(6, maxMultiplierDice);
        const storyCap = Math.min(config.simulation.payoutCapX * bet, bossFormulaCapX * bet);
        const grossParts = {
          boss: 0,
          hand: playerWins ? directHandPayoutX : 0,
          magic: killed ? coinPayoutX : 0,
          chain: killed && chainLevel > 0 ? rollDiceSum(chainLevel, random) * bet : 0
        };
        const sideGross = grossParts.hand + grossParts.magic + grossParts.chain;
        const sideScale = sideGross > 0 ? Math.min(1, storyCap / sideGross) : 0;
        grossParts.hand *= sideScale; grossParts.magic *= sideScale; grossParts.chain *= sideScale;
        const availableBossCap = Math.max(0, storyCap - grossParts.hand - grossParts.magic - grossParts.chain);
        if (killed && plannedBossPayout > 0 && availableBossCap > 0) {
          const targetBossOnHit = plannedBossPayout / payoutHitProbability;
          const amplitude = cappedLognormalAmplitude(targetBossOnHit, availableBossCap, sigma);
          grossParts.boss = Math.min(availableBossCap, amplitude * Math.exp(sigma * normal(random) - sigma * sigma / 2));
        }
        let gross = Object.values(grossParts).reduce((sum, value) => sum + value, 0);
        if (gross < bet * 0.02) {
          gross = 0;
          Object.keys(grossParts).forEach((key) => { grossParts[key] = 0; });
        }
        const deviation = storyDeviation({ plannedSpendX: baselineSpend, plannedPayoutX: plannedPayout, actualSpendX: actualSpend, actualPayoutX: gross, conditionalRtpPct: config.targetCoreRtpPct }, config.carry);
        const settlement = settleCarry(gross, carryBalance + deviation.correctionX, config.carry);
        carryBalance = settlement.carryAfterX;
        if (settlement.deductionX > 0 || settlement.bonusX > 0) totals.corrections += 1;
        handStatsByKey[playerStartHand.key].playerStart += 1;
        handStat.playerFinal += terminatedEarly ? 0 : 1; handStat.playerWins += playerWins ? 1 : 0; handStat.damage += playerWins ? Math.max(0, damagePotential) : 0; handStat.compareDraws += terminatedEarly ? 0 : draws;
        handStatsByKey[bossFinalHand.key].bossFinal += terminatedEarly ? 0 : 1;
        handStat.payout += grossParts.hand;
        allMagicCards.forEach((item) => {
          const stat = magicStatsByKey[item.key];
          if (!stat) return;
          stat.draws += 1;
          const target = String(item.row[6]);
          const effective = item.key === "joker" || item.key === "crit" || item.key === "flatDamage" || item.key === "coin" || item.key === "freeDraw" || target === playerFinalHand.key;
          stat.effective += effective ? 1 : 0;
          stat.killRounds += killed ? 1 : 0;
          stat.grossAttributed += item.key === "coin" ? grossParts.magic : 0;
        });
        chainStats[chainLevel].count += 1; chainStats[chainLevel].kills += killed ? 1 : 0;
        chainStats[chainLevel].payoutAttributed += grossParts.chain;
        totals.baselineSpend += baselineSpend; totals.spend += actualSpend; totals.entrySpend += bet; totals.drawSpend += paidDrawCost; totals.refreshSpend += refreshSpend;
        totals.gross += settlement.grossRewardX; totals.net += settlement.netRewardX;
        totals.deviation += deviation.correctionX;
        totals.deduction += settlement.deductionX; totals.bonus += settlement.bonusX; totals.bosses += 1;
        totals.kills += killed ? 1 : 0; totals.aborts += terminatedEarly ? 1 : 0; totals.rounds += rounds; totals.draws += draws;
        totals.compares += terminatedEarly ? 0 : 1; totals.folds += aborted ? 1 : 0; totals.ties += tieRound ? 1 : 0;
        totals.playerWins += playerWins ? 1 : 0; totals.playerLosses += !terminatedEarly && !playerWins ? 1 : 0;
        totals.freeDraws += freeDraws; totals.paidDraws += paidDraws; totals.bossRefreshes += refreshed ? 1 : 0;
        totals.damage += playerWins ? Math.max(0, damagePotential) : 0;
        totals.playerBadHighRerolls += playerStartPick.rerolls + playerFinalPick.rerolls;
        totals.bossBadHighRerolls += bossFinalPick.rerolls;
        totals.bossGross += grossParts.boss; totals.handGross += grossParts.hand; totals.magicGross += grossParts.magic; totals.chainGross += grossParts.chain;
        const bossRewardX = grossParts.boss / Math.max(bet, 1e-9);
        const jokerDrawsForBoss = allMagicCards.filter((item) => item.key === "joker").length;
        totals.bossRewardXSum += bossRewardX;
        totals.bossRewardCount += grossParts.boss > 0 ? 1 : 0;
        totals.jokerDraws += jokerDrawsForBoss;
        totals.maxStoryGrossX = Math.max(totals.maxStoryGrossX, settlement.grossRewardX / Math.max(bet, 1e-9));
        totals.maxStoryNetX = Math.max(totals.maxStoryNetX, settlement.netRewardX / Math.max(bet, 1e-9));
        const ss = starStats[star.star - 1];
        ss.count += 1; ss.baselineSpend += baselineSpend; ss.spend += actualSpend; ss.gross += settlement.grossRewardX; ss.net += settlement.netRewardX; ss.kills += killed ? 1 : 0; ss.aborts += terminatedEarly ? 1 : 0; ss.rounds += rounds; ss.draws += draws;
        ss.drawSpendX += paidDrawCost / Math.max(bet, 1e-9); ss.refreshes += refreshed ? 1 : 0;
        ss.bossGross += grossParts.boss; ss.bossRewardXSum += bossRewardX; ss.bossRewardCount += grossParts.boss > 0 ? 1 : 0;
        ss.jokerDraws += jokerDrawsForBoss; ss.straightFlushKills += killed && playerFinalHand.key === "straightFlush" ? 1 : 0;
        if (grossParts.boss > 0) {
          ss.minBossRewardX = Math.min(ss.minBossRewardX, bossRewardX);
          ss.maxBossRewardX = Math.max(ss.maxBossRewardX, bossRewardX);
        }
        ss.minGrossX = Math.min(ss.minGrossX, settlement.grossRewardX / Math.max(bet, 1e-9));
        ss.maxGrossX = Math.max(ss.maxGrossX, settlement.grossRewardX / Math.max(bet, 1e-9)); ss.maxNetX = Math.max(ss.maxNetX, settlement.netRewardX / Math.max(bet, 1e-9));
        const ts = treeStats[treeKey];
        ts.count += 1; ts.baselineSpend += baselineSpend; ts.spend += actualSpend; ts.gross += settlement.grossRewardX; ts.net += settlement.netRewardX; ts.kills += killed ? 1 : 0; ts.aborts += terminatedEarly ? 1 : 0; ts.rounds += rounds; ts.draws += draws; ts.profits.push(settlement.netRewardX - actualSpend);
        const cell = cellStats.get(`${star.star}:${treeKey}`);
        cell.count += 1; cell.baselineSpend += baselineSpend; cell.spend += actualSpend; cell.gross += settlement.grossRewardX; cell.net += settlement.netRewardX; cell.kills += killed ? 1 : 0; cell.aborts += terminatedEarly ? 1 : 0; cell.rounds += rounds; cell.draws += draws;
        const slice = roundSlices[Math.floor(bossIndex / config.simulation.roundSlice)];
        slice.count += 1; slice.baselineSpend += baselineSpend; slice.spend += actualSpend; slice.gross += settlement.grossRewardX; slice.net += settlement.netRewardX; slice.kills += killed ? 1 : 0; slice.aborts += terminatedEarly ? 1 : 0; slice.bonus += settlement.bonusX; slice.deduction += settlement.deductionX; slice.endingCarryTotal += carryBalance;
        addBucket(storyBuckets, settlement.grossRewardX / Math.max(bet, 1e-9), actualSpend, settlement.grossRewardX, settlement.netRewardX);
        addBucket(roundBuckets, settlement.grossRewardX / Math.max(actualSpend, 1e-9), actualSpend, settlement.grossRewardX, settlement.netRewardX);
        addBucket(playerBossBuckets, settlement.netRewardX / Math.max(actualSpend, 1e-9), actualSpend, settlement.grossRewardX, settlement.netRewardX);
        // A Boss story has exactly one primary close reason. REROLL remains
        // visible in the action report, but it must not make close-reason
        // totals exceed the number of simulated Boss stories.
        terminationStats[refreshed ? "REROLL" : killed ? "KILLED" : aborted ? "USER_EXIT" : "BOSS_ESCAPED"] += 1;
        baselineTotal += baselineSpend; spendTotal += actualSpend; grossTotal += settlement.grossRewardX; netTotal += settlement.netRewardX;
        roundsForPlayer += rounds;
        const profit = settlement.netRewardX - actualSpend;
        if (profit > 0) { currentWin += 1; currentLoss = 0; maxWinStreak = Math.max(maxWinStreak, currentWin); }
        else { currentLoss += 1; currentWin = 0; maxLossStreak = Math.max(maxLossStreak, currentLoss); }
        if (killed) {
          killsForPlayer += 1; currentKillStreak += 1; currentNoKillStreak = 0;
          maxKillStreak = Math.max(maxKillStreak, currentKillStreak);
          const streak = killStreakStats[Math.min(10, currentKillStreak) - 1];
          streak.count += 1; streak.payoutAttributed += grossParts.chain; streak.payoutXSum += grossParts.chain / Math.max(bet, 1e-9);
          if (!firstKillBoss) firstKillBoss = bossIndex + 1;
        } else {
          currentKillStreak = 0; currentNoKillStreak += 1; maxNoKillStreak = Math.max(maxNoKillStreak, currentNoKillStreak);
        }
        if (options.enforceCashout) {
          const liveBankroll = config.simulation.cashoutStartX * config.simulation.fixedBet + netTotal - spendTotal;
          if (liveBankroll >= config.simulation.cashoutTargetX * config.simulation.fixedBet || liveBankroll < config.simulation.fixedBet) break;
        }
      }
      const bankroll = config.simulation.cashoutStartX * config.simulation.fixedBet + netTotal - spendTotal;
      const cashoutSuccess = bankroll >= config.simulation.cashoutTargetX * config.simulation.fixedBet;
      const bankrupt = bankroll < config.simulation.fixedBet;
      players.push({ baselineSpend: baselineTotal, spend: spendTotal, gross: grossTotal, net: netTotal, grossRtpPct: grossTotal / Math.max(baselineTotal, 1e-9) * 100, actualGrossRtpPct: grossTotal / Math.max(spendTotal, 1e-9) * 100, netRtpPct: netTotal / Math.max(spendTotal, 1e-9) * 100, profit: netTotal - spendTotal, carryBalanceX: carryBalance, maxWinStreak, maxLossStreak, maxKillStreak, kills: killsForPlayer, rounds: roundsForPlayer, firstKillBoss, maxNoKillStreak, bankroll, cashoutSuccess, bankrupt });
    }
    const netRtps = players.map((row) => row.netRtpPct);
    const grossRtps = players.map((row) => row.grossRtpPct);
    const profits = players.map((row) => row.profit);
    const carries = players.map((row) => row.carryBalanceX);
    const playerKills = players.map((row) => row.kills);
    const storyProfits = TREE_KEYS.flatMap((key) => treeStats[key].profits);
    treeStats && TREE_KEYS.forEach((key) => { delete treeStats[key].profits; });
    const populatedSlices = roundSlices.filter((slice) => slice.count > 0);
    let cumulativeBaselineSpend = 0, cumulativeSpend = 0, cumulativeGross = 0, cumulativeNet = 0;
    populatedSlices.forEach((slice) => {
      cumulativeBaselineSpend += slice.baselineSpend; cumulativeSpend += slice.spend; cumulativeGross += slice.gross; cumulativeNet += slice.net;
      slice.grossRtpPct = slice.gross / Math.max(slice.baselineSpend, 1e-9) * 100;
      slice.actualGrossRtpPct = slice.gross / Math.max(slice.spend, 1e-9) * 100;
      slice.netRtpPct = slice.net / Math.max(slice.spend, 1e-9) * 100;
      slice.cumulativeGrossRtpPct = cumulativeGross / Math.max(cumulativeBaselineSpend, 1e-9) * 100;
      slice.cumulativeNetRtpPct = cumulativeNet / Math.max(cumulativeSpend, 1e-9) * 100;
      slice.avgEndingCarryX = slice.endingCarryTotal / Math.max(slice.count, 1);
    });
    const endingCarryX = players.reduce((sum, row) => sum + row.carryBalanceX, 0);
    starStats.forEach((row) => {
      if (!Number.isFinite(row.minGrossX)) row.minGrossX = 0;
      if (!Number.isFinite(row.minBossRewardX)) row.minBossRewardX = 0;
    });
    const payoutSources = { boss: totals.bossGross, hand: totals.handGross, magic: totals.magicGross, chain: totals.chainGross };
    let cashoutPlayers = players;
    if (!options.skipCashout) {
      const cashoutConfig = clone(config);
      cashoutConfig.seedMode = "FIXED";
      cashoutConfig.seed = (config.seed + 104729) >>> 0;
      cashoutConfig.simulation.playerCount = config.simulation.cashoutPlayerCount;
      cashoutConfig.simulation.cashoutPlayerCount = config.simulation.cashoutPlayerCount;
      cashoutPlayers = simulate(cashoutConfig, { skipCashout: true, enforceCashout: true }).players;
    }
    return {
      config,
      solved,
      totals: {
        ...totals,
        grossRtpPct: totals.gross / Math.max(totals.baselineSpend, 1e-9) * 100,
        actualGrossRtpPct: totals.gross / Math.max(totals.spend, 1e-9) * 100,
        netRtpPct: totals.net / Math.max(totals.spend, 1e-9) * 100,
        killRatePct: totals.kills / Math.max(totals.bosses, 1) * 100,
        abortRatePct: totals.aborts / Math.max(totals.bosses, 1) * 100,
        correctionRatePct: totals.corrections / Math.max(totals.bosses, 1) * 100,
        avgRoundsPerBoss: totals.rounds / Math.max(totals.bosses, 1),
        avgDrawsPerBoss: totals.draws / Math.max(totals.bosses, 1),
        avgDamagePerBoss: totals.damage / Math.max(totals.bosses, 1),
        endingCarryX,
        telescopeErrorX: endingCarryX - (totals.deviation - (totals.net - totals.gross)),
        platformProfitX: totals.spend - totals.net
      },
      runInfo: { reportStartedAt: startedAt, reportCompletedAt: Date.now(), reportElapsedMs: Date.now() - startedAt },
      playerDistribution: {
        grossRtpP10: percentile(grossRtps, 0.10), grossRtpP50: percentile(grossRtps, 0.50), grossRtpP90: percentile(grossRtps, 0.90), grossRtpP95: percentile(grossRtps, 0.95), grossRtpP99: percentile(grossRtps, 0.99),
        rtpP10: percentile(netRtps, 0.10), rtpP50: percentile(netRtps, 0.50), rtpP90: percentile(netRtps, 0.90), rtpP95: percentile(netRtps, 0.95), rtpP99: percentile(netRtps, 0.99), rtpMax: maxOf(netRtps), rtpStdDev: standardDeviation(netRtps),
        profitP10: percentile(profits, 0.10), profitP50: percentile(profits, 0.50), profitP90: percentile(profits, 0.90), profitP95: percentile(profits, 0.95), profitP99: percentile(profits, 0.99), profitMax: maxOf(profits), profitCvar99: upperTailMean(profits, 0.99),
        carryP10: percentile(carries, 0.10), carryP50: percentile(carries, 0.50), carryP90: percentile(carries, 0.90), carryP95: percentile(carries, 0.95), carryP99: percentile(carries, 0.99), carryMax: maxOf(carries), carryMin: minOf(carries),
        maxWinStreak: maxOf(players.map((row) => row.maxWinStreak)), maxLossStreak: maxOf(players.map((row) => row.maxLossStreak)),
        maxKillStreak: maxOf(players.map((row) => row.maxKillStreak))
      },
      starStats,
      treeStats: TREE_KEYS.map((key) => treeStats[key]),
      cellStats: [...cellStats.values()],
      roundSlices: populatedSlices,
      payoutBuckets: { story: Object.values(storyBuckets), round: Object.values(roundBuckets), playerBoss: Object.values(playerBossBuckets) },
      actionStats: {
        compareActions: totals.compares, foldActions: totals.folds, tieRounds: totals.ties,
        playerWins: totals.playerWins, playerLosses: totals.playerLosses,
        freeDrawActions: totals.freeDraws, paidDrawActions: totals.paidDraws, drawSpendX: totals.drawSpend,
        bossRefreshes: totals.bossRefreshes, playerBadHighRerolls: totals.playerBadHighRerolls, bossBadHighRerolls: totals.bossBadHighRerolls,
        terminationStats
      },
      handStats,
      magicStats,
      chainStats,
      killStreakStats,
      cashout: {
        projection: false,
        sourcePlayers: cashoutPlayers.length,
        totalPlayers: config.simulation.cashoutPlayerCount,
        successes: cashoutPlayers.filter((row) => row.cashoutSuccess).length,
        deaths: cashoutPlayers.filter((row) => row.bankrupt).length,
        cashoutRatePct: cashoutPlayers.filter((row) => row.cashoutSuccess).length / Math.max(cashoutPlayers.length, 1) * 100,
        bankruptcyRatePct: cashoutPlayers.filter((row) => row.bankrupt).length / Math.max(cashoutPlayers.length, 1) * 100,
        avgPlayedRounds: average(cashoutPlayers.map((row) => row.rounds)),
        avgDeathRounds: average(cashoutPlayers.filter((row) => row.bankrupt).map((row) => row.rounds)),
        avgBossKills: average(cashoutPlayers.map((row) => row.kills)),
        firstKillMedianBoss: percentile(cashoutPlayers.map((row) => row.firstKillBoss || config.simulation.bossesPerPlayer), 0.50),
        maxNoKillStreak: maxOf(cashoutPlayers.map((row) => row.maxNoKillStreak))
      },
      volatility: {
        storyProfitStdDevX: standardDeviation(storyProfits),
        storyProfitP95X: percentile(storyProfits, 0.95),
        storyProfitP99X: percentile(storyProfits, 0.99),
        storyProfitCvar99X: upperTailMean(storyProfits, 0.99),
        maxStoryGrossX: totals.maxStoryGrossX,
        maxStoryNetX: totals.maxStoryNetX,
        maxSliceGrossRtpPct: maxOf(populatedSlices.map((row) => row.grossRtpPct)),
        minSliceGrossRtpPct: minOf(populatedSlices.map((row) => row.grossRtpPct))
      },
      payoutSources,
      players
    };
  }

  function simulateNaturalModel(configInput, options = {}) {
    const config = sanitizeConfig(configInput);
    const startedAt = Date.now();
    const raw = simulateFullClassNaturalPopulation(config, options);
    const records = raw.records;
    const totals = {
      baselineSpend: 0, spend: 0, entrySpend: 0, drawSpend: 0, refreshSpend: 0,
      gross: 0, organicPayout: 0, net: 0, bonus: 0, deduction: 0, deviations: 0,
      bosses: 0, kills: 0, aborts: 0, rounds: 0, draws: 0, compares: 0, folds: 0, ties: 0,
      playerWins: 0, playerLosses: 0, freeDraws: 0, paidDraws: 0, bossRefreshes: 0,
      damage: 0, playerBadHighRerolls: 0, bossBadHighRerolls: 0,
      bossGross: 0, handGross: 0, magicGross: 0, chainGross: 0,
      bossRewardXSum: 0, bossRewardCount: 0, jokerDraws: 0,
      corrections: 0, maxStoryGrossX: 0, maxStoryNetX: 0
    };
    const handStats = config.handRows.map((row, index) => ({
      key: String(row[0]), label: String(row[1]), baseDamage: finite(row[4], index),
      playerStart: 0, playerFinal: 0, bossFinal: 0, playerWins: 0,
      damage: 0, compareDraws: 0, payout: 0
    }));
    const handByKey = Object.fromEntries(handStats.map((row) => [row.key, row]));
    const magicStats = config.magicRows.map((row) => ({ key: String(row[0]), label: String(row[1]), draws: 0, effective: 0, killRounds: 0, grossAttributed: 0 }));
    const magicByKey = Object.fromEntries(magicStats.map((row) => [row.key, row]));
    const starStats = Array.from({ length: 8 }, (_, index) => ({
      star: index + 1, count: 0, baselineSpend: 0, spend: 0, gross: 0, net: 0,
      kills: 0, aborts: 0, rounds: 0, draws: 0, drawSpendX: 0, refreshes: 0,
      bossGross: 0, bossRewardXSum: 0, bossRewardCount: 0,
      minBossRewardX: Infinity, maxBossRewardX: 0, minGrossX: Infinity, maxGrossX: 0, maxNetX: 0,
      jokerDraws: 0, straightFlushKills: 0, corrections: 0, directedStories: 0
    }));
    const treeStatsMap = Object.fromEntries(TREE_KEYS.map((key) => [key, {
      key, label: TREE_LABELS[key], count: 0, baselineSpend: 0, spend: 0, gross: 0, net: 0,
      kills: 0, aborts: 0, rounds: 0, draws: 0, directedStories: 0
    }]));
    const cellStatsMap = new Map();
    for (let star = 1; star <= 8; star += 1) for (const key of TREE_KEYS) cellStatsMap.set(`${star}:${key}`, {
      star, key, count: 0, baselineSpend: 0, spend: 0, gross: 0, net: 0,
      kills: 0, aborts: 0, rounds: 0, draws: 0, directedStories: 0
    });
    const storyBuckets = makeBucketStats();
    const roundBuckets = makeBucketStats();
    const playerBossBuckets = makeBucketStats();
    const carryBucketStats = NaturalCore.BET_BUCKETS.map((bucket, index) => ({
      index, key: bucket.key, label: bucket.label, bets: bucket.bets.slice(), bosses: 0,
      spendCredits: 0,
      targetAccrualCredits: 0, committedNetCredits: 0, organicPayoutCredits: 0, organicActualNetCredits: 0,
      correctionIncreaseCredits: 0, correctionDecreaseCredits: 0,
      corrections: 0, currentBossGapCredits: 0, endingBalanceCredits: 0
    }));
    const sliceSize = Math.max(1, config.simulation.roundSlice);
    const roundSlices = [];

    records.forEach((record, index) => {
      const story = record.story;
      const bet = record.bet;
      const spend = record.settlement.actualSpendCredits;
      const storyCredits = materializeStoryCredits(story, bet);
      const committedSpend = storyCredits.spendCredits;
      const committedPayout = storyCredits.payoutCredits;
      const organicPayout = record.settlement.organicPayoutCredits;
      const actualPayout = record.settlement.actualPayoutCredits;
      const correction = record.settlement.correction.deltaCredits;
      const carryBucket = carryBucketStats[record.settlement.bucketIndex];
      carryBucket.bosses += 1;
      carryBucket.spendCredits += spend;
      carryBucket.targetAccrualCredits += record.settlement.targetAccrualCredits;
      carryBucket.committedNetCredits += record.settlement.targetAccrualCredits;
      carryBucket.organicPayoutCredits += record.settlement.organicPayoutCredits;
      carryBucket.organicActualNetCredits += record.settlement.organicActualNetCredits;
      carryBucket.currentBossGapCredits += record.settlement.targetAccrualCredits - record.settlement.organicPayoutCredits;
      carryBucket.correctionIncreaseCredits += Math.max(0, correction);
      carryBucket.correctionDecreaseCredits += Math.max(0, -correction);
      carryBucket.corrections += record.settlement.correction.applied ? 1 : 0;
      const entrySpend = story.rounds * bet;
      const drawSpend = Math.max(0, spend - entrySpend);
      const actualBossRewardX = story.originalBossRewardX + record.settlement.correction.deltaX;
      totals.baselineSpend += committedSpend; totals.spend += spend; totals.entrySpend += entrySpend; totals.drawSpend += drawSpend;
      totals.gross += committedPayout; totals.organicPayout += organicPayout; totals.net += actualPayout;
      totals.bonus += Math.max(0, correction); totals.deduction += Math.max(0, -correction);
      totals.bosses += 1; totals.kills += story.killed ? 1 : 0; totals.rounds += story.rounds; totals.draws += story.actions.totalDraws;
      totals.compares += story.actions.fights; totals.folds += story.actions.folds; totals.ties += story.actions.ties;
      totals.playerWins += story.actions.playerRoundWins || 0; totals.playerLosses += story.actions.playerRoundLosses || 0;
      totals.freeDraws += story.actions.freeDraws; totals.paidDraws += story.actions.paidDraws;
      totals.damage += story.totalDamage; totals.playerBadHighRerolls += story.playerBadHighRerolls; totals.bossBadHighRerolls += story.bossBadHighRerolls;
      totals.bossGross += actualBossRewardX * bet; totals.handGross += story.payoutParts.hand * bet; totals.magicGross += story.payoutParts.coin * bet;
      totals.bossRewardXSum += story.killed ? actualBossRewardX : 0; totals.bossRewardCount += story.killed ? 1 : 0;
      totals.jokerDraws += story.magicCounts.joker || 0; totals.corrections += record.settlement.correction.applied ? 1 : 0;
      totals.maxStoryGrossX = Math.max(totals.maxStoryGrossX, story.payoutX);
      totals.maxStoryNetX = Math.max(totals.maxStoryNetX, actualPayout / Math.max(bet, 1e-12));

      Object.entries(story.playerStartHandCounts || {}).forEach(([key, count]) => { if (handByKey[key]) handByKey[key].playerStart += count; });
      Object.entries(story.playerFinalHandCounts || {}).forEach(([key, count]) => { if (handByKey[key]) handByKey[key].playerFinal += count; });
      Object.entries(story.bossHandCounts || {}).forEach(([key, count]) => { if (handByKey[key]) handByKey[key].bossFinal += count; });
      const bestHand = handByKey[story.storyMoments?.bestHandKey] || handByKey.high;
      bestHand.playerWins += story.actions.playerRoundWins || 0;
      bestHand.damage += story.totalDamage; bestHand.compareDraws += story.actions.totalDraws; bestHand.payout += story.payoutParts.hand * bet;
      Object.entries(story.magicCounts || {}).forEach(([key, count]) => {
        if (!magicByKey[key]) return;
        magicByKey[key].draws += count; magicByKey[key].effective += count;
        magicByKey[key].killRounds += story.killed ? count : 0;
        if (key === "coin") magicByKey[key].grossAttributed += story.payoutParts.coin * bet;
      });

      const ss = starStats[record.star - 1];
      ss.count += 1; ss.baselineSpend += committedSpend; ss.spend += spend; ss.gross += committedPayout; ss.net += actualPayout;
      ss.kills += story.killed ? 1 : 0; ss.rounds += story.rounds; ss.draws += story.actions.totalDraws; ss.drawSpendX += drawSpend / Math.max(bet, 1e-12);
      ss.bossGross += actualBossRewardX * bet; ss.bossRewardXSum += story.killed ? actualBossRewardX : 0; ss.bossRewardCount += story.killed ? 1 : 0;
      ss.jokerDraws += story.magicCounts.joker || 0; ss.straightFlushKills += story.killed && story.storyMoments?.bestHandKey === "straightFlush" ? 1 : 0;
      ss.corrections += record.settlement.correction.applied ? 1 : 0; ss.directedStories += story.sourcePool === "DIRECTED" ? 1 : 0;
      if (story.killed) { ss.minBossRewardX = Math.min(ss.minBossRewardX, actualBossRewardX); ss.maxBossRewardX = Math.max(ss.maxBossRewardX, actualBossRewardX); }
      ss.minGrossX = Math.min(ss.minGrossX, story.payoutX); ss.maxGrossX = Math.max(ss.maxGrossX, story.payoutX); ss.maxNetX = Math.max(ss.maxNetX, actualPayout / Math.max(bet, 1e-12));

      const ts = treeStatsMap[record.classKey];
      const cell = cellStatsMap.get(`${record.star}:${record.classKey}`);
      for (const row of [ts, cell]) {
        row.count += 1; row.baselineSpend += committedSpend; row.spend += spend; row.gross += committedPayout; row.net += actualPayout;
        row.kills += story.killed ? 1 : 0; row.rounds += story.rounds; row.draws += story.actions.totalDraws; row.directedStories += story.sourcePool === "DIRECTED" ? 1 : 0;
      }
      addBucket(storyBuckets, story.payoutX, spend, committedPayout, actualPayout);
      addBucket(roundBuckets, committedPayout / Math.max(spend, 1e-12), spend, committedPayout, actualPayout);
      addBucket(playerBossBuckets, actualPayout / Math.max(spend, 1e-12), spend, committedPayout, actualPayout);

      const sliceIndex = Math.floor(index / sliceSize);
      if (!roundSlices[sliceIndex]) roundSlices[sliceIndex] = {
        startBoss: sliceIndex * sliceSize + 1, endBoss: Math.min((sliceIndex + 1) * sliceSize, records.length),
        count: 0, baselineSpend: 0, spend: 0, gross: 0, net: 0, kills: 0, aborts: 0, bonus: 0, deduction: 0, endingCarryTotal: 0
      };
      const slice = roundSlices[sliceIndex];
      slice.count += 1; slice.baselineSpend += committedSpend; slice.spend += spend; slice.gross += committedPayout; slice.net += actualPayout;
      slice.kills += story.killed ? 1 : 0; slice.bonus += Math.max(0, correction); slice.deduction += Math.max(0, -correction);
      slice.endingCarryTotal += record.settlement.balances.reduce((sum, value) => sum + value, 0);
    });

    let cumulativeBaselineSpend = 0, cumulativeSpend = 0, cumulativeGross = 0, cumulativeNet = 0;
    roundSlices.forEach((slice) => {
      cumulativeBaselineSpend += slice.baselineSpend; cumulativeSpend += slice.spend; cumulativeGross += slice.gross; cumulativeNet += slice.net;
      slice.grossRtpPct = slice.gross / Math.max(slice.baselineSpend, 1e-12) * 100;
      slice.netRtpPct = slice.net / Math.max(slice.spend, 1e-12) * 100;
      slice.cumulativeGrossRtpPct = cumulativeGross / Math.max(cumulativeBaselineSpend, 1e-12) * 100;
      slice.cumulativeNetRtpPct = cumulativeNet / Math.max(cumulativeSpend, 1e-12) * 100;
      slice.avgEndingCarryX = slice.endingCarryTotal / Math.max(slice.count, 1);
    });
    const endingCarryX = raw.players.reduce((sum, player) => sum + player.bucketBalances.reduce((part, value) => part + value, 0), 0);
    carryBucketStats.forEach((row, index) => {
      row.endingBalanceCredits = raw.players.reduce((sum, player) => sum + finite(player.bucketBalances[index], 0), 0);
      row.correctionRatePct = row.corrections / Math.max(row.bosses, 1) * 100;
    });
    totals.grossRtpPct = totals.gross / Math.max(totals.baselineSpend, 1e-12) * 100;
    totals.actualGrossRtpPct = totals.gross / Math.max(totals.spend, 1e-12) * 100;
    totals.netRtpPct = totals.net / Math.max(totals.spend, 1e-12) * 100;
    totals.killRatePct = totals.kills / Math.max(totals.bosses, 1) * 100;
    totals.abortRatePct = 0;
    totals.correctionRatePct = totals.corrections / Math.max(totals.bosses, 1) * 100;
    totals.avgRoundsPerBoss = totals.rounds / Math.max(totals.bosses, 1);
    totals.avgDrawsPerBoss = totals.draws / Math.max(totals.bosses, 1);
    totals.avgDamagePerBoss = totals.damage / Math.max(totals.bosses, 1);
    totals.endingCarryX = endingCarryX;
    totals.endingBucketBalances = carryBucketStats.map((row) => row.endingBalanceCredits);
    totals.targetAccrualCredits = totals.spend * config.targetCoreRtpPct / 100;
    totals.committedNetCredits = totals.targetAccrualCredits;
    totals.organicActualNetCredits = totals.organicPayout - totals.spend;
    totals.actualNetCredits = totals.net - totals.spend;
    totals.telescopeErrorX = endingCarryX - (totals.targetAccrualCredits - totals.net);
    totals.actualSpendDeltaCredits = totals.spend - totals.baselineSpend;
    totals.actualSpendVsPlannedPct = totals.spend / Math.max(totals.baselineSpend, 1e-12) * 100;
    totals.poolZeroProjectedPayoutCredits = totals.targetAccrualCredits;
    totals.poolZeroProjectedRtpPct = totals.poolZeroProjectedPayoutCredits / Math.max(totals.spend, 1e-12) * 100;
    totals.poolZeroProjectedTargetDriftPp = totals.poolZeroProjectedRtpPct - config.targetCoreRtpPct;
    totals.spendBasisRtpDriftPp = totals.poolZeroProjectedRtpPct - config.targetCoreRtpPct;
    totals.platformProfitX = totals.spend - totals.net;
    totals.ticketErrorPpMax = raw.totals.ticketErrorPpMax;
    starStats.forEach((row) => { if (!Number.isFinite(row.minBossRewardX)) row.minBossRewardX = 0; if (!Number.isFinite(row.minGrossX)) row.minGrossX = 0; });

    const playerRtps = raw.players.map((row) => row.rtpPct);
    const profits = raw.players.map((row) => row.net);
    const carries = raw.players.map((row) => row.bucketBalances.reduce((sum, value) => sum + value, 0));
    const committedPlayerRtps = raw.players.map((player) => {
      const rows = records.filter((record) => record.player === player.player);
      const spend = rows.reduce((sum, record) => sum + record.story.spendX * record.bet, 0);
      const payout = rows.reduce((sum, record) => sum + record.story.payoutX * record.bet, 0);
      return payout / Math.max(spend, 1e-12) * 100;
    });
    let maxKillStreak = 0;
    const playerStreak = new Map();
    records.forEach((record) => { const next = record.story.killed ? (playerStreak.get(record.player) || 0) + 1 : 0; playerStreak.set(record.player, next); maxKillStreak = Math.max(maxKillStreak, next); });
    const playerDistribution = {
      grossRtpP10: percentile(committedPlayerRtps, 0.10), grossRtpP50: percentile(committedPlayerRtps, 0.50), grossRtpP90: percentile(committedPlayerRtps, 0.90), grossRtpP95: percentile(committedPlayerRtps, 0.95), grossRtpP99: percentile(committedPlayerRtps, 0.99),
      rtpP10: percentile(playerRtps, 0.10), rtpP50: percentile(playerRtps, 0.50), rtpP90: percentile(playerRtps, 0.90), rtpP95: percentile(playerRtps, 0.95), rtpP99: percentile(playerRtps, 0.99), rtpMax: Math.max(0, maxOf(playerRtps)), rtpStdDev: standardDeviation(playerRtps),
      profitP10: percentile(profits, 0.10), profitP50: percentile(profits, 0.50), profitP90: percentile(profits, 0.90), profitP95: percentile(profits, 0.95), profitP99: percentile(profits, 0.99), profitMax: Math.max(0, maxOf(profits)), profitCvar99: upperTailMean(profits, 0.99),
      carryP10: percentile(carries, 0.10), carryP50: percentile(carries, 0.50), carryP90: percentile(carries, 0.90), carryP95: percentile(carries, 0.95), carryP99: percentile(carries, 0.99), carryMax: Math.max(0, maxOf(carries)), carryMin: Math.min(0, minOf(carries)),
      maxWinStreak: 0, maxLossStreak: 0, maxKillStreak
    };
    const cashoutRows = raw.players.map((player) => {
      const bankroll = config.simulation.cashoutStartX * config.simulation.fixedBet + player.net;
      return { ...player, bankroll, cashoutSuccess: bankroll >= config.simulation.cashoutTargetX * config.simulation.fixedBet, bankrupt: bankroll < config.simulation.fixedBet };
    });
    const storyProfits = records.map((record) => record.settlement.actualPayoutCredits - record.settlement.actualSpendCredits);
    const ticketAttempts = records.map((record) => record.commit.candidateSetsEvaluated || record.commit.attempt || 1);
    const ticketBestPositions = records.map((record) => record.commit.attempt || 1);
    const ticketWeightStats = TREE_KEYS.map((key) => {
      const values = records.map((record) => finite(record.commit.weights?.[key], 0) * 100);
      return {
        key, label: TREE_LABELS[key], count: values.length,
        minPct: Math.min(100, minOf(values, 100)), p01Pct: percentile(values, 0.01), p05Pct: percentile(values, 0.05),
        p50Pct: percentile(values, 0.50), p95Pct: percentile(values, 0.95), p99Pct: percentile(values, 0.99),
        maxPct: Math.max(0, maxOf(values)), avgPct: average(values),
        below1PctRate: values.filter((value) => value < 1).length / Math.max(values.length, 1) * 100,
        below5PctRate: values.filter((value) => value < 5).length / Math.max(values.length, 1) * 100
      };
    });
    const maxTicketWeights = records.map((record) => Math.max(...TREE_KEYS.map((key) => finite(record.commit.weights?.[key], 0) * 100)));
    const effectiveChoices = records.map((record) => {
      const entropy = TREE_KEYS.reduce((sum, key) => {
        const probability = finite(record.commit.weights?.[key], 0);
        return probability > 0 ? sum - probability * Math.log(probability) : sum;
      }, 0);
      return Math.exp(entropy);
    });
    const ticketHealth = {
      commits: records.length,
      candidateSetsTried: ticketAttempts.reduce((sum, value) => sum + value, 0),
      rejectedCandidateSets: ticketAttempts.reduce((sum, value) => sum + Math.max(0, value - 1), 0),
      firstAttemptRatePct: ticketBestPositions.filter((value) => value === 1).length / Math.max(ticketBestPositions.length, 1) * 100,
      avgAttempts: average(ticketAttempts), p95Attempts: percentile(ticketAttempts, 0.95), p99Attempts: percentile(ticketAttempts, 0.99),
      maxAttempts: Math.max(0, maxOf(ticketAttempts)),
      maxWeightP95Pct: percentile(maxTicketWeights, 0.95), maxWeightP99Pct: percentile(maxTicketWeights, 0.99),
      maxWeightPct: Math.max(0, maxOf(maxTicketWeights)), avgEffectiveChoices: average(effectiveChoices),
      minEffectiveChoices: Math.min(3, minOf(effectiveChoices, 3)), weightStats: ticketWeightStats,
      avgMixDeviationPp: average(records.map((record) => finite(record.commit.mixDeviationPpMax, 0))),
      maxMixDeviationPp: Math.max(0, maxOf(records.map((record) => finite(record.commit.mixDeviationPpMax, 0))))
    };
    const ticketStarStats = Array.from({ length: 8 }, (_unused, index) => {
      const star = index + 1;
      const rows = records.filter((record) => record.star === star);
      const attempts = rows.map((record) => record.commit.candidateSetsEvaluated || record.commit.attempt || 1);
      const bestPositions = rows.map((record) => record.commit.attempt || 1);
      const allWeights = rows.flatMap((record) => TREE_KEYS.map((key) => finite(record.commit.weights?.[key], 0) * 100));
      const maxWeights = rows.map((record) => Math.max(...TREE_KEYS.map((key) => finite(record.commit.weights?.[key], 0) * 100)));
      const choices = rows.map((record) => {
        const entropy = TREE_KEYS.reduce((sum, key) => {
          const probability = finite(record.commit.weights?.[key], 0);
          return probability > 0 ? sum - probability * Math.log(probability) : sum;
        }, 0);
        return Math.exp(entropy);
      });
      return {
        star, commits: rows.length,
        firstAttemptRatePct: bestPositions.filter((value) => value === 1).length / Math.max(bestPositions.length, 1) * 100,
        avgAttempts: average(attempts), p99Attempts: percentile(attempts, 0.99), maxAttempts: Math.max(0, maxOf(attempts)),
        minWeightPct: Math.min(100, minOf(allWeights, 100)), below1PctRate: allWeights.filter((value) => value < 1).length / Math.max(allWeights.length, 1) * 100,
        maxWeightP99Pct: percentile(maxWeights, 0.99), maxWeightPct: Math.max(0, maxOf(maxWeights)), avgEffectiveChoices: average(choices)
      };
    });
    const storySelectionCoverage = [];
    for (let star = 1; star <= 8; star += 1) for (const key of TREE_KEYS) {
      const catalog = (raw.pool?.naturalCells?.[star] || raw.pool?.cells?.[star] || {})[key] || [];
      const candidateCounts = new Map();
      const selectedCounts = new Map();
      records.filter((record) => record.star === star).forEach((record) => {
        const candidate = record.commit.candidates?.find((story) => story.classKey === key);
        if (candidate?.id) candidateCounts.set(candidate.id, (candidateCounts.get(candidate.id) || 0) + 1);
        if (record.classKey === key && record.story?.id) selectedCounts.set(record.story.id, (selectedCounts.get(record.story.id) || 0) + 1);
      });
      const catalogIds = new Set(catalog.map((story) => story.id));
      storySelectionCoverage.push({
        star, key, label: TREE_LABELS[key], catalogStories: catalogIds.size,
        candidateUnique: [...candidateCounts.keys()].filter((id) => catalogIds.has(id)).length,
        selectedUnique: [...selectedCounts.keys()].filter((id) => catalogIds.has(id)).length,
        selectedCount: [...selectedCounts.values()].reduce((sum, value) => sum + value, 0),
        neverCandidate: [...catalogIds].filter((id) => !candidateCounts.has(id)).length,
        neverSelected: [...catalogIds].filter((id) => !selectedCounts.has(id)).length,
        maxSelectedRepeats: Math.max(0, maxOf(selectedCounts.values()))
      });
    }
    const correctionReasons = records.reduce((rows, record) => {
      const reason = record.settlement.correction.reason || (record.settlement.correction.applied ? "APPLIED" : "UNKNOWN");
      rows[reason] = (rows[reason] || 0) + 1;
      return rows;
    }, {});
    const correctionRequestedCredits = records.reduce((sum, record) => sum + finite(record.settlement.correction.requestedAbsCredits, 0), 0);
    const correctionAppliedCredits = records.reduce((sum, record) => sum + finite(record.settlement.correction.appliedAbsCredits, 0), 0);
    const correctionHealth = {
      exactReplay: false,
      opportunities: records.filter((record) => finite(record.settlement.correction.requestedAbsCredits, 0) >= 1e-9).length,
      applied: records.filter((record) => record.settlement.correction.applied).length,
      partial: records.filter((record) => record.settlement.correction.applied && finite(record.settlement.correction.unappliedAbsCredits, 0) >= 1e-9).length,
      capLimited: records.filter((record) => record.settlement.correction.limitedByCap && finite(record.settlement.correction.requestedAbsCredits, 0) >= 1e-9).length,
      requestedAbsCredits: correctionRequestedCredits, appliedAbsCredits: correctionAppliedCredits,
      utilizationPct: correctionAppliedCredits / Math.max(correctionRequestedCredits, 1e-12) * 100,
      reasons: correctionReasons
    };
    const migrationCounts = {};
    for (const from of TREE_KEYS) for (const to of TREE_KEYS) migrationCounts[`${from}:${to}`] = 0;
    records.forEach((record) => {
      const paidReturnX = record.settlement.actualPayoutCredits / Math.max(record.settlement.actualSpendCredits, 1e-12);
      const paidClass = NaturalCore.storyClass(paidReturnX, config);
      migrationCounts[`${record.classKey}:${paidClass}`] += 1;
    });
    const classMigration = TREE_KEYS.flatMap((from) => TREE_KEYS.map((to) => ({
      from, to, fromLabel: TREE_LABELS[from], toLabel: TREE_LABELS[to],
      count: migrationCounts[`${from}:${to}`],
      ratePct: migrationCounts[`${from}:${to}`] / Math.max(records.filter((record) => record.classKey === from).length, 1) * 100
    })));
    const carryBucketTailStats = NaturalCore.BET_BUCKETS.map((bucket, index) => {
      const values = raw.players.map((player) => finite(player.bucketBalances[index], 0));
      const absolute = values.map(Math.abs);
      return {
        index, key: bucket.key, label: bucket.label, players: values.length,
        positivePlayers: values.filter((value) => value > 1e-9).length,
        negativePlayers: values.filter((value) => value < -1e-9).length,
        zeroPlayers: values.filter((value) => Math.abs(value) <= 1e-9).length,
        meanCredits: average(values), absP50Credits: percentile(absolute, 0.50), absP90Credits: percentile(absolute, 0.90),
        absP95Credits: percentile(absolute, 0.95), absP99Credits: percentile(absolute, 0.99), maxAbsCredits: Math.max(0, maxOf(absolute)),
        endingAbsCredits: absolute.reduce((sum, value) => sum + value, 0), spendCredits: carryBucketStats[index].spendCredits
      };
    });
    const correctionCoverageStats = [...Array(8)].map((_unused, index) => {
      const star = index + 1;
      const cells = raw.pool?.naturalCells?.[star] || raw.pool?.cells?.[star] || {};
      const stories = TREE_KEYS.flatMap((key) => cells[key] || []);
      let killed = 0, noReward = 0, upAvailable = 0, downAvailable = 0, upFull = 0, downFull = 0;
      const upCapacityPct = [], downCapacityPct = [], upStepPct = [], downStepPct = [];
      stories.forEach((story) => {
        const original = Math.max(0, finite(story.originalBossRewardX, 0));
        if (!story.killed || original <= 0) { noReward += 1; return; }
        killed += 1;
        const outcomes = NaturalCore.legalDiceOutcomes(integer(story.originalDice?.normalDice, 1, 1, 8), integer(story.originalDice?.multiplierDice, 0, 0, 8));
        const minimum = original * config.carry.rewardFloorPct / 100;
        const maximum = original * config.carry.rewardCeilingMultiple;
        const upCap = maximum - original;
        const downCap = original - minimum;
        const ups = outcomes.filter((outcome) => outcome.total > original && outcome.total <= maximum + 1e-9).map((outcome) => outcome.total - original);
        const downs = outcomes.filter((outcome) => outcome.total < original && outcome.total >= minimum - 1e-9).map((outcome) => original - outcome.total);
        const maxUp = ups.length ? Math.max(...ups) : 0;
        const maxDown = downs.length ? Math.max(...downs) : 0;
        if (maxUp > 0) upAvailable += 1;
        if (maxDown > 0) downAvailable += 1;
        if (upCap > 0 && maxUp >= upCap - 1e-9) upFull += 1;
        if (downCap > 0 && maxDown >= downCap - 1e-9) downFull += 1;
        upCapacityPct.push(maxUp / original * 100); downCapacityPct.push(maxDown / original * 100);
        upStepPct.push(ups.length ? Math.min(...ups) / original * 100 : 0);
        downStepPct.push(downs.length ? Math.min(...downs) / original * 100 : 0);
      });
      return {
        star, stories: stories.length, killed, noReward,
        upAvailablePct: upAvailable / Math.max(killed, 1) * 100, downAvailablePct: downAvailable / Math.max(killed, 1) * 100,
        upFullCapPct: upFull / Math.max(killed, 1) * 100, downFullCapPct: downFull / Math.max(killed, 1) * 100,
        avgUpCapacityPct: average(upCapacityPct), avgDownCapacityPct: average(downCapacityPct),
        p50UpCapacityPct: percentile(upCapacityPct, 0.50), p50DownCapacityPct: percentile(downCapacityPct, 0.50),
        avgMinUpStepPct: average(upStepPct), avgMinDownStepPct: average(downStepPct)
      };
    });
    const settlementFunnel = {
      candidateStoriesDrawn: ticketHealth.candidateSetsTried * 3,
      commits: records.length, settlements: records.length, pending: 0,
      note: "模擬器每筆都完整結算；Demo／正式後端仍須另記 START 後未結算與冪等鍵"
    };
    const ticketSamples = records.slice(0, 100).map((record) => ({
      player: record.player,
      bossIndex: record.bossIndex,
      star: record.star,
      bet: record.bet,
      selectedClass: record.classKey,
      targetRtpPct: config.targetCoreRtpPct,
      ticketBasis: record.commit.ticketBasis || config.storyPool.ticketBasis,
      ticketCounts: Array.isArray(record.commit.ticketCounts) ? record.commit.ticketCounts.slice() : [],
      scorePoints: Array.isArray(record.commit.scorePoints) ? record.commit.scorePoints.slice() : [],
      weights: clone(record.commit.weights || {}),
      weightedRtpPct: finite(record.commit.weightedRtpPct, 0),
      rtpErrorPp: finite(record.commit.rtpErrorPp, 0),
      mixDeviationPpMax: finite(record.commit.mixDeviationPpMax, 0),
      candidates: (record.commit.candidates || []).map((story) => ({
        id: story.id,
        classKey: story.classKey,
        classLabel: story.classLabel || TREE_LABELS[story.classKey],
        spendX: finite(story.spendX, 0),
        payoutX: finite(story.payoutX, 0),
        netX: finite(story.netX, finite(story.payoutX, 0) - finite(story.spendX, 0)),
        spendCredits: finite(story.spendX, 0) * record.bet,
        payoutCredits: finite(story.payoutX, 0) * record.bet,
        netCredits: (finite(story.payoutX, 0) - finite(story.spendX, 0)) * record.bet,
        killed: Boolean(story.killed)
      }))
    }));
    const minimumTicketWeightPct = minOf(ticketWeightStats.map((row) => row.minPct));
    const minimumCorrectionAvailabilityPct = minOf(correctionCoverageStats.flatMap((row) => [row.upAvailablePct, row.downAvailablePct]));
    const minimumFullCapPct = minOf(correctionCoverageStats.flatMap((row) => [row.upFullCapPct, row.downFullCapPct]));
    const unsampledBuckets = carryBucketStats.filter((row) => row.bosses === 0).map((row) => row.label);
    const riskFindings = [
      {
        severity: "高", code: "TICKET_STARVATION",
        evidence: `最小權重 ${minimumTicketWeightPct.toFixed(6)}%；單故事最大權重 ${ticketHealth.maxWeightPct.toFixed(3)}%`,
        impact: "三個故事名義上存在，但個別故事可能近乎永遠抽不到；需決定最低籤權或接受此結果。"
      },
      {
        severity: "中", code: "CANDIDATE_REJECTION_BIAS",
        evidence: `淘汰 ${ticketHealth.rejectedCandidateSets} 組，占全部嘗試 ${(ticketHealth.rejectedCandidateSets / Math.max(ticketHealth.candidateSetsTried, 1) * 100).toFixed(2)}%`,
        impact: "無法配成目標 RTP 的三故事會整組重抽，實際候選分布不再等於從三池各均勻抽一次。"
      },
      {
        severity: "中", code: "TARGET_RTP_POOL_TAIL",
        evidence: `實際投入／劇情原定投入 ${totals.actualSpendVsPlannedPct.toFixed(3)}%；入池比例誤差 ${totals.spendBasisRtpDriftPp >= 0 ? "+" : ""}${totals.spendBasisRtpDriftPp.toFixed(3)}pp`,
        impact: `抽劇本與每筆花費入池都使用 ${config.targetCoreRtpPct}%；合法骰面未能吸收的短期差額會留在三桶，等待後續擊殺。`
      },
      {
        severity: "高", code: "EXACT_REPLAY_BLIND_SPOT",
        evidence: `本次依目標 RTP 入池並實跑 ${correctionHealth.opportunities} 次非零補正機會`,
        impact: "固定故事重播可驗證水池守恆與合法骰面容量；玩家臨場偏離分布仍需另做壓測。"
      },
      {
        severity: "高", code: "DICE_CORRECTION_GAPS",
        evidence: `最低可上／下修覆蓋 ${minimumCorrectionAvailabilityPct.toFixed(2)}%；最低完整上下界覆蓋 ${minimumFullCapPct.toFixed(2)}%`,
        impact: "合法骰面是離散值；即使池內有差額，也可能完全不能補或只能補一部分。"
      },
      {
        severity: "中", code: "BET_BUCKET_COVERAGE",
        evidence: unsampledBuckets.length ? `本次未抽樣：${unsampledBuckets.join("、")}` : "三個 Bet 桶都有樣本",
        impact: "未抽樣的桶不能從本次報表判定尾部風險。"
      },
      {
        severity: "高", code: "PENDING_COMMIT_DURABILITY",
        evidence: "模擬器待結算為 0，但 Demo 只把水池寫入 localStorage，未保存可恢復的完整進行中 encounter。",
        impact: "START 後重整／關頁可能留下已承諾但無法續結算的孤兒差額。正式後端需交易式 pending commit。"
      },
      {
        severity: "高", code: "SETTLEMENT_IDEMPOTENCY",
        evidence: "目前只靠頁面記憶體內的 poolSettlement／payoutSettled 防重複，沒有伺服器結算唯一鍵。",
        impact: "正式環境的重試、重連或雙請求可能造成重複結算或漏派彩。"
      }
    ];
    return {
      config, solved: { valid: true, mode: "DYNAMIC_THREE_CANDIDATES", targetRtpPct: config.targetCoreRtpPct },
      totals, runInfo: { reportStartedAt: startedAt, reportCompletedAt: Date.now(), reportElapsedMs: Date.now() - startedAt },
      playerDistribution, starStats, treeStats: TREE_KEYS.map((key) => treeStatsMap[key]), cellStats: [...cellStatsMap.values()], roundSlices, carryBucketStats,
      ticketHealth, ticketStarStats, ticketSamples, storySelectionCoverage, correctionHealth, correctionCoverageStats, carryBucketTailStats, classMigration, settlementFunnel, riskFindings,
      payoutBuckets: { story: Object.values(storyBuckets), round: Object.values(roundBuckets), playerBoss: Object.values(playerBossBuckets) },
      actionStats: {
        compareActions: totals.compares, foldActions: totals.folds, tieRounds: totals.ties,
        playerWins: totals.playerWins, playerLosses: totals.playerLosses,
        freeDrawActions: totals.freeDraws, paidDrawActions: totals.paidDraws, drawSpendX: totals.drawSpend,
        bossRefreshes: 0, playerBadHighRerolls: totals.playerBadHighRerolls, bossBadHighRerolls: totals.bossBadHighRerolls,
        terminationStats: { KILLED: totals.kills, BOSS_ESCAPED: totals.bosses - totals.kills }
      },
      handStats, magicStats,
      chainStats: Array.from({ length: 4 }, (_, level) => ({ level, count: 0, kills: 0, payoutAttributed: 0 })),
      killStreakStats: Array.from({ length: 10 }, (_, index) => ({ level: index + 1, count: 0, payoutAttributed: 0, payoutXSum: 0 })),
      cashout: {
        available: false, projection: false, sourcePlayers: 0, totalPlayers: 0,
        successes: 0, deaths: 0, cashoutRatePct: 0, bankruptcyRatePct: 0,
        avgPlayedRounds: 0, avgDeathRounds: 0, avgBossKills: 0, firstKillMedianBoss: 0, maxNoKillStreak: 0,
        note: "新版故事模型尚未建立獨立退幣玩家跑法；舊版三個玩家模型仍照原版執行"
      },
      volatility: {
        storyProfitStdDevX: standardDeviation(storyProfits), storyProfitP95X: percentile(storyProfits, 0.95), storyProfitP99X: percentile(storyProfits, 0.99), storyProfitCvar99X: upperTailMean(storyProfits, 0.99),
        maxStoryGrossX: totals.maxStoryGrossX, maxStoryNetX: totals.maxStoryNetX,
        maxSliceGrossRtpPct: Math.max(0, maxOf(roundSlices.map((row) => row.grossRtpPct))), minSliceGrossRtpPct: minOf(roundSlices.map((row) => row.grossRtpPct), 0)
      },
      payoutSources: { boss: totals.bossGross, hand: totals.handGross, magic: totals.magicGross, chain: totals.chainGross },
      storyPool: raw.pool,
      directedStats: {
        selected: records.filter((record) => record.story.sourcePool === "DIRECTED").length,
        selectedPct: records.filter((record) => record.story.sourcePool === "DIRECTED").length / Math.max(records.length, 1) * 100,
        archetypes: records.reduce((rows, record) => { const key = record.story.director?.archetype; if (key) rows[key] = (rows[key] || 0) + 1; return rows; }, {})
      },
      players: raw.players
    };
  }

  const publicApi = {
    TREE_KEYS, TREE_LABELS, SPEND_FACTORS, STORAGE_KEY, CHANNEL_NAME, TICKET_BASIS, PAYOUT_BUCKETS, BET_VALUES, STORY_BET_CONTRACT_VERSION, PLAYER_BEHAVIORS,
    DEFAULT_CONFIG: clone(DEFAULT_CONFIG), clone, sanitizeConfig, mixedRtpPct, solveStarTickets,
    solveAllStars, naturalityStatus, storyDeviation, settleCarry, materializeStoryCredits,
    drawFullClassStoryCommit, simulate: simulateNaturalModel, simulateNaturalModel, simulateLegacy: simulate,
    NaturalCore
  };
  root.BossDuelActionTreeCore = publicApi;
  if (typeof module !== "undefined" && module.exports) module.exports = publicApi;
})(typeof window !== "undefined" ? window : globalThis);
