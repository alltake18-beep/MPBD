(function initBossDuelPokerArrangementLabCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BossDuelPokerArrangementLabCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBossDuelPokerArrangementLabCore() {
  "use strict";

  const SUITS = ["S", "H", "D", "C"];
  const SUIT_LABELS = Object.freeze({ S: "黑桃", H: "紅心", D: "方塊", C: "梅花" });
  const RANK_LABELS = Object.freeze({ 14: "A", 13: "K", 12: "Q", 11: "J", 10: "10" });
  const STRAIGHT_WINDOWS = Object.freeze([
    [14, 2, 3, 4, 5],
    ...Array.from({ length: 9 }, (_value, index) => Array.from({ length: 5 }, (_item, offset) => index + 2 + offset))
  ]);
  const THREE_RUN_WINDOWS = Object.freeze([
    [14, 2, 3],
    ...Array.from({ length: 11 }, (_value, index) => Array.from({ length: 3 }, (_item, offset) => index + 2 + offset))
  ]);
  const PRIORITIES = Object.freeze([
    null,
    { key: "royalFlush", label: "皇家同花順", goal: "皇家同花順", coreSize: 5 },
    { key: "straightFlush", label: "同花順", goal: "同花順", coreSize: 5 },
    { key: "fourOfAKind", label: "四條", goal: "四條", coreSize: 4 },
    { key: "openStraightFlush", label: "聽雙頭同花順", goal: "同花順", coreSize: 4 },
    { key: "singleStraightFlush", label: "聽一同花順", goal: "同花順", coreSize: 4 },
    { key: "fullHouse", label: "葫蘆", goal: "葫蘆", coreSize: 5 },
    { key: "flush", label: "同花", goal: "同花", coreSize: 5 },
    { key: "straight", label: "順子", goal: "順子", coreSize: 5 },
    { key: "threeOfAKind", label: "三條", goal: "葫蘆／四條", coreSize: 3 },
    { key: "fourFlush", label: "四花缺一花", goal: "同花／同花順", coreSize: 4 },
    { key: "twoPair", label: "兩對", goal: "葫蘆", coreSize: 4 },
    { key: "openStraight", label: "聽雙頭順", goal: "順子", coreSize: 4 },
    { key: "threeFlush", label: "三花缺二花", goal: "同花／同花順", coreSize: 3 },
    { key: "singleStraight", label: "缺一順", goal: "順子", coreSize: 4 },
    { key: "onePair", label: "一對", goal: "葫蘆／四條", coreSize: 2 },
    { key: "twoFlush", label: "二花缺三花", goal: "同花／同花順", coreSize: 2 },
    { key: "threeRun", label: "三連順", goal: "順子", coreSize: 3 },
    { key: "twoStraight", label: "聽二順", goal: "順子", coreSize: 3 }
  ]);
  const TARGET_FAMILIES = Object.freeze({
    royalFlush: "straightFlush",
    straightFlush: "straightFlush",
    openStraightFlush: "straightFlush",
    singleStraightFlush: "straightFlush",
    fourOfAKind: "rank",
    fullHouse: "rank",
    threeOfAKind: "rank",
    twoPair: "rank",
    onePair: "rank",
    flush: "flush",
    fourFlush: "flush",
    threeFlush: "flush",
    twoFlush: "flush",
    straight: "straight",
    openStraight: "straight",
    singleStraight: "straight",
    threeRun: "straight",
    twoStraight: "straight",
    none: "none"
  });
  const COMPLETE_FIVE_CARD_KEYS = new Set(["royalFlush", "straightFlush", "fullHouse", "flush", "straight"]);

  function rankLabel(rank) {
    return RANK_LABELS[rank] || String(rank);
  }

  function cardId(card) {
    if (!card) return "";
    return String(card.id || card.baseId || (card.joker ? "JOKER" : `${card.rank}${card.suit}`));
  }

  function cardLabel(card) {
    if (!card) return "";
    if (card.joker) return "JOKER";
    return `${rankLabel(card.rank)}${SUIT_LABELS[card.suit] || card.suit}`;
  }

  function effectLabel(card) {
    const labels = [];
    if (card?.effects?.crit || card?.magicEffects?.crit) labels.push("暴擊");
    if (card?.effects?.flat || card?.magicEffects?.flatDamage) labels.push("固傷");
    return labels.join("＋");
  }

  function hasCrit(card) {
    return Boolean(card?.effects?.crit) || Boolean(card?.magicEffects && Object.prototype.hasOwnProperty.call(card.magicEffects, "crit"));
  }

  function hasFlat(card) {
    return Boolean(card?.effects?.flat) || Boolean(card?.magicEffects && Object.prototype.hasOwnProperty.call(card.magicEffects, "flatDamage"));
  }

  function hasEffect(card) {
    return hasCrit(card) || hasFlat(card);
  }

  function naturalCard(rank, suit, id = `${rank}${suit}`) {
    return { id, baseId: id, rank: Number(rank), suit, joker: false, effects: { crit: false, flat: false } };
  }

  function jokerCard(id = "JOKER") {
    return { id, baseId: id, rank: 0, suit: "JOKER", joker: true, effects: { crit: false, flat: false } };
  }

  function combinations(items, size) {
    if (size === 0) return [[]];
    if (items.length < size) return [];
    const [head, ...tail] = items;
    return [
      ...combinations(tail, size - 1).map((row) => [head, ...row]),
      ...combinations(tail, size)
    ];
  }

  function compareArrays(left, right) {
    const size = Math.max(left.length, right.length);
    for (let index = 0; index < size; index += 1) {
      const delta = Number(left[index] || 0) - Number(right[index] || 0);
      if (delta) return delta;
    }
    return 0;
  }

  function straightHigh(window) {
    return window[0] === 14 && window[1] === 2 ? 5 : Math.max(...window);
  }

  function regularCards(cards) {
    return cards.filter((card) => !card.joker);
  }

  function jokerCount(cards) {
    return cards.filter((card) => card.joker).length;
  }

  function uniqueRanks(cards) {
    return [...new Set(regularCards(cards).map((card) => card.rank))];
  }

  function sameNaturalSuit(cards) {
    const regular = regularCards(cards);
    if (!regular.length) return null;
    return regular.every((card) => card.suit === regular[0].suit) ? regular[0].suit : null;
  }

  function rankCounts(cards, jokerRank = null) {
    const counts = new Map();
    for (const card of regularCards(cards)) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
    if (jokerRank !== null) counts.set(jokerRank, (counts.get(jokerRank) || 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  }

  function bestAssignedPattern(cards, predicate) {
    const replacements = jokerCount(cards) ? Array.from({ length: 13 }, (_value, index) => index + 2) : [null];
    let best = null;
    for (const replacement of replacements) {
      const counts = rankCounts(cards, replacement);
      if (!predicate(counts)) continue;
      const vector = counts.flatMap(([rank, count]) => [count, rank]);
      if (!best || compareArrays(vector, best.vector) > 0) best = { replacement, counts, vector };
    }
    return best;
  }

  function representableStraightWindows(cards) {
    const ranks = uniqueRanks(cards);
    if (ranks.length !== regularCards(cards).length) return [];
    const jokers = jokerCount(cards);
    return STRAIGHT_WINDOWS.filter((window) =>
      ranks.every((rank) => window.includes(rank)) && window.filter((rank) => !ranks.includes(rank)).length === jokers
    );
  }

  function straightCompletionInfo(cards, suited = false) {
    if (cards.length !== 4) return { ranks: [], windows: [], suit: null };
    const suit = suited ? sameNaturalSuit(cards) : null;
    if (suited && !suit) return { ranks: [], windows: [], suit: null };
    const existing = new Set(uniqueRanks(cards));
    const ranks = new Set();
    const windows = [];
    for (let drawRank = 2; drawRank <= 14; drawRank += 1) {
      if (existing.has(drawRank)) continue;
      const draw = naturalCard(drawRank, suit || "S", `DRAW-${drawRank}`);
      const augmented = [...cards, draw];
      const matching = representableStraightWindows(augmented);
      if (!matching.length) continue;
      ranks.add(drawRank);
      windows.push(...matching);
    }
    const bestWindow = windows.length
      ? windows.slice().sort((left, right) => straightHigh(right) - straightHigh(left))[0]
      : null;
    return {
      ranks: [...ranks].sort((left, right) => left - right),
      windows,
      suit,
      high: bestWindow ? straightHigh(bestWindow) : 0,
      bestWindow
    };
  }

  function representableThreeRunWindows(cards) {
    if (cards.length !== 3) return [];
    const ranks = uniqueRanks(cards);
    if (ranks.length !== regularCards(cards).length) return [];
    const jokers = jokerCount(cards);
    return THREE_RUN_WINDOWS.filter((window) =>
      ranks.every((rank) => window.includes(rank)) && window.filter((rank) => !ranks.includes(rank)).length === jokers
    );
  }

  function twoStraightWindows(cards) {
    if (cards.length !== 3 || representableThreeRunWindows(cards).length) return [];
    const ranks = uniqueRanks(cards);
    if (ranks.length !== regularCards(cards).length) return [];
    const represented = ranks.length + jokerCount(cards);
    if (represented !== 3) return [];
    return STRAIGHT_WINDOWS.filter((window) => ranks.every((rank) => window.includes(rank)));
  }

  function candidate(priority, cards, details = {}) {
    const definition = PRIORITIES[priority];
    return {
      priority,
      key: definition.key,
      label: definition.label,
      goal: definition.goal,
      cards: [...new Set(cards)],
      targetSuit: details.targetSuit || null,
      windowHigh: Number(details.windowHigh || 0),
      groupVector: details.groupVector || [],
      completionRanks: details.completionRanks || [],
      targetWindow: details.targetWindow || null,
      jokerRank: details.jokerRank || null
    };
  }

  function assignedJokerRank(cards, pattern) {
    if (!jokerCount(cards) || !pattern) return null;
    const naturalCounts = new Map();
    for (const card of regularCards(cards)) naturalCounts.set(card.rank, (naturalCounts.get(card.rank) || 0) + 1);
    for (const [rank, count] of pattern.counts) if ((naturalCounts.get(rank) || 0) < count) return rank;
    return pattern.replacement || null;
  }

  function straightJokerRank(cards, window) {
    if (!jokerCount(cards) || !window) return null;
    const ranks = new Set(uniqueRanks(cards));
    const missing = window.filter((rank) => !ranks.has(rank));
    return missing.length ? Math.max(...missing) : null;
  }

  function flushJokerRank(cards) {
    if (!jokerCount(cards)) return null;
    const ranks = new Set(uniqueRanks(cards));
    for (let rank = 14; rank >= 2; rank -= 1) if (!ranks.has(rank)) return rank;
    return 14;
  }

  function candidateTieVector(row) {
    const ranks = regularCards(row.cards).map((card) => card.rank).sort((left, right) => right - left);
    return [
      row.windowHigh,
      ...row.groupVector,
      jokerCount(row.cards),
      ...ranks,
      row.cards.filter(hasCrit).length,
      row.cards.filter(hasFlat).length,
      straightFlushProgress(row.cards)
    ];
  }

  function compareCandidates(left, right) {
    if (!right) return 1;
    if (left.priority !== right.priority) return right.priority - left.priority;
    return compareArrays(candidateTieVector(left), candidateTieVector(right));
  }

  function bestCandidate(rows) {
    let best = null;
    for (const row of rows) if (!best || compareCandidates(row, best) > 0) best = row;
    return best;
  }

  function buildCandidates(hand) {
    const rows = [];
    for (const cards of combinations(hand, 5)) {
      const suit = sameNaturalSuit(cards);
      const straightWindows = representableStraightWindows(cards);
      const bestWindow = straightWindows.length ? straightWindows.slice().sort((a, b) => straightHigh(b) - straightHigh(a))[0] : null;
      const isRoyal = suit && bestWindow && straightHigh(bestWindow) === 14 && [10, 11, 12, 13, 14].every((rank) => bestWindow.includes(rank));
      if (isRoyal) rows.push(candidate(1, cards, {
        targetSuit: suit,
        windowHigh: 14,
        targetWindow: bestWindow,
        jokerRank: straightJokerRank(cards, bestWindow)
      }));
      if (suit && bestWindow) rows.push(candidate(2, cards, {
        targetSuit: suit,
        windowHigh: straightHigh(bestWindow),
        targetWindow: bestWindow,
        jokerRank: straightJokerRank(cards, bestWindow)
      }));
      const fullHouse = bestAssignedPattern(cards, (counts) => counts.length === 2 && counts[0][1] === 3 && counts[1][1] === 2);
      if (fullHouse) rows.push(candidate(6, cards, {
        groupVector: fullHouse.vector,
        jokerRank: assignedJokerRank(cards, fullHouse)
      }));
      if (suit) rows.push(candidate(7, cards, { targetSuit: suit, jokerRank: flushJokerRank(cards) }));
      if (bestWindow) rows.push(candidate(8, cards, {
        windowHigh: straightHigh(bestWindow),
        targetWindow: bestWindow,
        jokerRank: straightJokerRank(cards, bestWindow)
      }));
    }

    for (const cards of combinations(hand, 4)) {
      const quads = bestAssignedPattern(cards, (counts) => counts.length === 1 && counts[0][1] === 4);
      if (quads) rows.push(candidate(3, cards, {
        groupVector: quads.vector,
        jokerRank: assignedJokerRank(cards, quads)
      }));

      const suitedInfo = straightCompletionInfo(cards, true);
      if (suitedInfo.ranks.length >= 2) rows.push(candidate(4, cards, {
        targetSuit: suitedInfo.suit,
        windowHigh: suitedInfo.high,
        completionRanks: suitedInfo.ranks,
        targetWindow: suitedInfo.bestWindow,
        jokerRank: straightJokerRank(cards, suitedInfo.bestWindow)
      }));
      if (suitedInfo.ranks.length === 1) rows.push(candidate(5, cards, {
        targetSuit: suitedInfo.suit,
        windowHigh: suitedInfo.high,
        completionRanks: suitedInfo.ranks,
        targetWindow: suitedInfo.bestWindow,
        jokerRank: straightJokerRank(cards, suitedInfo.bestWindow)
      }));

      const suit = sameNaturalSuit(cards);
      if (suit) rows.push(candidate(10, cards, { targetSuit: suit, jokerRank: flushJokerRank(cards) }));

      const twoPair = bestAssignedPattern(cards, (counts) => counts.length === 2 && counts[0][1] === 2 && counts[1][1] === 2);
      if (twoPair) rows.push(candidate(11, cards, {
        groupVector: twoPair.vector,
        jokerRank: assignedJokerRank(cards, twoPair)
      }));

      const straightInfo = straightCompletionInfo(cards, false);
      if (straightInfo.ranks.length >= 2) rows.push(candidate(12, cards, {
        windowHigh: straightInfo.high,
        completionRanks: straightInfo.ranks,
        targetWindow: straightInfo.bestWindow,
        jokerRank: straightJokerRank(cards, straightInfo.bestWindow)
      }));
      if (straightInfo.ranks.length === 1) rows.push(candidate(14, cards, {
        windowHigh: straightInfo.high,
        completionRanks: straightInfo.ranks,
        targetWindow: straightInfo.bestWindow,
        jokerRank: straightJokerRank(cards, straightInfo.bestWindow)
      }));
    }

    for (const cards of combinations(hand, 3)) {
      const trips = bestAssignedPattern(cards, (counts) => counts.length === 1 && counts[0][1] === 3);
      if (trips) rows.push(candidate(9, cards, {
        groupVector: trips.vector,
        jokerRank: assignedJokerRank(cards, trips)
      }));
      const suit = sameNaturalSuit(cards);
      if (suit) rows.push(candidate(13, cards, { targetSuit: suit, jokerRank: flushJokerRank(cards) }));
      const runWindows = representableThreeRunWindows(cards);
      if (runWindows.length) {
        const bestWindow = runWindows.slice().sort((left, right) => straightHigh(right) - straightHigh(left))[0];
        rows.push(candidate(17, cards, {
          windowHigh: straightHigh(bestWindow),
          targetWindow: bestWindow,
          jokerRank: straightJokerRank(cards, bestWindow)
        }));
      }
      const sparseWindows = twoStraightWindows(cards);
      if (sparseWindows.length) {
        const bestWindow = sparseWindows.slice().sort((left, right) => straightHigh(right) - straightHigh(left))[0];
        rows.push(candidate(18, cards, {
          windowHigh: straightHigh(bestWindow),
          targetWindow: bestWindow,
          jokerRank: straightJokerRank(cards, bestWindow)
        }));
      }
    }

    for (const cards of combinations(hand, 2)) {
      const pair = bestAssignedPattern(cards, (counts) => counts.length === 1 && counts[0][1] === 2);
      if (pair) rows.push(candidate(15, cards, {
        groupVector: pair.vector,
        jokerRank: assignedJokerRank(cards, pair)
      }));
      const suit = sameNaturalSuit(cards);
      if (suit) rows.push(candidate(16, cards, { targetSuit: suit, jokerRank: flushJokerRank(cards) }));
    }
    return rows;
  }

  function preferredEffectSuit(cards) {
    const crit = cards.find((card) => hasCrit(card) && !card.joker);
    if (crit) return crit.suit;
    const flat = cards.find((card) => hasFlat(card) && !card.joker);
    return flat?.suit || null;
  }

  function containsEveryCard(cards, requiredCards) {
    const ids = new Set(cards.map(cardId));
    return requiredCards.every((card) => ids.has(cardId(card)));
  }

  function candidatePlan(best, candidates, keepCards = best?.cards || [], reasonByCardId = null) {
    if (!best) return null;
    const coreIds = new Set(best.cards.map(cardId));
    const extraCards = keepCards.filter((card) => !coreIds.has(cardId(card)));
    return {
      ...best,
      coreCards: best.cards.slice(),
      extraCards,
      extraReasons: new Map(extraCards.map((card) => [cardId(card), reasonByCardId?.get(cardId(card)) || "玩家已確認保留"])),
      keepCards: keepCards.slice(0, 5),
      effectSuit: preferredEffectSuit(keepCards),
      candidates
    };
  }

  function automaticKeepForBest(best, hand) {
    const keepCards = best.cards.slice();
    const keptIds = new Set(keepCards.map(cardId));
    const reasonByCardId = new Map();
    const addEffect = (predicate, reason) => {
      if (keepCards.length >= 5 || keepCards.some(predicate)) return false;
      const effectCard = hand.find((card) => predicate(card) && !keptIds.has(cardId(card)));
      if (!effectCard) return false;
      keepCards.push(effectCard);
      keptIds.add(cardId(effectCard));
      reasonByCardId.set(cardId(effectCard), reason);
      return true;
    };

    if (best.cards.length === 4 && !keepCards.some(hasEffect)) {
      // 四張基礎保留只補一張：同張暴擊＋固傷 > 暴擊 > 固傷。
      const addedBoth = addEffect((card) => hasCrit(card) && hasFlat(card), "四張基礎保留：暴擊＋固傷優先");
      if (!addedBoth) {
        const addedCrit = addEffect(hasCrit, "四張基礎保留：保留暴擊");
        if (!addedCrit) addEffect(hasFlat, "四張基礎保留：保留固傷");
      }
    } else if (best.cards.length === 3 || best.cards.length === 2) {
      // 三張或兩張基礎保留最多補兩張；同一實體牌同時綁兩效果時只占一格。
      if (!keepCards.some(hasCrit) && !keepCards.some(hasFlat)) {
        addEffect((card) => hasCrit(card) && hasFlat(card), `${best.cards.length}張基礎保留：保留暴擊＋固傷`);
      }
      addEffect(hasCrit, `${best.cards.length}張基礎保留：保留暴擊`);
      addEffect(hasFlat, `${best.cards.length}張基礎保留：保留固傷`);
    }

    return { keepCards, reasonByCardId };
  }

  function planHand(hand) {
    const candidates = buildCandidates(hand);
    const jokers = hand.filter((card) => card.joker);
    // Joker 一定保留，但不能再以「額外牌」硬塞進另一個不含 Joker 的目標。
    // 有 Joker 時，只在真正包含 Joker 的合法候選內比較正式優先序。
    const eligible = jokers.length
      ? candidates.filter((row) => containsEveryCard(row.cards, jokers))
      : candidates;
    const best = bestCandidate(eligible);
    if (!best) return {
      priority: null,
      key: "none",
      label: "尚未形成正式核心",
      goal: "等待更多牌",
      coreCards: [],
      extraCards: [],
      keepCards: jokers.slice(0, 5),
      targetSuit: null,
      effectSuit: preferredEffectSuit(jokers),
      completionRanks: [],
      candidates
    };
    const automatic = automaticKeepForBest(best, hand);
    return candidatePlan(best, candidates, automatic.keepCards, automatic.reasonByCardId);
  }

  function analyzeSelection(selectedCards) {
    const candidates = buildCandidates(selectedCards);
    const best = bestCandidate(candidates);
    if (!best) return {
      priority: null,
      key: "none",
      label: selectedCards.length ? "尚未形成正式核心" : "尚未保留牌",
      goal: selectedCards.length ? "再加入保留牌" : "等待玩家選牌",
      coreCards: selectedCards.slice(),
      extraCards: [],
      keepCards: selectedCards.slice(),
      targetSuit: null,
      effectSuit: preferredEffectSuit(selectedCards),
      completionRanks: [],
      candidates
    };
    const coreIds = new Set(best.cards.map(cardId));
    const extraCards = selectedCards.filter((card) => !coreIds.has(cardId(card)));
    return {
      ...best,
      coreCards: best.cards.slice(),
      extraCards,
      keepCards: selectedCards.slice(),
      targetSuit: best.targetSuit,
      effectSuit: preferredEffectSuit(selectedCards),
      candidates
    };
  }

  function straightFlushProgress(cards, forcedSuit = null) {
    const jokers = jokerCount(cards);
    let best = 0;
    const suits = forcedSuit ? [forcedSuit] : SUITS;
    for (const suit of suits) {
      const ranks = new Set(regularCards(cards).filter((card) => card.suit === suit).map((card) => card.rank));
      for (const window of STRAIGHT_WINDOWS) {
        const covered = [...ranks].filter((rank) => window.includes(rank)).length + jokers;
        best = Math.max(best, Math.min(5, covered));
      }
    }
    return best;
  }

  function sameRankReplacementCandidates(hand, previousKeepCards) {
    const previousIds = new Set(previousKeepCards.map(cardId));
    const newCards = hand.filter((card) => !previousIds.has(cardId(card)));
    const effectSuit = preferredEffectSuit(previousKeepCards);
    const rows = [];
    for (const from of previousKeepCards) {
      if (from.joker || hasEffect(from)) continue;
      for (const to of newCards) {
        if (to.joker || to.rank !== from.rank || to.suit === from.suit) continue;
        if (effectSuit && to.suit !== effectSuit) continue;
        rows.push({
          from,
          to,
          gain: 0,
          reason: effectSuit ? `效果牌鎖定${SUIT_LABELS[effectSuit]}目標花色` : "同點數換花色後更接近同花順"
        });
      }
    }
    return rows;
  }

  function completedTarget(plan) {
    return Boolean(plan && (COMPLETE_FIVE_CARD_KEYS.has(plan.key) || plan.key === "fourOfAKind"));
  }

  function sameRankReplacementOptions(hand, previousKeepCards, lockedPlan = analyzeSelection(previousKeepCards)) {
    const candidateRows = sameRankReplacementCandidates(hand, previousKeepCards);
    const progressSuit = preferredEffectSuit(previousKeepCards) ||
      (["flush", "straightFlush"].includes(targetFamily(lockedPlan)) ? lockedPlan.targetSuit : null);
    const baseline = straightFlushProgress(previousKeepCards, progressSuit);
    const rowsByFrom = new Map();
    for (const row of candidateRows) {
      const id = cardId(row.from);
      if (!rowsByFrom.has(id)) rowsByFrom.set(id, []);
      rowsByFrom.get(id).push(row);
    }

    const options = [];
    const optionKeys = new Set();
    function visit(index, cards, rows, usedTargets) {
      if (index >= previousKeepCards.length) {
        const progress = straightFlushProgress(cards, progressSuit);
        if (rows.length && progress <= baseline) return;
        const key = cards.map(cardId).join("|");
        if (optionKeys.has(key)) return;
        optionKeys.add(key);
        options.push({ progress, rows: rows.slice(), cards: cards.slice() });
        return;
      }

      visit(index + 1, cards, rows, usedTargets);
      const from = previousKeepCards[index];
      for (const row of rowsByFrom.get(cardId(from)) || []) {
        const targetId = cardId(row.to);
        if (usedTargets.has(targetId)) continue;
        const nextCards = cards.slice();
        nextCards[index] = row.to;
        usedTargets.add(targetId);
        rows.push(row);
        visit(index + 1, nextCards, rows, usedTargets);
        rows.pop();
        usedTargets.delete(targetId);
      }
    }

    // 已完成的五張目標不可為了同品質平移而做同點數換花色。
    if (completedTarget(lockedPlan)) return [{ progress: baseline, rows: [], cards: previousKeepCards.slice() }];
    visit(0, previousKeepCards.slice(), [], new Set());
    return options;
  }

  function legalSameRankReplacements(hand, previousKeepCards) {
    const lockedPlan = analyzeSelection(previousKeepCards);
    const progressSuit = preferredEffectSuit(previousKeepCards) ||
      (["flush", "straightFlush"].includes(targetFamily(lockedPlan)) ? lockedPlan.targetSuit : null);
    const baseline = straightFlushProgress(previousKeepCards, progressSuit);
    const legalByKey = new Map();
    for (const option of sameRankReplacementOptions(hand, previousKeepCards, lockedPlan)) {
      if (!option.rows.length) continue;
      for (const row of option.rows) {
        const key = `${cardId(row.from)}>${cardId(row.to)}`;
        const gain = option.progress - baseline;
        const existing = legalByKey.get(key);
        if (!existing || gain > existing.gain) legalByKey.set(key, { ...row, gain });
      }
    }
    return [...legalByKey.values()].sort((left, right) => right.gain - left.gain || right.to.rank - left.to.rank);
  }

  function targetFamily(plan) {
    return TARGET_FAMILIES[plan?.key] || "none";
  }

  function isAllowedStructuralTransition(lockedPlan, trialPlan) {
    if (!trialPlan || trialPlan.priority === null) return false;
    if (!lockedPlan || lockedPlan.priority === null) return true;
    const lockedFamily = targetFamily(lockedPlan);
    const trialFamily = targetFamily(trialPlan);
    if (trialFamily === lockedFamily) return true;

    // 順子或同花路線可在原核心仍被保留時自然升級成同花順路線。
    if (trialFamily === "straightFlush" && (lockedFamily === "straight" || lockedFamily === "flush")) return true;

    // 不得只因另一條路線的未完成聽牌數字優先序較高就改追；跨路線至少要直接成五張牌。
    return COMPLETE_FIVE_CARD_KEYS.has(trialPlan.key);
  }

  function buildRedrawDecision(hand, replacementOption) {
    const confirmedCards = replacementOption.cards.slice();
    const replacedFromIds = new Set(replacementOption.rows.map((row) => cardId(row.from)));
    const optionHand = hand.filter((card) => !replacedFromIds.has(cardId(card)));
    const candidates = buildCandidates(optionHand);

    // REDRAW 後目前所有保留牌都視為玩家確認。新目標只有在核心完整包含
    // 每一張確認牌時才有資格參與正式優先序比較；否則保持原保留不動。
    const compatibleCandidates = candidates.filter((row) => containsEveryCard(row.cards, confirmedCards));
    const best = bestCandidate(compatibleCandidates);
    const automatic = best ? automaticKeepForBest(best, optionHand) : null;
    const plan = best
      ? candidatePlan(best, candidates, automatic.keepCards, automatic.reasonByCardId)
      : analyzeSelection(confirmedCards);
    const confirmedIds = new Set(confirmedCards.map(cardId));
    const structuralCards = plan.keepCards.filter((card) => !confirmedIds.has(cardId(card)));

    return {
      plan,
      keepCards: plan.keepCards.slice(),
      appliedReplacements: replacementOption.rows,
      replacementProgress: replacementOption.progress,
      structuralCards
    };
  }

  function compareRedrawDecisions(left, right) {
    if (!right) return 1;
    const leftPriority = left.plan.priority === null ? Number.POSITIVE_INFINITY : left.plan.priority;
    const rightPriority = right.plan.priority === null ? Number.POSITIVE_INFINITY : right.plan.priority;
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    if (left.plan.priority !== null && right.plan.priority !== null) {
      const candidateComparison = compareCandidates(left.plan, right.plan);
      if (candidateComparison) return candidateComparison;
    }
    if (left.replacementProgress !== right.replacementProgress) return left.replacementProgress - right.replacementProgress;
    if (left.structuralCards.length !== right.structuralCards.length) return right.structuralCards.length - left.structuralCards.length;
    return right.appliedReplacements.length - left.appliedReplacements.length;
  }

  function reconcileAfterRedraw(hand, previousKeepCards) {
    const handIds = new Set(hand.map(cardId));
    const automatic = planHand(hand);

    // REDRAW 後若六張牌已直接形成最高完成牌型，必須立刻改保留該牌型；
    // 這是唯一可以取消既有玩家保留牌的例外。
    if (["royalFlush", "straightFlush", "fourOfAKind"].includes(automatic.key)) {
      return {
        plan: automatic,
        keepCards: automatic.keepCards,
        legalReplacements: [],
        appliedReplacements: [],
        forcedOverride: true,
        oldKeepCards: previousKeepCards.slice(),
        missingConfirmedCards: previousKeepCards.filter((card) => !handIds.has(cardId(card)))
      };
    }

    const kept = previousKeepCards.filter((card) => handIds.has(cardId(card)));
    const lockedPlan = analyzeSelection(kept);
    const replacementOptions = sameRankReplacementOptions(hand, kept, lockedPlan);
    const legalReplacements = legalSameRankReplacements(hand, kept);
    let bestDecision = null;
    for (const option of replacementOptions) {
      const decision = buildRedrawDecision(hand, option);
      if (!bestDecision || compareRedrawDecisions(decision, bestDecision) > 0) bestDecision = decision;
    }

    return {
      plan: bestDecision.plan,
      keepCards: bestDecision.keepCards,
      legalReplacements,
      appliedReplacements: bestDecision.appliedReplacements,
      forcedOverride: false,
      oldKeepCards: previousKeepCards.slice(),
      missingConfirmedCards: previousKeepCards.filter((card) => !handIds.has(cardId(card)))
    };
  }

  function logicalRank(card, plan) {
    if (!card?.joker) return Number(card?.rank || 0);
    return Number(plan?.jokerRank || 15);
  }

  function displayRank(card, plan) {
    const rank = logicalRank(card, plan);
    return rank === 14 ? 1 : rank;
  }

  function suitOrder(card) {
    if (card?.joker) return SUITS.length;
    const index = SUITS.indexOf(card?.suit);
    return index < 0 ? SUITS.length : index;
  }

  function sortCardsForDisplay(cards, plan) {
    return cards.slice().sort((left, right) =>
      displayRank(left, plan) - displayRank(right, plan) ||
      suitOrder(left) - suitOrder(right)
    );
  }

  function arrangeHandForDisplay(hand, plan, selectedIds = null) {
    const selected = selectedIds instanceof Set
      ? selectedIds
      : new Set((plan?.keepCards || []).map(cardId));
    const retained = sortCardsForDisplay(hand.filter((card) => selected.has(cardId(card))), plan);
    const loose = hand.filter((card) => !selected.has(cardId(card)));
    return [...retained, ...loose];
  }

  function makeDeck() {
    const deck = [];
    for (const suit of SUITS) for (let rank = 2; rank <= 14; rank += 1) deck.push(naturalCard(rank, suit));
    return deck;
  }

  return Object.freeze({
    SUITS,
    SUIT_LABELS,
    PRIORITIES,
    STRAIGHT_WINDOWS,
    rankLabel,
    cardId,
    cardLabel,
    effectLabel,
    hasCrit,
    hasFlat,
    hasEffect,
    naturalCard,
    jokerCard,
    makeDeck,
    buildCandidates,
    planHand,
    analyzeSelection,
    straightFlushProgress,
    targetFamily,
    isAllowedStructuralTransition,
    legalSameRankReplacements,
    reconcileAfterRedraw,
    displayRank,
    arrangeHandForDisplay
  });
});
