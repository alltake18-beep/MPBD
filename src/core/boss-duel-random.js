"use strict";

(function attachBossDuelRandom(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BossDuelRandom = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createBossDuelRandom() {
  const sumDistributionCache = new Map();
  const diceOutcomeCache = new Map();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

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
    return (result ^ result >>> 16) >>> 0;
  }

  function bossDiceConfig(star, stateIndex) {
    if (star <= 6) return { normalDice: Math.max(1, star - stateIndex), multiplierDice: stateIndex };
    if (star === 7) return { normalDice: Math.max(1, 6 - stateIndex), multiplierDice: 1 + stateIndex };
    return { normalDice: Math.max(1, 6 - stateIndex), multiplierDice: 2 + stateIndex };
  }

  function diceSumDistribution(count) {
    const key = String(count);
    if (sumDistributionCache.has(key)) return sumDistributionCache.get(key);
    if (count <= 0) return [{ sum: 0, ways: 1 }];
    let counts = new Map([[0, 1]]);
    for (let die = 0; die < count; die += 1) {
      const next = new Map();
      for (const [sum, ways] of counts) for (let face = 1; face <= 6; face += 1) next.set(sum + face, (next.get(sum + face) || 0) + ways);
      counts = next;
    }
    const result = [...counts].map(([sum, ways]) => ({ sum, ways }));
    sumDistributionCache.set(key, result);
    return result;
  }

  function diceOutcomes(normalDice, multiplierDice) {
    const key = `${normalDice}:${multiplierDice}`;
    if (diceOutcomeCache.has(key)) return diceOutcomeCache.get(key);
    const outcomes = [];
    let totalWays = 0;
    for (const normal of diceSumDistribution(normalDice)) {
      for (const multiplier of diceSumDistribution(multiplierDice)) {
        const ways = normal.ways * multiplier.ways;
        outcomes.push({ total: multiplierDice > 0 ? normal.sum * multiplier.sum : normal.sum, normalSum: normal.sum, multiplierSum: multiplier.sum, ways });
        totalWays += ways;
      }
    }
    outcomes.sort((left, right) => left.total - right.total || left.normalSum - right.normalSum || left.multiplierSum - right.multiplierSum);
    const result = { outcomes, totalWays };
    diceOutcomeCache.set(key, result);
    return result;
  }

  function facesForSum(count, targetSum, rng) {
    if (count <= 0) return [];
    const memo = new Map();
    const ways = (left, sum) => {
      const key = `${left}:${sum}`;
      if (memo.has(key)) return memo.get(key);
      if (left === 0) return sum === 0 ? 1 : 0;
      let total = 0;
      for (let face = 1; face <= 6; face += 1) total += ways(left - 1, sum - face);
      memo.set(key, total);
      return total;
    };
    const faces = [];
    let remaining = targetSum;
    for (let left = count; left > 0; left -= 1) {
      const options = [];
      let total = 0;
      for (let face = 1; face <= 6; face += 1) {
        const weight = ways(left - 1, remaining - face);
        if (weight > 0) { options.push({ face, weight }); total += weight; }
      }
      let cursor = rng() * total;
      let selected = options.at(-1);
      for (const option of options) {
        cursor -= option.weight;
        if (cursor < 0) { selected = option; break; }
      }
      faces.push(selected.face);
      remaining -= selected.face;
    }
    return faces;
  }

  function inverseDiceOutcome(star, stateIndex, probability, seed = 1) {
    const dice = bossDiceConfig(star, stateIndex);
    const distribution = diceOutcomes(dice.normalDice, dice.multiplierDice);
    let cursor = clamp(probability, 0, 0.999999999999) * distribution.totalWays;
    let selected = distribution.outcomes.at(-1);
    for (const outcome of distribution.outcomes) {
      cursor -= outcome.ways;
      if (cursor < 0) { selected = outcome; break; }
    }
    const rng = mulberry32(seed);
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

  return { mulberry32, hash32, inverseDiceOutcome };
});
