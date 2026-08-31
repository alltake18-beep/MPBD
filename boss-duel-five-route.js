"use strict";

(function attachBossDuelFiveRoute(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BossDuelFiveRoute = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createBossDuelFiveRoute() {
  const STORAGE_KEY = "boss-duel:five-route:config:v2";
  const CHANNEL_NAME = "boss-duel:five-route:hot-update:v2";
  const SCHEMA_VERSION = 2;
  const LIMITS = Object.freeze({ ticket: 1_000_000_000, x: 1_000_000 });

  const DEFAULT_CONFIG = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    revision: 1,
    seed: 20260818,
    targetCoreRtp: 0.96,
    tolerancePp: 0.01,
    officialPolicyId: "policy-funded-v1",
    settlementProfileId: "linear-bet-v1",
    routes: [
      { id: "WIN_BIG", label: "贏多", ticket: 213, vi: [
        { id: "H1", label: "低", ticket: 20, spendX: 4, payoutX: 8 },
        { id: "H2", label: "中", ticket: 60, spendX: 4, payoutX: 12 },
        { id: "H3", label: "高", ticket: 20, spendX: 4, payoutX: 18 }
      ] },
      { id: "WIN_SMALL", label: "贏少", ticket: 246, vi: [
        { id: "W1", label: "低", ticket: 30, spendX: 5, payoutX: 6 },
        { id: "W2", label: "中", ticket: 50, spendX: 5, payoutX: 8 },
        { id: "W3", label: "高", ticket: 20, spendX: 5, payoutX: 10 }
      ] },
      { id: "PUSH", label: "打平", ticket: 191, vi: [
        { id: "P1", label: "低", ticket: 25, spendX: 7, payoutX: 6 },
        { id: "P2", label: "中", ticket: 50, spendX: 7, payoutX: 7 },
        { id: "P3", label: "高", ticket: 25, spendX: 7, payoutX: 8 }
      ] },
      { id: "LOSE_SMALL", label: "輸少", ticket: 196, vi: [
        { id: "L1", label: "低", ticket: 40, spendX: 9, payoutX: 3 },
        { id: "L2", label: "中", ticket: 40, spendX: 9, payoutX: 5 },
        { id: "L3", label: "高", ticket: 20, spendX: 9, payoutX: 7 }
      ] },
      { id: "LOSE_BIG", label: "輸多", ticket: 154, vi: [
        { id: "B1", label: "低", ticket: 50, spendX: 12, payoutX: 0 },
        { id: "B2", label: "中", ticket: 30, spendX: 12, payoutX: 2 },
        { id: "B3", label: "高", ticket: 20, spendX: 12, payoutX: 4 }
      ] }
    ]
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function safeInteger(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  }

  function sanitizeConfig(input = {}) {
    const fallback = clone(DEFAULT_CONFIG);
    const sourceRoutes = Array.isArray(input.routes) ? input.routes : [];
    const routes = fallback.routes.map((route, routeIndex) => {
      const sourceRoute = sourceRoutes.find((candidate) => candidate?.id === route.id) || sourceRoutes[routeIndex] || {};
      const sourceVi = Array.isArray(sourceRoute.vi) ? sourceRoute.vi : [];
      return {
        id: route.id,
        label: route.label,
        ticket: finiteNumber(sourceRoute.ticket, route.ticket),
        vi: route.vi.map((tier, viIndex) => {
          const sourceTier = sourceVi.find((candidate) => candidate?.id === tier.id) || sourceVi[viIndex] || {};
          return {
            id: tier.id,
            label: tier.label,
            ticket: finiteNumber(sourceTier.ticket, tier.ticket),
            spendX: finiteNumber(sourceTier.spendX, tier.spendX),
            payoutX: finiteNumber(sourceTier.payoutX, tier.payoutX)
          };
        })
      };
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: safeInteger(input.revision, fallback.revision, 1, 999_999_999),
      seed: safeInteger(input.seed, fallback.seed, 0, 0xffffffff) >>> 0,
      targetCoreRtp: finiteNumber(input.targetCoreRtp, fallback.targetCoreRtp),
      tolerancePp: finiteNumber(input.tolerancePp, fallback.tolerancePp),
      officialPolicyId: String(input.officialPolicyId || fallback.officialPolicyId).slice(0, 80),
      settlementProfileId: String(input.settlementProfileId || fallback.settlementProfileId).slice(0, 80),
      routes
    };
  }

  function calculate(input) {
    const config = sanitizeConfig(input);
    const errors = [];
    const routeTicketTotal = config.routes.reduce((sum, route) => sum + route.ticket, 0);
    if (!Number.isSafeInteger(routeTicketTotal) || routeTicketTotal <= 0 || routeTicketTotal > LIMITS.ticket * config.routes.length) {
      errors.push("五路線外層總籤必須大於 0，且每格須為安全整數");
    }
    if (!(config.targetCoreRtp > 0 && config.targetCoreRtp <= 2)) errors.push("目標核心 RTP 必須介於 0%～200%");
    if (!(config.tolerancePp >= 0 && config.tolerancePp <= 100)) errors.push("容許差必須介於 0～100 個百分點");

    let expectedSpendX = 0;
    let expectedPayoutX = 0;
    let secondMomentY = 0;
    const rows = config.routes.map((route, routeIndex) => {
      if (!Number.isSafeInteger(route.ticket) || route.ticket < 0 || route.ticket > LIMITS.ticket) {
        errors.push(`${route.label}外層籤必須是 0～${LIMITS.ticket} 的安全整數`);
      }
      const viTicketTotal = route.vi.reduce((sum, tier) => sum + tier.ticket, 0);
      if (route.ticket > 0 && (!Number.isSafeInteger(viTicketTotal) || viTicketTotal <= 0)) errors.push(`${route.label}至少要有一個 VI 籤`);
      let routeSpendX = 0;
      let routePayoutX = 0;
      const viRows = route.vi.map((tier) => {
        if (!Number.isSafeInteger(tier.ticket) || tier.ticket < 0 || tier.ticket > LIMITS.ticket) errors.push(`${route.label}／${tier.id} VI 籤不是合法安全整數`);
        if (!(tier.spendX > 0 && tier.spendX <= LIMITS.x)) errors.push(`${route.label}／${tier.id} 核心投入必須大於 0 且不超過 ${LIMITS.x}x`);
        if (!(tier.payoutX >= 0 && tier.payoutX <= LIMITS.x)) errors.push(`${route.label}／${tier.id} 派彩必須介於 0～${LIMITS.x}x`);
        const conditionalProbability = viTicketTotal > 0 ? tier.ticket / viTicketTotal : 0;
        const routeProbability = routeTicketTotal > 0 ? route.ticket / routeTicketTotal : 0;
        const jointProbability = routeProbability * conditionalProbability;
        routeSpendX += conditionalProbability * tier.spendX;
        routePayoutX += conditionalProbability * tier.payoutX;
        expectedSpendX += jointProbability * tier.spendX;
        expectedPayoutX += jointProbability * tier.payoutX;
        const y = tier.payoutX - config.targetCoreRtp * tier.spendX;
        secondMomentY += jointProbability * y * y;
        return { ...tier, conditionalProbability, jointProbability, netX: tier.payoutX - tier.spendX };
      });
      const activePayouts = viRows.filter((tier) => tier.ticket > 0).map((tier) => tier.payoutX);
      if (activePayouts.some((value, index) => index > 0 && value < activePayouts[index - 1])) errors.push(`${route.label} VI 派彩必須由低到高`);
      const routeNetX = routePayoutX - routeSpendX;
      if (routeIndex <= 1 && viRows.some((tier) => tier.ticket > 0 && tier.netX <= 0)) errors.push(`${route.label}啟用中的 VI 必須為淨贏`);
      if (routeIndex >= 3 && viRows.some((tier) => tier.ticket > 0 && tier.netX >= 0)) errors.push(`${route.label}啟用中的 VI 必須為淨輸`);
      return {
        ...route,
        probability: routeTicketTotal > 0 ? route.ticket / routeTicketTotal : 0,
        viTicketTotal,
        expectedSpendX: routeSpendX,
        expectedPayoutX: routePayoutX,
        netX: routeNetX,
        vi: viRows
      };
    });

    const activeRows = rows.filter((route) => route.ticket > 0);
    for (let index = 1; index < activeRows.length; index += 1) {
      if (!(activeRows[index - 1].netX > activeRows[index].netX)) {
        errors.push("五路線平均 CoreNet 必須嚴格保持：贏多＞贏少＞打平＞輸少＞輸多");
        break;
      }
    }
    const coreRtp = expectedSpendX > 0 ? expectedPayoutX / expectedSpendX : NaN;
    const gapPp = Number.isFinite(coreRtp) ? (coreRtp - config.targetCoreRtp) * 100 : NaN;
    // 這裡只是 route×VI 目標摘要的直算；公開 BOSS bucket 的合法上下界會改變
    // 真正可玩的投入／派彩，發布閘門以 projectPlayable() 的 RTP 為準。
    const winProbability = rows.slice(0, 2).reduce((sum, route) => sum + route.probability, 0);
    const loseProbability = rows.slice(3).reduce((sum, route) => sum + route.probability, 0);
    const targetYMean = expectedPayoutX - config.targetCoreRtp * expectedSpendX;
    const sigmaY = Math.sqrt(Math.max(0, secondMomentY - targetYMean * targetYMean));
    return {
      config,
      valid: errors.length === 0,
      errors,
      routeTicketTotal,
      expectedSpendX,
      expectedPayoutX,
      coreRtp,
      gapPp,
      sigmaY,
      winProbability,
      loseProbability,
      winStreak3: winProbability ** 3,
      loseStreak3: loseProbability ** 3,
      winBigStreak3: (rows[0]?.probability || 0) ** 3,
      winBigStreak5: (rows[0]?.probability || 0) ** 5,
      rows
    };
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

  function hashString(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function weightedPick(rows, value) {
    const total = rows.reduce((sum, row) => sum + Math.max(0, row.ticket), 0);
    if (total <= 0) return rows[0];
    let cursor = Math.min(0.999999999999, Math.max(0, value)) * total;
    for (const row of rows) {
      cursor -= Math.max(0, row.ticket);
      if (cursor < 0) return row;
    }
    return rows.at(-1);
  }

  function sample(input, playerId, storyIndex) {
    const config = sanitizeConfig(input);
    const seed = (config.seed ^ hashString(playerId) ^ Math.imul((Number(storyIndex) + 1) >>> 0, 0x9E3779B1)) >>> 0;
    const random = mulberry32(seed);
    const route = weightedPick(config.routes, random());
    const tier = weightedPick(route.vi, random());
    return {
      revision: config.revision,
      routeId: route.id,
      routeLabel: route.label,
      viId: tier.id,
      viLabel: tier.label,
      targetSpendX: tier.spendX,
      targetPayoutX: tier.payoutX,
      seed,
      noise: random()
    };
  }

  function normalizeLegacyConfig(legacyCore, input = {}) {
    if (legacyCore?.sanitizeConfig) return legacyCore.sanitizeConfig(input);
    return {
      entryCostX: Math.max(0, Number(input.entryCostX) || 1),
      drawCostsX: Array.isArray(input.drawCostsX) && input.drawCostsX.length ? input.drawCostsX.map(Number) : [1, 2, 3],
      standardDraws: Math.max(0, Math.trunc(Number(input.standardDraws) || 1))
    };
  }

  function storyEconomics(packet, legacyCore, legacyConfigInput = {}) {
    const legacyConfig = normalizeLegacyConfig(legacyCore, legacyConfigInput);
    const rounds = packet.win ? Math.max(1, packet.targetRound) : Math.max(1, packet.roundLimit);
    let spendX = 0;
    let coinX = 0;
    for (let round = 1; round <= rounds; round += 1) {
      const finalRound = packet.win && round >= packet.targetRound;
      const drawCount = finalRound ? packet.requiredDraws : legacyConfig.standardDraws;
      const magicCards = legacyCore?.magicPlanForRound ? legacyCore.magicPlanForRound(packet, round, packet.hp) : [];
      const freeDraws = magicCards.some((card) => card.key === "freeDraw") && drawCount > 0 ? 1 : 0;
      const paidDraws = Math.max(0, drawCount - freeDraws);
      spendX += legacyConfig.entryCostX;
      for (let draw = 0; draw < paidDraws; draw += 1) {
        const costs = legacyConfig.drawCostsX;
        spendX += Number(costs[Math.min(draw, costs.length - 1)] || 0);
      }
      coinX += magicCards.filter((card) => card.key === "coin").reduce((sum, card) => sum + Number(card.value || 0), 0);
    }
    const diceX = packet.win ? Number(packet.dice?.total || 0) : 0;
    return { spendX, payoutX: packet.win ? diceX + coinX : 0, coinX, rounds };
  }

  function routePenalty(routeId, spendX, payoutX) {
    const netX = payoutX - spendX;
    if (routeId === "WIN_BIG") return netX > 1 ? 0 : 50 + Math.abs(netX - 1);
    if (routeId === "WIN_SMALL") return netX > 0 ? 0 : 35 + Math.abs(netX);
    if (routeId === "PUSH") return 0;
    if (routeId === "LOSE_SMALL") return netX < 0 ? 0 : 35 + Math.abs(netX);
    return netX < 0 ? 0 : 50 + Math.abs(netX);
  }

  const diceOptionCache = new Map();

  function diceOptions(legacyCore, star, stateIndex) {
    const key = `${star}:${stateIndex}`;
    if (diceOptionCache.has(key)) return diceOptionCache.get(key);
    const byTotal = new Map();
    for (let index = 0; index <= 128; index += 1) {
      const quantile = Math.min(0.999999, index / 128);
      const outcome = legacyCore.inverseDiceOutcome(star, stateIndex, quantile, 0x5EED1234);
      if (!byTotal.has(outcome.total)) byTotal.set(outcome.total, { total: outcome.total, quantile });
    }
    const options = [...byTotal.values()].sort((left, right) => left.total - right.total);
    diceOptionCache.set(key, options);
    return options;
  }

  function diceExpectation(legacyCore, packet, desiredDiceX) {
    const options = diceOptions(legacyCore, packet.star, packet.stateIndex);
    if (!options.length) return { expected: 0, lower: null, upper: null, upperProbability: 0 };
    const lower = [...options].reverse().find((option) => option.total <= desiredDiceX) || options[0];
    const upper = options.find((option) => option.total >= desiredDiceX) || options.at(-1);
    if (lower.total === upper.total) return { expected: lower.total, lower, upper, upperProbability: 0 };
    const upperProbability = Math.max(0, Math.min(1, (desiredDiceX - lower.total) / (upper.total - lower.total)));
    return { expected: lower.total * (1 - upperProbability) + upper.total * upperProbability, lower, upper, upperProbability };
  }

  function selectionRandom(selection, salt) {
    const noiseSeed = Math.floor(Math.max(0, Math.min(0.999999999, Number(selection.noise || 0))) * 4294967296) >>> 0;
    return mulberry32(((selection.seed >>> 0) ^ hashString(salt) ^ noiseSeed) >>> 0)();
  }

  function realizeDice(expectation, selection, legacyCore, packet) {
    const option = expectation.upperProbability > 0 && selectionRandom(selection, "dice-mixture") < expectation.upperProbability ? expectation.upper : expectation.lower;
    return {
      outcome: legacyCore.inverseDiceOutcome(packet.star, packet.stateIndex, option.quantile, selection.seed >>> 0),
      option
    };
  }

  function chooseStoryPlan(basePacket, selection, legacyCore, legacyConfigInput = {}) {
    const base = { ...basePacket };
    const targetPayoutX = Math.max(0, Number(selection.targetPayoutX) || 0);
    const roundOptions = Array.from({ length: Math.max(1, base.roundLimit) }, (_unused, index) => index + 1);
    const drawOptions = [0, 1, 2, 3];
    const lossCandidate = { ...base, win: false, targetRound: base.roundLimit, requiredDraws: 0, combatLuck: 0.08 };
    const lossEconomics = storyEconomics(lossCandidate, legacyCore, legacyConfigInput);
    let best = null;

    for (const targetRound of roundOptions) {
      for (const requiredDraws of drawOptions) {
        const candidate = {
          ...base,
          win: true,
          targetRound,
          requiredDraws,
          payoutLuck: 0,
          combatLuck: 0.55 + 0.4 * (1 - targetRound / Math.max(1, base.roundLimit))
        };
        const withoutDice = storyEconomics(candidate, legacyCore, legacyConfigInput);
        const minimumDice = diceOptions(legacyCore, candidate.star, candidate.stateIndex)[0]?.total || 0;
        const minimumWinPayoutX = withoutDice.coinX + minimumDice;
        const winProbability = targetPayoutX <= 0 ? 0 : Math.min(1, targetPayoutX / Math.max(minimumWinPayoutX, 1e-12));
        const conditionalTargetPayoutX = winProbability > 0 ? targetPayoutX / winProbability : minimumWinPayoutX;
        const expectation = diceExpectation(legacyCore, candidate, Math.max(0, conditionalTargetPayoutX - withoutDice.coinX));
        const conditionalWinPayoutX = withoutDice.coinX + expectation.expected;
        const expectedPayoutX = winProbability * conditionalWinPayoutX;
        const expectedSpendX = winProbability * withoutDice.spendX + (1 - winProbability) * lossEconomics.spendX;
        const spendError = Math.abs(expectedSpendX - Number(selection.targetSpendX));
        const payoutError = Math.abs(expectedPayoutX - targetPayoutX);
        const score = spendError * 1.4 + payoutError + routePenalty(selection.routeId, expectedSpendX, expectedPayoutX);
        const tieBreak = targetRound * 10 + requiredDraws;
        if (!best || score < best.score - 1e-12 || (Math.abs(score - best.score) <= 1e-12 && tieBreak < best.tieBreak)) {
          best = {
            candidate,
            lossCandidate,
            economics: { ...withoutDice, spendX: expectedSpendX, payoutX: expectedPayoutX },
            winEconomics: withoutDice,
            lossEconomics,
            expectation,
            winProbability,
            score,
            tieBreak
          };
        }
      }
    }
    if (best.winProbability > 0 && selectionRandom(selection, "win-mixture") < best.winProbability) {
      const realizedDice = realizeDice(best.expectation, selection, legacyCore, best.candidate);
      best.candidate.dice = realizedDice.outcome;
      best.candidate.payoutLuck = realizedDice.option.quantile;
      best.realizedEconomics = storyEconomics(best.candidate, legacyCore, legacyConfigInput);
    } else {
      best.candidate = best.lossCandidate;
      best.realizedEconomics = best.lossEconomics;
    }
    return best;
  }

  const publicScaleCache = new Map();

  function publicCalibrationKey(basePacket, routeConfig, legacyConfig) {
    const routeSignature = routeConfig.routes.map((route) => [
      route.ticket,
      ...route.vi.flatMap((tier) => [tier.ticket, tier.spendX, tier.payoutX])
    ]);
    return [
      basePacket.packetSeed, basePacket.star, basePacket.stateIndex, basePacket.hp, basePacket.roundLimit,
      routeConfig.revision, routeConfig.targetCoreRtp, hashString(JSON.stringify(routeSignature)),
      legacyConfig.entryCostX, legacyConfig.standardDraws, ...legacyConfig.drawCostsX
    ].join(":");
  }

  function publicPayoutScale(basePacket, routeConfigInput, legacyCore, legacyConfigInput = {}) {
    const routeConfig = sanitizeConfig(routeConfigInput || DEFAULT_CONFIG);
    const legacyConfig = normalizeLegacyConfig(legacyCore, legacyConfigInput);
    const key = publicCalibrationKey(basePacket, routeConfig, legacyConfig);
    if (publicScaleCache.has(key)) return publicScaleCache.get(key);
    const routeTotal = routeConfig.routes.reduce((sum, route) => sum + route.ticket, 0);
    let scale = 1;
    // 付款前可見的 Boss 必須各自校準，避免免費切 BET 挑星／HP／回合套利。
    // 固定點修正把離散骰獎混合後的條件 RTP 收回同一目標。
    for (let iteration = 0; iteration < 8; iteration += 1) {
      let spendX = 0;
      let payoutX = 0;
      let cellIndex = 0;
      for (const route of routeConfig.routes) {
        const viTotal = route.vi.reduce((sum, tier) => sum + tier.ticket, 0);
        for (const tier of route.vi) {
          const probability = routeTotal > 0 && viTotal > 0 ? route.ticket / routeTotal * tier.ticket / viTotal : 0;
          if (probability <= 0) continue;
          const calibrationSelection = {
            routeId: route.id,
            targetSpendX: tier.spendX,
            targetPayoutX: tier.payoutX * scale,
            seed: (routeConfig.seed ^ Math.imul(cellIndex + 1, 0x9E3779B1)) >>> 0,
            noise: 0.5
          };
          const plan = chooseStoryPlan(basePacket, calibrationSelection, legacyCore, legacyConfig);
          spendX += probability * plan.economics.spendX;
          payoutX += probability * plan.economics.payoutX;
          cellIndex += 1;
        }
      }
      if (!(spendX > 0 && payoutX > 0)) break;
      scale *= routeConfig.targetCoreRtp * spendX / payoutX;
      scale = Math.max(0.05, Math.min(20, scale));
    }
    publicScaleCache.set(key, scale);
    return scale;
  }

  function applyToPacket(basePacket, selection, legacyCore, legacyConfigInput = {}, routeConfigInput = DEFAULT_CONFIG) {
    const payoutScale = publicPayoutScale(basePacket, routeConfigInput, legacyCore, legacyConfigInput);
    const calibratedSelection = { ...selection, targetPayoutX: selection.targetPayoutX * payoutScale };
    const plan = chooseStoryPlan(basePacket, calibratedSelection, legacyCore, legacyConfigInput);
    const packet = { ...plan.candidate };
    const realized = plan.realizedEconomics || plan.economics;
    packet.dicePrizeX = packet.win ? Number(packet.dice?.total || 0) : 0;
    packet.plannedCoinX = realized.coinX;
    packet.prizeX = realized.payoutX;
    packet.winSpendX = realized.spendX;
    packet.lossSpendX = realized.spendX;
    packet.routeId = selection.routeId;
    packet.routeLabel = selection.routeLabel;
    packet.viId = selection.viId;
    packet.viLabel = selection.viLabel;
    packet.routeRevision = selection.revision;
    packet.storySeed = selection.seed;
    packet.ledgerDecision = "五路線故事已鎖定";
    packet.ledgerProjectedX = realized.payoutX - realized.spendX;
    packet.targetSpendX = selection.targetSpendX;
    packet.targetPayoutX = selection.targetPayoutX;
    packet.publicPayoutScale = payoutScale;
    packet.publicAdjustedTargetPayoutX = calibratedSelection.targetPayoutX;
    packet.storySpendX = realized.spendX;
    packet.storyPayoutX = realized.payoutX;
    packet.storyExpectedSpendX = plan.economics.spendX;
    packet.storyExpectedPayoutX = plan.economics.payoutX;
    packet.storyFitError = plan.score;
    // 五路線的 StoryPool 已經把整段投入／派彩鎖成一個可驗證故事。
    // 若在故事中再插入平手重發，前一手的換牌成本便會落在規劃之外；
    // 因此只對這類受控故事預先排除平手，一般遊戲封包仍保留平手機制。
    packet.noTieStory = true;
    return packet;
  }

  function projectPlayable(input, legacyCore, legacyConfigInput = {}, sampleCount = 64) {
    const summary = calculate(input);
    if (!legacyCore?.buildPersonalCycle || !legacyCore?.inverseDiceOutcome) {
      return { valid: false, error: "缺少 BOSS 骰子核心，無法驗證可玩故事。", cells: [], coreRtp: NaN };
    }
    const legacyConfig = normalizeLegacyConfig(legacyCore, legacyConfigInput);
    const requestedCount = Math.max(8, Math.min(4096, Math.trunc(sampleCount) || 256));
    const packets = [];
    for (let poolIndex = 0; packets.length < requestedCount; poolIndex += 1) {
      const cycle = legacyCore.buildPersonalCycle(legacyConfig, `five-route-story-pool-${poolIndex}`, 0);
      packets.push(...cycle.packets);
    }
    packets.length = requestedCount;
    const count = packets.length;
    const cells = [];
    let expectedSpendX = 0;
    let expectedPayoutX = 0;
    let weightedFitError = 0;
    for (const route of summary.rows) {
      for (const tier of route.vi) {
        let spendX = 0;
        let payoutX = 0;
        let fitError = 0;
        for (let index = 0; index < count; index += 1) {
          const basePacket = packets[(index * 17 + cells.length * 29) % packets.length];
          const selection = {
            revision: summary.config.revision,
            routeId: route.id,
            routeLabel: route.label,
            viId: tier.id,
            viLabel: tier.label,
            targetSpendX: tier.spendX,
            targetPayoutX: tier.payoutX,
            seed: (summary.config.seed ^ hashString(`${route.id}:${tier.id}`) ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0,
            noise: legacyCore.hashUniform(summary.config.seed, cells.length, index + 1)
          };
          const packet = applyToPacket(basePacket, selection, legacyCore, legacyConfig, summary.config);
          spendX += packet.storyExpectedSpendX;
          payoutX += packet.storyExpectedPayoutX;
          fitError += packet.storyFitError;
        }
        const cell = {
          routeId: route.id,
          viId: tier.id,
          jointProbability: tier.jointProbability,
          targetSpendX: tier.spendX,
          targetPayoutX: tier.payoutX,
          spendX: spendX / count,
          payoutX: payoutX / count,
          fitError: fitError / count
        };
        cells.push(cell);
        expectedSpendX += cell.jointProbability * cell.spendX;
        expectedPayoutX += cell.jointProbability * cell.payoutX;
        weightedFitError += cell.jointProbability * cell.fitError;
      }
    }
    const coreRtp = expectedSpendX > 0 ? expectedPayoutX / expectedSpendX : NaN;
    const gapPp = Number.isFinite(coreRtp) ? (coreRtp - summary.config.targetCoreRtp) * 100 : NaN;
    return { valid: summary.valid && Number.isFinite(coreRtp), summary, cells, expectedSpendX, expectedPayoutX, coreRtp, gapPp, weightedFitError, sampleCount: count };
  }

  return {
    STORAGE_KEY,
    CHANNEL_NAME,
    SCHEMA_VERSION,
    LIMITS,
    DEFAULT_CONFIG,
    clone,
    sanitizeConfig,
    calculate,
    sample,
    applyToPacket,
    publicPayoutScale,
    storyEconomics,
    projectPlayable
  };
});
