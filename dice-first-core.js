"use strict";

(function attachBossDuelCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BossDuelCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createBossDuelCore() {
  const STORAGE_KEY = "boss-duel:dice-first:config";
  const CHANNEL_NAME = "boss-duel:dice-first:hot-update";

  const HANDS = [
    { key: "high", label: "高牌", damage: 0 },
    { key: "pair", label: "對子", damage: 1 },
    { key: "twoPair", label: "兩對", damage: 2 },
    { key: "three", label: "三條", damage: 3 },
    { key: "straight", label: "順子", damage: 4 },
    { key: "flush", label: "同花", damage: 5 },
    { key: "fullHouse", label: "葫蘆", damage: 8 },
    { key: "four", label: "四條", damage: 15 },
    { key: "straightFlush", label: "同花順", damage: 30 }
  ];

  const BOSS_ROWS = [
    { star: 1, hpMin: 1, hpMax: 2, roundMin: 1, roundMax: 3, tickets: 50, states: [100, 0, 0, 0] },
    { star: 2, hpMin: 10, hpMax: 18, roundMin: 3, roundMax: 5, tickets: 75, states: [0, 100, 0, 0] },
    { star: 3, hpMin: 16, hpMax: 24, roundMin: 4, roundMax: 6, tickets: 125, states: [0, 100, 0, 0] },
    { star: 4, hpMin: 21, hpMax: 29, roundMin: 5, roundMax: 7, tickets: 200, states: [0, 60, 40, 0] },
    { star: 5, hpMin: 27, hpMax: 36, roundMin: 6, roundMax: 8, tickets: 175, states: [0, 60, 40, 0] },
    { star: 6, hpMin: 40, hpMax: 50, roundMin: 7, roundMax: 9, tickets: 150, states: [0, 60, 40, 0] },
    { star: 7, hpMin: 44, hpMax: 55, roundMin: 7, roundMax: 9, tickets: 125, states: [20, 70, 10, 0] },
    { star: 8, hpMin: 50, hpMax: 60, roundMin: 7, roundMax: 9, tickets: 100, states: [20, 70, 10, 0] }
  ];

  const MAGIC_ROWS = [
    { key: "threeBoost", label: "THREE OF A KIND", tickets: 50, min: 1, max: 3, target: "three", type: "DMG" },
    { key: "fourBoost", label: "QUADS", tickets: 75, min: 1, max: 3, target: "four", type: "DMG" },
    { key: "straightBoost", label: "STRAIGHT", tickets: 125, min: 1, max: 3, target: "straight", type: "DMG" },
    { key: "flushBoost", label: "FLUSH", tickets: 175, min: 1, max: 3, target: "flush", type: "DMG" },
    { key: "fullHouseBoost", label: "FULL HOUSE", tickets: 175, min: 1, max: 3, target: "fullHouse", type: "DMG" },
    { key: "joker", label: "JOKER", tickets: 50, min: 1, max: 1, target: "joker", type: "JOKER" },
    { key: "crit", label: "CRITICAL", tickets: 100, min: 1, max: 5, target: "crit", type: "DMG" },
    { key: "flatDamage", label: "FIXED DMG", tickets: 175, min: 3, max: 6, target: "flat", type: "DMG" },
    { key: "coin", label: "GOLD", tickets: 25, min: 3, max: 6, target: "coin", type: "GOLD" },
    { key: "freeDraw", label: "FREE REDRAW", tickets: 50, min: 1, max: 1, target: "freeDraw", type: "DRAW" }
  ];

  const DEFAULT_CONFIG = Object.freeze({
    revision: 1,
    seed: 20260817,
    targetRtp: 0.96,
    cycleSize: 256,
    coupling: 0.78,
    volatility: 0.72,
    bet: 1,
    entryCostX: 1,
    drawCostsX: [1, 2, 3],
    standardDraws: 1,
    starWeights: BOSS_ROWS.map((row) => row.tickets),
    hpScale: 1,
    modelName: "Dice-First 個人帶"
  });

  const sumDistributionCache = new Map();
  const diceOutcomeCache = new Map();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function integer(value, fallback, min, max) {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  }

  function sanitizeConfig(input = {}) {
    const merged = { ...DEFAULT_CONFIG, ...input };
    const weights = Array.from({ length: 8 }, (_, index) => {
      const value = Number(merged.starWeights?.[index]);
      const baseline = DEFAULT_CONFIG.starWeights[index];
      return Number.isFinite(value) ? clamp(value, baseline * 0.6, baseline * 1.4) : baseline;
    });
    const drawCosts = Array.from({ length: 3 }, (_, index) => {
      const value = Number(merged.drawCostsX?.[index]);
      return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CONFIG.drawCostsX[index];
    });
    return {
      revision: integer(merged.revision, 1, 1, 999999999),
      seed: integer(merged.seed, DEFAULT_CONFIG.seed, 0, 0xffffffff) >>> 0,
      targetRtp: clamp(merged.targetRtp, 0.5, 1.2),
      cycleSize: integer(merged.cycleSize, DEFAULT_CONFIG.cycleSize, 64, 2048),
      coupling: clamp(merged.coupling, 0.6, 0.99),
      volatility: clamp(merged.volatility, 0, 1),
      bet: clamp(merged.bet, 0.01, 100000),
      entryCostX: clamp(merged.entryCostX, 0.01, 100),
      drawCostsX: drawCosts,
      standardDraws: integer(merged.standardDraws, 1, 0, 3),
      starWeights: weights,
      hpScale: clamp(merged.hpScale, 0.5, 2),
      modelName: String(merged.modelName || DEFAULT_CONFIG.modelName)
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

  function hash32(seed, value, salt = 0) {
    let result = (seed ^ Math.imul((value + 1) >>> 0, 0x9E3779B1) ^ Math.imul((salt + 17) >>> 0, 0x85EBCA77)) >>> 0;
    result ^= result >>> 16;
    result = Math.imul(result, 0x7FEB352D);
    result ^= result >>> 15;
    result = Math.imul(result, 0x846CA68B);
    result ^= result >>> 16;
    return result >>> 0;
  }

  function hashUniform(seed, value, salt = 0) {
    return (hash32(seed, value, salt) + 0.5) / 4294967296;
  }

  function normalInv(probability) {
    const p = clamp(probability, 1e-12, 1 - 1e-12);
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const low = 0.02425;
    const high = 1 - low;
    if (p < low) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > high) {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function erf(value) {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }

  function normalCdf(value) {
    return 0.5 * (1 + erf(value / Math.SQRT2));
  }

  function correlatedUniform(primaryU, independentU, rho) {
    const z = clamp(rho, 0, 0.99) * normalInv(primaryU) + Math.sqrt(1 - rho * rho) * normalInv(independentU);
    return clamp(normalCdf(z), 1e-9, 1 - 1e-9);
  }

  function weightedIndex(weights, u) {
    const total = weights.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (total <= 0) return 0;
    let cursor = clamp(u, 0, 0.999999999999) * total;
    for (let index = 0; index < weights.length; index += 1) {
      cursor -= Math.max(0, Number(weights[index]) || 0);
      if (cursor < 0) return index;
    }
    return weights.length - 1;
  }

  function bossDiceConfig(star, stateIndex) {
    if (star <= 6) return { normalDice: Math.max(1, star - stateIndex), multiplierDice: stateIndex };
    if (star === 7) return { normalDice: Math.max(1, 6 - stateIndex), multiplierDice: 1 + stateIndex };
    return { normalDice: Math.max(1, 6 - stateIndex), multiplierDice: 2 + stateIndex };
  }

  function diceSumDistribution(count) {
    const key = String(count);
    if (sumDistributionCache.has(key)) return sumDistributionCache.get(key);
    if (count <= 0) {
      const empty = [{ sum: 0, ways: 1 }];
      sumDistributionCache.set(key, empty);
      return empty;
    }
    let counts = new Map([[0, 1]]);
    for (let die = 0; die < count; die += 1) {
      const next = new Map();
      for (const [sum, ways] of counts.entries()) {
        for (let face = 1; face <= 6; face += 1) next.set(sum + face, (next.get(sum + face) || 0) + ways);
      }
      counts = next;
    }
    const result = [...counts.entries()].map(([sum, ways]) => ({ sum, ways }));
    sumDistributionCache.set(key, result);
    return result;
  }

  function diceOutcomes(normalDice, multiplierDice) {
    const key = `${normalDice}:${multiplierDice}`;
    if (diceOutcomeCache.has(key)) return diceOutcomeCache.get(key);
    const normal = diceSumDistribution(normalDice);
    const multiplier = diceSumDistribution(multiplierDice);
    const outcomes = [];
    let totalWays = 0;
    for (const left of normal) {
      for (const right of multiplier) {
        const ways = left.ways * right.ways;
        const total = multiplierDice > 0 ? left.sum * right.sum : left.sum;
        outcomes.push({ total, normalSum: left.sum, multiplierSum: right.sum, ways });
        totalWays += ways;
      }
    }
    outcomes.sort((a, b) => a.total - b.total || a.normalSum - b.normalSum || a.multiplierSum - b.multiplierSum);
    const result = { outcomes, totalWays };
    diceOutcomeCache.set(key, result);
    return result;
  }

  function facesForSum(count, targetSum, rng) {
    if (count <= 0) return [];
    const memo = new Map();
    function ways(left, sum) {
      const key = `${left}:${sum}`;
      if (memo.has(key)) return memo.get(key);
      if (left === 0) return sum === 0 ? 1 : 0;
      let total = 0;
      for (let face = 1; face <= 6; face += 1) total += ways(left - 1, sum - face);
      memo.set(key, total);
      return total;
    }
    const faces = [];
    let remaining = targetSum;
    for (let left = count; left > 0; left -= 1) {
      const options = [];
      let total = 0;
      for (let face = 1; face <= 6; face += 1) {
        const weight = ways(left - 1, remaining - face);
        if (weight > 0) {
          options.push({ face, weight });
          total += weight;
        }
      }
      let cursor = rng() * total;
      let selected = options[options.length - 1];
      for (const option of options) {
        cursor -= option.weight;
        if (cursor < 0) {
          selected = option;
          break;
        }
      }
      faces.push(selected.face);
      remaining -= selected.face;
    }
    return faces;
  }

  function inverseDiceOutcome(star, stateIndex, u, seed = 1) {
    const dice = bossDiceConfig(star, stateIndex);
    const distribution = diceOutcomes(dice.normalDice, dice.multiplierDice);
    let cursor = clamp(u, 0, 0.999999999999) * distribution.totalWays;
    let selected = distribution.outcomes[distribution.outcomes.length - 1];
    for (const outcome of distribution.outcomes) {
      cursor -= outcome.ways;
      if (cursor < 0) {
        selected = outcome;
        break;
      }
    }
    const rng = mulberry32(seed >>> 0);
    return {
      ...dice,
      normalFaces: facesForSum(dice.normalDice, selected.normalSum, rng),
      multiplierFaces: facesForSum(dice.multiplierDice, selected.multiplierSum, rng),
      normalSum: selected.normalSum,
      multiplierSum: selected.multiplierSum,
      total: selected.total,
      maxTotal: dice.normalDice * 6 * (dice.multiplierDice > 0 ? dice.multiplierDice * 6 : 1)
    };
  }

  function expectedDiceX(star, stateIndex) {
    const dice = bossDiceConfig(star, stateIndex);
    return dice.multiplierDice > 0
      ? dice.normalDice * 3.5 * dice.multiplierDice * 3.5
      : dice.normalDice * 3.5;
  }

  function naturalMagicPlan(packetSeed, roundNumber) {
    const rng = mulberry32(hash32(packetSeed, roundNumber, 1301));
    const pool = MAGIC_ROWS.map((row) => ({ ...row }));
    const cards = [];
    for (let draw = 0; draw < 2; draw += 1) {
      const active = pool.filter((row) => row.tickets > 0);
      const index = weightedIndex(active.map((row) => row.tickets), rng());
      const row = active[index];
      cards.push({
        ...row,
        value: row.min + Math.floor(rng() * (row.max - row.min + 1)),
        effectSlot: Math.floor(rng() * 6)
      });
      pool.find((candidate) => candidate.key === row.key).tickets = 0;
    }
    return cards;
  }

  function magicPlanForRound(packet, roundNumber, hpLeft = packet.hp) {
    const finalWindow = packet.win && roundNumber >= packet.targetRound;
    if (!finalWindow) return naturalMagicPlan(packet.packetSeed, roundNumber);
    const routeIndex = (packet.packetSeed + roundNumber) % 3;
    if (routeIndex === 0) {
      const cards = naturalMagicPlan(packet.packetSeed, roundNumber).map((card) => ({ ...card }));
      const neededCrit = Math.max(1, Math.min(5, Math.ceil(hpLeft / HANDS[8].damage)));
      const critIndex = cards.findIndex((card) => card.key === "crit");
      const guaranteedCrit = {
        ...MAGIC_ROWS.find((card) => card.key === "crit"),
        value: Math.max(neededCrit, Number(cards[critIndex]?.value || 0)),
        effectSlot: 0
      };
      if (critIndex >= 0) cards[critIndex] = guaranteedCrit;
      else cards[0] = guaranteedCrit;
      return cards;
    }
    if (routeIndex === 1) {
      const crit = Math.max(1, Math.min(5, Math.ceil(hpLeft / 15)));
      return [
        { ...MAGIC_ROWS.find((card) => card.key === "crit"), value: crit, effectSlot: 0 },
        { ...MAGIC_ROWS.find((card) => card.key === "fourBoost"), value: 1, effectSlot: 1 }
      ];
    }
    const needed = Math.max(2, Math.min(8, Math.ceil(hpLeft / 8)));
    const boost = Math.max(1, Math.min(3, needed - 1));
    const crit = Math.max(1, Math.min(5, needed - boost));
    return [
      { ...MAGIC_ROWS.find((card) => card.key === "crit"), value: crit, effectSlot: 0 },
      { ...MAGIC_ROWS.find((card) => card.key === "fullHouseBoost"), value: boost, effectSlot: 1 }
    ];
  }

  function plannedRoundSpendX(config, magicCards, drawCount) {
    const freeDraws = magicCards.some((card) => card.key === "freeDraw") && drawCount > 0 ? 1 : 0;
    const paidDraws = Math.max(0, drawCount - freeDraws);
    const drawSpend = Array.from({ length: paidDraws }, (_, index) =>
      config.drawCostsX[Math.min(index, config.drawCostsX.length - 1)] || 0
    ).reduce((sum, value) => sum + value, 0);
    return config.entryCostX + drawSpend;
  }

  function buildRawPackets(configInput, playerSeed, epoch = 0) {
    const config = sanitizeConfig(configInput);
    const count = config.cycleSize;
    const epochSeed = hash32(config.seed ^ playerSeed, epoch, 911);
    const packets = [];
    for (let index = 0; index < count; index += 1) {
      const payoutLuck = (index + 0.5) / count;
      const starLuck = correlatedUniform(payoutLuck, hashUniform(epochSeed, index, 31), config.coupling);
      const starIndex = weightedIndex(config.starWeights, starLuck);
      const row = BOSS_ROWS[starIndex];
      const stateIndex = weightedIndex(row.states, hashUniform(epochSeed, index, 37));
      const dice = inverseDiceOutcome(row.star, stateIndex, payoutLuck, hash32(epochSeed, index, 41));
      const noiseU = hashUniform(epochSeed, index, 43);
      const combatLuck = correlatedUniform(payoutLuck, noiseU, config.coupling);
      const hpRange = Math.max(0, row.hpMax - row.hpMin);
      const roundRange = Math.max(0, row.roundMax - row.roundMin);
      const hp = Math.max(1, Math.round((row.hpMin + Math.floor(hashUniform(epochSeed, index, 47) * (hpRange + 1))) * config.hpScale));
      const roundLimit = row.roundMin + Math.floor(hashUniform(epochSeed, index, 53) * (roundRange + 1));
      const requiredDraws = combatLuck > 0.88 ? 0 : combatLuck > 0.58 ? 1 : combatLuck > 0.3 ? 2 : 3;
      const targetRound = Math.min(roundLimit, combatLuck > 0.86 ? 1 : combatLuck > 0.62 ? 2 : 3);
      const packetSeed = hash32(epochSeed, index, 59);
      const winPlanPacket = { win: true, targetRound, packetSeed, hp };
      const plannedCoinX = Array.from({ length: targetRound }, (_, roundIndex) =>
        magicPlanForRound(winPlanPacket, roundIndex + 1, hp)
          .filter((card) => card.key === "coin")
          .reduce((sum, card) => sum + card.value, 0)
      ).reduce((sum, value) => sum + value, 0);
      const lossPlanPacket = { win: false, targetRound, packetSeed, hp };
      const winSpendX = Array.from({ length: targetRound }, (_, roundIndex) => {
        const roundNumber = roundIndex + 1;
        const drawCount = roundNumber === targetRound ? requiredDraws : config.standardDraws;
        return plannedRoundSpendX(config, magicPlanForRound(winPlanPacket, roundNumber, hp), drawCount);
      }).reduce((sum, value) => sum + value, 0);
      const lossSpendX = Array.from({ length: roundLimit }, (_, roundIndex) =>
        plannedRoundSpendX(config, magicPlanForRound(lossPlanPacket, roundIndex + 1, hp), config.standardDraws)
      ).reduce((sum, value) => sum + value, 0);
      packets.push({
        sourceIndex: index,
        payoutLuck,
        combatLuck,
        score: config.coupling * payoutLuck + (1 - config.coupling) * combatLuck,
        star: row.star,
        stateIndex,
        stateKey: ["A", "B", "C", "D"][stateIndex],
        hp,
        roundLimit,
        requiredDraws,
        targetRound,
        winSpendX,
        lossSpendX,
        dice,
        dicePrizeX: dice.total,
        plannedCoinX,
        prizeX: dice.total + plannedCoinX,
        win: false,
        packetSeed
      });
    }
    return packets;
  }

  function calibratePackets(rawPackets, configInput) {
    const config = sanitizeConfig(configInput);
    const ranked = [...rawPackets].sort((a, b) => b.score - a.score || b.prizeX - a.prizeX);
    let payout = 0;
    let spend = rawPackets.reduce((sum, packet) => sum + packet.lossSpendX, 0);
    let best = { count: 0, error: Math.abs(config.targetRtp), payout, spend };
    for (let index = 0; index < ranked.length; index += 1) {
      const packet = ranked[index];
      payout += packet.prizeX;
      spend += packet.winSpendX - packet.lossSpendX;
      const rtp = payout / Math.max(spend, 1e-9);
      const error = Math.abs(rtp - config.targetRtp);
      if (error < best.error) best = { count: index + 1, error, payout, spend };
      if (rtp > config.targetRtp * 1.3 && index > best.count + 12) break;
    }
    const winners = new Set(ranked.slice(0, best.count).map((packet) => packet.sourceIndex));
    const effect = (packet) => packet.prizeX - config.targetRtp * (packet.winSpendX - packet.lossSpendX);
    let balance = best.payout - config.targetRtp * best.spend;
    for (let pass = 0; pass < 3; pass += 1) {
      const selected = ranked.filter((packet) => winners.has(packet.sourceIndex));
      const unselected = ranked.filter((packet) => !winners.has(packet.sourceIndex));
      let move = null;
      let moveError = Math.abs(balance);
      for (const packet of selected) {
        const error = Math.abs(balance - effect(packet));
        if (error + 1e-12 < moveError) {
          move = { remove: packet, add: null, balance: balance - effect(packet) };
          moveError = error;
        }
      }
      for (const packet of unselected) {
        const error = Math.abs(balance + effect(packet));
        if (error + 1e-12 < moveError) {
          move = { remove: null, add: packet, balance: balance + effect(packet) };
          moveError = error;
        }
      }
      for (const remove of selected) {
        for (const add of unselected) {
          const nextBalance = balance - effect(remove) + effect(add);
          const error = Math.abs(nextBalance);
          if (error + 1e-12 < moveError) {
            move = { remove, add, balance: nextBalance };
            moveError = error;
          }
        }
      }
      if (!move) break;
      if (move.remove) winners.delete(move.remove.sourceIndex);
      if (move.add) winners.add(move.add.sourceIndex);
      balance = move.balance;
    }
    for (const packet of rawPackets) packet.win = winners.has(packet.sourceIndex);
    const finalPayout = rawPackets.reduce((sum, packet) => sum + (packet.win ? packet.prizeX : 0), 0);
    const finalSpend = rawPackets.reduce((sum, packet) => sum + (packet.win ? packet.winSpendX : packet.lossSpendX), 0);
    return {
      payoutX: finalPayout,
      spendX: finalSpend,
      rtp: finalPayout / Math.max(finalSpend, 1e-9),
      error: Math.abs(finalPayout / Math.max(finalSpend, 1e-9) - config.targetRtp),
      winnerCount: winners.size
    };
  }

  function orderPackets(rawPackets, configInput, seed) {
    const config = sanitizeConfig(configInput);
    const winners = rawPackets.filter((packet) => packet.win);
    const losers = rawPackets.filter((packet) => !packet.win);
    const rng = mulberry32(seed >>> 0);
    for (const list of [winners, losers]) {
      for (let index = list.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(rng() * (index + 1));
        [list[index], list[swap]] = [list[swap], list[index]];
      }
    }
    const ordered = [];
    let currentWin = rng() < winners.length / Math.max(1, rawPackets.length);
    const sameChance = 0.48 + config.volatility * 0.44;
    while (winners.length || losers.length) {
      let source = currentWin ? winners : losers;
      if (!source.length) source = currentWin ? losers : winners;
      ordered.push(source.pop());
      if (rng() > sameChance) currentWin = !currentWin;
      if (currentWin && !winners.length) currentWin = false;
      if (!currentWin && !losers.length) currentWin = true;
    }
    return ordered.map((packet, cycleIndex) => ({ ...packet, cycleIndex }));
  }

  function buildPersonalCycle(configInput, playerId = "demo-player", epoch = 0) {
    const config = sanitizeConfig(configInput);
    let playerSeed = config.seed;
    for (let index = 0; index < String(playerId).length; index += 1) playerSeed = hash32(playerSeed, String(playerId).charCodeAt(index), index);
    const rawPackets = buildRawPackets(config, playerSeed, epoch);
    const calibration = calibratePackets(rawPackets, config);
    const packets = orderPackets(rawPackets, config, hash32(playerSeed, epoch, 977));
    return { config, playerId, playerSeed, epoch, packets, calibration };
  }

  function plannedSpendX(packet) {
    return packet.win ? packet.winSpendX : packet.lossSpendX;
  }

  function personalPoolBalance(ledger = {}) {
    const targetCreditX = Number(ledger.targetCreditX) || 0;
    const payoutX = Number(ledger.payoutX) || 0;
    return targetCreditX - payoutX;
  }

  function betLedger(ledger = {}, bet = 1) {
    const key = String(Math.max(0.01, Number(bet) || 1));
    if (!ledger.betLedgers || typeof ledger.betLedgers !== "object") ledger.betLedgers = {};
    if (!ledger.betLedgers[key] || typeof ledger.betLedgers[key] !== "object") {
      ledger.betLedgers[key] = { spendX: 0, payoutX: 0, targetCreditX: 0 };
    }
    return ledger.betLedgers[key];
  }

  function resolvePacketForLedger(basePacket, ledger = {}, configInput = {}, bet = 1, sequence = 0) {
    const config = sanitizeConfig(configInput);
    const stake = Math.max(0.01, Number(bet) || config.bet);
    const referenceStake = Math.max(0.01, Number(ledger.referenceBet) || stake);
    const balanceBefore = personalPoolBalance(ledger);
    const winSpend = basePacket.winSpendX * stake;
    const lossSpend = basePacket.lossSpendX * stake;
    const prize = basePacket.prizeX * stake;
    const projectedLossBalance = balanceBefore + config.targetRtp * lossSpend;
    const projectedWinBalance = balanceBefore + config.targetRtp * winSpend - prize;

    // A bounded low-frequency target gives Slot-like climbs and drops while the
    // error-feedback decision keeps each active player's long-run balance bounded.
    const period = 8 + Math.round(config.volatility * 20);
    const phase = hashUniform(basePacket.packetSeed, 1703, config.seed) * period;
    const wave = Math.sin((Number(sequence) + phase) * Math.PI * 2 / period);
    // The credit floor stays locked to the first real stake, while the visible
    // swing band uses the smaller of first/current stakes. A player who drops
    // from a huge stake to a tiny one must not leave a huge positive pool parked
    // inside what the controller considers normal Slot variance.
    const bandStake = Math.min(referenceStake, stake);
    const waveBand = Math.min(prize * 0.22, bandStake * (6 + config.volatility * 42)) * config.volatility;
    const trajectoryBalance = wave * waveBand;
    const lossDistance = Math.abs(projectedLossBalance - trajectoryBalance);
    const winDistance = Math.abs(projectedWinBalance - trajectoryBalance);
    const epsilon = Math.max(1e-9, stake * 0.005);
    const creditLimit = referenceStake * (24 + config.volatility * 100);
    const winAffordable = projectedWinBalance >= -creditLimit;
    const win = winAffordable && (Math.abs(winDistance - lossDistance) <= epsilon ? Boolean(basePacket.win) : winDistance < lossDistance);

    return {
      ...basePacket,
      win,
      ledgerControlled: true,
      ledgerBalanceBeforeX: balanceBefore,
      ledgerTrajectoryX: trajectoryBalance,
      ledgerCreditFloorX: -creditLimit,
      ledgerProjectedX: win ? projectedWinBalance : projectedLossBalance,
      ledgerDecision: win ? "RETURN" : "BUILD"
    };
  }

  function pearson(valuesA, valuesB) {
    const count = Math.min(valuesA.length, valuesB.length);
    if (!count) return 0;
    const avgA = valuesA.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
    const avgB = valuesB.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
    let numerator = 0;
    let denominatorA = 0;
    let denominatorB = 0;
    for (let index = 0; index < count; index += 1) {
      const deltaA = valuesA[index] - avgA;
      const deltaB = valuesB[index] - avgB;
      numerator += deltaA * deltaB;
      denominatorA += deltaA * deltaA;
      denominatorB += deltaB * deltaB;
    }
    return numerator / Math.sqrt(Math.max(denominatorA * denominatorB, 1e-12));
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const position = (sorted.length - 1) * clamp(p, 0, 1);
    const left = Math.floor(position);
    const right = Math.ceil(position);
    const weight = position - left;
    return sorted[left] * (1 - weight) + sorted[right] * weight;
  }

  function simulatePlayers(configInput, playerCount = 100, cyclesPerPlayer = 1) {
    const config = sanitizeConfig(configInput);
    const count = integer(playerCount, 100, 1, 2000);
    const cycles = integer(cyclesPerPlayer, 1, 1, 20);
    const playerRtps = [];
    const allPackets = [];
    const convergenceSpend = Array(config.cycleSize).fill(0);
    const convergencePayout = Array(config.cycleSize).fill(0);
    let totalSpendX = 0;
    let totalPayoutX = 0;
    let kills = 0;
    let quickKills = 0;
    for (let player = 0; player < count; player += 1) {
      let playerSpend = 0;
      let playerPayout = 0;
      for (let epoch = 0; epoch < cycles; epoch += 1) {
        const cycle = buildPersonalCycle(config, `sim-${player}`, epoch);
        let runningSpend = 0;
        let runningPayout = 0;
        for (let index = 0; index < cycle.packets.length; index += 1) {
          const packet = cycle.packets[index];
          const spend = plannedSpendX(packet);
          const payout = packet.win ? packet.prizeX : 0;
          playerSpend += spend;
          playerPayout += payout;
          runningSpend += spend;
          runningPayout += payout;
          if (epoch === 0) {
            convergenceSpend[index] += runningSpend;
            convergencePayout[index] += runningPayout;
          }
          allPackets.push(packet);
          if (packet.win) {
            kills += 1;
            if (packet.targetRound === 1) quickKills += 1;
          }
        }
      }
      totalSpendX += playerSpend;
      totalPayoutX += playerPayout;
      playerRtps.push(playerPayout / Math.max(playerSpend, 1e-9));
    }
    playerRtps.sort((a, b) => a - b);
    const winningPackets = allPackets.filter((packet) => packet.win);
    const quick = winningPackets.filter((packet) => packet.targetRound === 1);
    const slow = winningPackets.filter((packet) => packet.targetRound > 1);
    const meanPrize = (list) => list.reduce((sum, packet) => sum + packet.prizeX, 0) / Math.max(1, list.length);
    const convergence = convergenceSpend.map((spend, index) => ({
      n: index + 1,
      rtp: convergencePayout[index] / Math.max(spend, 1e-9)
    }));
    return {
      config,
      playerCount: count,
      cyclesPerPlayer: cycles,
      totalSpendX,
      totalPayoutX,
      rtp: totalPayoutX / Math.max(totalSpendX, 1e-9),
      killRate: kills / Math.max(allPackets.length, 1),
      quickKillRate: quickKills / Math.max(kills, 1),
      playerRtps,
      p10: percentile(playerRtps, 0.1),
      p50: percentile(playerRtps, 0.5),
      p90: percentile(playerRtps, 0.9),
      quickPrizeAvg: meanPrize(quick),
      slowPrizeAvg: meanPrize(slow),
      spendPrizeCorrelation: pearson(winningPackets.map(plannedSpendX), winningPackets.map((packet) => packet.prizeX)),
      luckPrizeCorrelation: pearson(winningPackets.map((packet) => packet.combatLuck), winningPackets.map((packet) => packet.prizeX)),
      convergence,
      allPackets
    };
  }

  function simulateLedgerPlayers(configInput, playerCount = 100, bossCount = 256) {
    const config = sanitizeConfig(configInput);
    const count = integer(playerCount, 100, 1, 2000);
    const bosses = integer(bossCount, config.cycleSize, 16, 8192);
    const playerRtps = [];
    const allPackets = [];
    const convergenceSpend = Array(bosses).fill(0);
    const convergencePayout = Array(bosses).fill(0);
    let totalSpendX = 0;
    let totalPayoutX = 0;
    let kills = 0;
    let quickKills = 0;
    for (let player = 0; player < count; player += 1) {
      const profile = player % 3;
      const ledger = { targetCreditX: 0, payoutX: 0 };
      let playerSpend = 0;
      let playerPayout = 0;
      let cycle = null;
      for (let sequence = 0; sequence < bosses; sequence += 1) {
        const epoch = Math.floor(sequence / config.cycleSize);
        const cycleIndex = sequence % config.cycleSize;
        if (!cycle || cycle.epoch !== epoch) cycle = buildPersonalCycle(config, `ledger-sim-${player}`, epoch);
        const packet = resolvePacketForLedger(cycle.packets[cycleIndex], ledger, config, config.bet, sequence);
        const acceptsReturn = hashUniform(packet.packetSeed, player, sequence + 1901) > 0.2;
        let actualSpendX;
        let actualPayoutX = 0;
        if (profile === 0) {
          actualSpendX = packet.win ? packet.winSpendX : packet.lossSpendX;
          actualPayoutX = packet.win ? packet.prizeX : 0;
        } else if (profile === 1) {
          actualSpendX = packet.win && acceptsReturn ? packet.winSpendX : config.entryCostX;
          actualPayoutX = packet.win && acceptsReturn ? packet.prizeX : 0;
        } else {
          const extraSpendX = config.drawCostsX[sequence % config.drawCostsX.length] || 0;
          actualSpendX = (packet.win ? packet.winSpendX : packet.lossSpendX) + extraSpendX;
          actualPayoutX = packet.win ? packet.prizeX : 0;
        }
        actualSpendX *= config.bet;
        actualPayoutX *= config.bet;
        playerSpend += actualSpendX;
        playerPayout += actualPayoutX;
        ledger.targetCreditX += actualSpendX * config.targetRtp;
        ledger.payoutX += actualPayoutX;
        convergenceSpend[sequence] += playerSpend;
        convergencePayout[sequence] += playerPayout;
        const paidWin = actualPayoutX > 0;
        if (paidWin) {
          kills += 1;
          if (packet.targetRound === 1) quickKills += 1;
        }
        allPackets.push({ ...packet, actualSpendX, actualPayoutX, paidWin, profile });
      }
      totalSpendX += playerSpend;
      totalPayoutX += playerPayout;
      playerRtps.push(playerPayout / Math.max(playerSpend, 1e-9));
    }
    playerRtps.sort((a, b) => a - b);
    const winningPackets = allPackets.filter((packet) => packet.paidWin);
    const quick = winningPackets.filter((packet) => packet.targetRound === 1);
    const slow = winningPackets.filter((packet) => packet.targetRound > 1);
    const meanPrize = (list) => list.reduce((sum, packet) => sum + packet.actualPayoutX / config.bet, 0) / Math.max(1, list.length);
    const meanSpend = (list) => list.reduce((sum, packet) => sum + packet.actualSpendX / config.bet, 0) / Math.max(1, list.length);
    const meanNet = (list) => list.reduce((sum, packet) => sum + (packet.actualPayoutX - packet.actualSpendX) / config.bet, 0) / Math.max(1, list.length);
    const convergence = convergenceSpend.map((spend, index) => ({
      n: index + 1,
      rtp: convergencePayout[index] / Math.max(spend, 1e-9)
    }));
    return {
      config,
      playerCount: count,
      bossCount: bosses,
      totalSpendX,
      totalPayoutX,
      rtp: totalPayoutX / Math.max(totalSpendX, 1e-9),
      killRate: kills / Math.max(allPackets.length, 1),
      quickKillRate: quickKills / Math.max(kills, 1),
      playerRtps,
      p10: percentile(playerRtps, 0.1),
      p50: percentile(playerRtps, 0.5),
      p90: percentile(playerRtps, 0.9),
      quickPrizeAvg: meanPrize(quick),
      slowPrizeAvg: meanPrize(slow),
      quickSpendAvg: meanSpend(quick),
      slowSpendAvg: meanSpend(slow),
      quickNetAvg: meanNet(quick),
      slowNetAvg: meanNet(slow),
      spendPrizeCorrelation: pearson(winningPackets.map((packet) => packet.actualSpendX), winningPackets.map((packet) => packet.actualPayoutX)),
      luckPrizeCorrelation: pearson(winningPackets.map((packet) => packet.combatLuck), winningPackets.map((packet) => packet.actualPayoutX)),
      convergence,
      allPackets,
      adaptive: true
    };
  }

  function handCards(rank, seed = 1) {
    const suit = ["♠", "♥", "♦", "♣"];
    const presets = [
      [[14,0],[13,1],[9,2],[7,3],[4,0],[2,1]],
      [[10,0],[10,1],[14,2],[8,3],[5,0],[2,2]],
      [[11,0],[11,2],[7,1],[7,3],[14,0],[3,1]],
      [[9,0],[9,1],[9,2],[14,3],[6,0],[2,1]],
      [[6,0],[7,1],[8,2],[9,3],[10,0],[14,1]],
      [[14,2],[11,2],[9,2],[6,2],[3,2],[8,0]],
      [[12,0],[12,1],[12,2],[8,0],[8,3],[3,1]],
      [[7,0],[7,1],[7,2],[7,3],[14,0],[4,1]],
      [[9,1],[10,1],[11,1],[12,1],[13,1],[2,0]]
    ];
    const chosen = presets[integer(rank, 0, 0, 8)].map((card) => [...card]);
    const rotate = hash32(seed, rank, 71) % 4;
    return chosen.map(([value, suitIndex], index) => ({
      value,
      label: value <= 10 ? String(value) : ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[value],
      suit: suit[(suitIndex + rotate) % 4]
    }));
  }

  function roundPresentation(packet, roundNumber, draws, hpLeft) {
    const finalWindow = packet.win && roundNumber >= packet.targetRound;
    const drawReady = draws >= packet.requiredDraws;
    let playerRank = Math.min(7, Math.floor(packet.combatLuck * 6) + Math.min(draws, 2));
    let bossRank = Math.min(7, 2 + Math.floor((1 - packet.combatLuck) * 5));
    let crit = 1;
    let flat = 0;
    let playerWins = playerRank > bossRank;
    if (finalWindow && drawReady) {
      playerRank = packet.payoutLuck > 0.985 ? 8 : 7;
      bossRank = Math.min(6, Math.max(2, playerRank - 1));
      playerWins = true;
      crit = playerRank === 8 ? 1 : Math.min(5, Math.max(1, Math.ceil(hpLeft / HANDS[playerRank].damage)));
      if (HANDS[playerRank].damage * crit < hpLeft) playerRank = 8;
    } else if (!packet.win && roundNumber === packet.roundLimit) {
      playerWins = false;
      bossRank = Math.max(bossRank, playerRank + 1);
    }
    if (!playerWins && bossRank === playerRank) bossRank = Math.min(8, bossRank + 1);
    const rawDamage = playerWins ? HANDS[playerRank].damage * crit + flat : 0;
    const damage = Math.min(hpLeft, rawDamage);
    return {
      playerRank,
      bossRank: Math.min(8, bossRank),
      playerHand: HANDS[playerRank],
      bossHand: HANDS[Math.min(8, bossRank)],
      playerCards: handCards(playerRank, packet.packetSeed + roundNumber * 17 + draws),
      bossCards: handCards(Math.min(8, bossRank), packet.packetSeed + roundNumber * 23),
      crit,
      flat,
      playerWins,
      damage,
      kills: damage >= hpLeft && hpLeft > 0,
      recommendation: finalWindow ? Math.max(0, packet.requiredDraws - draws) : Math.max(0, 1 - draws)
    };
  }

  function bossRow(star) {
    return BOSS_ROWS.find((row) => row.star === Number(star)) || BOSS_ROWS[0];
  }

  return {
    STORAGE_KEY,
    CHANNEL_NAME,
    HANDS,
    BOSS_ROWS,
    DEFAULT_CONFIG,
    sanitizeConfig,
    mulberry32,
    hash32,
    hashUniform,
    bossDiceConfig,
    inverseDiceOutcome,
    expectedDiceX,
    magicPlanForRound,
    buildPersonalCycle,
    plannedSpendX,
    personalPoolBalance,
    betLedger,
    resolvePacketForLedger,
    simulatePlayers,
    simulateLedgerPlayers,
    roundPresentation,
    handCards,
    bossRow,
    pearson,
    percentile
  };
});
