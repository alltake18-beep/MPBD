"use strict";

(function attachBossDuelRules(root, factory) {
  const arrangementCore = root.BossDuelPokerArrangementLabCore || (
    typeof module === "object" && module.exports && typeof require === "function"
      ? require("./boss-duel-poker-arrangement-lab-core.js")
      : null
  );
  const api = factory(root.BossDuelCore, arrangementCore);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BossDuelRules = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createBossDuelRules(Core, ArrangementCore) {
  if (!ArrangementCore) throw new Error("Boss Duel 正式規則缺少共用理牌核心");
  const SUITS = ["S", "H", "D", "C"];
  const SUIT_GLYPHS = { S: "♠", H: "♥", D: "♦", C: "♣", JOKER: "" };
  const HANDS = (Core?.HANDS || [
    { key: "high", label: "高牌", damage: 0 },
    { key: "pair", label: "對子", damage: 1 },
    { key: "twoPair", label: "兩對", damage: 2 },
    { key: "three", label: "三條", damage: 3 },
    { key: "straight", label: "順子", damage: 4 },
    { key: "flush", label: "同花", damage: 5 },
    { key: "fullHouse", label: "葫蘆", damage: 8 },
    { key: "four", label: "四條", damage: 15 },
    { key: "straightFlush", label: "同花順", damage: 30 }
  ]).map((hand, rank) => ({ ...hand, rank }));
  const HAND_BY_KEY = Object.fromEntries(HANDS.map((hand) => [hand.key, hand]));
  const COMBOS = [
    [0, 1, 2, 3, 4], [0, 1, 2, 3, 5], [0, 1, 2, 4, 5],
    [0, 1, 3, 4, 5], [0, 2, 3, 4, 5], [1, 2, 3, 4, 5]
  ];
  const MAGIC_TABLE = [
    { key: "threeBoost", label: "THREE OF A KIND", tickets: 50, min: 1, max: 3, target: "three", type: "DMG" },
    { key: "fourBoost", label: "FOUR OF A KIND", tickets: 75, min: 1, max: 3, target: "four", type: "DMG" },
    { key: "straightBoost", label: "STRAIGHT", tickets: 125, min: 1, max: 3, target: "straight", type: "DMG" },
    { key: "flushBoost", label: "FLUSH", tickets: 175, min: 1, max: 3, target: "flush", type: "DMG" },
    { key: "fullHouseBoost", label: "FULL HOUSE", tickets: 175, min: 1, max: 3, target: "fullHouse", type: "DMG" },
    { key: "joker", label: "JOKER", tickets: 50, min: 1, max: 1, target: "joker", type: "JOKER" },
    { key: "crit", label: "CRITICAL", tickets: 100, min: 1, max: 5, target: "crit", type: "DMG" },
    { key: "flatDamage", label: "FIXED DMG", tickets: 175, min: 3, max: 6, target: "flat", type: "DMG" },
    { key: "coin", label: "GOLD", tickets: 25, min: 3, max: 6, target: "coin", type: "GOLD" },
    { key: "freeDraw", label: "FREE REDRAW", tickets: 50, min: 1, max: 1, target: "freeDraw", type: "DRAW" }
  ];

  function randomInt(min, max, rng) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function cloneCard(card) {
    return { ...card, magicEffects: card.magicEffects ? { ...card.magicEffects } : undefined };
  }

  function makeDeck(ranks) {
    const cards = [];
    for (const rank of ranks) {
      for (let suitIndex = 0; suitIndex < SUITS.length; suitIndex += 1) {
        const suit = SUITS[suitIndex];
        cards.push({ rank, suit, suitIndex, baseId: `${rank}${suit}` });
      }
    }
    return cards;
  }

  function shuffled(deck, rng) {
    const copy = deck.map(cloneCard);
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = randomInt(0, index, rng);
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function cardId(card) {
    return card.baseId || `${card.rank}${card.suit}`;
  }

  function cardLabel(card) {
    if (card.joker) return "JOKER";
    return card.rank <= 10 ? String(card.rank) : ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[card.rank];
  }

  function magicDescription(card) {
    if (!card) return "";
    if (card.key === "joker") return "隨機一張手牌變成 JOKER，可代替任意牌。";
    if (card.key === "freeDraw") return "本回合第一次 REDRAW 免費。";
    if (card.key === "coin") return `擊敗目前 BOSS 時，骰子獎勵再加 ${card.value}x。`;
    if (card.key === "flatDamage") return `綁定一張手牌；該牌進入最佳五張時追加 ${card.value} 固定傷害。`;
    if (card.key === "crit") return `綁定一張手牌；該牌進入最佳五張時提供 ${card.value}x 暴擊倍率。`;
    return `完成 ${card.label} 時，傷害倍率加入 ${card.value}x。`;
  }

  function compareArrays(a, b) {
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const delta = (a[index] || 0) - (b[index] || 0);
      if (delta) return delta;
    }
    return 0;
  }

  function straightHigh(ranks) {
    const unique = [...new Set(ranks)].sort((a, b) => b - a);
    if (unique.includes(14)) unique.push(1);
    let run = 1;
    for (let index = 1; index < unique.length; index += 1) {
      if (unique[index - 1] - unique[index] === 1) run += 1;
      else run = 1;
      if (run >= 5) return unique[index - 4];
    }
    return 0;
  }

  function evaluateFivePlain(cards) {
    const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
    const groups = [...ranks.reduce((map, rank) => map.set(rank, (map.get(rank) || 0) + 1), new Map()).entries()]
      .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const straight = straightHigh(ranks);
    if (flush && straight) return { ...HAND_BY_KEY.straightFlush, tiebreak: [straight] };
    if (groups[0][1] === 4) return { ...HAND_BY_KEY.four, tiebreak: [groups[0][0], groups[1][0]] };
    if (groups[0][1] === 3 && groups[1][1] === 2) return { ...HAND_BY_KEY.fullHouse, tiebreak: [groups[0][0], groups[1][0]] };
    if (flush) return { ...HAND_BY_KEY.flush, tiebreak: ranks };
    if (straight) return { ...HAND_BY_KEY.straight, tiebreak: [straight] };
    if (groups[0][1] === 3) return { ...HAND_BY_KEY.three, tiebreak: [groups[0][0], ...groups.slice(1).map((row) => row[0]).sort((a, b) => b - a)] };
    const pairs = groups.filter((row) => row[1] === 2).sort((a, b) => b[0] - a[0]);
    if (pairs.length >= 2) {
      const pairRanks = pairs.slice(0, 2).map((row) => row[0]);
      const kicker = groups.filter((row) => !pairRanks.includes(row[0])).map((row) => row[0]).sort((a, b) => b - a)[0];
      return { ...HAND_BY_KEY.twoPair, tiebreak: [...pairRanks, kicker] };
    }
    if (pairs.length === 1) {
      const kickers = groups.filter((row) => row[0] !== pairs[0][0]).map((row) => row[0]).sort((a, b) => b - a);
      return { ...HAND_BY_KEY.pair, tiebreak: [pairs[0][0], ...kickers] };
    }
    return { ...HAND_BY_KEY.high, tiebreak: ranks };
  }

  function compareEval(a, b) {
    return a.rank - b.rank || compareArrays(a.tiebreak || [], b.tiebreak || []);
  }

  function hasAttachedEffect(card) {
    return Boolean(card?.magicEffects && (
      Object.prototype.hasOwnProperty.call(card.magicEffects, "crit") ||
      Object.prototype.hasOwnProperty.call(card.magicEffects, "flatDamage")
    ));
  }

  function boundCardCount(cards) {
    return cards.reduce((count, card) => count + (hasAttachedEffect(card) ? 1 : 0), 0);
  }

  function comboHasCritBound(cards) {
    return cards.some((card) => Object.prototype.hasOwnProperty.call(card.magicEffects || {}, "crit"));
  }

  function straightSmallestCardBound(cards) {
    const real = cards.filter((card) => !card.joker);
    if (!real.length) return false;
    const ranks = new Set(real.map((card) => card.rank));
    const smallestRank = ranks.has(14) && ranks.has(2) && !ranks.has(13)
      ? 14
      : Math.min(...real.map((card) => card.rank));
    return real.some((card) => card.rank === smallestRank && hasAttachedEffect(card));
  }

  function suitRankHigherCombo(a, b) {
    if (!a || !b) return false;
    const orderKey = (card) => card.joker ? -1 : (card.rank - 2) * 4 + (3 - (SUITS.indexOf(card.suit) >= 0 ? SUITS.indexOf(card.suit) : 0));
    const left = a.slice().sort((x, y) => orderKey(x) - orderKey(y));
    const right = b.slice().sort((x, y) => orderKey(x) - orderKey(y));
    for (let index = 0; index < left.length; index += 1) {
      const leftRank = left[index].joker ? 0 : left[index].rank;
      const rightRank = right[index].joker ? 0 : right[index].rank;
      if (leftRank !== rightRank) return false;
    }
    for (let index = left.length - 1; index >= 0; index -= 1) {
      const delta = orderKey(left[index]) - orderKey(right[index]);
      if (delta) return delta > 0;
    }
    return false;
  }

  function priorityBoundCard(cards) {
    let fixedCard = null;
    for (const card of cards) {
      if (card.joker) continue;
      const effects = card.magicEffects || {};
      if (Object.prototype.hasOwnProperty.call(effects, "crit")) return card;
      if (!fixedCard && Object.prototype.hasOwnProperty.call(effects, "flatDamage")) fixedCard = card;
    }
    return fixedCard;
  }

  function applyPairJokerBoundValue(cards, jokerIndex, evaluation) {
    if (!evaluation || evaluation.key !== "pair") return evaluation;
    const bound = priorityBoundCard(cards);
    if (!bound || bound.rank === evaluation.tiebreak[0]) return evaluation;
    const kickers = cards
      .filter((card, index) => index !== jokerIndex && card !== bound)
      .map((card) => card.rank)
      .sort((a, b) => b - a);
    return { ...evaluation, tiebreak: [bound.rank, ...kickers], jokerRank: bound.rank };
  }

  function evaluateFive(cards) {
    const jokerIndex = cards.findIndex((card) => card.joker);
    if (jokerIndex < 0) return { ...evaluateFivePlain(cards), cards };
    const used = new Set(cards.filter((card) => !card.joker).map(cardId));
    let best = null;
    for (const replacement of makeDeck(Array.from({ length: 13 }, (_, index) => index + 2))) {
      if (used.has(cardId(replacement))) continue;
      const candidate = cards.slice();
      candidate[jokerIndex] = { ...replacement, joker: true, baseId: cards[jokerIndex].baseId, magicEffects: cards[jokerIndex].magicEffects };
      const evaluation = { ...evaluateFivePlain(candidate), cards, jokerRank: replacement.rank };
      if (!best || compareEval(evaluation, best) > 0) best = evaluation;
    }
    return applyPairJokerBoundValue(cards, jokerIndex, best);
  }

  function evaluateBest(hand) {
    let best = null;
    let bestCards = null;
    let bestBoundCount = 0;
    let bestHasCrit = false;
    let bestSmallestBound = false;
    const hasBound = hand.some(hasAttachedEffect);
    for (const indexes of COMBOS) {
      const cards = indexes.map((index) => hand[index]);
      const evaluation = evaluateFive(cards);
      let take = false;
      if (!best) {
        take = true;
      } else if (!hasBound) {
        const power = compareEval(evaluation, best);
        take = power > 0 || (power === 0 && suitRankHigherCombo(cards, bestCards));
      } else if (evaluation.rank !== best.rank) {
        take = evaluation.rank > best.rank;
      } else {
        const straightLike = evaluation.key === "straight" || evaluation.key === "straightFlush";
        const smallestBound = straightLike && straightSmallestCardBound(cards);
        const boundCount = boundCardCount(cards);
        const hasCrit = comboHasCritBound(cards);
        if (straightLike && smallestBound !== bestSmallestBound) take = smallestBound;
        else if (boundCount !== bestBoundCount) take = boundCount > bestBoundCount;
        else if (hasCrit !== bestHasCrit) take = hasCrit;
        else {
          const power = compareEval(evaluation, best);
          take = power > 0 || (power === 0 && suitRankHigherCombo(cards, bestCards));
        }
      }
      if (take) {
        best = evaluation;
        bestCards = cards;
        if (hasBound) {
          const straightLike = evaluation.key === "straight" || evaluation.key === "straightFlush";
          bestSmallestBound = straightLike && straightSmallestCardBound(cards);
          bestBoundCount = boundCardCount(cards);
          bestHasCrit = comboHasCritBound(cards);
        }
      }
    }
    if (best) best.cards = bestCards;
    return best || { ...HAND_BY_KEY.high, tiebreak: [], cards: [] };
  }

  function weightedPick(rows, rng) {
    let cursor = rng() * rows.reduce((sum, row) => sum + Math.max(0, row.tickets || 0), 0);
    for (const row of rows) {
      cursor -= Math.max(0, row.tickets || 0);
      if (cursor < 0) return row;
    }
    return rows[rows.length - 1];
  }

  function normalizeMagicRows(rows, useHighTickets = true) {
    return (Array.isArray(rows) && rows.length ? rows : MAGIC_TABLE).map((row) => {
      if (!Array.isArray(row)) return { ...row };
      return {
        key: String(row[0]), label: String(row[1]),
        tickets: Number(row[useHighTickets ? 3 : 2] || 0),
        min: Number(row[4] || 0), max: Number(row[5] || row[4] || 0),
        target: String(row[6] || ""), type: /^(?:joker)$/i.test(String(row[0])) ? "JOKER"
          : /^(?:coin)$/i.test(String(row[0])) ? "GOLD"
            : /^(?:freeDraw)$/i.test(String(row[0])) ? "DRAW" : "DMG"
      };
    });
  }

  function drawMagicCardsFromTable(rng, rows = MAGIC_TABLE, count = 2, useHighTickets = true) {
    const pool = normalizeMagicRows(rows, useHighTickets);
    const cards = [];
    const drawCount = Math.max(0, Math.min(pool.length, Math.trunc(Number(count) || 0)));
    for (let index = 0; index < drawCount; index += 1) {
      const available = pool.filter((item) => item.tickets > 0);
      if (!available.length) break;
      const row = weightedPick(available, rng);
      cards.push({ ...row, value: randomInt(row.min, row.max, rng), effectSlot: randomInt(0, 5, rng) });
      const used = pool.find((item) => item.key === row.key);
      if (used) used.tickets = 0;
    }
    return cards;
  }

  function drawMagicCards(rng) {
    return drawMagicCardsFromTable(rng, MAGIC_TABLE, 2, true);
  }

  function plannedMagic(packet, roundNumber, hpLeft, rng, redealIndex = 0) {
    if (redealIndex > 0) return drawMagicCards(rng);
    if (Core?.magicPlanForRound) return Core.magicPlanForRound(packet, roundNumber, hpLeft).map((card) => ({ ...card }));
    const finalWindow = packet.win && roundNumber >= packet.targetRound;
    if (!finalWindow) return drawMagicCards(rng);
    const routeIndex = (packet.packetSeed + roundNumber) % 3;
    if (routeIndex === 0) {
      const cards = drawMagicCards(rng);
      const neededCrit = Math.max(1, Math.min(5, Math.ceil(hpLeft / HAND_BY_KEY.straightFlush.damage)));
      const critIndex = cards.findIndex((card) => card.key === "crit");
      const guaranteedCrit = {
        ...MAGIC_TABLE.find((card) => card.key === "crit"),
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
        { ...MAGIC_TABLE.find((card) => card.key === "crit"), value: crit, effectSlot: 0 },
        { ...MAGIC_TABLE.find((card) => card.key === "fourBoost"), value: 1, effectSlot: 1 }
      ];
    }
    const needed = Math.max(2, Math.min(8, Math.ceil(hpLeft / 8)));
    const boost = Math.max(1, Math.min(3, needed - 1));
    const crit = Math.max(1, Math.min(5, needed - boost));
    return [
      { ...MAGIC_TABLE.find((card) => card.key === "crit"), value: crit, effectSlot: 0 },
      { ...MAGIC_TABLE.find((card) => card.key === "fullHouseBoost"), value: boost, effectSlot: 1 }
    ];
  }

  function applyEntryMagic(hand, magicCards) {
    const result = hand.map(cloneCard);
    const joker = magicCards.find((card) => card.key === "joker");
    if (joker) {
      const source = result[joker.effectSlot];
      result[joker.effectSlot] = { ...source, joker: true, rank: 0, suit: "JOKER", baseId: cardId(source) };
    }
    for (const magic of magicCards) {
      if (magic.key !== "crit" && magic.key !== "flatDamage") continue;
      const source = result[magic.effectSlot];
      result[magic.effectSlot] = { ...source, magicEffects: { ...(source.magicEffects || {}), [magic.key]: magic.value } };
    }
    return result;
  }

  function routeHand(route, complete, seed) {
    const suit = SUITS[seed % 4];
    const offset = seed % 5;
    const straight = [6 + offset, 7 + offset, 8 + offset, 9 + offset, 10 + offset];
    const junk = [
      { rank: 5, suit: SUITS[(seed + 1) % 4] },
      { rank: 3, suit: SUITS[(seed + 2) % 4] },
      { rank: 2, suit: SUITS[(seed + 3) % 4] }
    ];
    let cards;
    if (route === "straightFlush") {
      cards = straight.slice(0, complete ? 5 : 4).map((rank) => ({ rank, suit }));
      cards.push(...junk.slice(0, 6 - cards.length));
    } else if (route === "four") {
      const rank = 8 + seed % 5;
      cards = SUITS.slice(0, complete ? 4 : 3).map((cardSuit) => ({ rank, suit: cardSuit }));
      cards.push(...junk.slice(0, 6 - cards.length));
    } else {
      const threeRank = 9 + seed % 4;
      const pairRank = 6 + seed % 3;
      cards = SUITS.slice(0, 3).map((cardSuit) => ({ rank: threeRank, suit: cardSuit }));
      cards.push({ rank: pairRank, suit: "S" });
      if (complete) cards.push({ rank: pairRank, suit: "H" });
      cards.push(...junk.slice(0, 6 - cards.length));
    }
    const seen = new Set();
    return cards.slice(0, 6).map((card, index) => {
      let next = { ...card };
      while (seen.has(`${next.rank}${next.suit}`)) next = { rank: 2 + ((next.rank + index) % 13), suit: SUITS[(SUITS.indexOf(next.suit) + 1) % 4] };
      seen.add(`${next.rank}${next.suit}`);
      return { ...next, suitIndex: SUITS.indexOf(next.suit), baseId: `${next.rank}${next.suit}` };
    });
  }

  function removeFromDeck(deck, cards) {
    const removed = new Set(cards.map(cardId));
    return deck.filter((card) => !removed.has(cardId(card)));
  }

  function dealNatural(rng) {
    const playerDeck = shuffled(makeDeck(Array.from({ length: 13 }, (_, index) => index + 2)), rng);
    const bossDeck = shuffled(makeDeck(Array.from({ length: 9 }, (_, index) => index + 6)), rng);
    return { playerCards: playerDeck.splice(0, 6), playerDeck, bossCards: bossDeck.splice(0, 6) };
  }

  function dealNaturalWithBadHighRerolls(rng, options = {}) {
    const playerPct = Math.max(0, Math.min(100, Number(options.playerBadHighRerollPct) || 0)) / 100;
    const bossPct = Math.max(0, Math.min(100, Number(options.bossBadHighRerollPct) || 0)) / 100;
    const limit = Math.max(0, Math.trunc(Number(options.initialRerollLimit) || 0));
    let playerCards;
    let playerDeck;
    let playerRerolls = 0;
    do {
      playerDeck = shuffled(makeDeck(Array.from({ length: 13 }, (_value, index) => index + 2)), rng);
      playerCards = playerDeck.splice(0, 6);
      if (evaluateBest(playerCards).key !== "high" || playerRerolls >= limit || rng() >= playerPct) break;
      playerRerolls += 1;
    } while (true);

    let bossCards;
    let bossRerolls = 0;
    do {
      const bossDeck = shuffled(makeDeck(Array.from({ length: 9 }, (_value, index) => index + 6)), rng);
      bossCards = bossDeck.splice(0, 6);
      if (evaluateBest(bossCards).key !== "high" || bossRerolls >= limit || rng() >= bossPct) break;
      bossRerolls += 1;
    } while (true);
    return { playerCards, playerDeck, bossCards, playerRerolls, bossRerolls };
  }

  function makeControlledRound(packet, roundNumber, hpLeft, rng) {
    const finalWindow = packet.win && roundNumber >= packet.targetRound;
    const route = (packet.packetSeed + roundNumber) % 3 === 0 ? "straightFlush" : ((packet.packetSeed + roundNumber) % 3 === 1 ? "four" : "fullHouse");
    const complete = finalWindow && (packet.requiredDraws === 0 || route === "straightFlush");
    let deal = dealNatural(rng);
    let plan = null;
    if (finalWindow) {
      const routeSeed = packet.packetSeed + roundNumber;
      const raw = routeHand(route, complete, routeSeed);
      deal.playerCards = raw;
      deal.playerDeck = shuffled(removeFromDeck(makeDeck(Array.from({ length: 13 }, (_, index) => index + 2)), raw), rng);
      const bossRaw = [
        { rank: 6, suit: "S" }, { rank: 6, suit: "H" }, { rank: 8, suit: "D" },
        { rank: 10, suit: "C" }, { rank: 12, suit: "S" }, { rank: 14, suit: "H" }
      ].map((card) => ({ ...card, suitIndex: SUITS.indexOf(card.suit), baseId: `${card.rank}${card.suit}` }));
      deal.bossCards = bossRaw;
      const targetCards = routeHand(route, true, routeSeed).slice(0, route === "four" ? 4 : 5);
      const targetIds = targetCards.map(cardId);
      const avoidRanks = route === "fullHouse" ? [...new Set(raw.slice(0, 4).map((card) => card.rank))] : [];
      const counts = targetCards.reduce((map, card) => map.set(card.rank, (map.get(card.rank) || 0) + 1), new Map());
      const countRows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      plan = {
        route, routeSeed, completeAt: packet.requiredDraws, targetIds, avoidRanks,
        targetRank: route === "four" ? targetCards[0].rank : null,
        tripleRank: route === "fullHouse" ? countRows[0]?.[0] : null,
        pairRank: route === "fullHouse" ? countRows[1]?.[0] : null,
        targetSuit: route === "straightFlush" ? targetCards[0].suit : null,
        targetRanks: route === "straightFlush" ? targetCards.map((card) => card.rank) : null
      };
    } else if (!packet.win && roundNumber >= packet.roundLimit) {
      const raw = [
        { rank: 14, suit: "S" }, { rank: 12, suit: "H" }, { rank: 10, suit: "D" },
        { rank: 8, suit: "C" }, { rank: 5, suit: "S" }, { rank: 2, suit: "H" }
      ].map((card) => ({ ...card, suitIndex: SUITS.indexOf(card.suit), baseId: `${card.rank}${card.suit}` }));
      deal.playerCards = raw;
      deal.playerDeck = shuffled(removeFromDeck(makeDeck(Array.from({ length: 13 }, (_, index) => index + 2)), raw), rng);
    }
    return { ...deal, plan };
  }

  function bestStraightHold(hand, sameSuit = false) {
    let best = [];
    const suitGroups = sameSuit ? SUITS.map((suit) => hand.filter((card) => card.joker || card.suit === suit)) : [hand];
    for (const group of suitGroups) {
      for (let low = 1; low <= 10; low += 1) {
        const ranks = new Set([low === 1 ? 14 : low, low + 1, low + 2, low + 3, low + 4]);
        const picked = group.filter((card) => card.joker || ranks.has(card.rank));
        const unique = [];
        const seen = new Set();
        for (const card of picked) {
          const key = card.joker ? "J" : card.rank;
          if (!seen.has(key)) { seen.add(key); unique.push(card); }
        }
        if (unique.length > best.length) best = unique;
      }
    }
    return best;
  }

  const STRAIGHT_WINDOWS = [
    ...Array.from({ length: 9 }, (_value, index) => Array.from({ length: 5 }, (_item, offset) => index + 2 + offset)),
    [2, 3, 4, 5, 14]
  ];

  function combinations(cards, size) {
    if (size === 0) return [[]];
    if (cards.length < size) return [];
    const [head, ...tail] = cards;
    return [
      ...combinations(tail, size - 1).map((row) => [head, ...row]),
      ...combinations(tail, size)
    ];
  }

  function hasBoundBonus(card) {
    return Boolean(card?.magicEffects?.crit || card?.magicEffects?.flatDamage);
  }

  function effectPriority(card) {
    if (card?.magicEffects?.crit) return 2;
    if (card?.magicEffects?.flatDamage) return 1;
    return 0;
  }

  function suitPriority(card) {
    return card?.joker ? 99 : Math.max(0, 4 - SUITS.indexOf(card.suit));
  }

  function coreWeight(card) {
    if (card?.joker) return 9999;
    return card.rank * 10 + suitPriority(card) + (hasBoundBonus(card) ? 0.1 : 0);
  }

  function sortByCore(cards) {
    return cards.slice().sort((left, right) => coreWeight(right) - coreWeight(left));
  }

  function sortByEffectThenCore(cards) {
    return cards.slice().sort((left, right) =>
      effectPriority(right) - effectPriority(left) || coreWeight(right) - coreWeight(left)
    );
  }

  function groupByRank(cards) {
    const groups = new Map();
    for (const card of cards) {
      const key = card.joker ? `joker-${cardId(card)}` : card.rank;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    }
    return [...groups.values()];
  }

  function sortGroups(cards) {
    return groupByRank(cards)
      .sort((left, right) => right.length - left.length || coreWeight(right[0]) - coreWeight(left[0]))
      .flatMap(sortByCore);
  }

  function straightWindowHigh(window) {
    return window.includes(14) && window.includes(2) ? 5 : Math.max(...window);
  }

  function uniqueRanks(cards) {
    return [...new Set(cards.filter((card) => !card.joker).map((card) => card.rank))];
  }

  function canRepresentRun(run, cards) {
    const ranks = uniqueRanks(cards);
    const jokers = cards.filter((card) => card.joker).length;
    return ranks.every((rank) => run.includes(rank)) && run.filter((rank) => !ranks.includes(rank)).length <= jokers;
  }

  function isStraightDrawGroup(cards) {
    if (cards.length < 2 || cards.length > 4) return false;
    const ranks = uniqueRanks(cards);
    if (ranks.length !== cards.filter((card) => !card.joker).length) return false;
    return STRAIGHT_WINDOWS.some((window) => ranks.every((rank) => window.includes(rank)));
  }

  function sortLockedCards(cards) {
    const jokers = cards.filter((card) => card.joker);
    const regular = cards.filter((card) => !card.joker);
    if (!isStraightDrawGroup(regular)) return [...jokers, ...sortGroups(regular)];
    return [...jokers, ...sortByCore(regular)];
  }

  function sortUnlockedCards(cards) {
    const bonus = sortByCore(cards.filter(hasBoundBonus));
    const rest = sortByCore(cards.filter((card) => !hasBoundBonus(card)));
    return [...bonus, ...rest];
  }

  function pickRanksForWindow(hand, window, need, suit = null) {
    const picked = [];
    const used = new Set();
    for (const rank of window) {
      if (picked.length >= need) break;
      const choices = sortByEffectThenCore(hand.filter((card) =>
        !card.joker && !used.has(card) && card.rank === rank && (suit === null || card.suit === suit)
      ));
      if (!choices.length) continue;
      picked.push(choices[0]);
      used.add(choices[0]);
    }
    const joker = hand.find((card) => card.joker);
    if (picked.length >= need) return picked.slice(0, need);
    if (joker && picked.length === need - 1) return [...picked, joker];
    return null;
  }

  function isOpenEndedCandidate(cards) {
    const runs = [
      [2, 3, 4, 5],
      ...Array.from({ length: 8 }, (_value, index) => Array.from({ length: 4 }, (_item, offset) => index + 3 + offset))
    ];
    return runs.some((run) => canRepresentRun(run, cards));
  }

  function isThreeCardRun(cards) {
    const runs = [
      [14, 2, 3],
      ...Array.from({ length: 11 }, (_value, index) => Array.from({ length: 3 }, (_item, offset) => index + 2 + offset))
    ];
    return runs.some((run) => canRepresentRun(run, cards));
  }

  function candidate(priority, tendency, cards) {
    const unique = [...new Set(cards)];
    return unique.length && unique.length <= 5 ? { priority, tendency, cards: unique } : null;
  }

  function countEffect(cards, key) {
    return cards.filter((card) => Number(card?.magicEffects?.[key] || 0) > 0).length;
  }

  function cardRankTie(cards) {
    return cards.slice().sort((left, right) => right.rank - left.rank).map((card) => card.joker ? 0 : card.rank);
  }

  function candidateStraightHigh(cards) {
    const ranks = uniqueRanks(cards);
    let best = -1;
    for (const window of STRAIGHT_WINDOWS) {
      if (ranks.every((rank) => window.includes(rank))) best = Math.max(best, straightWindowHigh(window));
    }
    return best;
  }

  function candidateFaceTie(row) {
    if (["royalFlush", "straightFlush", "straightFlushDraw", "straight", "straightDraw"].includes(row.tendency)) {
      return [candidateStraightHigh(row.cards), ...cardRankTie(row.cards)];
    }
    if (row.tendency === "fourOfAKind") {
      const bestGroup = groupByRank(row.cards.filter((card) => !card.joker)).sort((a, b) => b.length - a.length || b[0].rank - a[0].rank)[0];
      return [bestGroup?.[0]?.rank || 0, ...cardRankTie(row.cards)];
    }
    return cardRankTie(row.cards);
  }

  function compareCandidate(left, right) {
    if (!right) return 1;
    const crit = countEffect(left.cards, "crit") - countEffect(right.cards, "crit");
    if (crit) return crit;
    const fixed = countEffect(left.cards, "flatDamage") - countEffect(right.cards, "flatDamage");
    if (fixed) return fixed;
    return compareArrays(candidateFaceTie(left), candidateFaceTie(right));
  }

  function bestCandidate(rows) {
    let best = null;
    for (const row of rows.filter(Boolean)) {
      if (!best || row.priority < best.priority || (row.priority === best.priority && compareCandidate(row, best) > 0)) best = row;
    }
    return best;
  }

  function madeFiveCandidates(hand, priority, tendency, predicate) {
    return combinations(hand, 5)
      .filter((cards) => predicate(evaluateFive(cards)))
      .map((cards) => candidate(priority, tendency, cards));
  }

  function rankGroupCandidates(hand, priority, need, tendency) {
    const joker = hand.find((card) => card.joker);
    const rows = [];
    for (const group of groupByRank(hand.filter((card) => !card.joker))) {
      let cards = null;
      if (group.length >= need) cards = sortByEffectThenCore(group).slice(0, need);
      else if (joker && group.length === need - 1) cards = [...sortByEffectThenCore(group), joker];
      if (!cards) continue;
      if (tendency === "fourOfAKind" && cards.length === 4) {
        const coreIds = new Set(cards.map(cardId));
        const effectKicker = sortByEffectThenCore(hand.filter((card) => !coreIds.has(cardId(card)) && hasBoundBonus(card)))[0];
        if (effectKicker) cards = [...cards, effectKicker];
      }
      rows.push(candidate(priority, tendency, cards));
    }
    return rows;
  }

  function flushCandidates(hand, priority, need, tendency) {
    const joker = hand.find((card) => card.joker);
    const rows = [];
    for (const suit of SUITS) {
      const suited = sortByEffectThenCore(hand.filter((card) => !card.joker && card.suit === suit));
      let cards = null;
      if (suited.length >= need) cards = suited.slice(0, need);
      else if (joker && suited.length === need - 1) cards = [...suited, joker];
      if (cards) rows.push(candidate(priority, tendency, cards));
    }
    return rows;
  }

  function straightCandidates(hand, priority, need, tendency, suit = null, mode = "any") {
    const rows = [];
    for (const window of STRAIGHT_WINDOWS) {
      const cards = pickRanksForWindow(hand, window, need, suit);
      if (!cards) continue;
      if (mode === "open" && !(need === 4 ? isOpenEndedCandidate(cards) : isThreeCardRun(cards))) continue;
      if (mode === "sparse") {
        const ranks = uniqueRanks(cards).slice().sort((a, b) => a - b);
        if (isThreeCardRun(cards) || (ranks.length === 3 && ranks[2] - ranks[0] === 2)) continue;
      }
      rows.push(candidate(priority, tendency, cards));
    }
    return rows;
  }

  function canBeTwoPair(cards) {
    const jokerCount = cards.filter((card) => card.joker).length;
    const groups = groupByRank(cards.filter((card) => !card.joker));
    const pairs = groups.filter((group) => group.length >= 2).length;
    const singles = groups.filter((group) => group.length === 1).length;
    return jokerCount ? pairs >= 1 && singles >= 1 : pairs >= 2;
  }

  function lockPlanFromCandidate(hand, row, candidates = []) {
    const ordered = [
      ...hand.filter((card) => card.joker),
      ...(row?.cards || []).filter((card) => !card.joker)
    ];
    const keepCards = [...new Set(ordered)].slice(0, 5);
    const keepIds = new Set(keepCards.map(cardId));
    const keepIndexes = new Set(hand.map((card, index) => keepIds.has(cardId(card)) ? index : -1).filter((index) => index >= 0));
    const discardIndexes = new Set(hand.map((_card, index) => keepIndexes.has(index) ? -1 : index).filter((index) => index >= 0));
    return { priority: row?.priority || 99, tendency: row?.tendency || null, cards: keepCards, keepIndexes, discardIndexes, candidates };
  }

  function autoLockPlan(hand) {
    const rows = [];
    rows.push(...madeFiveCandidates(hand, 1, "royalFlush", (evaluation) => evaluation.key === "straightFlush" && evaluation.tiebreak?.[0] === 14));
    rows.push(...madeFiveCandidates(hand, 2, "straightFlush", (evaluation) => evaluation.key === "straightFlush"));
    rows.push(...rankGroupCandidates(hand, 3, 4, "fourOfAKind"));
    for (const suit of SUITS) {
      rows.push(...straightCandidates(hand, 4, 4, "straightFlushDraw", suit, "open"));
      rows.push(...straightCandidates(hand, 5, 4, "straightFlushDraw", suit).filter((row) => !isOpenEndedCandidate(row.cards)));
    }
    rows.push(...madeFiveCandidates(hand, 6, "fullHouse", (evaluation) => evaluation.key === "fullHouse"));
    rows.push(...flushCandidates(hand, 7, 5, "flush"));
    rows.push(...flushCandidates(hand, 8, 4, "flushDraw"));
    rows.push(...madeFiveCandidates(hand, 9, "straight", (evaluation) => evaluation.key === "straight" || evaluation.key === "straightFlush"));
    rows.push(...straightCandidates(hand, 10, 4, "straightDraw", null, "open"));
    rows.push(...straightCandidates(hand, 11, 4, "straightDraw"));
    rows.push(...rankGroupCandidates(hand, 12, 3, "threeOfAKind"));
    rows.push(...combinations(hand, 4).filter(canBeTwoPair).map((cards) => candidate(13, "twoPair", cards)));
    rows.push(...flushCandidates(hand, 14, 3, "flushDraw"));
    rows.push(...straightCandidates(hand, 15, 3, "straightDraw", null, "open"));
    rows.push(...rankGroupCandidates(hand, 16, 2, "onePair"));
    rows.push(...flushCandidates(hand, 17, 2, "flushDraw"));
    rows.push(...straightCandidates(hand, 18, 3, "straightDraw", null, "sparse"));

    const validRows = rows.filter(Boolean);
    const best = bestCandidate(validRows) || candidate(99, "highCard", sortByCore(hand.filter((card) => !card.joker)).slice(0, 2));
    return lockPlanFromCandidate(hand, best, validRows);
  }

  function recommendedDiscardIndexes(hand) {
    return autoLockPlan(hand).discardIndexes;
  }

  function sortCardIndexes(hand, discardIndexes = new Set()) {
    const locked = hand.map((card, index) => ({ card, index })).filter((row) => !discardIndexes.has(row.index));
    const unlocked = hand.map((card, index) => ({ card, index })).filter((row) => discardIndexes.has(row.index));
    const lockedCards = sortLockedCards(locked.map((row) => row.card));
    const unlockedCards = sortUnlockedCards(unlocked.map((row) => row.card));
    const indexByCard = new Map(hand.map((card, index) => [card, index]));
    return [...lockedCards, ...unlockedCards].map((card) => indexByCard.get(card));
  }

  function controlledDiscardIndexes(state) {
    const plan = sharedAutoLockPlan(state.playerCards);
    state.lockPriority = plan.priority;
    state.lockTendency = plan.tendency;
    state.lockedCardIds = new Set(plan.cards.map(cardId));
    state.arrangementPlan = plan.arrangementPlan;
    return plan.discardIndexes;
  }

  function discardIndexesFromLockedIds(hand, lockedIds) {
    return new Set(hand.map((card, index) => lockedIds.has(cardId(card)) ? -1 : index).filter((index) => index >= 0));
  }

  function maxSameSuitCount(cards) {
    const counts = new Map();
    let jokers = 0;
    for (const card of cards) {
      if (card.joker) {
        jokers += 1;
        continue;
      }
      counts.set(card.suit, (counts.get(card.suit) || 0) + 1);
    }
    return Math.max(0, ...counts.values()) + jokers;
  }

  function canReplaceSameRankForSuit(nextPlan, currentCards, state) {
    if (!["straight", "straightDraw"].includes(state.lockTendency)) return false;
    if (!["straight", "straightDraw", "straightFlushDraw"].includes(nextPlan.tendency)) return false;
    if (nextPlan.cards.length !== currentCards.length) return false;
    const nextIds = new Set(nextPlan.cards.map(cardId));
    const nextRanks = nextPlan.cards.filter((card) => !card.joker).map((card) => card.rank);
    const dropped = currentCards.filter((card) => !nextIds.has(cardId(card)));
    if (!dropped.length) return false;
    if (dropped.some(hasBoundBonus)) return false;
    if (!dropped.every((card) => nextRanks.includes(card.rank))) return false;
    return maxSameSuitCount(nextPlan.cards) > maxSameSuitCount(currentCards);
  }

  function canMoveStraightWindow(nextPlan, currentCards, state) {
    if (state.userTouched) return false;
    if (!["straight", "straightDraw"].includes(state.lockTendency)) return false;
    if (!["straight", "straightDraw"].includes(nextPlan.tendency)) return false;
    const nextIds = new Set(nextPlan.cards.map(cardId));
    const dropped = currentCards.filter((card) => !nextIds.has(cardId(card)));
    if (!dropped.length || dropped.some(hasBoundBonus)) return false;
    return candidateStraightHigh(nextPlan.cards) > candidateStraightHigh(currentCards);
  }

  function straightPlanForCards(cards) {
    if (cards.length === 5) {
      const evaluation = evaluateFive(cards);
      if (evaluation.key === "straightFlush") return candidate(2, "straightFlush", cards);
      if (evaluation.key === "straight") return candidate(9, "straight", cards);
      return null;
    }
    if (cards.length !== 4 || candidateStraightHigh(cards) < 0) return null;
    const suited = maxSameSuitCount(cards) === cards.length;
    const open = isOpenEndedCandidate(cards);
    return candidate(suited ? (open ? 4 : 5) : (open ? 10 : 11), suited ? "straightFlushDraw" : "straightDraw", cards);
  }

  function sameRankSuitReplacementPlans(hand, currentCards, state) {
    if (!["straight", "straightDraw"].includes(state.lockTendency)) return [];
    const currentIds = new Set(currentCards.map(cardId));
    const choices = currentCards.map((locked) => {
      if (locked.joker || hasBoundBonus(locked)) return [locked];
      return [
        locked,
        ...hand.filter((card) => !card.joker && !currentIds.has(cardId(card)) && card.rank === locked.rank)
      ];
    });
    const rows = [];
    const visit = (index, picked) => {
      if (index >= choices.length) {
        if (new Set(picked).size !== picked.length) return;
        const row = straightPlanForCards(picked);
        if (!row) return;
        const nextPlan = lockPlanFromCandidate(hand, row);
        if (canReplaceSameRankForSuit(nextPlan, currentCards, state)) rows.push(nextPlan);
        return;
      }
      for (const card of choices[index]) visit(index + 1, [...picked, card]);
    };
    visit(0, []);
    return rows.sort((left, right) =>
      maxSameSuitCount(right.cards) - maxSameSuitCount(left.cards) || compareCandidate(right, left)
    );
  }

  function reconcileLockAfterRedraw(state, previousLockedIds) {
    const plan = autoLockPlan(state.playerCards);
    const surviving = state.playerCards.filter((card) => previousLockedIds.has(cardId(card)));
    const availablePlans = [
      ...sameRankSuitReplacementPlans(state.playerCards, surviving, state),
      plan,
      ...plan.candidates.map((row) => lockPlanFromCandidate(state.playerCards, row))
    ];
    const allowedPlans = availablePlans.filter((nextPlan) => {
      if (!surviving.length) return true;
      const nextIds = new Set(nextPlan.cards.map(cardId));
      const includesSurviving = surviving.every((card) => nextIds.has(cardId(card)));
      const forcedMade = nextPlan.priority >= 1 && nextPlan.priority <= 3;
      const inclusiveUpgrade = includesSurviving && nextPlan.priority <= (state.lockPriority || 99);
      return forcedMade || inclusiveUpgrade ||
        canReplaceSameRankForSuit(nextPlan, surviving, state) ||
        canMoveStraightWindow(nextPlan, surviving, state);
    });
    const chosen = bestCandidate(allowedPlans);
    let lockedCards;
    if (chosen) {
      lockedCards = chosen.cards.slice();
      state.lockPriority = chosen.priority;
      state.lockTendency = chosen.tendency;
    } else {
      // 換牌後不得因另一個較高表面優先級而拆掉原鎖牌傾向；只保留仍在手上的舊鎖牌。
      lockedCards = surviving.slice();
    }

    for (const joker of state.playerCards.filter((card) => card.joker)) {
      if (!lockedCards.includes(joker)) lockedCards.unshift(joker);
    }
    while (lockedCards.length > 5) {
      let removed = false;
      for (let index = state.playerCards.length - 1; index >= 0; index -= 1) {
        const card = state.playerCards[index];
        const lockIndex = lockedCards.indexOf(card);
        if (lockIndex >= 0 && !card.joker) {
          lockedCards.splice(lockIndex, 1);
          removed = true;
          break;
        }
      }
      if (!removed) break;
    }
    state.lockedCardIds = new Set(lockedCards.map(cardId));
    return discardIndexesFromLockedIds(state.playerCards, state.lockedCardIds);
  }

  // 正式遊戲與獨立理牌工具共用同一個 v6 決策核心。下列轉接層只維持既有
  // Demo 所需的欄位名稱；牌型比較、傷害、發牌排程與牌堆責任仍留在本檔。
  const ARRANGEMENT_TENDENCY = Object.freeze({
    royalFlush: "royalFlush",
    straightFlush: "straightFlush",
    fourOfAKind: "fourOfAKind",
    openStraightFlush: "straightFlushDraw",
    singleStraightFlush: "straightFlushDraw",
    fullHouse: "fullHouse",
    flush: "flush",
    straight: "straight",
    threeOfAKind: "threeOfAKind",
    fourFlush: "flushDraw",
    twoPair: "twoPair",
    openStraight: "straightDraw",
    threeFlush: "flushDraw",
    singleStraight: "straightDraw",
    onePair: "onePair",
    twoFlush: "flushDraw",
    threeRun: "straightDraw",
    twoStraight: "straightDraw",
    none: "highCard"
  });

  function sharedPlanView(hand, arrangementPlan) {
    const cards = (arrangementPlan.keepCards || []).slice(0, 5);
    const keptIds = new Set(cards.map(ArrangementCore.cardId));
    const keepIndexes = hand
      .map((card, index) => keptIds.has(ArrangementCore.cardId(card)) ? index : -1)
      .filter((index) => index >= 0);
    const discardIndexes = new Set(
      hand.map((_card, index) => keepIndexes.includes(index) ? -1 : index).filter((index) => index >= 0)
    );
    return {
      priority: Number.isInteger(arrangementPlan.priority) ? arrangementPlan.priority : 99,
      tendency: ARRANGEMENT_TENDENCY[arrangementPlan.key] || "highCard",
      cards,
      keepIndexes,
      discardIndexes,
      candidates: arrangementPlan.candidates || [],
      arrangementPlan
    };
  }

  function sharedAutoLockPlan(hand) {
    return sharedPlanView(hand, ArrangementCore.planHand(hand));
  }

  function sharedRecommendedDiscardIndexes(hand) {
    return sharedAutoLockPlan(hand).discardIndexes;
  }

  function applyRecommendedKeepCards(state, keepCardIdsInput) {
    const requested = new Set(Array.from(keepCardIdsInput || [], (value) => String(value)));
    const lockedCards = state.playerCards.filter((card) => requested.has(cardId(card))).slice(0, 5);
    const lockedIds = new Set(lockedCards.map(cardId));
    const selectionPlan = ArrangementCore.analyzeSelection(lockedCards);
    state.userTouched = false;
    state.lockPriority = Number.isInteger(selectionPlan.priority) ? selectionPlan.priority : 99;
    state.lockTendency = ARRANGEMENT_TENDENCY[selectionPlan.key] || "highCard";
    state.lockedCardIds = lockedIds;
    state.arrangementPlan = selectionPlan;
    state.discardIndexes = discardIndexesFromLockedIds(state.playerCards, lockedIds);
    return refresh(state);
  }

  function sharedSortCardIndexes(hand, discardIndexes = new Set()) {
    const retainedCards = hand.filter((_card, index) => !discardIndexes.has(index));
    const retainedIds = new Set(retainedCards.map(ArrangementCore.cardId));
    const selectionPlan = ArrangementCore.analyzeSelection(retainedCards);
    const orderedCards = ArrangementCore.arrangeHandForDisplay(hand, selectionPlan, retainedIds);
    const indexByCard = new Map(hand.map((card, index) => [card, index]));
    return orderedCards.map((card) => indexByCard.get(card));
  }

  function sharedReconcileLockAfterRedraw(state, previousLockedIds) {
    const previousKeepCards = state.playerCards.filter((card) => previousLockedIds.has(cardId(card)));
    const decision = ArrangementCore.reconcileAfterRedraw(state.playerCards, previousKeepCards);
    const lockedCards = decision.keepCards.slice(0, 5);
    state.lockPriority = Number.isInteger(decision.plan.priority) ? decision.plan.priority : 99;
    state.lockTendency = ARRANGEMENT_TENDENCY[decision.plan.key] || "highCard";
    state.lockedCardIds = new Set(lockedCards.map(cardId));
    state.arrangementPlan = decision.plan;
    state.arrangementDecision = decision;
    return discardIndexesFromLockedIds(state.playerCards, state.lockedCardIds);
  }

  function createRound(packet, roundNumber, hpLeft, redealIndex = 0) {
    const seed = Core.hash32(Core.hash32(packet.packetSeed, roundNumber, 1201), redealIndex, 1207);
    const rng = Core.mulberry32(seed);
    const deal = makeControlledRound(packet, roundNumber, hpLeft, rng);
    const magicCards = plannedMagic(packet, roundNumber, hpLeft, rng, redealIndex);
    if (deal.plan?.route === "straightFlush") {
      const joker = magicCards.find((card) => card.key === "joker");
      if (joker) joker.effectSlot = Math.abs(Number(joker.effectSlot) || 0) % 5;
    }
    const playerCards = applyEntryMagic(deal.playerCards, magicCards);
    const state = {
      rng, playerCards, playerDeck: deal.playerDeck, bossCards: deal.bossCards, magicCards,
      draws: 0, freeUsed: false, plan: deal.plan,
      userTouched: false, lockPriority: 99, lockTendency: null, lockedCardIds: new Set(),
      noTieStory: Boolean(packet.noTieStory),
      coinX: magicCards.filter((card) => card.key === "coin").reduce((sum, card) => sum + card.value, 0)
    };
    state.discardIndexes = controlledDiscardIndexes(state);
    return refresh(state);
  }

  function createNaturalRound(options = {}) {
    const rng = typeof options.rng === "function" ? options.rng : Math.random;
    const deal = dealNaturalWithBadHighRerolls(rng, options);
    const magicCards = options.magicEnabled === false
      ? []
      : drawMagicCardsFromTable(
        rng,
        options.magicRows || MAGIC_TABLE,
        options.magicCardsPerRound === undefined ? 2 : options.magicCardsPerRound,
        options.useHighMagicTickets !== false
      );
    const playerCards = applyEntryMagic(deal.playerCards, magicCards);
    const arrangementPlan = ArrangementCore.planHand(playerCards);
    const planView = sharedPlanView(playerCards, arrangementPlan);
    const state = {
      rng, playerCards, playerDeck: deal.playerDeck, bossCards: deal.bossCards, magicCards,
      draws: 0, freeUsed: false, plan: null,
      userTouched: false, lockPriority: planView.priority, lockTendency: planView.tendency,
      lockedCardIds: new Set(planView.cards.map(cardId)), arrangementPlan,
      noTieStory: false,
      coinX: magicCards.filter((card) => card.key === "coin").reduce((sum, card) => sum + card.value, 0),
      playerBadHighRerolls: deal.playerRerolls,
      bossBadHighRerolls: deal.bossRerolls
    };
    state.discardIndexes = planView.discardIndexes;
    return refresh(state);
  }

  function refresh(state) {
    state.playerEval = evaluateBest(state.playerCards);
    state.bossEval = evaluateBest(state.bossCards);
    state.playerHand = state.playerEval;
    state.bossHand = state.bossEval;
    state.damage = computeDamage(state.playerEval, state.magicCards);
    state.playerRank = state.playerEval.rank;
    state.bossRank = state.bossEval.rank;
    return state;
  }

  function completePlan(state, discarded) {
    if (!state.plan || state.draws + 1 !== state.plan.completeAt) return null;
    const kept = state.playerCards.filter((_card, index) => !discarded.has(index));
    const picked = [];
    const useFromDeck = (predicate, count) => {
      for (const card of state.playerDeck) {
        if (picked.length >= count) break;
        if (predicate(card) && !picked.some((selected) => cardId(selected) === cardId(card))) picked.push(card);
      }
    };
    if (state.plan.route === "four") {
      const present = kept.filter((card) => card.rank === state.plan.targetRank).length;
      useFromDeck((card) => card.rank === state.plan.targetRank, Math.max(0, 4 - present));
    } else if (state.plan.route === "fullHouse") {
      const presentTriple = kept.filter((card) => card.rank === state.plan.tripleRank).length;
      const presentPair = kept.filter((card) => card.rank === state.plan.pairRank).length;
      useFromDeck((card) => card.rank === state.plan.tripleRank, Math.max(0, 3 - presentTriple));
      const triplePicked = picked.length;
      for (const card of state.playerDeck) {
        if (picked.length - triplePicked >= Math.max(0, 2 - presentPair)) break;
        if (card.rank === state.plan.pairRank && !picked.some((selected) => cardId(selected) === cardId(card))) picked.push(card);
      }
    } else {
      const keepIds = new Set(kept.map(cardId));
      const targetIds = new Set(state.plan.targetIds || []);
      for (const card of state.playerDeck) {
        if (targetIds.has(cardId(card)) && !keepIds.has(cardId(card))) picked.push(card);
      }
    }
    return picked.slice(0, discarded.size);
  }

  function safePlannedReplacementIndex(state, discarded, usedRanks = null) {
    if (!state.plan || state.draws + 1 >= state.plan.completeAt) return 0;
    const kept = state.playerCards.filter((_card, index) => !discarded.has(index));
    const ranks = usedRanks || new Set(kept.map((card) => card.rank));
    if (state.plan.route === "straightFlush") {
      const index = state.playerDeck.findIndex((card) => card.suit !== state.plan.targetSuit && !ranks.has(card.rank));
      return index >= 0 ? index : 0;
    }
    const blocked = new Set([state.plan.targetRank, state.plan.tripleRank, state.plan.pairRank].filter(Number.isFinite));
    const index = state.playerDeck.findIndex((card) => card.rank <= 5 && !blocked.has(card.rank) && !ranks.has(card.rank));
    return index >= 0 ? index : 0;
  }

  function redraw(state, discarded) {
    const indexes = [...discarded].filter((index) => index >= 0 && index < state.playerCards.length).sort((a, b) => a - b);
    if (!indexes.length || state.playerDeck.length - indexes.length < 10) return state;
    const previousLockedIds = new Set(state.playerCards.filter((_card, index) => !discarded.has(index)).map(cardId));
    const scheduled = completePlan(state, discarded) || [];
    const scheduledIds = new Set(scheduled.map(cardId));
    state.playerDeck = state.playerDeck.filter((card) => !scheduledIds.has(cardId(card)));
    const safeRanks = new Set(state.playerCards.filter((_card, index) => !discarded.has(index)).map((card) => card.rank));
    for (let offset = 0; offset < indexes.length; offset += 1) {
      let replacement = scheduled[offset];
      if (!replacement) {
        const avoid = state.plan && state.draws + 1 === state.plan.completeAt ? new Set(state.plan.avoidRanks || []) : null;
        const safeIndex = avoid
          ? state.playerDeck.findIndex((card) => !avoid.has(card.rank))
          : safePlannedReplacementIndex(state, discarded, safeRanks);
        replacement = state.playerDeck.splice(Math.max(0, safeIndex), 1)[0];
      }
      if (!replacement) break;
      state.playerCards[indexes[offset]] = cloneCard(replacement);
      safeRanks.add(replacement.rank);
    }
    state.draws += 1;
    state.discardIndexes = sharedReconcileLockAfterRedraw(state, previousLockedIds);
    return refresh(state);
  }

  function cloneRuntimeRoundState(source) {
    const cloneCards = (cards) => (cards || []).map(cloneCard);
    const cloned = {
      ...source,
      playerCards: cloneCards(source.playerCards),
      playerDeck: cloneCards(source.playerDeck),
      bossCards: cloneCards(source.bossCards),
      magicCards: (source.magicCards || []).map((card) => ({ ...card })),
      discardIndexes: new Set(source.discardIndexes || []),
      lockedCardIds: new Set(source.lockedCardIds || [])
    };
    return refresh(cloned);
  }

  function applyRuntimeReplacements(state, discarded, replacementsInput) {
    const indexes = [...discarded].filter((index) => index >= 0 && index < state.playerCards.length).sort((a, b) => a - b);
    const replacements = (replacementsInput || []).map(cloneCard);
    if (!indexes.length || replacements.length !== indexes.length || state.playerDeck.length - indexes.length < 10) return state;
    const previousLockedIds = new Set(state.playerCards.filter((_card, index) => !discarded.has(index)).map(cardId));
    const replacementIds = new Set(replacements.map(cardId));
    if (replacementIds.size !== replacements.length) return state;
    if (replacements.some((card) => !state.playerDeck.some((deckCard) => cardId(deckCard) === cardId(card)))) return state;
    state.playerDeck = state.playerDeck.filter((card) => !replacementIds.has(cardId(card)));
    indexes.forEach((index, offset) => { state.playerCards[index] = replacements[offset]; });
    state.draws += 1;
    state.discardIndexes = sharedReconcileLockAfterRedraw(state, previousLockedIds);
    return refresh(state);
  }

  function damageBreakdown(evaluation, magicCards) {
    if (!evaluation) return { base: 0, multiplier: 1, flat: 0, total: 0, activeEffects: [] };
    const included = new Set((evaluation.cards || []).map(cardId));
    let crit = 0;
    let flat = 0;
    const activeEffects = [];
    for (const card of evaluation.cards || []) {
      if (!included.has(cardId(card))) continue;
      const critValue = Number(card.magicEffects?.crit || 0);
      const flatValue = Number(card.magicEffects?.flatDamage || 0);
      if (critValue) {
        crit += critValue;
        activeEffects.push({ key: "crit", type: "DMG", label: `CRITICAL ${critValue}X`, value: critValue, cardId: cardId(card) });
      }
      if (flatValue) {
        flat += flatValue;
        activeEffects.push({ key: "flatDamage", type: "DMG", label: `FIXED DMG +${flatValue}`, value: flatValue, cardId: cardId(card) });
      }
    }
    const boostCard = magicCards.find((card) => card.target === evaluation.key);
    const boost = Number(boostCard?.value || 0);
    if (boostCard) activeEffects.push({ ...boostCard, label: `${boostCard.label} ${boost}X` });
    const jokerCard = (evaluation.cards || []).find((card) => card.joker);
    if (jokerCard) activeEffects.push({ key: "joker", type: "JOKER", label: "JOKER ACTIVE", value: 1, cardId: cardId(jokerCard) });

    const multiplier = crit || boost ? crit + boost : 1;
    const base = evaluation.damage;
    return { base, crit, boost, multiplier, flat, total: base * multiplier + flat, activeEffects };
  }

  function computeDamage(evaluation, magicCards) {
    return damageBreakdown(evaluation, magicCards).total;
  }

  function compare(state) {
    const delta = compareEval(state.playerEval, state.bossEval);
    return { playerWins: delta > 0, tie: delta === 0, damage: delta > 0 ? state.damage : 0 };
  }

  function bossHandAbove(rank) {
    const templates = [
      [[6, "S"], [6, "H"], [8, "D"], [10, "C"], [12, "S"], [14, "H"]],
      [[6, "S"], [6, "H"], [8, "D"], [8, "C"], [12, "S"], [14, "H"]],
      [[7, "S"], [7, "H"], [7, "D"], [10, "C"], [12, "S"], [14, "H"]],
      [[6, "S"], [7, "H"], [8, "D"], [9, "C"], [10, "S"], [14, "H"]],
      [[6, "H"], [8, "H"], [10, "H"], [12, "H"], [14, "H"], [7, "S"]],
      [[9, "S"], [9, "H"], [9, "D"], [12, "S"], [12, "H"], [14, "C"]],
      [[10, "S"], [10, "H"], [10, "D"], [10, "C"], [14, "S"], [12, "H"]],
      [[10, "S"], [11, "S"], [12, "S"], [13, "S"], [14, "S"], [6, "H"]],
      [[10, "S"], [11, "S"], [12, "S"], [13, "S"], [14, "S"], [6, "H"]]
    ];
    return templates[Math.max(0, Math.min(8, rank))].map(([cardRank, suit]) => ({
      rank: cardRank, suit, suitIndex: SUITS.indexOf(suit), baseId: `${cardRank}${suit}`
    }));
  }

  function bossHandBelow() {
    return [[6, "S"], [7, "H"], [9, "D"], [11, "C"], [13, "S"], [14, "H"]].map(([cardRank, suit]) => ({
      rank: cardRank, suit, suitIndex: SUITS.indexOf(suit), baseId: `${cardRank}${suit}`
    }));
  }

  function prepareCompare(state, preventKill, hpLeft) {
    let result = compare(state);
    if (state.noTieStory && result.tie) {
      state.bossCards = preventKill ? bossHandAbove(state.playerEval.rank) : bossHandBelow();
      refresh(state);
      result = compare(state);
    }
    if (!preventKill || !result.playerWins || result.damage < hpLeft) return state;
    state.bossCards = bossHandAbove(state.playerEval.rank);
    return refresh(state);
  }

  function magicDisplay(card) {
    if (card.key === "joker") return { type: "JOKER", label: "WILD CARD" };
    if (card.key === "freeDraw") return { type: "DRAW", label: "FREE" };
    if (card.key === "coin") return { type: "GOLD", label: `+${card.value}x` };
    if (card.key === "flatDamage") return { type: "DMG", label: `+${card.value}` };
    return { type: card.type || "DMG", label: `${card.label} ${card.value}X` };
  }

  return {
    VERSION: "rules-v10",
    HANDS, SUIT_GLYPHS, cardId, cardLabel, hasAttachedEffect, evaluateBest, compareEval,
    autoLockPlan: sharedAutoLockPlan,
    recommendedDiscardIndexes: sharedRecommendedDiscardIndexes,
    applyRecommendedKeepCards,
    sortCardIndexes: sharedSortCardIndexes,
    reconcileLockAfterRedraw: sharedReconcileLockAfterRedraw,
    createRound, createNaturalRound, redraw, cloneRuntimeRoundState, applyRuntimeReplacements,
    prepareCompare, compare, damageBreakdown, computeDamage,
    drawMagicCardsFromTable, magicDisplay, magicDescription
  };
});
