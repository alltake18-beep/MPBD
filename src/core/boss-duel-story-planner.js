"use strict";

(function attachBossDuelStoryPlanner(root, factory) {
  const Rules = root.BossDuelRules || (
    typeof module === "object" && module.exports && typeof require === "function"
      ? require("./boss-duel-rules.js")
      : null
  );
  const api = factory(Rules);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BossDuelStoryPlanner = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createBossDuelStoryPlanner(Rules) {
  if (!Rules) throw new Error("劇情規劃器缺少正式牌局規則");

  const COMPLETE_HAND_KEYS = new Set(["straightFlush", "four", "fullHouse", "flush", "straight"]);
  const COMPLETE_HAND_PRIORITY = Object.freeze({
    straightFlush: 2,
    four: 3,
    fullHouse: 6,
    flush: 7,
    straight: 8
  });
  const BOSS_REFERENCE_SAMPLE_SIZE = 4096;

  function buildBossReferenceHands() {
    const deck = [];
    for (let rank = 6; rank <= 14; rank += 1) {
      for (const suit of ["S", "H", "D", "C"]) deck.push({ rank, suit, baseId: `${rank}${suit}` });
    }
    let state = 0x26a81945;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const rows = [];
    for (let sample = 0; sample < BOSS_REFERENCE_SAMPLE_SIZE; sample += 1) {
      const cards = deck.map((card) => ({ ...card }));
      for (let index = cards.length - 1; index > cards.length - 7; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [cards[index], cards[swap]] = [cards[swap], cards[index]];
      }
      rows.push(Rules.evaluateBest(cards.slice(-6)));
    }
    return rows.sort(Rules.compareEval);
  }

  const BOSS_REFERENCE_HANDS = buildBossReferenceHands();
  const BOSS_REFERENCE_HIGH_COUNT = BOSS_REFERENCE_HANDS.findIndex((row) => row.key !== "high");
  const showdownCache = new Map();

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function evaluationSignature(evaluation, bossBadHighRerollPct) {
    return `${evaluation?.key || "high"}:${(evaluation?.tiebreak || []).join(",")}:${finite(bossBadHighRerollPct, 25)}`;
  }

  function showdownWinProbability(evaluation, bossBadHighRerollPct = 25) {
    const signature = evaluationSignature(evaluation, bossBadHighRerollPct);
    if (showdownCache.has(signature)) return showdownCache.get(signature);
    let lower = 0;
    let upper = BOSS_REFERENCE_HANDS.length;
    while (lower < upper) {
      const middle = (lower + upper) >> 1;
      if (Rules.compareEval(BOSS_REFERENCE_HANDS[middle], evaluation) < 0) lower = middle + 1;
      else upper = middle;
    }
    const firstEqual = lower;
    upper = BOSS_REFERENCE_HANDS.length;
    while (lower < upper) {
      const middle = (lower + upper) >> 1;
      if (Rules.compareEval(BOSS_REFERENCE_HANDS[middle], evaluation) <= 0) lower = middle + 1;
      else upper = middle;
    }
    const firstGreater = lower;
    const highWeight = 1 - Math.max(0, Math.min(100, finite(bossBadHighRerollPct, 25))) / 100;
    const weightedRange = (from, to) => {
      const high = Math.max(0, Math.min(to, BOSS_REFERENCE_HIGH_COUNT) - Math.min(from, BOSS_REFERENCE_HIGH_COUNT));
      return high * highWeight + Math.max(0, to - from - high);
    };
    const total = weightedRange(0, BOSS_REFERENCE_HANDS.length);
    const probability = total > 0
      ? (weightedRange(0, firstEqual) + weightedRange(firstEqual, firstGreater) * 0.5) / total
      : 0;
    showdownCache.set(signature, probability);
    return probability;
  }

  function cloneCard(card) {
    return { ...card, magicEffects: card?.magicEffects ? { ...card.magicEffects } : undefined };
  }

  function cloneMagic(card) {
    return { ...card };
  }

  function refreshState(state) {
    state.playerEval = Rules.evaluateBest(state.playerCards);
    state.bossEval = Rules.evaluateBest(state.bossCards);
    state.playerHand = state.playerEval;
    state.bossHand = state.bossEval;
    state.damage = Rules.computeDamage(state.playerEval, state.magicCards);
    state.playerRank = state.playerEval.rank;
    state.bossRank = state.bossEval.rank;
    return state;
  }

  function cloneRoundState(source) {
    const playerCards = source.playerCards.map(cloneCard);
    const state = {
      ...source,
      playerCards,
      playerDeck: source.playerDeck.map(cloneCard),
      bossCards: source.bossCards.map(cloneCard),
      magicCards: source.magicCards.map(cloneMagic),
      lockedCardIds: new Set(source.lockedCardIds || []),
      discardIndexes: new Set(source.discardIndexes || []),
      arrangementPlan: source.arrangementPlan,
      arrangementDecision: source.arrangementDecision
    };
    return refreshState(state);
  }

  function cardIds(cards) {
    return cards.map(Rules.cardId);
  }

  function cardText(card) {
    if (card.joker) return "Joker";
    const rank = card.rank <= 10 ? String(card.rank) : ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[card.rank];
    const suit = ({ S: "♠", H: "♥", D: "♦", C: "♣" })[card.suit] || card.suit;
    const effects = Object.entries(card.magicEffects || {}).map(([key, value]) => {
      const label = ({ crit: "暴擊", flatDamage: "固傷", threeBoost: "三條傷害", fourBoost: "四條傷害", straightBoost: "順子傷害", flushBoost: "同花傷害", fullHouseBoost: "葫蘆傷害" })[key] || key;
      return `${label}${value}`;
    });
    return `${rank}${suit}${effects.length ? `（${effects.join("＋")}）` : ""}`;
  }

  function cardTexts(cards) {
    return cards.map(cardText);
  }

  function keptCards(state) {
    return state.playerCards.filter((_card, index) => !state.discardIndexes.has(index));
  }

  function symmetricDifferenceSize(leftInput, rightInput) {
    const left = new Set(leftInput);
    const right = new Set(rightInput);
    let count = 0;
    for (const value of left) if (!right.has(value)) count += 1;
    for (const value of right) if (!left.has(value)) count += 1;
    return count;
  }

  function effectCount(cards) {
    return cards.reduce((count, card) => count + (Rules.hasAttachedEffect(card) ? 1 : 0), 0);
  }

  function boostTargetForRoute(routeKey) {
    const key = String(routeKey || "");
    if (key === "fullHouse") return "fullHouse";
    if (key === "fourOfAKind") return "four";
    if (key === "threeOfAKind") return "three";
    if (/straight/i.test(key) && !/flush/i.test(key)) return "straight";
    if (/flush/i.test(key) && !/straight/i.test(key)) return "flush";
    return null;
  }

  function routeCandidates(state, maximum = 8) {
    const autoPlan = state.arrangementPlan || Rules.autoLockPlan(state.playerCards).arrangementPlan;
    const autoCards = keptCards(state);
    const autoIds = cardIds(autoCards);
    const joker = state.playerCards.find((card) => card.joker);
    const rows = [];
    const seen = new Set();
    const add = (cardsInput, key, label, priority, reason) => {
      const cards = [];
      const used = new Set();
      for (const card of cardsInput || []) {
        const id = Rules.cardId(card);
        if (used.has(id) || cards.length >= 5) continue;
        used.add(id);
        cards.push(card);
      }
      if (joker && !used.has(Rules.cardId(joker)) && cards.length < 5) {
        used.add(Rules.cardId(joker));
        cards.push(joker);
      }
      if (!cards.length || cards.length >= state.playerCards.length) return;
      const ids = cardIds(cards).sort();
      const signature = ids.join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      const changedCards = symmetricDifferenceSize(ids, autoIds);
      rows.push({
        key, label, priority: Number.isInteger(priority) ? priority : 99,
        cards, keepCardIds: ids, changedCards,
        manualAdjustment: changedCards > 0,
        reason: changedCards > 0 ? reason : "沿用系統自動保留"
      });
    };

    add(autoCards, autoPlan?.key || "auto", autoPlan?.label || "系統建議", autoPlan?.priority, "沿用系統自動保留");
    if (autoPlan?.coreCards?.length && autoPlan.coreCards.length < autoCards.length) {
      add(autoPlan.coreCards, autoPlan.key, autoPlan.label, autoPlan.priority, "第一次換牌前解除與主要目標衝突的額外效果牌");
    }

    const autoPriority = Number.isInteger(autoPlan?.priority) ? autoPlan.priority : 18;
    const candidates = (autoPlan?.candidates || []).slice().sort((left, right) => {
      const priority = finite(left.priority, 99) - finite(right.priority, 99);
      if (priority) return priority;
      const effects = effectCount(right.cards || []) - effectCount(left.cards || []);
      if (effects) return effects;
      return (right.cards?.length || 0) - (left.cards?.length || 0);
    });
    const bestByKey = new Set();
    const bestEffectByKey = new Set();
    for (const candidate of candidates) {
      const hasEffect = effectCount(candidate.cards || []) > 0;
      const routeKey = String(candidate.key || "route");
      const boostTarget = boostTargetForRoute(routeKey);
      const hasMatchingBoost = Boolean(boostTarget && state.magicCards.some((card) => card.target === boostTarget));
      if (!hasEffect && !hasMatchingBoost) continue;
      const slotKey = `${routeKey}:${hasEffect ? "effect" : "plain"}`;
      const targetSet = hasEffect ? bestEffectByKey : bestByKey;
      if (targetSet.has(slotKey)) continue;
      if (!hasEffect && finite(candidate.priority, 99) > Math.min(18, autoPriority + 5)) continue;
      targetSet.add(slotKey);
      add(
        candidate.cards,
        routeKey,
        candidate.label || routeKey,
        candidate.priority,
        hasEffect
          ? `第一次換牌前解決牌型核心與綁定效果牌的保留位置衝突，改走「${candidate.label || routeKey}」路線`
          : hasMatchingBoost
            ? `第一次換牌前依本回合${boostTarget}增傷，改走「${candidate.label || routeKey}」路線`
            : `第一次換牌前比較比牌勝率、擊殺機會與換牌成本，改走「${candidate.label || routeKey}」路線`
      );
      if (rows.length >= maximum) break;
    }
    return rows.slice(0, maximum);
  }

  function drawFee(config, drawIndex) {
    const fees = Array.isArray(config.drawFeesX) && config.drawFeesX.length ? config.drawFeesX : [1, 2, 3];
    return Math.max(0, finite(fees[Math.min(drawIndex, fees.length - 1)], 0));
  }

  function plannedPaidDrawLimit(route, hasJoker = false) {
    if (route.priority <= 3) return 0;
    if (route.priority <= 14) return hasJoker ? 2 : 3;
    return hasJoker ? 1 : 2;
  }

  function roundActionOption(state, route, startHand, initialCards, bossCards, drawLog, paidDraws, freeDraws, drawSpendX, config, includeDetails = true) {
    const comparison = state.playerEval.key === "high" ? null : Rules.compare(state);
    const damageView = Rules.damageBreakdown(state.playerEval, state.magicCards);
    const action = state.playerEval.key === "high" ? "FOLD" : "FIGHT";
    const result = action === "FOLD"
      ? "FOLD"
      : comparison.tie
        ? "TIE"
        : comparison.playerWins
          ? "WIN"
          : "LOSE";
    const showdownProbability = action === "FIGHT"
      ? showdownWinProbability(state.playerEval, config?.bossBadHighRerollPct)
      : 0;
    const magicDamageGain = Math.max(0, finite(damageView.total, 0) - finite(damageView.base, 0));
    const activeJoker = damageView.activeEffects.some((effect) => effect.key === "joker") ? 1 : 0;
    const hasJoker = state.playerCards.some((card) => card.joker);
    const magicSynergyScore = magicDamageGain + activeJoker + freeDraws * Math.max(0, drawFee(config || {}, 0));
    return {
      startHand,
      initialCards: includeDetails ? initialCards.slice() : [],
      finalCards: includeDetails ? cardTexts(state.playerCards) : [],
      finalHand: state.playerEval.key,
      finalRank: state.playerEval.rank,
      bossHand: state.bossEval.key,
      bossCards: includeDetails ? bossCards.slice() : [],
      draws: drawLog.length,
      paidDraws,
      freeDraws,
      drawSpendX,
      damage: comparison?.playerWins ? Math.max(0, finite(comparison.damage, 0)) : 0,
      action,
      result,
      tie: Boolean(comparison?.tie),
      playerWins: Boolean(comparison?.playerWins),
      routeKey: route.key,
      routeLabel: includeDetails ? route.label : "",
      routePriority: route.priority,
      initialKeepCardIds: route.keepCardIds.slice(),
      autoKeepCardIds: route.autoKeepCardIds.slice(),
      changedCards: route.changedCards,
      manualAdjustment: route.manualAdjustment,
      decisionReason: includeDetails ? route.reason : "",
      drawLog: includeDetails ? drawLog.map((row) => ({ ...row, discardedCardIds: row.discardedCardIds.slice() })) : [],
      magicCards: includeDetails ? state.magicCards.map(cloneMagic) : [],
      coinX: Math.max(0, finite(state.coinX, 0)),
      activeCrit: Math.max(0, finite(damageView.crit, 0)),
      activeBoost: Math.max(0, finite(damageView.boost, 0)),
      activeFlat: Math.max(0, finite(damageView.flat, 0)),
      showdownWinProbability: showdownProbability,
      expectedDamage: showdownProbability * Math.max(0, finite(damageView.total, 0)),
      magicSynergyScore,
      hasJoker,
      playerBadHighRerolls: Math.max(0, finite(state.playerBadHighRerolls, 0)),
      bossBadHighRerolls: Math.max(0, finite(state.bossBadHighRerolls, 0)),
      completedHand: COMPLETE_HAND_KEYS.has(state.playerEval.key)
    };
  }

  function pruneRoundActions(options) {
    const bestByResult = new Map();
    for (const option of options) {
      const key = [
        option.action, option.tie ? 1 : 0, option.playerWins ? 1 : 0,
        option.damage, option.finalHand, option.drawSpendX
      ].join(":");
      const existing = bestByResult.get(key);
      if (!existing
        || option.changedCards < existing.changedCards
        || (option.changedCards === existing.changedCards && option.paidDraws < existing.paidDraws)) {
        bestByResult.set(key, option);
      }
    }
    return [...bestByResult.values()];
  }

  function enumerateRoundActions(sourceState, config, runOptions = {}) {
    const includeDetails = runOptions.includeDetails !== false;
    const original = cloneRoundState(sourceState);
    const autoKeepCardIds = cardIds(keptCards(original)).sort();
    const routes = routeCandidates(original).map((route) => ({ ...route, autoKeepCardIds }));
    const options = [];
    const seenOptions = new Set();
    const addOption = (option) => {
      const signature = [option.finalHand, option.bossHand, option.draws, option.drawSpendX, option.initialKeepCardIds.join("|")].join("::");
      if (seenOptions.has(signature)) return;
      seenOptions.add(signature);
      options.push(option);
    };

    const baseRoute = routes.find((route) => !route.manualAdjustment) || routes[0];
    const initialCards = includeDetails ? cardTexts(original.playerCards) : [];
    const bossCards = includeDetails ? cardTexts(original.bossCards) : [];
    if (baseRoute) addOption(roundActionOption(original, baseRoute, original.playerEval.key, initialCards, bossCards, [], 0, 0, 0, config, includeDetails));

    for (const route of routes) {
      let state = cloneRoundState(original);
      Rules.applyRecommendedKeepCards(state, route.keepCardIds);
      const startHand = original.playerEval.key;
      const drawLog = [];
      let paidDraws = 0;
      let freeDraws = 0;
      let drawSpendX = 0;
      const completedPriority = COMPLETE_HAND_PRIORITY[startHand] ?? Number.POSITIVE_INFINITY;
      const improvesCompletedHand = finite(route.priority, 99) < completedPriority;
      const protectsCompletedHand = COMPLETE_HAND_KEYS.has(startHand) && !improvesCompletedHand;
      const routeDrawLimit = protectsCompletedHand
        ? 0
        : plannedPaidDrawLimit(route, state.playerCards.some((card) => card.joker));
      const paidDrawLimit = Math.min(config.smartMaxDraws, routeDrawLimit);
      const totalDrawLimit = protectsCompletedHand
        ? 0
        : paidDrawLimit + (config.freeDrawEnabled && state.magicCards.some((card) => card.key === "freeDraw") ? 1 : 0);
      for (let drawIndex = 0; drawIndex < totalDrawLimit; drawIndex += 1) {
        if (!state.discardIndexes.size) break;
        if (state.playerDeck.length - state.discardIndexes.size < config.deckStopCount) break;
        const discardedCards = includeDetails ? [...state.discardIndexes].map((index) => cardText(state.playerCards[index])) : [];
        const discardedCardIds = includeDetails ? [...state.discardIndexes].map((index) => Rules.cardId(state.playerCards[index])) : [];
        const keepCardIds = includeDetails
          ? state.playerCards
            .filter((_card, index) => !state.discardIndexes.has(index))
            .map((card) => Rules.cardId(card))
            .sort()
          : [];
        const freeAvailable = config.freeDrawEnabled && !state.freeUsed && state.magicCards.some((card) => card.key === "freeDraw");
        let feeX = 0;
        if (freeAvailable) {
          state.freeUsed = true;
          freeDraws += 1;
        } else {
          if (!config.paidDrawEnabled) break;
          if (paidDraws >= paidDrawLimit) break;
          feeX = drawFee(config, drawLog.length);
          drawSpendX += feeX;
          paidDraws += 1;
        }
        const before = state.draws;
        Rules.redraw(state, new Set(state.discardIndexes));
        if (state.draws === before) break;
        drawLog.push(includeDetails ? {
          draw: drawLog.length + 1,
          free: freeAvailable,
          feeX,
          keepCardIds,
          discardedCardIds,
          discardedCards,
          acceptedCardIds: state.playerCards
            .filter((card) => !keepCardIds.includes(Rules.cardId(card)))
            .map((card) => Rules.cardId(card))
            .sort(),
          nextKeepCardIds: state.playerCards
            .filter((_card, index) => !state.discardIndexes.has(index))
            .map((card) => Rules.cardId(card))
            .sort()
        } : null);
        addOption(roundActionOption(state, route, startHand, initialCards, bossCards, drawLog, paidDraws, freeDraws, drawSpendX, config, includeDetails));
      }
    }
    const pruned = pruneRoundActions(options);
    const autoOptions = pruned.filter((option) => !option.manualAdjustment);
    for (const option of pruned) {
      const comparableAuto = autoOptions
        .filter((row) => row.drawSpendX <= option.drawSpendX)
        .sort((left, right) => right.showdownWinProbability - left.showdownWinProbability
          || right.expectedDamage - left.expectedDamage
          || right.magicSynergyScore - left.magicSynergyScore)[0] || autoOptions[0];
      option.autoShowdownWinProbability = finite(comparableAuto?.showdownWinProbability, 0);
      option.autoExpectedDamage = finite(comparableAuto?.expectedDamage, 0);
      option.autoMagicSynergyScore = finite(comparableAuto?.magicSynergyScore, 0);
    }
    return pruned.filter((option) => !option.manualAdjustment
      || option.showdownWinProbability >= option.autoShowdownWinProbability + (option.hasJoker ? 0.05 : 0.03)
      || option.expectedDamage >= option.autoExpectedDamage + (option.hasJoker ? 1 : 0.5)
      || option.magicSynergyScore >= option.autoMagicSynergyScore + 1);
  }

  function emptyOutcome(reason = "STOP_LOSS") {
    return {
      killed: false,
      spendX: 0,
      payoutX: 0,
      handPayoutX: 0,
      bossPayoutX: 0,
      coinPayoutX: 0,
      hpLeft: null,
      totalDamage: 0,
      paidDraws: 0,
      freeDraws: 0,
      totalDraws: 0,
      fights: 0,
      folds: 0,
      ties: 0,
      playerRoundWins: 0,
      playerRoundLosses: 0,
      manualAdjustments: 0,
      changedCards: 0,
      showdownConfidenceSum: 0,
      showdownDecisionCount: 0,
      expectedDamage: 0,
      estimatedKillProbability: 0,
      magicSynergy: 0,
      rewardAtStakeX: 0,
      jokerDecisionCount: 0,
      nonJokerDecisionCount: 0,
      pathLength: 0,
      rounds: 0,
      path: [],
      terminationReason: reason
    };
  }

  function outcomePathLength(outcome) {
    return Math.max(0, finite(outcome?.pathLength, outcome?.path?.length || 0));
  }

  function plannerUtility(outcome) {
    const netX = outcome.payoutX - outcome.spendX;
    return netX
      - outcome.manualAdjustments * 6
      - outcome.changedCards * 0.5
      - outcome.paidDraws * 0.01
      - outcomePathLength(outcome) * 0.0001;
  }

  function killEffortCost(outcome) {
    return outcome.spendX
      + outcome.manualAdjustments * 6
      + outcome.changedCards * 0.5;
  }

  function showdownConfidence(outcome) {
    return outcome.showdownDecisionCount > 0
      ? outcome.showdownConfidenceSum / outcome.showdownDecisionCount
      : 0;
  }

  function nonKillProgressScore(outcome) {
    return outcome.expectedDamage * 0.8
      + outcome.totalDamage * 0.2
      + showdownConfidence(outcome) * 2
      + outcome.magicSynergy * 0.12
      - outcome.spendX * 0.85
      - outcome.manualAdjustments * 5
      - outcome.changedCards * 0.3;
  }

  function profitDecisionView(outcome, sunkSpendX = 0, sunkPayoutX = 0) {
    const totalSpendX = sunkSpendX + outcome.spendX;
    const payoutWithoutKillX = sunkPayoutX + outcome.handPayoutX;
    const payoutWithKillX = payoutWithoutKillX + outcome.rewardAtStakeX;
    const alreadyProfitable = payoutWithoutKillX > totalSpendX;
    const profitPossible = alreadyProfitable
      || (payoutWithKillX > totalSpendX && outcome.estimatedKillProbability > 0);
    const profitProbability = alreadyProfitable
      ? 1
      : profitPossible
        ? outcome.estimatedKillProbability
        : 0;
    const expectedPayoutX = payoutWithoutKillX + outcome.estimatedKillProbability * outcome.rewardAtStakeX;
    return {
      totalSpendX,
      payoutWithKillX,
      profitPossible,
      profitProbability,
      expectedNetX: expectedPayoutX - totalSpendX
    };
  }

  function compareOutcomes(left, right, sunkSpendX = 0, sunkPayoutX = 0, mayStop = false) {
    if (!right) return 1;
    const leftProfit = profitDecisionView(left, sunkSpendX, sunkPayoutX);
    const rightProfit = profitDecisionView(right, sunkSpendX, sunkPayoutX);
    if (left.manualAdjustments !== right.manualAdjustments) {
      const leftMoreManual = left.manualAdjustments > right.manualAdjustments;
      const manualPath = leftMoreManual ? left : right;
      const simplePath = leftMoreManual ? right : left;
      const manualProfit = leftMoreManual ? leftProfit : rightProfit;
      const simpleProfit = leftMoreManual ? rightProfit : leftProfit;
      const manualDelta = manualPath.manualAdjustments - simplePath.manualAdjustments;
      const jokerShare = manualPath.showdownDecisionCount > 0
        ? manualPath.jokerDecisionCount / manualPath.showdownDecisionCount
        : 0;
      const requiredProbabilityGain = 0.1 + Math.max(0, manualDelta - 1) * (jokerShare > 0 ? 0.05 : 0.06);
      const requiredExpectedNetGain = manualDelta * (jokerShare > 0 ? 3 : 4);
      const materiallyBetter = manualProfit.profitProbability >= simpleProfit.profitProbability + requiredProbabilityGain
        || manualProfit.expectedNetX >= simpleProfit.expectedNetX + requiredExpectedNetGain;
      if (!materiallyBetter) return leftMoreManual ? -1 : 1;
    }
    if (leftProfit.profitPossible !== rightProfit.profitPossible) return leftProfit.profitPossible ? 1 : -1;
    const profitProbabilityGap = leftProfit.profitProbability - rightProfit.profitProbability;
    if (Math.abs(profitProbabilityGap) >= 0.01) return profitProbabilityGap > 0 ? 1 : -1;
    const expectedNetGap = leftProfit.expectedNetX - rightProfit.expectedNetX;
    if (Math.abs(expectedNetGap) >= 0.25) return expectedNetGap > 0 ? 1 : -1;
    if (left.killed !== right.killed && Math.abs(profitProbabilityGap) > 1e-12) {
      return profitProbabilityGap > 0 ? 1 : -1;
    }
    if (left.killed) {
      const leftEffort = killEffortCost(left);
      const rightEffort = killEffortCost(right);
      const effortGap = Math.abs(leftEffort - rightEffort);
      const killProbabilityGap = left.estimatedKillProbability - right.estimatedKillProbability;
      if (effortGap <= 2 && Math.abs(killProbabilityGap) >= 0.05) return killProbabilityGap > 0 ? 1 : -1;
      if (Math.abs(leftEffort - rightEffort) > 1e-12) return leftEffort < rightEffort ? 1 : -1;
      const confidenceGap = showdownConfidence(left) - showdownConfidence(right);
      if (Math.abs(confidenceGap) > 1e-12) return confidenceGap > 0 ? 1 : -1;
      if (left.magicSynergy !== right.magicSynergy) return left.magicSynergy > right.magicSynergy ? 1 : -1;
      if (left.manualAdjustments !== right.manualAdjustments) return left.manualAdjustments < right.manualAdjustments ? 1 : -1;
      if (left.changedCards !== right.changedCards) return left.changedCards < right.changedCards ? 1 : -1;
      if (left.spendX !== right.spendX) return left.spendX < right.spendX ? 1 : -1;
    } else {
      const leftProgress = nonKillProgressScore(left);
      const rightProgress = nonKillProgressScore(right);
      if (Math.abs(leftProgress - rightProgress) > 1e-12) return leftProgress > rightProgress ? 1 : -1;
      if (left.manualAdjustments !== right.manualAdjustments) return left.manualAdjustments < right.manualAdjustments ? 1 : -1;
      if (left.changedCards !== right.changedCards) return left.changedCards < right.changedCards ? 1 : -1;
    }
    if (left.paidDraws !== right.paidDraws) return left.paidDraws < right.paidDraws ? 1 : -1;
    if (left.payoutX !== right.payoutX) return left.payoutX > right.payoutX ? 1 : -1;
    return outcomePathLength(left) <= outcomePathLength(right) ? 1 : -1;
  }

  function prependAction(option, tail, context) {
    const entrySpendX = context.tieIndex === 0 ? 1 : 0;
    const spendX = entrySpendX + option.drawSpendX + tail.spendX;
    const currentHandPayout = option.playerWins && !option.tie ? context.handPayoutX(option.finalHand) : 0;
    const payoutX = currentHandPayout + tail.payoutX;
    const includePath = context.includePath !== false;
    let step = null;
    if (includePath) {
      const result = option.tie
        ? "TIE"
        : option.playerWins
          ? (context.hpAfter <= 0 ? "KILLED" : "WIN")
          : option.result;
      const showdownDeltaPp = (option.showdownWinProbability - option.autoShowdownWinProbability) * 100;
      const expectedDamageDelta = option.expectedDamage - option.autoExpectedDamage;
      const magicSynergyDelta = option.magicSynergyScore - option.autoMagicSynergyScore;
      const metricReason = option.manualAdjustment
        ? `；相較自動路線：比牌勝率${showdownDeltaPp >= 0 ? "+" : ""}${showdownDeltaPp.toFixed(1)}個百分點、預期傷害${expectedDamageDelta >= 0 ? "+" : ""}${expectedDamageDelta.toFixed(1)}、魔法連動${magicSynergyDelta >= 0 ? "+" : ""}${magicSynergyDelta.toFixed(1)}`
        : "；沿用自動鎖牌後評估比牌勝率、擊殺機會與魔法連動";
      step = {
        round: context.round,
        tieIndex: context.tieIndex,
        startHand: option.startHand,
        initialCards: option.initialCards.slice(),
        finalCards: option.finalCards.slice(),
        finalHand: option.finalHand,
        finalRank: option.finalRank,
        bossHand: option.bossHand,
        bossCards: option.bossCards.slice(),
        draws: option.draws,
        paidDraws: option.paidDraws,
        freeDraws: option.freeDraws,
        damage: option.playerWins && !option.tie ? option.damage : 0,
        action: option.action,
        result,
        routeKey: option.routeKey,
        routeLabel: option.routeLabel,
        routePriority: option.routePriority,
        autoKeepCardIds: option.autoKeepCardIds.slice(),
        initialKeepCardIds: option.initialKeepCardIds.slice(),
        changedCards: option.changedCards,
        manualAdjustment: option.manualAdjustment,
        decisionReason: `${option.decisionReason}${metricReason}`,
        drawLog: option.drawLog.map((row) => ({
          ...row,
          keepCardIds: row.keepCardIds.slice(),
          discardedCardIds: row.discardedCardIds.slice(),
          acceptedCardIds: row.acceptedCardIds.slice(),
          nextKeepCardIds: row.nextKeepCardIds.slice()
        })),
        magicCards: option.magicCards.map(cloneMagic),
        activeCrit: option.activeCrit,
        activeBoost: option.activeBoost,
        activeFlat: option.activeFlat,
        showdownWinProbability: option.showdownWinProbability,
        autoShowdownWinProbability: option.autoShowdownWinProbability,
        expectedDamage: option.expectedDamage,
        autoExpectedDamage: option.autoExpectedDamage,
        magicSynergyScore: option.magicSynergyScore,
        autoMagicSynergyScore: option.autoMagicSynergyScore,
        hasJoker: option.hasJoker,
        jokerBehavior: option.hasJoker
          ? "Joker 固定保留並視為任意缺口；縮短追牌上限，只有獲利機率或魔法連動明顯提升才改動其他鎖牌"
          : "按實際缺牌與可成牌張數評估；小幅改善不手動改動自動鎖牌",
        killOpportunityProbability: option.damage >= context.hpBefore ? option.showdownWinProbability : 0,
        bossHpBefore: context.hpBefore,
        bossHpAfter: context.hpAfter,
        playerBadHighRerolls: option.playerBadHighRerolls,
        bossBadHighRerolls: option.bossBadHighRerolls,
        totalBetAfter: spendX - tail.spendX,
        planner: "整隻 BOSS 預排／玩家可執行"
      };
    }
    const directKillProbability = option.action === "FIGHT" && option.damage >= context.hpBefore
      ? option.showdownWinProbability
      : 0;
    return {
      ...tail,
      killed: context.hpAfter <= 0 || tail.killed,
      spendX,
      payoutX,
      handPayoutX: currentHandPayout + tail.handPayoutX,
      hpLeft: context.hpAfter <= 0 ? 0 : tail.hpLeft,
      totalDamage: (option.playerWins && !option.tie ? option.damage : 0) + tail.totalDamage,
      paidDraws: option.paidDraws + tail.paidDraws,
      freeDraws: option.freeDraws + tail.freeDraws,
      totalDraws: option.draws + tail.totalDraws,
      fights: (option.action === "FIGHT" ? 1 : 0) + tail.fights,
      folds: (option.action === "FOLD" ? 1 : 0) + tail.folds,
      ties: (option.tie ? 1 : 0) + tail.ties,
      playerRoundWins: (option.playerWins && !option.tie ? 1 : 0) + tail.playerRoundWins,
      playerRoundLosses: (option.action === "FIGHT" && !option.tie && !option.playerWins ? 1 : 0) + tail.playerRoundLosses,
      manualAdjustments: (option.manualAdjustment ? 1 : 0) + tail.manualAdjustments,
      changedCards: option.changedCards + tail.changedCards,
      showdownConfidenceSum: (option.action === "FIGHT" ? option.showdownWinProbability : 0) + tail.showdownConfidenceSum,
      showdownDecisionCount: (option.action === "FIGHT" ? 1 : 0) + tail.showdownDecisionCount,
      expectedDamage: option.expectedDamage + tail.expectedDamage,
      estimatedKillProbability: directKillProbability + (1 - directKillProbability) * tail.estimatedKillProbability,
      magicSynergy: option.magicSynergyScore + tail.magicSynergy,
      rewardAtStakeX: Math.max(context.bossRewardX + context.nextCoinX, tail.rewardAtStakeX),
      jokerDecisionCount: (option.hasJoker ? 1 : 0) + tail.jokerDecisionCount,
      nonJokerDecisionCount: (option.hasJoker ? 0 : 1) + tail.nonJokerDecisionCount,
      pathLength: 1 + outcomePathLength(tail),
      rounds: Math.max(context.round, finite(tail.rounds, 0)),
      path: includePath ? [step, ...tail.path] : []
    };
  }

  function planBossStory(input) {
    const config = input.config;
    const includePath = input.includePath !== false;
    const initialHp = Math.max(1, Math.trunc(finite(input.initialHp, 1)));
    const roundLimit = Math.max(1, Math.trunc(finite(input.roundLimit, 1)));
    const bossRewardX = Math.max(0, finite(input.bossRewardX, 0));
    const createRound = input.createRound;
    const handPayoutX = typeof input.handPayoutX === "function" ? input.handPayoutX : () => 0;
    const roundCache = new Map();
    const actionCache = new Map();
    const solveCache = new Map();

    const getRound = (round, tieIndex) => {
      const key = `${round}:${tieIndex}`;
      if (!roundCache.has(key)) roundCache.set(key, createRound(round, tieIndex));
      return roundCache.get(key);
    };

    const solve = (round, tieIndex, hpLeft, bankedCoinX, mayStop, spentSoFar = 0, realizedPayoutSoFar = 0) => {
      if (round > roundLimit) {
        const exhausted = emptyOutcome("ROUND_EXHAUSTED");
        exhausted.hpLeft = hpLeft;
        return exhausted;
      }
      if (tieIndex >= 100) {
        const safety = emptyOutcome("TIE_SAFETY_STOP");
        safety.hpLeft = hpLeft;
        return safety;
      }
      const cacheKey = `${round}:${tieIndex}:${hpLeft}:${bankedCoinX}:${mayStop ? 1 : 0}:${spentSoFar}:${realizedPayoutSoFar}`;
      if (solveCache.has(cacheKey)) return solveCache.get(cacheKey);
      let best = null;
      if (mayStop) {
        best = emptyOutcome("STOP_LOSS");
        best.hpLeft = hpLeft;
      }
      const state = getRound(round, tieIndex);
      const actionKey = `${round}:${tieIndex}`;
      if (!actionCache.has(actionKey)) actionCache.set(actionKey, enumerateRoundActions(state, config, { includeDetails: includePath }));
      const options = actionCache.get(actionKey);
      for (const option of options) {
        const nextCoinX = bankedCoinX + option.coinX;
        const optionSpendX = (tieIndex === 0 ? 1 : 0) + option.drawSpendX;
        const currentHandPayoutX = option.playerWins && !option.tie ? handPayoutX(option.finalHand) : 0;
        let tail;
        let hpAfter = hpLeft;
        if (option.tie) {
          tail = solve(round, tieIndex + 1, hpLeft, nextCoinX, false, spentSoFar + optionSpendX, realizedPayoutSoFar);
        } else {
          if (option.playerWins) hpAfter = Math.max(0, hpLeft - option.damage);
          if (hpAfter <= 0) {
            tail = emptyOutcome("KILLED");
            tail.killed = true;
            tail.hpLeft = 0;
            tail.bossPayoutX = bossRewardX;
            tail.coinPayoutX = nextCoinX;
            tail.payoutX = bossRewardX + nextCoinX;
          } else {
            tail = solve(
              round + 1,
              0,
              hpAfter,
              nextCoinX,
              true,
              spentSoFar + optionSpendX,
              realizedPayoutSoFar + currentHandPayoutX
            );
          }
        }
        const combined = prependAction(option, tail, {
          round, tieIndex, hpBefore: hpLeft, hpAfter, handPayoutX,
          bossRewardX, nextCoinX, includePath
        });
        if (!best || compareOutcomes(
          combined,
          best,
          spentSoFar,
          realizedPayoutSoFar,
          mayStop
        ) > 0) best = combined;
      }
      solveCache.set(cacheKey, best);
      return best;
    };

    const outcome = solve(1, 0, initialHp, 0, false);
    let cumulativeSpendX = 0;
    for (const step of outcome.path) {
      const entryX = step.tieIndex === 0 ? 1 : 0;
      const drawX = step.drawLog.reduce((sum, row) => sum + finite(row.feeX, 0), 0);
      step.totalBetBefore = cumulativeSpendX;
      cumulativeSpendX += entryX + drawX;
      step.totalBetAfter = cumulativeSpendX;
    }
    outcome.hpLeft = outcome.killed ? 0 : finite(outcome.hpLeft, initialHp);
    outcome.rounds = includePath
      ? outcome.path.reduce((max, step) => Math.max(max, step.round), 0)
      : Math.max(0, finite(outcome.rounds, 0));
    const profitView = profitDecisionView(outcome, 0, 0);
    outcome.decisionMetrics = {
      showdownConfidence: showdownConfidence(outcome),
      estimatedKillProbability: outcome.estimatedKillProbability,
      expectedDamage: outcome.expectedDamage,
      magicSynergy: outcome.magicSynergy,
      profitPossible: profitView.profitPossible,
      profitProbability: profitView.profitProbability,
      expectedNetX: profitView.expectedNetX,
      payoutWithKillX: profitView.payoutWithKillX
    };
    outcome.behavior = "以最終有機率獲利為目標；用比牌勝率、擊殺機率與魔法卡連動估算，並扣除總押、換牌與手動操作成本";
    outcome.plannerVersion = "boss-plan-v11";
    return outcome;
  }

  return {
    VERSION: "boss-plan-v11",
    planBossStory,
    enumerateRoundActions,
    routeCandidates,
    plannerUtility,
    showdownWinProbability,
    profitDecisionView
  };
});
