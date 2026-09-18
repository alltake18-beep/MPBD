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
  const PLAYER_POLICY_VERSION = "story-player-policy-v1";
  const ROUTE_BANDS = Object.freeze({
    royalFlush: 4,
    straightFlush: 4,
    fourOfAKind: 4,
    fullHouse: 4,
    flush: 4,
    straight: 4,
    openStraightFlush: 3,
    singleStraightFlush: 3,
    threeOfAKind: 3,
    fourFlush: 3,
    twoPair: 3,
    openStraight: 3,
    singleStraight: 3,
    onePair: 2,
    threeFlush: 2,
    threeRun: 2,
    twoFlush: 1,
    twoStraight: 1,
    effectOnly: 0,
    none: 0
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

  function hasOwnEffect(card, key) {
    return Boolean(card?.magicEffects && Object.prototype.hasOwnProperty.call(card.magicEffects, key));
  }

  function attachedEffectTier(card) {
    const crit = hasOwnEffect(card, "crit");
    const flat = hasOwnEffect(card, "flatDamage");
    return crit && flat ? 3 : crit ? 2 : flat ? 1 : 0;
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

  function routeBand(routeKey) {
    return ROUTE_BANDS[String(routeKey || "none")] ?? 0;
  }

  function compareStoryPlayerRoutes(left, right) {
    if (left.band !== right.band) return right.band - left.band;
    if (left.activeMagicKeys.length !== right.activeMagicKeys.length) return right.activeMagicKeys.length - left.activeMagicKeys.length;
    if (left.effectTier !== right.effectTier) return right.effectTier - left.effectTier;
    if (left.hasCrit !== right.hasCrit) return left.hasCrit ? -1 : 1;
    if (left.hasFlat !== right.hasFlat) return left.hasFlat ? -1 : 1;
    if (left.priority !== right.priority) return left.priority - right.priority;
    if (left.cards.length !== right.cards.length) return right.cards.length - left.cards.length;
    if (left.effectDealIndex !== right.effectDealIndex) return left.effectDealIndex - right.effectDealIndex;
    return left.signature.localeCompare(right.signature);
  }

  function routeCandidates(state, maximum = 64) {
    const autoPlan = state.arrangementPlan || Rules.autoLockPlan(state.playerCards).arrangementPlan;
    const autoCards = keptCards(state);
    const autoIds = cardIds(autoCards).sort();
    const jokers = state.playerCards.filter((card) => card.joker);
    const jokerIds = new Set(jokers.map(Rules.cardId));
    const rowsBySignature = new Map();
    const handIndexById = new Map(state.playerCards.map((card, index) => [Rules.cardId(card), index]));
    const add = (cardsInput, key, label, priority, source) => {
      const cards = [];
      const used = new Set();
      for (const card of cardsInput || []) {
        const id = Rules.cardId(card);
        if (used.has(id) || cards.length >= 5) continue;
        used.add(id);
        cards.push(card);
      }
      for (const joker of jokers) {
        const id = Rules.cardId(joker);
        if (!used.has(id) && cards.length < 5) {
          used.add(id);
          cards.push(joker);
        }
      }
      if (cards.length >= state.playerCards.length) return;
      const ids = cardIds(cards).sort();
      const signature = ids.join("|");
      const activeMagicKeys = [];
      const hasCrit = cards.some((card) => hasOwnEffect(card, "crit"));
      const hasFlat = cards.some((card) => hasOwnEffect(card, "flatDamage"));
      if (hasCrit) activeMagicKeys.push("crit");
      if (hasFlat) activeMagicKeys.push("flatDamage");
      const boostTarget = boostTargetForRoute(key);
      for (const magic of state.magicCards || []) {
        if (boostTarget && magic.target === boostTarget && /Boost$/.test(String(magic.key || ""))) {
          activeMagicKeys.push(String(magic.key));
        }
      }
      const effectCards = cards.filter((card) => attachedEffectTier(card) > 0);
      const effectTier = effectCards.reduce((tier, card) => Math.max(tier, attachedEffectTier(card)), 0);
      const effectDealIndex = effectCards.reduce(
        (minimum, card) => Math.min(minimum, handIndexById.get(Rules.cardId(card)) ?? Number.POSITIVE_INFINITY),
        Number.POSITIVE_INFINITY
      );
      const changedCards = symmetricDifferenceSize(ids, autoIds);
      const row = {
        key, label, priority: Number.isInteger(priority) ? priority : 99,
        band: routeBand(key), cards, keepCardIds: ids, signature,
        activeMagicKeys: [...new Set(activeMagicKeys)],
        effectTier, hasCrit, hasFlat, effectDealIndex,
        source, changedCards,
        manualAdjustment: changedCards > 0,
        reason: ""
      };
      const existing = rowsBySignature.get(signature);
      if (!existing || compareStoryPlayerRoutes(row, existing) < 0) rowsBySignature.set(signature, row);
    };

    add(autoPlan?.coreCards || jokers, autoPlan?.key || "none", autoPlan?.label || "尚未形成正式核心", autoPlan?.priority, "NORMAL");

    const candidates = (autoPlan?.candidates || []).filter((candidate) => {
      const ids = new Set((candidate.cards || []).map(Rules.cardId));
      return [...jokerIds].every((id) => ids.has(id));
    });
    const effectCards = state.playerCards.filter((card) => !card.joker && attachedEffectTier(card) > 0);
    const effectsWithCore = new Set();
    for (const candidate of candidates) {
      const includedEffects = effectCards.filter((card) => (candidate.cards || []).some((item) => Rules.cardId(item) === Rules.cardId(card)));
      for (const card of includedEffects) effectsWithCore.add(Rules.cardId(card));
      const boostTarget = boostTargetForRoute(candidate.key);
      const hasMatchingBoost = Boolean(boostTarget && (state.magicCards || []).some((card) => card.target === boostTarget && /Boost$/.test(String(card.key || ""))));
      if (!includedEffects.length && !hasMatchingBoost) continue;
      add(
        candidate.cards,
        candidate.key,
        candidate.label || candidate.key,
        candidate.priority,
        includedEffects.length ? "ATTACHED_EFFECT" : "HAND_BOOST"
      );
    }
    for (const card of effectCards) {
      if (!effectsWithCore.has(Rules.cardId(card))) {
        add([card], "effectOnly", "單張效果牌", 99, "ATTACHED_EFFECT");
      }
    }

    const rows = [...rowsBySignature.values()].sort(compareStoryPlayerRoutes).slice(0, maximum);
    if (rows.length) {
      const selected = rows[0];
      const magic = selected.activeMagicKeys.length ? `，可啟動 ${selected.activeMagicKeys.join("＋")}` : "，不啟動額外魔法";
      selected.reason = `固定劇本玩家規則：等級 ${selected.band}${magic}；依固定排序選定後鎖定本回合路線`;
      for (let index = 1; index < rows.length; index += 1) {
        rows[index].reason = `固定劇本玩家規則候選：等級 ${rows[index].band}`;
      }
    }
    return rows;
  }

  function drawFee(config, drawIndex) {
    const fees = Array.isArray(config.drawFeesX) && config.drawFeesX.length ? config.drawFeesX : [1, 2, 3];
    return Math.max(0, finite(fees[Math.min(drawIndex, fees.length - 1)], 0));
  }

  function plannedPaidDrawLimit(route, hasJoker = false) {
    if (route.band >= 4) return 0;
    if (route.band === 3) return hasJoker ? 2 : 3;
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
      routeBand: route.band,
      activeRouteMagicKeys: route.activeMagicKeys.slice(),
      playerPolicyVersion: PLAYER_POLICY_VERSION,
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
    const maxDrawSpendX = Number.isFinite(Number(runOptions.maxDrawSpendX))
      ? Math.max(0, finite(runOptions.maxDrawSpendX, 0))
      : Infinity;
    const original = cloneRoundState(sourceState);
    const autoKeepCardIds = cardIds(keptCards(original)).sort();
    const routes = routeCandidates(original).map((route) => ({ ...route, autoKeepCardIds }));
    const route = routes[0];
    if (!route) return [];
    const initialCards = includeDetails ? cardTexts(original.playerCards) : [];
    const bossCards = includeDetails ? cardTexts(original.bossCards) : [];
    const state = cloneRoundState(original);
    Rules.applyRecommendedKeepCards(state, route.keepCardIds);
    const startHand = original.playerEval.key;
    const drawLog = [];
    let paidDraws = 0;
    let freeDraws = 0;
    let drawSpendX = 0;
    const protectsCompletedHand = route.band >= 4 || COMPLETE_HAND_KEYS.has(startHand);
    const routeDrawLimit = protectsCompletedHand
      ? 0
      : plannedPaidDrawLimit(route, state.playerCards.some((card) => card.joker));
    const paidDrawLimit = Math.min(config.smartMaxDraws, routeDrawLimit);
    const totalDrawLimit = protectsCompletedHand
      ? 0
      : paidDrawLimit + (config.freeDrawEnabled && state.magicCards.some((card) => card.key === "freeDraw") ? 1 : 0);
    for (let drawIndex = 0; drawIndex < totalDrawLimit; drawIndex += 1) {
      if (COMPLETE_HAND_KEYS.has(state.playerEval.key)) break;
      if (!state.discardIndexes.size) break;
      if (state.playerDeck.length - state.discardIndexes.size < config.deckStopCount) break;
      const discardedCards = includeDetails ? [...state.discardIndexes].map((index) => cardText(state.playerCards[index])) : [];
      const discardedCardIds = includeDetails ? [...state.discardIndexes].map((index) => Rules.cardId(state.playerCards[index])) : [];
      const keepCardIds = state.playerCards
        .filter((_card, index) => !state.discardIndexes.has(index))
        .map((card) => Rules.cardId(card))
        .sort();
      const freeAvailable = config.freeDrawEnabled && !state.freeUsed && state.magicCards.some((card) => card.key === "freeDraw");
      let feeX = 0;
      if (freeAvailable) {
        state.freeUsed = true;
        freeDraws += 1;
      } else {
        if (!config.paidDrawEnabled || paidDraws >= paidDrawLimit) break;
        feeX = drawFee(config, drawLog.length);
        if (drawSpendX + feeX > maxDrawSpendX + 1e-9) break;
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
    }
    const option = roundActionOption(state, route, startHand, initialCards, bossCards, drawLog, paidDraws, freeDraws, drawSpendX, config, includeDetails);
    option.autoShowdownWinProbability = option.showdownWinProbability;
    option.autoExpectedDamage = option.expectedDamage;
    option.autoMagicSynergyScore = option.magicSynergyScore;
    option.routeCandidates = includeDetails ? routes.map((candidate) => ({
      key: candidate.key,
      label: candidate.label,
      band: candidate.band,
      priority: candidate.priority,
      keepCardIds: candidate.keepCardIds.slice(),
      activeMagicKeys: candidate.activeMagicKeys.slice(),
      selected: candidate === route
    })) : [];
    return [option];
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
        routeBand: option.routeBand,
        activeRouteMagicKeys: option.activeRouteMagicKeys.slice(),
        routeCandidates: option.routeCandidates.map((route) => ({
          ...route,
          keepCardIds: route.keepCardIds.slice(),
          activeMagicKeys: route.activeMagicKeys.slice()
        })),
        playerPolicyVersion: option.playerPolicyVersion,
        autoKeepCardIds: option.autoKeepCardIds.slice(),
        initialKeepCardIds: option.initialKeepCardIds.slice(),
        changedCards: option.changedCards,
        manualAdjustment: option.manualAdjustment,
        decisionReason: option.decisionReason,
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
          ? "Joker 固定保留並視為任意缺口；依固定規則減少一次付費換牌上限"
          : "依起手路線等級使用固定付費換牌上限",
        killOpportunityProbability: option.damage >= context.hpBefore ? option.showdownWinProbability : 0,
        bossHpBefore: context.hpBefore,
        bossHpAfter: context.hpAfter,
        playerBadHighRerolls: option.playerBadHighRerolls,
        bossBadHighRerolls: option.bossBadHighRerolls,
        totalBetAfter: spendX - tail.spendX,
        planner: "固定劇本玩家規則／不預看後續牌"
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
    const maxSpendX = Number.isFinite(Number(input.maxSpendX))
      ? Math.max(0, finite(input.maxSpendX, 0))
      : Infinity;
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
      const entrySpendX = tieIndex === 0 ? 1 : 0;
      if (spentSoFar + entrySpendX > maxSpendX + 1e-9) {
        const insufficient = emptyOutcome("INSUFFICIENT_FUNDS");
        insufficient.hpLeft = hpLeft;
        return insufficient;
      }
      const cacheKey = `${round}:${tieIndex}:${hpLeft}:${bankedCoinX}:${mayStop ? 1 : 0}:${spentSoFar}:${realizedPayoutSoFar}`;
      if (solveCache.has(cacheKey)) return solveCache.get(cacheKey);
      let best = null;
      const state = getRound(round, tieIndex);
      const availableDrawSpendX = Number.isFinite(maxSpendX)
        ? Math.max(0, maxSpendX - spentSoFar - entrySpendX)
        : Infinity;
      const actionKey = `${round}:${tieIndex}:${Number.isFinite(availableDrawSpendX) ? availableDrawSpendX : "INF"}`;
      if (!actionCache.has(actionKey)) {
        actionCache.set(actionKey, enumerateRoundActions(state, config, {
          includeDetails: includePath,
          maxDrawSpendX: availableDrawSpendX
        }));
      }
      const options = actionCache.get(actionKey);
      for (const option of options) {
        const nextCoinX = bankedCoinX + option.coinX;
        const optionSpendX = entrySpendX + option.drawSpendX;
        if (spentSoFar + optionSpendX > maxSpendX + 1e-9) continue;
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
      if (!best) {
        best = emptyOutcome("INSUFFICIENT_FUNDS");
        best.hpLeft = hpLeft;
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
    outcome.behavior = "每回合依固定等級與魔法啟動排序選定一條互斥路線；不預看後續牌、不讀最終分類且不執行停損";
    outcome.playerPolicyVersion = PLAYER_POLICY_VERSION;
    outcome.plannerVersion = "boss-plan-v12";
    return outcome;
  }

  return {
    VERSION: "boss-plan-v12",
    PLAYER_POLICY_VERSION,
    planBossStory,
    enumerateRoundActions,
    routeCandidates,
    plannerUtility,
    showdownWinProbability,
    profitDecisionView
  };
});
