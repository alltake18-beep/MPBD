"use strict";

(function runBossDuelDemo() {
  const Random = window.BossDuelRandom;
  const Rules = window.BossDuelRules;
  const NaturalCore = window.BossDuelNaturalStoryCore;
  const StoryPreset = window.BossDuelStoryPresetV1;
  const els = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
  const PLAYER_STATE_KEY = "boss-duel:demo-player-v2";
  const TUTORIAL_SKIP_KEY = "BossDuelTutorialSkip";
  const TUTORIAL_SESSION_KEY = "boss-duel:tutorial-shown";
  const AUDIO_KEY = "boss-duel:audio-enabled";
  const LOCALE_KEY = "boss-duel:locale";
  const HISTORY_KEY = "boss-duel:battle-history";
  const STORY_REWARD_FLOOR_PCT = 10;
  const STORY_REWARD_CEILING_MULTIPLE = 10;
  const STORY_BET_CONTRACT_VERSION = NaturalCore.STORY_BET_CONTRACT_VERSION;
  const HAND_SECONDS = 40;
  const TURBO_TIME_SCALE = 1.65;
  const BOSS_RENDER_OVERFLOW = 120;
  const BOSS_VISUAL_LAYOUT = Object.freeze({
    // MINO 的勝負動作外框遠大於待機本體；全動畫共用外框會把待機縮小。
    // 原站以較大的固定角色比例把下半身收在牌桌後，並保留上方手臂活動空間。
    minotaur: Object.freeze({ scale: 0.303, yOffset: 56 })
  });
  const ATTACK_ANIMATION_NAMES = Object.freeze({ normal: "animation", special: "animation2", heavy: "animation3", finisher: "animation4" });
  const ATTACK_ANIMATION_SECONDS = Object.freeze({ normal: 0.8333, special: 1, heavy: 1.4667, finisher: 1.6 });
  // attack/skeleton.json 的正式 1080×1920 舞台框。不能用動畫第 0 幀的暫時 attachment
  // bounds 重新放大，否則後續飛行特效會被錯誤縮放並射出 390×695 畫面。
  const ATTACK_SOURCE_BOUNDS = Object.freeze({ x: -541, y: -960.64, width: 1082, height: 1920.65 });
  // 7／8 星的 1／2 顆保底倍數骰從選角畫面就必須可見；付 Bet 後只揭示
  // 額外倍數骰。寶箱布牌依使用者最新規格改為每隻 BOSS 一張完整美術，
  // 不再把 WIN UP TO 與數字拆成兩層 DOM 疊字。
  const GUARANTEED_PREMIUM_DICE = Object.freeze([0, 0, 0, 0, 0, 0, 0, 1, 2]);
  const TREASURE_PRESENTATION_BY_STAR = Object.freeze({
    1: Object.freeze({ maximum: 6, art: "assets/mobile/treasure-labels/drunkard-6x.png" }),
    2: Object.freeze({ maximum: 12, art: "assets/mobile/treasure-labels/unicorn-12x.png" }),
    3: Object.freeze({ maximum: 18, art: "assets/mobile/treasure-labels/bard-18x.png" }),
    4: Object.freeze({ maximum: 24, art: "assets/mobile/treasure-labels/paladin-24x.png" }),
    5: Object.freeze({ maximum: 30, art: "assets/mobile/treasure-labels/minotaur-30x.png" }),
    6: Object.freeze({ maximum: 36, art: "assets/mobile/treasure-labels/cleopatra-36x.png" }),
    7: Object.freeze({ maximum: 216, art: "assets/mobile/treasure-labels/thor-216x.png" }),
    8: Object.freeze({ maximum: 432, art: "assets/mobile/treasure-labels/cinderdragon-432x.png" })
  });
  const REWARD_DIE_RENDER_SIZE = 80;
  const REWARD_DIE_FLIP_SECONDS = 0.85;
  const bossSkins = [
    { key: "drunkard", name: "DRUNKARD", title: "assets/mobile/text-drunkard.png", fallback: "assets/mobile/boss-fallback/drunkard.png" },
    { key: "unicorn", name: "UNICORN", title: "assets/mobile/text-unicorn.png", fallback: "assets/mobile/boss-fallback/unicorn.png" },
    { key: "bard", name: "BARD", title: "assets/mobile/text-bard.png", fallback: "assets/mobile/boss-fallback/bard.png" },
    { key: "paladin", name: "PALADIN", title: "assets/mobile/text-paladin.png", fallback: "assets/mobile/boss-fallback/paladin.png" },
    { key: "minotaur", name: "MINOTAUR", title: "assets/mobile/text-minotaur.png", fallback: "assets/mobile/boss-fallback/minotaur.png" },
    { key: "cleopatra", name: "CLEOPATRA", title: "assets/mobile/text-cleopatra.png", fallback: "assets/mobile/boss-fallback/cleopatra.png" },
    { key: "thor", name: "THOR", title: "assets/mobile/text-thor.png", fallback: "assets/mobile/boss-fallback/thor.png" },
    { key: "cinderdragon", name: "CINDER DRAGON", title: "assets/mobile/text-cinderdragon.png", fallback: "assets/mobile/boss-fallback/cinderdragon.png" }
  ];
  const qaParams = new URLSearchParams(location.search);
  const qaBossOverride = qaParams.get("qa") === "1" && bossSkins.some((boss) => boss.key === qaParams.get("boss"))
    ? qaParams.get("boss")
    : "";
  const handNames = {
    high: "HIGH CARD",
    pair: "ONE PAIR",
    twoPair: "TWO PAIR",
    three: "THREE OF A KIND",
    straight: "STRAIGHT",
    flush: "FLUSH",
    fullHouse: "FULL HOUSE",
    four: "FOUR OF A KIND",
    straightFlush: "STRAIGHT FLUSH"
  };
  const localeCopy = Object.freeze({
    en: {
      tutorialClose: "SKIP", cardHelpTitle: "POKER HANDS", historyTitle: "BATTLE HISTORY",
      deckTitle: "CARDS LEFT", totalBet: "TOTAL BET",
      audioOn: "SOUND: ON", audioOff: "SOUND: OFF", language: "INTERFACE LANGUAGE: EN-US"
    },
    "zh-Hant": {
      tutorialClose: "略過", cardHelpTitle: "牌型說明", historyTitle: "戰局紀錄",
      deckTitle: "剩餘牌堆", totalBet: "TOTAL BET",
      audioOn: "音效：開", audioOff: "音效：關", language: "介面語言：繁體中文"
    }
  });
  const HAND_ART = Object.freeze({
    high: { base: "assets/mobile/hand-types/type1-base.png", word: "assets/mobile/hand-types/type1-word.png", wordWidth: "55%" },
    pair: { base: "assets/mobile/hand-types/type2-base.png", word: "assets/mobile/hand-types/type2-word.png", wordWidth: "47.5%" },
    twoPair: { base: "assets/mobile/hand-types/type3-base.png", word: "assets/mobile/hand-types/type3-word.png", wordWidth: "47%" },
    three: { base: "assets/mobile/hand-types/type4-base.png", word: "assets/mobile/hand-types/type4-word.png", wordWidth: "60%" },
    straight: { base: "assets/mobile/hand-types/type5-base.png", word: "assets/mobile/hand-types/type5-word.png", wordWidth: "31.6%" },
    flush: { base: "assets/mobile/hand-types/type6-base.png", word: "assets/mobile/hand-types/type6-word.png", wordWidth: "24.2%" },
    fullHouse: { base: "assets/mobile/hand-types/type7-base.png", word: "assets/mobile/hand-types/type7-word.png", wordWidth: "44.5%" },
    four: { base: "assets/mobile/hand-types/type8-base.png", word: "assets/mobile/hand-types/type8-word.png", wordWidth: "57.6%" },
    straightFlush: { base: "assets/mobile/hand-types/type9-base.png", word: "assets/mobile/hand-types/type9-word.png", wordWidth: "52.4%" },
    royalFlush: { base: "assets/mobile/hand-types/type10-base.png", word: "assets/mobile/hand-types/type10-word.png", wordWidth: "39%" }
  });

  function handPresentationKey(evaluation) {
    if (evaluation?.key === "straightFlush" && Number(evaluation.tiebreak?.[0]) === 14) return "royalFlush";
    return evaluation?.key || "high";
  }

  function handPresentationLabel(evaluation) {
    const key = handPresentationKey(evaluation);
    return key === "royalFlush" ? "ROYAL FLUSH" : handNames[key] || evaluation?.label || "HIGH CARD";
  }
  const betSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 800, 1000, 1200, 1500, 1800, 2000];
  document.documentElement.dataset.storyBetContract = STORY_BET_CONTRACT_VERSION;

  function storyCreditsForBet(story, betInput) {
    const result = NaturalCore.materializeStoryForBet(story, betInput);
    if (result.version !== STORY_BET_CONTRACT_VERSION) throw new Error("劇本 Bet 換算版本不一致");
    return result;
  }
  const originalCardArt = Object.create(null);
  const originalCardPacks = [
    ["04b742ae7", 867, 904, [["d9",3,3,1],["f13",292,3,1],["d8",581,3,1],["s5",3,229,1],["f9",292,229,1],["h4",581,229,1],["s1",3,455,1],["h10",292,455,1],["d10",581,455,1],["h13",3,681,1],["f12",292,681,1],["h2",581,681,1]]],
    ["06d91ba30", 515, 904, [["f4",3,3,1],["d13",292,3,0],["h1",3,229,1],["f2",292,292,0],["s13",3,455,1],["d6",292,581,0],["s12",3,681,1]]],
    ["0729f5e85", 867, 904, [["h8",3,3,1],["h6",292,3,1],["s2",581,3,1],["d12",3,229,1],["d4",292,229,1],["h9",581,229,1],["h11",3,455,1],["s7",292,455,1],["d11",581,455,1],["back_purple",3,681,1],["s10",292,681,1],["h7",581,681,1]]],
    ["0d7bb8ea4", 867, 904, [["f1",3,3,1],["f8",292,3,1],["f5",581,3,1],["s3",3,229,1],["back_blue",292,229,1],["d7",581,229,1],["s8",3,455,1],["s6",292,455,1],["d5",581,455,1],["f11",3,681,1],["s11",292,681,1],["s9",581,681,1]]],
    ["0e8f810d4", 867, 904, [["back",3,3,1],["f7",292,3,1],["s4",581,3,1],["f6",3,229,1],["h3",292,229,1],["d1",581,229,1],["h12",3,455,1],["d2",292,455,1],["d3",581,455,1],["h5",3,681,1],["f10",292,681,1],["f3",581,681,1]]]
  ];
  for (const [file, atlasWidth, atlasHeight, frames] of originalCardPacks) {
    for (const [name, x, y, rotated] of frames) {
      originalCardArt[name] = { file: `assets/mobile/original-cards-${file}.png`, atlasWidth, atlasHeight, x, y, width: 220, height: 283, rotated: Boolean(rotated) };
    }
  }
  originalCardArt.joker = { file: "assets/mobile/original-fight-atlas-b.png", atlasWidth: 1021, atlasHeight: 903, x: 660, y: 493, width: 220, height: 283, rotated: true };
  const originalSuitPrefix = { S: "s", H: "h", D: "d", C: "f" };
  const DIRECT_CARD_ART = Object.create(null);
  for (const prefix of ["s", "h", "d", "f"]) {
    for (let rank = 1; rank <= 13; rank += 1) DIRECT_CARD_ART[`${prefix}${rank}`] = `assets/mobile/cards/${prefix}${rank}.png`;
  }
  DIRECT_CARD_ART.back_blue = "assets/mobile/cards/back-blue.png";
  const JOKER_RANK_PATHS = Object.freeze({
    2: "assets/mobile/joker-card/rank-2.png", 3: "assets/mobile/joker-card/rank-3.png",
    4: "assets/mobile/joker-card/rank-4.png", 5: "assets/mobile/joker-card/rank-5.png",
    6: "assets/mobile/joker-card/rank-6.png", 7: "assets/mobile/joker-card/rank-7.png",
    8: "assets/mobile/joker-card/rank-8.png", 9: "assets/mobile/joker-card/rank-9.png",
    10: "assets/mobile/joker-card/rank-10.png", 11: "assets/mobile/joker-card/rank-j.png",
    12: "assets/mobile/joker-card/rank-q.png", 13: "assets/mobile/joker-card/rank-k.png",
    14: "assets/mobile/joker-card/rank-a.png"
  });
  const JOKER_FACE_PATH = "assets/mobile/joker-card/face.png";
  const JOKER_TITLE_PATH = "assets/mobile/joker-card/title.png";
  const DAMAGE_GLYPH_PATHS = Object.freeze({
    "0": "assets/mobile/damage-glyphs/0.png", "1": "assets/mobile/damage-glyphs/1.png",
    "2": "assets/mobile/damage-glyphs/2.png", "3": "assets/mobile/damage-glyphs/3.png",
    "4": "assets/mobile/damage-glyphs/4.png", "5": "assets/mobile/damage-glyphs/5.png",
    "6": "assets/mobile/damage-glyphs/6.png", "7": "assets/mobile/damage-glyphs/7.png",
    "8": "assets/mobile/damage-glyphs/8.png", "9": "assets/mobile/damage-glyphs/9.png",
    "X": "assets/mobile/damage-glyphs/x.png", "+": "assets/mobile/damage-glyphs/plus.png",
    "-": "assets/mobile/damage-glyphs/minus.png", "~": "assets/mobile/damage-glyphs/tilde.png",
    "/": "assets/mobile/damage-glyphs/slash.png"
  });
  const WIN_GLYPH_PATHS = Object.freeze({
    "0": "assets/mobile/win-glyphs/0.png", "1": "assets/mobile/win-glyphs/1.png",
    "2": "assets/mobile/win-glyphs/2.png", "3": "assets/mobile/win-glyphs/3.png",
    "4": "assets/mobile/win-glyphs/4.png", "5": "assets/mobile/win-glyphs/5.png",
    "6": "assets/mobile/win-glyphs/6.png", "7": "assets/mobile/win-glyphs/7.png",
    "8": "assets/mobile/win-glyphs/8.png", "9": "assets/mobile/win-glyphs/9.png",
    "X": "assets/mobile/win-glyphs/x.png"
  });
  const TREASURE_TITLE_PATH = "assets/mobile/original-win-up-to.png";
  const MAGIC_ART_PATHS = Object.freeze({
    straightBoost: "assets/mobile/magic-cards/straight.png",
    flushBoost: "assets/mobile/magic-cards/flush.png",
    threeBoost: "assets/mobile/magic-cards/three-kind.png",
    fourBoost: "assets/mobile/magic-cards/four-kind.png",
    fullHouseBoost: "assets/mobile/magic-cards/flush.png",
    crit: "assets/mobile/magic-cards/crit.png",
    flatDamage: "assets/mobile/magic-cards/fixed-dmg.png",
    freeDraw: "assets/mobile/magic-cards/free-redraw.png",
    joker: "assets/mobile/magic-cards/joker.png",
    coin: "assets/mobile/magic-cards/coins.png"
  });
  const MAGIC_COPY_PATHS = Object.freeze({
    straightBoost: "assets/mobile/magic-copy/straight.png",
    flushBoost: "assets/mobile/magic-copy/flush.png",
    threeBoost: "assets/mobile/magic-copy/three-kind.png",
    fourBoost: "assets/mobile/magic-copy/four-kind.png",
    fullHouseBoost: "assets/mobile/magic-copy/full-house.png",
    crit: "assets/mobile/magic-copy/crit.png",
    flatDamage: "assets/mobile/magic-copy/fixed-dmg.png",
    freeDraw: "assets/mobile/magic-copy/free-redraw.png",
    joker: "assets/mobile/magic-copy/joker.png",
    coin: "assets/mobile/magic-copy/coins.png"
  });
  const MAGIC_LABEL_PATHS = Object.freeze({
    fullHouseBoost: "assets/mobile/magic-cards/full-house-label.png"
  });
  const UI_PRELOAD_PATHS = Object.freeze([
    "assets/mobile/ui-supplied/start-panel.png", "assets/mobile/ui-supplied/start-word.png",
    "assets/mobile/ui-supplied/buff-panel.png", "assets/mobile/ui-supplied/buff-crit.png", "assets/mobile/ui-supplied/buff-fixed.png",
    "assets/mobile/ui-supplied/button-green.png", "assets/mobile/ui-supplied/button-purple.png", "assets/mobile/ui-supplied/button-red.png",
    "assets/mobile/ui-supplied/card-stack.png", "assets/mobile/ui-supplied/star.png", "assets/mobile/ui-supplied/star-rainbow.png",
    "assets/mobile/ui-supplied/round-panel.png", "assets/mobile/ui-supplied/round-numbers.png", "assets/mobile/ui-supplied/round-word.png",
    "assets/mobile/ui-supplied/tutorial-title.png", "assets/mobile/ui-supplied/tutorial-arrow.png", "assets/mobile/ui-supplied/tutorial-skip-button.png",
    "assets/mobile/ui-supplied/tutorial-skip-word.png", "assets/mobile/ui-supplied/tutorial-check-frame.png", "assets/mobile/ui-supplied/tutorial-checkmark.png",
    "assets/mobile/ui-supplied/tutorial-p1.png", "assets/mobile/ui-supplied/tutorial-p2.png", "assets/mobile/ui-supplied/tutorial-p3.png",
    "assets/mobile/ui-supplied/tutorial-p3b.png", "assets/mobile/ui-supplied/tutorial-p4.png"
  ]);
  for (const src of [...Object.values(HAND_ART).flatMap((art) => [art.base, art.word]), ...Object.values(DIRECT_CARD_ART), ...Object.values(JOKER_RANK_PATHS), JOKER_FACE_PATH, JOKER_TITLE_PATH, ...Object.values(DAMAGE_GLYPH_PATHS), ...Object.values(WIN_GLYPH_PATHS), ...Object.values(MAGIC_ART_PATHS), ...Object.values(MAGIC_COPY_PATHS), ...Object.values(MAGIC_LABEL_PATHS), ...Object.values(TREASURE_PRESENTATION_BY_STAR).map((entry) => entry.art), TREASURE_TITLE_PATH, ...UI_PRELOAD_PATHS]) {
    const image = new Image();
    image.src = src;
  }

  function assetUrl(path) {
    return new URL(path, document.baseURI).href;
  }

  function magicArtVariables(key) {
    const art = MAGIC_ART_PATHS[key];
    const label = MAGIC_LABEL_PATHS[key];
    return [art ? `--magic-art:url('${assetUrl(art)}')` : "", label ? `--magic-label:url('${assetUrl(label)}')` : ""].filter(Boolean).join(";");
  }

  function directCardMarkup(src) {
    return `<img class="direct-card-art" src="${src}" alt="" aria-hidden="true">`;
  }

  function jokerCardMarkup(rank, revealSubstituteRank = true) {
    const resolvedRank = Math.max(2, Math.min(14, Number(rank) || 14));
    return `<span class="joker-card-art${revealSubstituteRank ? " rank-revealed" : " joker-only"}" aria-hidden="true"><img class="joker-card-face" src="${JOKER_FACE_PATH}" alt="">${revealSubstituteRank ? `<img class="joker-card-rank" src="${JOKER_RANK_PATHS[resolvedRank]}" alt="">` : ""}<img class="joker-card-title" src="${JOKER_TITLE_PATH}" alt=""></span>`;
  }

  function damageGlyphMarkup(value) {
    return [...String(value)].map((character) => {
      const src = DAMAGE_GLYPH_PATHS[character.toUpperCase()];
      return src ? `<img src="${src}" alt="">` : "";
    }).join("");
  }

  function roundGlyphMarkup(value) {
    return [...String(Math.max(0, Math.round(Number(value) || 0)))].map((digit) => `<i class="round-glyph digit-${digit}" aria-hidden="true"></i>`).join("");
  }

  function setRewardTotal(value) {
    const total = Math.max(0, Math.round(Number(value) || 0));
    const label = `${total}X`;
    els.rewardTotal.dataset.value = String(total);
    els.rewardTotal.innerHTML = `<span class="sr-only">${total}x</span>${[...label].map((character) => {
      const src = WIN_GLYPH_PATHS[character];
      return `<img class="win-total-glyph${character === "X" ? " win-total-x" : ""}" src="${src}" alt="" aria-hidden="true">`;
    }).join("")}`;
  }

  function diePipsMarkup(face) {
    const positions = {
      1: ["mc"],
      2: ["tl", "br"],
      3: ["tl", "mc", "br"],
      4: ["tl", "tr", "bl", "br"],
      5: ["tl", "tr", "mc", "bl", "br"],
      6: ["tl", "tr", "ml", "mr", "bl", "br"]
    }[Number(face)] || [];
    return `<span class="die-fallback die-pips" aria-hidden="true">${positions.map((position) => `<i class="die-pip pip-${position}"></i>`).join("")}</span>`;
  }

  const platformTargetRtpPct = NaturalCore.normalizeTargetRtpPct(window.BOSS_DUEL_PLATFORM_CONFIG?.targetRtpPct);
  const runtimeConfig = Object.freeze({ seed: 20260824, targetRtp: platformTargetRtpPct / 100, cycleSize: 256, bet: 1, entryCostX: 1, drawCostsX: Object.freeze([1, 2, 3]) });
  let storyExperience = loadStoryExperience(runtimeConfig);
  let encounter = null;
  let playerState = loadPlayerState();
  // 個人紀錄只用來記住教學已完成；每次載入仍建立一隻全新的 BOSS。
  let session = { credits: 10000, spend: 0, payout: 0, hasStarted: playerState.spendX > 0 };
  let magicTimer = null;
  let roundFxTimer = null;
  let roundWarningTimer = null;
  let bossSpeechTimer = null;
  let settleTimer = null;
  let redrawTimer = null;
  let combatFxTimer = null;
  let combatSequenceToken = 0;
  let combatRollTimers = [];
  let handEnterTimer = null;
  let entryStarsTimer = null;
  let entryMaximumTimer = null;
  let treasureMaximumPulseTimer = null;
  let defeatFxTimer = null;
  let prizeTimer = null;
  let countdownTimer = null;
  let countdownDeadline = 0;
  let countdownRemaining = 0;
  let countdownEncounter = null;
  let countdownExpired = false;
  let prizeRevealState = null;
  let magicRevealIndex = 0;
  let activeBet = runtimeConfig.bet;
  let bossSpineApp = null;
  let activeBossSpine = null;
  let activeBossVisualKey = "";
  let bossHandSpineApp = null;
  let activeBossHandSpine = null;
  let activeBossHandHiddenSlots = [];
  let activeBossSpineKey = "";
  let bossSpineLoadingSignature = "";
  let bossSpineLoadToken = 0;
  let bossSpineEncounterId = 0;
  let bossSpineRetryTimer = null;
  let bossSpineRetrySignature = "";
  let bossSpineRetryCount = 0;
  let bossSpineFailedSignature = "";
  let treasureSpineApp = null;
  let activeTreasureSpine = null;
  let activeTreasureSkinNumber = 0;
  let activeTreasureEncounterId = 0;
  let treasureSpineLoadToken = 0;
  let attackSpineApp = null;
  let attackSpineToken = 0;
  let rewardDiceToken = 0;
  let rewardDieSpines = new Map();
  let tutorialPage = 0;
  let currentLocale = localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "zh-Hant";
  let audioEnabled = localStorage.getItem(AUDIO_KEY) !== "0";
  let audioContext = null;
  let historyEntries = loadStoredHistory();
  const replayAuditArchive = [];

  const spineResourcePromises = new Map();

  function localeText(key) {
    return localeCopy[currentLocale]?.[key] || localeCopy.en[key] || key;
  }

  function loadStoredHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(stored) ? stored.slice(0, 20) : [];
    } catch (_error) {
      return [];
    }
  }

  function auditSnapshot(target = encounter) {
    if (!target) return null;
    const state = target.presentation;
    return {
      phase: target.phase,
      round: target.round,
      tieIndex: target.tieRedeals || 0,
      drawNumber: target.draws,
      hpLeft: target.hpLeft,
      keepCardIds: state
        ? NaturalCore.sortedCardIds(state.playerCards.filter((_card, index) => !state.discardIndexes.has(index)))
        : [],
      playerCardIds: state ? state.playerCards.map(Rules.cardId) : [],
      bossCardIds: state ? state.bossCards.map(Rules.cardId) : [],
      playerDeckCount: state?.playerDeck?.length || 0,
      magic: (state?.magicCards || []).map((card) => ({ key: card.key, value: card.value, target: card.target, effectSlot: card.effectSlot }))
    };
  }

  function plannedOperation(type) {
    const step = NaturalCore.storyStepAt(encounter?.packet?.storyRecord, encounter?.round || 1, encounter?.tieRedeals || 0);
    if (["REROLL_BOSS", "BET_CHANGE"].includes(type)) {
      if (!encounter?.round) return "START";
      const nextStep = (encounter.packet.storyRecord?.path || []).find((row) => row.round > encounter.round);
      return nextStep ? "CONTINUE" : "STOP";
    }
    if (!step) return type === "START" ? "START" : "STOP";
    if (type === "REDRAW") return encounter.draws < step.draws ? "REDRAW" : step.action;
    if (["FIGHT", "FOLD"].includes(type)) return encounter.draws < step.draws ? "REDRAW" : step.action;
    if (type === "CONTINUE") {
      const nextStep = (encounter.packet.storyRecord?.path || []).find((row) => row.round > encounter.round);
      return nextStep ? "CONTINUE" : "STOP";
    }
    return type;
  }

  function beginOperation(type) {
    encounter.operationSequence += 1;
    return {
      sequence: encounter.operationSequence,
      requestId: `${encounter.bossInstanceId}-op-${encounter.operationSequence}`,
      type,
      plannedType: plannedOperation(type),
      before: auditSnapshot()
    };
  }

  function completeOperation(operation, detail = {}) {
    const row = {
      ...operation,
      matchedPlan: operation.type === operation.plannedType,
      ...detail,
      after: auditSnapshot()
    };
    encounter.actionLog.push(row);
    syncReplayAuditDom();
    return row;
  }

  function recordKeepSelection() {
    if (!encounter?.presentation) return;
    encounter.clientEventSequence += 1;
    const snapshot = auditSnapshot();
    const plannedKeepIds = NaturalCore.plannedKeepIdsAt(
      encounter.packet.storyRecord,
      encounter.round,
      encounter.tieRedeals || 0,
      encounter.draws + 1
    );
    encounter.clientEvents.push({
      sequence: encounter.clientEventSequence,
      requestId: `${encounter.bossInstanceId}-keep-${encounter.clientEventSequence}`,
      type: "KEEP_SELECTION",
      plannedKeepIds,
      actualKeepIds: snapshot.keepCardIds,
      matchedPlan: NaturalCore.sameCardIds(plannedKeepIds, snapshot.keepCardIds),
      snapshot
    });
    syncReplayAuditDom();
  }

  function archiveEncounterAudit(reason) {
    if (!encounter?.replayContract || encounter.auditArchived) return;
    encounter.auditArchived = true;
    replayAuditArchive.push({
      reason,
      contract: encounter.replayContract,
      suppressionActive: encounter.suppressionActive,
      actionLog: encounter.actionLog,
      clientEvents: encounter.clientEvents,
      final: auditSnapshot(encounter)
    });
    if (replayAuditArchive.length > 20) replayAuditArchive.shift();
    syncReplayAuditDom();
  }

  function replayAuditPayload() {
    return JSON.parse(JSON.stringify({
      current: encounter?.replayContract ? {
        contract: encounter.replayContract,
        suppressionActive: encounter.suppressionActive,
        actionLog: encounter.actionLog,
        clientEvents: encounter.clientEvents,
        current: auditSnapshot()
      } : null,
      archived: replayAuditArchive
    }));
  }

  function syncReplayAuditDom() {
    if (qaParams.get("qaAudit") !== "1") return;
    document.documentElement.dataset.bossDuelReplayAudit = JSON.stringify(replayAuditPayload());
  }

  if (qaParams.get("qaAudit") === "1") {
    window.getBossDuelReplayAudit = replayAuditPayload;
    document.addEventListener("boss-duel:request-replay-audit", () => {
      document.documentElement.dataset.bossDuelReplayAudit = JSON.stringify(replayAuditPayload());
    });
  }

  function closeQuickMenu() {
    els.quickMenu.hidden = true;
    els.menuButton.setAttribute("aria-expanded", "false");
  }

  function applyLocale(locale) {
    currentLocale = locale === "en" ? "en" : "zh-Hant";
    document.documentElement.lang = currentLocale;
    localStorage.setItem(LOCALE_KEY, currentLocale);
    document.querySelectorAll("[data-copy-en][data-copy-zh]").forEach((node) => {
      node.textContent = currentLocale === "en" ? node.dataset.copyEn : node.dataset.copyZh;
    });
    els.tutorialClose.setAttribute("aria-label", localeText("tutorialClose"));
    document.querySelector(".card-help-card h2").textContent = localeText("cardHelpTitle");
    document.querySelector(".history-card h2").textContent = localeText("historyTitle");
    document.querySelector(".deck-panel-card h2").childNodes[0].nodeValue = `${localeText("deckTitle")} `;
    document.querySelector(".wallet-bar > div:last-child span").textContent = localeText("totalBet");
    els.languageButton.classList.toggle("active", currentLocale === "en");
    els.languageButton.setAttribute("aria-pressed", String(currentLocale === "en"));
    renderHistory();
  }

  function ensureAudioContext() {
    if (!audioEnabled) return null;
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function playSfx(kind = "click") {
    const context = ensureAudioContext();
    if (!context) return;
    const patterns = {
      click: [[620, .035, "square", .018]],
      deal: [[360, .045, "triangle", .025], [520, .04, "triangle", .018]],
      countdown: [[760, .08, "square", .035]],
      countdownFinal: [[1040, .12, "square", .05]],
      compare: [[150, .16, "sawtooth", .045], [620, .14, "triangle", .035]],
      win: [[523, .11, "triangle", .04], [659, .12, "triangle", .04], [784, .18, "triangle", .045]],
      lose: [[392, .13, "triangle", .035], [294, .18, "triangle", .04]],
      attack: [[110, .18, "sawtooth", .055], [880, .11, "square", .025]],
      reward: [[660, .08, "triangle", .04], [990, .13, "triangle", .04]],
      collect: [[523, .09, "triangle", .04], [784, .1, "triangle", .04], [1046, .19, "triangle", .05]]
    };
    const notes = patterns[kind] || patterns.click;
    let cursor = context.currentTime;
    notes.forEach(([frequency, duration, type, volume]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, cursor);
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(volume, cursor + .008);
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(cursor);
      oscillator.stop(cursor + duration + .01);
      cursor += duration * .68;
    });
  }

  function setAudioEnabled(active, announce = true) {
    audioEnabled = Boolean(active);
    localStorage.setItem(AUDIO_KEY, audioEnabled ? "1" : "0");
    els.soundButton.classList.toggle("active", audioEnabled);
    els.soundButton.setAttribute("aria-pressed", String(audioEnabled));
    if (audioEnabled && announce) playSfx("click");
    if (announce) setMessage(audioEnabled ? localeText("audioOn") : localeText("audioOff"), "");
  }

  function hideResultBoard() {
    els.resultBoard.hidden = true;
    els.resultBoard.className = "result-board";
  }

  function showResultBoard(type, title, detail) {
    els.resultBoard.className = `result-board result-${type}${isTurbo() ? " turbo" : ""}`;
    els.resultBoardEyebrow.textContent = type === "draw" ? "SHOWDOWN" : "RESULT";
    els.resultBoardTitle.textContent = title;
    els.resultBoardDetail.textContent = detail || "";
    els.resultBoard.hidden = false;
    playSfx(type === "player" ? "win" : type === "boss" ? "lose" : "compare");
  }

  function renderCardHelp() {
    const order = ["royalFlush", "straightFlush", "four", "fullHouse", "flush", "straight", "three", "twoPair", "pair", "high"];
    els.cardHelpList.innerHTML = order.map((key) => {
      const art = HAND_ART[key];
      return `<div class="card-help-row"><img class="base" src="${art.base}" alt=""><img class="word" src="${art.word}" alt="${key}"></div>`;
    }).join("");
  }

  function deckCardsForPanel() {
    if (encounter?.presentation?.playerDeck) return encounter.presentation.playerDeck;
    return ["S", "H", "C", "D"].flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({ suit, rank: index + 2 })));
  }

  function renderDeckPanel() {
    const cards = deckCardsForPanel();
    const ranks = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const labels = { 14: "A", 13: "K", 12: "Q", 11: "J" };
    const suits = [{ key: "S", glyph: "♠", red: false }, { key: "H", glyph: "♥", red: true }, { key: "C", glyph: "♣", red: false }, { key: "D", glyph: "♦", red: true }];
    const available = new Set(cards.map((card) => `${card.suit}:${card.rank}`));
    const header = `<span class="deck-cell header"></span>${ranks.map((rank) => `<span class="deck-cell header">${labels[rank] || rank}</span>`).join("")}`;
    const rows = suits.map((suit) => `<span class="deck-cell suit${suit.red ? " red" : ""}">${suit.glyph}</span>${ranks.map((rank) => `<span class="deck-cell${available.has(`${suit.key}:${rank}`) ? "" : " empty"}">${available.has(`${suit.key}:${rank}`) ? "●" : "×"}</span>`).join("")}`).join("");
    els.deckMatrix.innerHTML = header + rows;
    els.deckPanelTotal.textContent = `${cards.length}/52`;
    els.deckSuitTotals.innerHTML = suits.map((suit) => `<span class="${suit.red ? "red" : ""}">${suit.glyph} ${cards.filter((card) => card.suit === suit.key).length}</span>`).join("");
  }

  function addHistory(outcome, detail, tone = "") {
    if (!encounter) return;
    const time = new Date().toLocaleTimeString(currentLocale === "en" ? "en-US" : "zh-TW", { hour: "2-digit", minute: "2-digit" });
    historyEntries.unshift({ outcome, detail, tone, star: encounter.packet.star, round: encounter.round, bet: encounter.bet, time });
    historyEntries = historyEntries.slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
    renderHistory();
  }

  function renderHistory() {
    els.historyList.innerHTML = historyEntries.length ? historyEntries.map((entry) => {
      const bet = Number(entry.bet);
      const betLabel = Number.isFinite(bet) ? `BET ${bet.toLocaleString(currentLocale === "en" ? "en-US" : "zh-TW")}` : "BET —";
      return `<div class="history-entry ${entry.tone || ""}"><b>${entry.star}★ R${entry.round}<em>${entry.time || ""}</em></b><span>${entry.outcome}</span><small>${betLabel}<br>${entry.detail}</small></div>`;
    }).join("") : `<p>${currentLocale === "en" ? "NO BATTLES YET" : "尚無戰局紀錄"}</p>`;
  }

  function updateTutorialPage() {
    const pages = [...els.tutorialPages.querySelectorAll("[data-tutorial-page]")];
    tutorialPage = Math.max(0, Math.min(pages.length - 1, tutorialPage));
    pages.forEach((page, index) => {
      page.hidden = index !== tutorialPage;
      page.classList.toggle("active", index === tutorialPage);
    });
    els.tutorialPrev.disabled = tutorialPage === 0;
    els.tutorialNext.disabled = tutorialPage === pages.length - 1;
    els.tutorialDots.innerHTML = pages.map((_, index) => `<i class="${index === tutorialPage ? "active" : ""}"></i>`).join("");
  }

  function openTutorial(page = 0) {
    tutorialPage = page;
    els.tutorialSkipPreference.checked = localStorage.getItem(TUTORIAL_SKIP_KEY) === "1";
    updateTutorialPage();
    els.tutorialOverlay.hidden = false;
  }

  function closeTutorial() {
    localStorage.setItem(TUTORIAL_SKIP_KEY, els.tutorialSkipPreference.checked ? "1" : "0");
    els.tutorialOverlay.hidden = true;
  }

  function updateCountdownVisual() {
    els.countdownValue.textContent = String(Math.max(0, countdownRemaining));
    els.countdownPanel.hidden = countdownRemaining <= 0 || countdownRemaining > 10;
    els.countdownPanel.classList.toggle("warning", countdownRemaining <= 10 && countdownRemaining > 3);
    els.countdownPanel.classList.toggle("critical", countdownRemaining <= 3 && countdownRemaining > 0);
  }

  function stopCountdown() {
    clearTimeout(countdownTimer);
    countdownTimer = null;
    countdownDeadline = 0;
    countdownRemaining = 0;
    countdownEncounter = null;
    countdownExpired = false;
    els.countdownPanel.hidden = true;
  }

  function expireCountdown(targetEncounter) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
    countdownExpired = true;
    els.countdownPanel.hidden = true;
    if (encounter === targetEncounter && encounter.phase === "hand" && !encounter.handEntering) {
      setMessage("TIME UP｜自動進行 FIGHT／FOLD", "lose");
      automaticFightOrFold();
    }
  }

  function tickCountdown(targetEncounter) {
    if (encounter !== targetEncounter || !targetEncounter.presentation || ["compare-reveal", "compare-result", "round-result", "resolved-loss", "boss-defeat", "prize-reveal", "resolved-win"].includes(targetEncounter.phase)) {
      stopCountdown();
      return;
    }
    const next = Math.max(0, Math.ceil((countdownDeadline - Date.now()) / 1000));
    if (next !== countdownRemaining) {
      countdownRemaining = next;
      updateCountdownVisual();
      if (next <= 5 && next > 0) playSfx(next === 1 ? "countdownFinal" : "countdown");
    }
    if (countdownRemaining <= 0) {
      expireCountdown(targetEncounter);
      return;
    }
    countdownTimer = setTimeout(() => tickCountdown(targetEncounter), 160);
  }

  function startCountdown(targetEncounter = encounter) {
    stopCountdown();
    if (!targetEncounter?.presentation) return;
    countdownEncounter = targetEncounter;
    const handSeconds = Number.isInteger(targetEncounter.packet?.naturalStorySeed) ? 120 : HAND_SECONDS;
    countdownRemaining = handSeconds;
    countdownDeadline = Date.now() + handSeconds * 1000;
    updateCountdownVisual();
    countdownTimer = setTimeout(() => tickCountdown(targetEncounter), 160);
  }

  function loadSpineResource(folder, collection = "spine") {
    const resourceKey = `${collection}/${folder}`;
    if (spineResourcePromises.has(resourceKey)) return spineResourcePromises.get(resourceKey);
    const base = `assets/mobile/${collection}/${folder}`;
    const promise = PIXI.Assets.load({
      src: `${base}/skeleton.json`,
      data: { spineAtlasFile: `${base}/skeleton.atlas` }
    }).catch((error) => {
      spineResourcePromises.delete(resourceKey);
      throw error;
    });
    spineResourcePromises.set(resourceKey, promise);
    return promise;
  }

  function clearRewardDiceSpines() {
    rewardDiceToken += 1;
    for (const record of rewardDieSpines.values()) record.app.destroy(true, { children: true, texture: false, baseTexture: false });
    rewardDieSpines = new Map();
  }

  async function mountRewardDiceSpines() {
    clearRewardDiceSpines();
    const token = rewardDiceToken;
    try {
      if (!window.PIXI?.spine?.Spine) return;
      const resource = await loadSpineResource("dice");
      if (token !== rewardDiceToken || !encounter || encounter.phase !== "prize-reveal") return;
      for (const host of els.rewardDice.querySelectorAll("[data-die-spine]")) {
        const die = host.closest("[data-prize-index]");
        const index = Number(die?.dataset.prizeIndex);
        const face = Number(host.dataset.face);
        const multiplier = host.dataset.kind === "multiplier";
        if (!die || !Number.isFinite(index) || !face) continue;
        const app = new PIXI.Application({
          width: REWARD_DIE_RENDER_SIZE,
          height: REWARD_DIE_RENDER_SIZE,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
          autoDensity: true
        });
        host.replaceChildren(app.view);
        const spine = new PIXI.spine.Spine(resource.spineData);
        spine.skeleton.setSkinByName(multiplier ? `x${face}` : `dice_${face}`);
        spine.skeleton.setSlotsToSetupPose();
        const alreadyOpened = Boolean(prizeRevealState?.opened?.has(index));
        const alreadyFinished = Boolean(prizeRevealState?.finished?.has(index));
        spine.state.setAnimation(0, alreadyFinished
          ? (multiplier ? "golden_end" : "normal_end")
          : alreadyOpened
            ? (multiplier ? "golden_flip" : "normal_flip")
            : (multiplier ? "golden_begin" : "normal_begin"), false);
        spine.update(0);
        const bounds = spine.getLocalBounds();
        const visualSize = REWARD_DIE_RENDER_SIZE - 2;
        const scale = Math.min(visualSize / Math.max(1, bounds.width), visualSize / Math.max(1, bounds.height));
        spine.scale.set(scale);
        spine.x = REWARD_DIE_RENDER_SIZE / 2 - (bounds.x + bounds.width / 2) * scale;
        spine.y = REWARD_DIE_RENDER_SIZE / 2 - (bounds.y + bounds.height / 2) * scale;
        app.stage.addChild(spine);
        rewardDieSpines.set(index, { app, spine, multiplier, face });
        die.classList.add("spine-ready");
      }
    } catch (error) {
      if (token === rewardDiceToken) {
        console.warn("Reward dice spine fallback", error);
        document.documentElement.dataset.rewardDiceError = String(error?.message || error);
      }
    }
  }

  function playBossSequence(beginAnimation, loopAnimation = "11_idle") {
    for (const spine of [activeBossSpine, activeBossHandSpine].filter(Boolean)) {
      try {
        spine.state.timeScale = isTurbo() ? TURBO_TIME_SCALE : 1;
        spine.state.setAnimation(0, beginAnimation, false);
        if (loopAnimation) spine.state.addAnimation(0, loopAnimation, true, 0);
      } catch (error) {
        console.warn("Boss animation fallback", beginAnimation, error);
        spine.state.setAnimation(0, "11_idle", true);
      }
    }
  }

  function bossAnimationWindowMs(animationName, fallbackSeconds = 1, bufferMs = 60) {
    const duration = activeBossSpine?.spineData?.findAnimation?.(animationName)?.duration;
    return animationWindowMs(Number.isFinite(duration) && duration > 0 ? duration : fallbackSeconds, bufferMs);
  }

  function playTreasureSequence(animationName) {
    if (!activeTreasureSpine) return;
    try {
      activeTreasureSpine.state.timeScale = isTurbo() ? TURBO_TIME_SCALE : 1;
      activeTreasureSpine.state.setAnimation(0, animationName, false);
      activeTreasureSpine.state.addAnimation(0, "idle", true, 0);
    } catch (error) {
      console.warn("Treasure animation fallback", animationName, error);
      activeTreasureSpine.state.setAnimation(0, "idle", true);
    }
  }

  function syncTreasureSpineToEncounter(encounterId) {
    if (!encounter || encounterId !== bossSpineEncounterId) return;
    if (["boss-defeat", "prize-reveal", "resolved-win"].includes(encounter.phase)) playTreasureSequence("level2");
    else if (encounter.round > 0) playTreasureSequence("level1");
  }

  function syncBossSpineToEncounter(encounterId) {
    if (!encounter || encounterId !== bossSpineEncounterId || !activeBossSpine) return;
    if (["boss-defeat", "prize-reveal", "resolved-win"].includes(encounter.phase)) playBossSequence("31_lose_begin", "32_lose_loop");
    else if (encounter.phase === "resolved-loss") playBossSequence("21_win_begin", "22_win_loop");
    else if (encounter.phase === "tie-result") playBossSequence("41_draw_begin", "42_draw_loop");
    else if (encounter.phase === "damage") playBossSequence("17_damage", null);
    else if (encounter.phase === "post-hit") playBossSequence("14_idle_nocard", "14_idle_nocard");
    else if (["effect-charge", "attack-exit", "attack"].includes(encounter.phase)) playBossSequence("14_idle_nocard", "14_idle_nocard");
    else if (encounter.phase === "round-result" && encounter.cardsCleared) playBossSequence("14_idle_nocard", "14_idle_nocard");
    else if (["compare-reveal", "compare-result", "round-result"].includes(encounter.phase)) playBossSequence("13_showdown", "11_idle");
    else if (encounter.phase === "entry-promise") playBossSequence("15_begin", "14_idle_nocard");
    else if (encounter.phase === "ready") playBossSequence("14_idle_nocard", "14_idle_nocard");
    else if (encounter.round > 0) playBossSequence("12_take", "11_idle");
    else playBossSequence("14_idle_nocard", "14_idle_nocard");
  }

  function treasureSkinForStar(star) {
    // 原站 TreasureTableSkinLevelMap：未揭示骰型前，1–3 / 4–5 / 6–7 / 8 星分別使用四套初始寶箱。
    const normalizedStar = Math.max(1, Math.min(8, Math.round(Number(star) || 1)));
    if (normalizedStar <= 3) return 1;
    if (normalizedStar <= 5) return 2;
    if (normalizedStar <= 7) return 3;
    return 4;
  }

  function guaranteedPremiumDiceForStar(star) {
    const normalizedStar = Math.max(1, Math.min(8, Math.round(Number(star) || 1)));
    return GUARANTEED_PREMIUM_DICE[normalizedStar];
  }

  function treasurePresentationForStar(star) {
    const normalizedStar = Math.max(1, Math.min(8, Math.round(Number(star) || 1)));
    return TREASURE_PRESENTATION_BY_STAR[normalizedStar];
  }

  function treasureSkinForMaximum(maximum) {
    const value = Math.max(0, Number(maximum) || 0);
    if (value <= 18) return 1;
    if (value <= 30) return 2;
    if (value <= 216) return 3;
    return 4;
  }

  function maximumRewardForDice(dice) {
    const lockedMaximum = Number(dice?.maxTotal);
    if (Number.isFinite(lockedMaximum) && lockedMaximum > 0) return Math.round(lockedMaximum);
    const normalDice = Math.max(1, Math.round(Number(dice?.normalDice) || 1));
    const multiplierDice = Math.max(0, Math.round(Number(dice?.multiplierDice) || 0));
    return normalDice * 6 * (multiplierDice > 0 ? multiplierDice * 6 : 1);
  }

  function treasureMaximumMarkup(maximum) {
    const maximumLabel = `${maximum}X`;
    const glyphs = [...maximumLabel].map((character) => `<img src="${WIN_GLYPH_PATHS[character]}" alt="" aria-hidden="true">`).join("");
    return `<span class="treasure-plaque-art" aria-hidden="true"><span class="treasure-plaque-face"><img class="treasure-plaque-title" src="${TREASURE_TITLE_PATH}" alt=""><span class="treasure-plaque-value length-${maximumLabel.length}">${glyphs}</span></span></span><span class="sr-only">WIN UP TO ${maximumLabel}</span>`;
  }

  async function showTreasureSkin(encounterId, star, maximum, maximumRevealed) {
    const baseSkinNumber = treasureSkinForStar(star);
    const skinNumber = maximumRevealed
      ? Math.max(baseSkinNumber, treasureSkinForMaximum(maximum))
      : baseSkinNumber;
    const maximumLabel = `${maximum}X`;
    const chestMaximum = els.treasureChest.querySelector("span");
    const previousEncounterId = els.treasureChest.dataset.encounterId;
    const previousMaximum = els.treasureChest.dataset.maximum;
    const sameEncounter = previousEncounterId === String(encounterId);
    els.treasureChest.dataset.tier = String(skinNumber);
    els.treasureChest.dataset.encounterId = String(encounterId);
    els.treasureChest.dataset.maximum = String(maximum);
    chestMaximum.setAttribute("aria-label", `WIN UP TO ${maximumLabel}`);
    if (!sameEncounter || previousMaximum !== String(maximum)) {
      chestMaximum.innerHTML = treasureMaximumMarkup(maximum);
      clearTimeout(treasureMaximumPulseTimer);
      els.treasureChest.classList.remove("maximum-updated");
      if (sameEncounter && previousMaximum) {
        void els.treasureChest.offsetWidth;
        els.treasureChest.classList.add("maximum-updated");
        playSfx("deal");
        treasureMaximumPulseTimer = setTimeout(() => els.treasureChest.classList.remove("maximum-updated"), isTurbo() ? 520 : 900);
      }
    }
    if (!window.PIXI?.spine?.Spine) return;
    if (activeTreasureSkinNumber === skinNumber && activeTreasureEncounterId === encounterId && activeTreasureSpine) return;
    const token = ++treasureSpineLoadToken;
    // 新 BOSS 載入期間先顯示通用寶箱，避免短暫殘留上一星級的 Spine skin。
    els.treasureChest.classList.remove("spine-ready");
    try {
      if (!treasureSpineApp) {
        // 以較大的 renderer 保留原 Spine 粒子，再由 108px HUD 視窗裁出原 1080px 舞台的右側寶箱區。
        treasureSpineApp = new PIXI.Application({ width: 195, height: 180, backgroundAlpha: 0, antialias: true, resolution: 1 });
        els.treasureSpine.replaceChildren(treasureSpineApp.view);
      }
      const resource = await loadSpineResource("treasure");
      if (token !== treasureSpineLoadToken) return;
      treasureSpineApp.stage.removeChildren();
      activeTreasureSpine = new PIXI.spine.Spine(resource.spineData);
      activeTreasureSpine.skeleton.setSkinByName(`treasure${skinNumber}`);
      activeTreasureSpine.skeleton.setSlotsToSetupPose();
      const backdrop = activeTreasureSpine.skeleton.findSlot("bk");
      if (backdrop) backdrop.attachment = null;
      // Spine skin 的布牌烙有舊制 10/25/50/100X；移除後由 HUD 以公開星級上限重畫。
      const embeddedMaximumCloth = activeTreasureSpine.skeleton.findSlot("cloth");
      if (embeddedMaximumCloth) embeddedMaximumCloth.attachment = null;
      activeTreasureSpine.state.setAnimation(0, "appear", false);
      activeTreasureSpine.state.addAnimation(0, "idle", true, 0);
      activeTreasureSpine.update(0);
      if (embeddedMaximumCloth) {
        embeddedMaximumCloth.attachment = null;
        embeddedMaximumCloth.color.a = 0;
      }
      activeTreasureSpine.scale.set(0.65);
      activeTreasureSpine.x = -157;
      activeTreasureSpine.y = 112;
      treasureSpineApp.stage.addChild(activeTreasureSpine);
      activeTreasureSkinNumber = skinNumber;
      activeTreasureEncounterId = encounterId;
      els.treasureChest.classList.add("spine-ready");
      syncTreasureSpineToEncounter(encounterId);
    } catch (error) {
      if (token !== treasureSpineLoadToken) return;
      console.warn("Treasure spine fallback", error);
      activeTreasureSkinNumber = 0;
      activeTreasureEncounterId = 0;
      els.treasureChest.classList.remove("spine-ready");
    }
  }

  function entryStarPresentationTiming(extraPremiumStars) {
    const turbo = isTurbo();
    const extra = Math.max(0, Math.round(Number(extraPremiumStars) || 0));
    const maximumRevealAt = extra > 0
      ? Math.max(0, extra - 1) * (turbo ? 80 : 140) + (turbo ? 300 : 580)
      : turbo ? 280 : 480;
    return { maximumRevealAt, duration: maximumRevealAt + (turbo ? 260 : 500) };
  }

  function clearCombatRollTimers() {
    for (const timer of combatRollTimers) clearTimeout(timer);
    combatRollTimers = [];
  }

  function clearAttackSpine() {
    attackSpineToken += 1;
    if (attackSpineApp) attackSpineApp.stage.removeChildren();
    els.combatFx.classList.remove("attack-fallback");
  }

  async function playAttackSpine(tier, attackEncounter) {
    const token = ++attackSpineToken;
    const fallbackDuration = ATTACK_ANIMATION_SECONDS[tier] || ATTACK_ANIMATION_SECONDS.normal;
    els.combatFx.classList.add("attack-fallback");
    try {
      if (!window.PIXI?.spine?.Spine) throw new Error("PIXI Spine unavailable");
      if (!attackSpineApp) {
        attackSpineApp = new PIXI.Application({ width: 390, height: 695, backgroundAlpha: 0, antialias: true, resolution: 1 });
        els.combatSpineStage.replaceChildren(attackSpineApp.view);
      }
      attackSpineApp.renderer.resize(390, 695);
      const resource = await loadSpineResource("attack");
      if (token !== attackSpineToken || encounter !== attackEncounter || encounter.phase !== "attack") return;
      els.combatFx.classList.remove("attack-fallback");
      attackSpineApp.stage.removeChildren();
      const spine = new PIXI.spine.Spine(resource.spineData);
      spine.skeleton.setSlotsToSetupPose();
      spine.state.timeScale = isTurbo() ? TURBO_TIME_SCALE : 1;
      const animation = ATTACK_ANIMATION_NAMES[tier] || ATTACK_ANIMATION_NAMES.normal;
      spine.state.setAnimation(0, animation, false);
      spine.update(0);
      const bounds = ATTACK_SOURCE_BOUNDS;
      const scale = Math.min(390 / bounds.width, 695 / bounds.height);
      spine.scale.set(scale);
      spine.x = 195 - (bounds.x + bounds.width / 2) * scale;
      spine.y = 695 - (bounds.y + bounds.height) * scale;
      attackSpineApp.stage.addChild(spine);
      const sourceDuration = spine.spineData?.findAnimation?.(animation)?.duration || fallbackDuration;
      await new Promise((resolve) => {
        combatFxTimer = setTimeout(resolve, animationWindowMs(sourceDuration, 90));
      });
      return token === attackSpineToken && encounter === attackEncounter && encounter.phase === "attack";
    } catch (error) {
      if (token === attackSpineToken && encounter === attackEncounter && encounter.phase === "attack") {
        els.combatFx.classList.add("attack-fallback");
        console.warn("Attack spine fallback", error);
        await new Promise((resolve) => {
          combatFxTimer = setTimeout(resolve, animationWindowMs(fallbackDuration, 90));
        });
        return token === attackSpineToken && encounter === attackEncounter && encounter.phase === "attack";
      }
      return false;
    }
  }

  function measureBossSafeBounds(spine) {
    const animationNames = ["11_idle", "12_take", "13_showdown", "14_idle_nocard", "15_begin", "16_end", "17_damage", "21_win_begin", "31_lose_begin", "41_draw_begin"];
    let safe = null;
    const includeBounds = () => {
      const bounds = spine.getLocalBounds();
      if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return;
      const right = bounds.x + bounds.width;
      const bottom = bounds.y + bounds.height;
      if (!safe) safe = { x: bounds.x, y: bounds.y, right, bottom };
      else {
        safe.x = Math.min(safe.x, bounds.x);
        safe.y = Math.min(safe.y, bounds.y);
        safe.right = Math.max(safe.right, right);
        safe.bottom = Math.max(safe.bottom, bottom);
      }
    };
    for (const animationName of animationNames) {
      const animation = spine.spineData?.findAnimation?.(animationName);
      if (!animation) continue;
      spine.skeleton.setToSetupPose();
      spine.state.clearTracks();
      spine.state.setAnimation(0, animationName, false);
      spine.update(0);
      includeBounds();
      const steps = Math.max(1, Math.ceil(animation.duration / 0.2));
      for (let index = 0; index < steps; index += 1) {
        spine.update(animation.duration / steps);
        includeBounds();
      }
    }
    spine.skeleton.setToSetupPose();
    spine.state.clearTracks();
    spine.state.setAnimation(0, "14_idle_nocard", true);
    spine.update(0);
    if (!safe) {
      const bounds = spine.getLocalBounds();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }
    return { x: safe.x, y: safe.y, width: safe.right - safe.x, height: safe.bottom - safe.y };
  }

  function mergeBossSafeBounds(...boundsList) {
    const valid = boundsList.filter((bounds) => bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite));
    if (!valid.length) return null;
    const left = Math.min(...valid.map((bounds) => bounds.x));
    const top = Math.min(...valid.map((bounds) => bounds.y));
    const right = Math.max(...valid.map((bounds) => bounds.x + bounds.width));
    const bottom = Math.max(...valid.map((bounds) => bounds.y + bounds.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function applyBossFrontMask() {
    if (!activeBossHandSpine) return;
    const hidden = new Set(activeBossHandHiddenSlots);
    activeBossHandSpine.skeleton.slots.forEach((slot, index) => {
      if (activeBossHandSpine.slotContainers?.[index]) activeBossHandSpine.slotContainers[index].visible = !hidden.has(slot);
      if (hidden.has(slot)) slot.color.a = 0;
    });
  }

  function layoutBossSpine() {
    if (!bossSpineApp || !activeBossSpine) return;
    const stageHeight = Math.max(1, Math.round(els.bossStage.clientHeight));
    const rendererHeight = stageHeight + BOSS_RENDER_OVERFLOW;
    bossSpineApp.renderer.resize(390, rendererHeight);
    if (bossHandSpineApp) bossHandSpineApp.renderer.resize(390, rendererHeight);
    const bounds = activeBossSpine.__safeBossBounds || activeBossSpine.getLocalBounds();
    const scale = Math.min(378 / Math.max(1, bounds.width), (stageHeight + 48) / Math.max(1, bounds.height));
    const visualLayout = BOSS_VISUAL_LAYOUT[activeBossVisualKey] || {};
    const bossScale = visualLayout.scale || scale * 0.96;
    for (const spine of [activeBossSpine, activeBossHandSpine].filter(Boolean)) {
      spine.scale.set(bossScale);
      spine.x = 195 - (bounds.x + bounds.width / 2) * bossScale;
      spine.y = stageHeight + 48 - (bounds.y + bounds.height) * bossScale + (visualLayout.yOffset || 0);
    }
    applyBossFrontMask();
    window.__bossSpineDebug = {
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      scaleX: bossScale,
      scaleY: bossScale,
      x: activeBossSpine.x,
      y: activeBossSpine.y,
      stageHeight,
      rendererHeight,
      frontSlots: activeBossHandSpine ? activeBossHandSpine.skeleton.slots.length - activeBossHandHiddenSlots.length : 0
    };
  }

  function auditBossAnimationCoverage(key) {
    if (new URLSearchParams(location.search).get("qa") !== "1" || !activeBossSpine || !activeBossHandSpine) return;
    const safe = activeBossSpine.__safeBossBounds;
    const animationNames = ["11_idle", "12_take", "13_showdown", "14_idle_nocard", "15_begin", "16_end", "17_damage", "21_win_begin", "22_win_loop", "31_lose_begin", "32_lose_loop", "41_draw_begin", "42_draw_loop"];
    const samples = [];
    for (const animationName of animationNames) {
      const animation = activeBossSpine.spineData?.findAnimation?.(animationName);
      if (!animation) {
        samples.push({ animationName, missing: true });
        continue;
      }
      let clipped = false;
      const phaseBounds = [];
      let maximumCriticalVisible = 0;
      let maximumFrontCriticalVisible = 0;
      for (const progress of [0, .25, .5, .75, 1]) {
        for (const spine of [activeBossSpine, activeBossHandSpine]) {
          spine.skeleton.setToSetupPose();
          spine.state.clearTracks();
          spine.state.setAnimation(0, animationName, false);
          spine.update(animation.duration * progress);
        }
        applyBossFrontMask();
        const transformedFor = (spine) => {
          const bounds = spine.getLocalBounds();
          return {
            left: spine.x + bounds.x * spine.scale.x,
            top: spine.y + bounds.y * spine.scale.y,
            right: spine.x + (bounds.x + bounds.width) * spine.scale.x,
            bottom: spine.y + (bounds.y + bounds.height) * spine.scale.y
          };
        };
        const bodyBounds = transformedFor(activeBossSpine);
        const frontBounds = transformedFor(activeBossHandSpine);
        const transformed = {
          left: Math.min(bodyBounds.left, frontBounds.left),
          top: Math.min(bodyBounds.top, frontBounds.top),
          right: Math.max(bodyBounds.right, frontBounds.right),
          bottom: Math.max(bodyBounds.bottom, frontBounds.bottom)
        };
        const visibleCriticalCount = (spine) => spine.skeleton.slots.filter((slot, index) =>
          /hand|finger|forearm|\barm|card[1-6]|dealing/i.test(slot.data.name)
          && Boolean(slot.attachment)
          && spine.slotContainers?.[index]?.visible !== false
          && Number(slot.color?.a ?? 1) > .01
        ).length;
        const bodyCriticalVisible = visibleCriticalCount(activeBossSpine);
        const frontCriticalVisible = visibleCriticalCount(activeBossHandSpine);
        maximumCriticalVisible = Math.max(maximumCriticalVisible, bodyCriticalVisible + frontCriticalVisible);
        maximumFrontCriticalVisible = Math.max(maximumFrontCriticalVisible, frontCriticalVisible);
        if (transformed.left < -1 || transformed.top < -1 || transformed.right > 391 || transformed.bottom > bossSpineApp.renderer.height + 1) clipped = true;
        phaseBounds.push({ progress, ...transformed, bodyCriticalVisible, frontCriticalVisible });
      }
      samples.push({ animationName, duration: animation.duration, clipped, maximumCriticalVisible, maximumFrontCriticalVisible, phaseBounds });
    }
    window.__bossPhaseAudit = {
      key,
      renderer: [bossSpineApp.renderer.width, bossSpineApp.renderer.height],
      safeBounds: safe ? { x: safe.x, y: safe.y, width: safe.width, height: safe.height } : null,
      frontSlots: activeBossHandSpine.skeleton.slots.filter((slot) => !activeBossHandHiddenSlots.includes(slot)).map((slot) => slot.data.name),
      samples
    };
    syncBossSpineToEncounter(bossSpineEncounterId);
  }

  async function showBossSpine(key, encounterId) {
    activeBossVisualKey = key;
    if (!window.PIXI?.spine?.Spine) {
      els.bossSpineStage.hidden = true;
      els.bossHandSpineStage.hidden = true;
      els.bossCharacter.hidden = !bossSkins.find((boss) => boss.key === key)?.fallback;
      return;
    }
    const signature = `${key}:${encounterId}`;
    if (bossSpineRetrySignature !== signature) {
      clearTimeout(bossSpineRetryTimer);
      bossSpineRetrySignature = signature;
      bossSpineRetryCount = 0;
      bossSpineFailedSignature = "";
    }
    if (activeBossSpineKey === signature && activeBossSpine && activeBossHandSpine) {
      els.bossSpineStage.hidden = false;
      els.bossHandSpineStage.hidden = false;
      els.bossCharacter.hidden = true;
      requestAnimationFrame(layoutBossSpine);
      return;
    }
    if (bossSpineFailedSignature === signature) return;
    if (bossSpineLoadingSignature === signature) return;
    const token = ++bossSpineLoadToken;
    activeBossSpineKey = signature;
    bossSpineLoadingSignature = signature;
    activeBossSpine = null;
    activeBossHandSpine = null;
    activeBossHandHiddenSlots = [];
    // 新骨架尚未完成時先清掉上一隻 BOSS；八隻都使用各自骨架擷取的首幀備援圖。
    els.bossSpineStage.hidden = true;
    els.bossHandSpineStage.hidden = true;
    els.bossCharacter.hidden = !bossSkins.find((boss) => boss.key === key)?.fallback;
    try {
      if (!bossSpineApp) {
        bossSpineApp = new PIXI.Application({ width: 390, height: 412, backgroundAlpha: 0, antialias: true, resolution: 1 });
        els.bossSpineStage.replaceChildren(bossSpineApp.view);
      }
      if (!bossHandSpineApp) {
        bossHandSpineApp = new PIXI.Application({ width: 390, height: 412, backgroundAlpha: 0, antialias: true, resolution: 1 });
        els.bossHandSpineStage.replaceChildren(bossHandSpineApp.view);
        bossHandSpineApp.ticker.add(applyBossFrontMask);
      }
      const [resource, frontResource] = await Promise.all([
        loadSpineResource(key),
        loadSpineResource(key, "spine-front")
      ]);
      if (token !== bossSpineLoadToken) return;
      bossSpineApp.stage.removeChildren();
      bossHandSpineApp.stage.removeChildren();
      activeBossSpine = new PIXI.spine.Spine(resource.spineData);
      activeBossSpine.skeleton.setSlotsToSetupPose();
      activeBossSpine.state.setAnimation(0, "14_idle_nocard", true);
      activeBossSpine.update(0);
      const bodySafeBounds = measureBossSafeBounds(activeBossSpine);
      activeBossHandSpine = new PIXI.spine.Spine(frontResource.spineData);
      activeBossHandSpine.skeleton.setSlotsToSetupPose();
      activeBossHandSpine.state.setAnimation(0, "14_idle_nocard", true);
      activeBossHandSpine.update(0);
      const frontSafeBounds = measureBossSafeBounds(activeBossHandSpine);
      activeBossSpine.__safeBossBounds = mergeBossSafeBounds(bodySafeBounds, frontSafeBounds) || bodySafeBounds;
      if (qaParams.get("qa") === "1") {
        window.__activeBossSpine = activeBossSpine;
        window.__activeBossHandSpine = activeBossHandSpine;
      }
      activeBossHandHiddenSlots = [];
      applyBossFrontMask();
      bossSpineApp.stage.addChild(activeBossSpine);
      bossHandSpineApp.stage.addChild(activeBossHandSpine);
      window.__extractBossPng = () => bossSpineApp.renderer.extract.canvas(activeBossSpine).toDataURL("image/png");
      els.bossSpineStage.hidden = false;
      els.bossHandSpineStage.hidden = false;
      els.bossCharacter.hidden = true;
      clearTimeout(bossSpineRetryTimer);
      bossSpineRetryCount = 0;
      bossSpineFailedSignature = "";
      layoutBossSpine();
      syncBossSpineToEncounter(encounterId);
      auditBossAnimationCoverage(key);
    } catch (error) {
      if (token !== bossSpineLoadToken) return;
      console.warn("Boss spine fallback", key, error);
      document.documentElement.dataset.bossSpineError = String(error?.message || error);
      activeBossSpine = null;
      activeBossHandSpine = null;
      activeBossHandHiddenSlots = [];
      els.bossSpineStage.hidden = true;
      els.bossHandSpineStage.hidden = true;
      els.bossCharacter.hidden = !bossSkins.find((boss) => boss.key === key)?.fallback;
      if (location.protocol.startsWith("http") && bossSpineRetryCount < 2) {
        bossSpineRetryCount += 1;
        clearTimeout(bossSpineRetryTimer);
        bossSpineRetryTimer = setTimeout(() => {
          if (bossSpineRetrySignature === signature && encounterId === bossSpineEncounterId) showBossSpine(key, encounterId);
        }, bossSpineRetryCount * 600);
      } else bossSpineFailedSignature = signature;
    } finally {
      if (token === bossSpineLoadToken && bossSpineLoadingSignature === signature) bossSpineLoadingSignature = "";
    }
  }

  function loadSuppressionPolicy() {
    try {
      return NaturalCore.normalizeSuppressionPolicy(JSON.parse(localStorage.getItem(NaturalCore.SUPPRESSION_STORAGE_KEY) || "null") || NaturalCore.DEFAULT_SUPPRESSION_POLICY);
    } catch (_error) {
      return NaturalCore.normalizeSuppressionPolicy(NaturalCore.DEFAULT_SUPPRESSION_POLICY);
    }
  }

  function loadStoryExperience(currentConfig) {
    if (qaParams.get("storyMode") !== "1" || !NaturalCore) return null;
    const seed = Number(qaParams.get("storySeed"));
    const star = Math.max(1, Math.min(8, Math.trunc(Number(qaParams.get("storyStar")) || 1)));
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    const config = NaturalCore.normalizeConfig({
      seed,
      drawFeesX: currentConfig.drawCostsX,
      suppression: loadSuppressionPolicy(),
      storyPool: {
        seed: 20260824,
        storiesPerClass: 10000,
        winMinReturnX: 3,
        pushMinReturnX: 1,
        smartMaxDraws: 9
      }
    });
    const story = NaturalCore.simulateNaturalStory(config, star, seed >>> 0, { includePath: true, behavior: "SMART" });
    return {
      config,
      story,
      source: "NATURAL",
      commit: {
        star, selectedClass: story.classKey, selectedStory: story,
        committedNetX: story.netX, committedSpendX: story.spendX, committedPayoutX: story.payoutX,
        weights: null, weightedRtpPct: null, rtpErrorPp: null
      }
    };
  }

  function runtimeNaturalConfig(currentConfig) {
    return NaturalCore.normalizeConfig({
      seed: currentConfig.seed,
      targetRtpPct: currentConfig.targetRtp * 100,
      drawFeesX: currentConfig.drawCostsX,
      carry: {
        rewardFloorPct: STORY_REWARD_FLOOR_PCT,
        rewardCeilingMultiple: STORY_REWARD_CEILING_MULTIPLE
      },
      suppression: loadSuppressionPolicy(),
      storyPool: {
        seed: 20260824, storiesPerClass: 10000,
        winMinReturnX: 3, pushMinReturnX: 1,
        ticketBasis: 1000000,
        smartMaxDraws: 9, maxCandidateAttempts: 10000
      }
    });
  }

  function runtimeStoryRng(star) {
    let playerSeed = runtimeConfig.seed >>> 0;
    for (let index = 0; index < String(playerState.id).length; index += 1) {
      playerSeed = Random.hash32(playerSeed, String(playerState.id).charCodeAt(index), index + 1);
    }
    const storyIndex = playerState.epoch * runtimeConfig.cycleSize + playerState.index;
    return Random.mulberry32(Random.hash32(playerSeed, storyIndex, 6200 + star));
  }

  function drawRuntimeStoryExperience(star) {
    if (!NaturalCore || !StoryPreset?.natural) throw new Error("正式故事池載入失敗");
    const config = runtimeNaturalConfig(runtimeConfig);
    const commit = NaturalCore.drawUniformPresetStoryCommit(
      StoryPreset, config, star, runtimeConfig.targetRtp * 100, runtimeStoryRng(star),
      { includePath: true, maxCandidateAttempts: config.maxCandidateAttempts }
    );
    return { config, story: commit.selectedStory, source: "NATURAL", commit };
  }

  function drawBossStar(avoidStar = 0) {
    const rows = runtimeNaturalConfig(runtimeConfig).bossRows.filter((row) => Number(row[5]) > 0 && Number(row[0]) !== Number(avoidStar));
    const rng = runtimeStoryRng(0);
    let cursor = rng() * rows.reduce((sum, row) => sum + Number(row[5]), 0);
    for (const row of rows) {
      cursor -= Number(row[5]);
      if (cursor < 0) return Number(row[0]);
    }
    return Number(rows.at(-1)?.[0] || 1);
  }

  function fitGameToViewport() {
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const rootStyle = getComputedStyle(document.documentElement);
    const safeArea = {
      top: parseFloat(rootStyle.getPropertyValue("--safe-area-top")) || 0,
      right: parseFloat(rootStyle.getPropertyValue("--safe-area-right")) || 0,
      bottom: parseFloat(rootStyle.getPropertyValue("--safe-area-bottom")) || 0,
      left: parseFloat(rootStyle.getPropertyValue("--safe-area-left")) || 0
    };
    const usableWidth = Math.max(1, viewportWidth - safeArea.left - safeArea.right);
    const usableHeight = Math.max(1, viewportHeight - safeArea.top - safeArea.bottom);
    const scale = Math.min(usableWidth / 390, usableHeight / 695, 1);
    const scaledWidth = 390 * scale;
    els.gameShell.style.position = "absolute";
    els.gameShell.style.left = `${viewportLeft + safeArea.left + (usableWidth - scaledWidth) / 2}px`;
    // 原站固定貼齊可視安全區頂端；較高裝置只在遊戲框下方留黑，不垂直置中。
    els.gameShell.style.top = `${viewportTop + safeArea.top}px`;
    els.gameShell.style.transformOrigin = "top left";
    els.gameShell.style.transform = `scale(${scale})`;
  }

  function loadPlayerState() {
    try {
      const stored = JSON.parse(localStorage.getItem(PLAYER_STATE_KEY) || "{}");
      const state = {
        id: stored.id || `player-${Math.random().toString(36).slice(2, 10)}`,
        epoch: Number.isInteger(stored.epoch) ? stored.epoch : 0,
        index: Number.isInteger(stored.index) ? stored.index : 0,
        spendX: Math.max(0, Number(stored.spendX) || 0),
        payoutX: Math.max(0, Number(stored.payoutX) || 0),
        targetCreditX: Math.max(0, Number(stored.targetCreditX) || 0),
        referenceBet: Math.max(0, Number(stored.referenceBet) || 0),
        betLedgers: {},
        storyBucketBalances: Array.from({ length: 3 }, (_, index) => {
          const value = Number(stored.storyBucketBalances?.[index]);
          return Number.isFinite(value) ? value : 0;
        }),
        storyPoolTotals: {
          targetAccrualCredits: Number(stored.storyPoolTotals?.targetAccrualCredits) || 0,
          organicPayoutCredits: Number(stored.storyPoolTotals?.organicPayoutCredits) || 0,
          organicActualNetCredits: Number(stored.storyPoolTotals?.organicActualNetCredits) || 0,
          correctionCredits: Number(stored.storyPoolTotals?.correctionCredits) || 0,
          corrections: Math.max(0, Math.trunc(Number(stored.storyPoolTotals?.corrections) || 0)),
          settledBosses: Math.max(0, Math.trunc(Number(stored.storyPoolTotals?.settledBosses) || 0))
        }
      };
      for (const [key, ledger] of Object.entries(stored.betLedgers || {})) {
        state.betLedgers[key] = {
          spendX: Math.max(0, Number(ledger?.spendX) || 0),
          payoutX: Math.max(0, Number(ledger?.payoutX) || 0),
          targetCreditX: Math.max(0, Number(ledger?.targetCreditX) || 0)
        };
      }
      if (!Object.keys(state.betLedgers).length && (state.spendX || state.payoutX || state.targetCreditX)) {
        state.betLedgers[String(runtimeConfig.bet)] = {
          spendX: state.spendX,
          payoutX: state.payoutX,
          targetCreditX: state.targetCreditX
        };
      }
      if (!state.referenceBet && state.spendX) state.referenceBet = runtimeConfig.bet;
      return state;
    } catch (_error) {
      return {
        id: `player-${Math.random().toString(36).slice(2, 10)}`, epoch: 0, index: 0,
        spendX: 0, payoutX: 0, targetCreditX: 0, referenceBet: 0, betLedgers: {},
        storyBucketBalances: [0, 0, 0],
        storyPoolTotals: { targetAccrualCredits: 0, organicPayoutCredits: 0, organicActualNetCredits: 0, correctionCredits: 0, corrections: 0, settledBosses: 0 }
      };
    }
  }

  function savePlayerState() {
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(playerState));
  }

  function activeBetLedger() {
    const key = String(activeBet);
    if (!playerState.betLedgers[key]) playerState.betLedgers[key] = { spendX: 0, payoutX: 0, targetCreditX: 0 };
    return playerState.betLedgers[key];
  }

  function beginStoryPoolCommit() {
    if (!encounter?.packet?.storyCommit || !NaturalCore) return null;
    if (encounter.poolCommitApplied) return encounter.poolCommit;
    const started = {
      bucketIndex: NaturalCore.bucketIndexForBet(activeBet),
      incomingPoolCredits: Number(playerState.storyBucketBalances?.[NaturalCore.bucketIndexForBet(activeBet)]) || 0,
      targetRtpPct: encounter.poolTargetRtpPct
    };
    encounter.poolCommitApplied = true;
    encounter.poolCommit = started;
    savePlayerState();
    return started;
  }

  function settleStoryPool(organicPayoutCredits, killed) {
    if (!encounter?.packet?.storyCommit || encounter.poolSettlement || !NaturalCore) return encounter?.poolSettlement || null;
    const started = beginStoryPoolCommit();
    if (!started) return null;
    const organicPayout = Math.max(0, Number(organicPayoutCredits) || 0);
    const actualSpend = Math.max(0, Number(encounter.storySpendCredits) || 0);
    const originalDice = {
      normalDice: encounter.packet.dice.normalDice,
      multiplierDice: encounter.packet.dice.multiplierDice,
      normalFaces: encounter.packet.dice.normalFaces.slice(),
      multiplierFaces: encounter.packet.dice.multiplierFaces.slice(),
      normalSum: encounter.packet.dice.normalSum,
      multiplierSum: encounter.packet.dice.multiplierSum,
      total: encounter.packet.dice.total
    };
    const result = NaturalCore.settleStartedStory(
      encounter.packet.storyCommit,
      started,
      playerState.storyBucketBalances,
      activeBet,
      {
        actualSpendCredits: actualSpend,
        targetRtpPct: encounter.poolTargetRtpPct,
        targetAccrualCredits: encounter.storyTargetAccrualCredits,
        organicPayoutCredits: organicPayout,
        actualKilled: killed,
        actualBossRewardX: originalDice.total,
        actualDice: originalDice,
        rewardFloorPct: STORY_REWARD_FLOOR_PCT,
        rewardCeilingMultiple: STORY_REWARD_CEILING_MULTIPLE,
        rng: runtimeStoryRng(encounter.packet.star)
      }
    );
    playerState.storyBucketBalances = result.balances;
    playerState.storyPoolTotals.targetAccrualCredits += result.targetAccrualCredits;
    playerState.storyPoolTotals.organicPayoutCredits += result.organicPayoutCredits;
    playerState.storyPoolTotals.organicActualNetCredits += result.organicActualNetCredits;
    playerState.storyPoolTotals.correctionCredits += result.correction.deltaCredits;
    playerState.storyPoolTotals.corrections += result.correction.applied ? 1 : 0;
    playerState.storyPoolTotals.settledBosses += 1;
    encounter.poolSettlement = result;
    if (result.correction.applied) {
      encounter.packet.dice = {
        normalDice: result.correction.dice.normalDice,
        multiplierDice: result.correction.dice.multiplierDice,
        normalFaces: result.correction.dice.normalFaces.slice(),
        multiplierFaces: result.correction.dice.multiplierFaces.slice(),
        normalSum: result.correction.dice.normalSum,
        multiplierSum: result.correction.dice.multiplierSum,
        total: result.correction.dice.total
      };
    }
    savePlayerState();
    return result;
  }

  function spawnBoss(avoidStar = 0) {
    const forcedBossKey = new URLSearchParams(location.search).get("boss");
    const forcedBossIndex = bossSkins.findIndex((boss) => boss.key === forcedBossKey);
    const star = forcedBossIndex >= 0 ? forcedBossIndex + 1 : drawBossStar(avoidStar);
    const activeStoryExperience = storyExperience || drawRuntimeStoryExperience(star);
    const story = activeStoryExperience.story;
    const packet = {
      star: story.star,
      hp: story.hp,
      roundLimit: story.roundLimit,
      dice: {
        normalDice: story.originalDice.normalDice,
        multiplierDice: story.originalDice.multiplierDice,
        normalFaces: story.originalDice.normalFaces.slice(),
        multiplierFaces: story.originalDice.multiplierFaces.slice(),
        normalSum: story.originalDice.normalSum,
        multiplierSum: story.originalDice.multiplierSum,
        total: story.originalDice.total
      },
      stateIndex: story.diceStateIndex,
      packetSeed: story.seed,
      naturalStorySeed: story.seed,
      storyRecord: story,
      storySource: activeStoryExperience.source,
      storyRuntimeMode: storyExperience ? "FIXED" : "DYNAMIC",
      lockedTargetRtpPct: runtimeConfig.targetRtp * 100,
      storyConfig: activeStoryExperience.config,
      storyCommit: activeStoryExperience.commit,
      ledgerDecision: storyExperience ? "指定故事體驗" : `三分類全池各抽一個，再配籤至 ${platformTargetRtpPct}%`,
      ledgerProjectedX: 0
    };
    encounter = {
      packet,
      hpLeft: packet.hp,
      round: 0,
      draws: 0,
      paidDraws: 0,
      tieRedeals: 0,
      totalBetX: 0,
      storySpendCredits: 0,
      storyTargetAccrualCredits: 0,
      poolTargetRtpPct: runtimeConfig.targetRtp * 100,
      coinBonusX: 0,
      revealedCoinBonusX: 0,
      revealedMagicIndexes: new Set(),
      phase: "ready",
      presentation: null,
      bossRevealed: false,
      redrawIndexes: null,
      handEntering: false,
      payoutSettled: false,
      poolCommitApplied: false,
      poolCommit: null,
      poolSettlement: null,
      playerCardOrder: [],
      bossCardOrder: [],
      expandedEffect: "",
      compareOutcome: "",
      cardsCleared: false,
      entryStarsAnimating: false,
      entryStarsRevealed: false,
      entryCompositionShown: false,
      treasureMaximumRevealed: false
    };
    encounter.replayContract = NaturalCore.replayContract(story, activeStoryExperience.config);
    encounter.bossInstanceId = `${playerState.id}:${playerState.epoch}:${playerState.index}:${packet.packetSeed >>> 0}`;
    encounter.replayContract = {
      ...encounter.replayContract,
      bossInstanceId: encounter.bossInstanceId,
      storyBetContract: storyCreditsForBet(story, activeBet)
    };
    encounter.operationSequence = 0;
    encounter.clientEventSequence = 0;
    encounter.actionLog = [];
    encounter.clientEvents = [];
    encounter.suppressionActive = false;
    encounter.pendingFightOperation = null;
    encounter.auditArchived = false;
    bossSpineEncounterId += 1;
    els.rewardPanel.hidden = true;
    clearRewardDiceSpines();
    combatSequenceToken += 1;
    clearCombatRollTimers();
    els.combatFx.hidden = true;
    clearAttackSpine();
    els.compareFx.hidden = true;
    els.magicPreview.hidden = true;
    els.bossSpeech.hidden = true;
    els.roundWarningFx.hidden = true;
    clearTimeout(bossSpeechTimer);
    clearTimeout(roundWarningTimer);
    hideResultBoard();
    stopCountdown();
    els.bossDefeatFx.hidden = true;
    els.quickMenu.hidden = true;
    prizeRevealState = null;
    setMessage("", "");
    render();
    bossSpeechTimer = setTimeout(() => showBossSpeech("WELCOME TO THE DUEL!", "", isTurbo() ? 720 : 1800), isTurbo() ? 100 : 260);
  }

  function spend(amountX, options = {}) {
    const amount = amountX * activeBet;
    if (session.credits < amount) {
      setMessage("CREDITS 不足，請從選單重置體驗。", "lose");
      return false;
    }
    session.credits -= amount;
    session.spend += amount;
    if (!playerState.referenceBet) playerState.referenceBet = activeBet;
    playerState.spendX += amount;
    playerState.targetCreditX = NaturalCore.roundMoney(playerState.targetCreditX + amount * runtimeConfig.targetRtp);
    const storySpend = options.storySpend !== false;
    if (encounter?.packet?.storyCommit && storySpend) {
      beginStoryPoolCommit();
      encounter.storySpendCredits += amount;
      const targetAccrualCredits = NaturalCore.roundMoney(amount * encounter.poolTargetRtpPct / 100);
      const posted = NaturalCore.addPoolCredits(playerState.storyBucketBalances, activeBet, targetAccrualCredits);
      playerState.storyBucketBalances = posted.balances;
      encounter.storyTargetAccrualCredits = NaturalCore.roundMoney(encounter.storyTargetAccrualCredits + targetAccrualCredits);
    } else if (NaturalCore && options.poolAccrual !== false) {
      const targetRtpPct = Number(options.targetRtpPct ?? runtimeConfig.targetRtp * 100);
      const posted = NaturalCore.addPoolCredits(playerState.storyBucketBalances, activeBet, amount * targetRtpPct / 100);
      playerState.storyBucketBalances = posted.balances;
      playerState.storyPoolTotals.targetAccrualCredits = NaturalCore.roundMoney(playerState.storyPoolTotals.targetAccrualCredits + amount * targetRtpPct / 100);
    }
    const ledger = activeBetLedger();
    ledger.spendX += amount;
    ledger.targetCreditX = NaturalCore.roundMoney(ledger.targetCreditX + amount * runtimeConfig.targetRtp);
    savePlayerState();
    return true;
  }

  function dealRound() {
    if (!encounter || encounter.phase !== "ready") return;
    if (!spend(runtimeConfig.entryCostX)) return;
    const startOperation = beginOperation("START");
    session.hasStarted = true;
    encounter.round += 1;
    encounter.draws = 0;
    encounter.paidDraws = 0;
    encounter.tieRedeals = 0;
    // TOTAL BET 是本次 BOSS encounter 的累積投入；只有換到下一隻 BOSS 才由 spawnBoss 歸零。
    encounter.totalBetX += runtimeConfig.entryCostX;
    encounter.bossRevealed = false;
    createCurrentRound();
    completeOperation(startOperation, { costX: runtimeConfig.entryCostX, bet: activeBet });
    beginEntryStarReveal();
  }

  function beginEntryStarReveal() {
    if (!encounter) return;
    const dice = encounter.packet.dice;
    const guaranteedPremiumDice = guaranteedPremiumDiceForStar(encounter.packet.star);
    const extraPremiumDice = Math.max(0, dice.multiplierDice - guaranteedPremiumDice);
    const firstReveal = !encounter.entryCompositionShown;
    encounter.phase = "entry-promise";
    encounter.compareOutcome = "";
    encounter.entryStarsAnimating = firstReveal;
    encounter.entryStarsRevealed = !firstReveal;
    encounter.entryCompositionShown = true;
    playBossSequence("15_begin", "14_idle_nocard");
    playSfx("deal");
    render();
    const entryEncounter = encounter;
    const presentation = firstReveal
      ? entryStarPresentationTiming(extraPremiumDice)
      : { maximumRevealAt: 1, duration: 1 };
    playTreasureSequence("level1");
    clearTimeout(entryMaximumTimer);
    entryMaximumTimer = setTimeout(() => {
      if (!encounter || encounter !== entryEncounter || encounter.phase !== "entry-promise") return;
      encounter.treasureMaximumRevealed = true;
      render();
    }, Math.max(1, presentation.maximumRevealAt));
    clearTimeout(entryStarsTimer);
    entryStarsTimer = setTimeout(() => {
      if (!encounter || encounter !== entryEncounter || encounter.phase !== "entry-promise") return;
      encounter.entryStarsAnimating = false;
      encounter.entryStarsRevealed = true;
      render();
      beginRoundReveal();
    }, Math.max(1, presentation.duration));
  }

  function magicRevealCopy(card) {
    const display = Rules.magicDisplay(card);
    const icon = card.key === "joker" ? "JOKER"
      : card.key === "freeDraw" ? "↻"
        : card.key === "coin" ? "◆"
          : card.key === "crit" ? "✊"
            : card.key === "flatDamage" ? "+DMG"
              : "♠ ♥ ♣ ♦";
    return { display, icon, description: Rules.magicDescription(card) };
  }

  function magicBindingCopy(card) {
    const bindsToCard = ["joker", "crit", "flatDamage"].includes(card.key);
    const targetCard = bindsToCard ? encounter?.presentation?.playerCards?.[card.effectSlot] : null;
    const displaySlot = targetCard ? encounter.playerCardOrder.indexOf(card.effectSlot) + 1 : 0;
    const targetLabel = targetCard
      ? targetCard.joker ? "JOKER" : `${Rules.cardLabel(targetCard)}${Rules.SUIT_GLYPHS[targetCard.suit] || ""}`
      : "";
    return targetCard ? `<span class="magic-bind-copy">BINDS → ${targetLabel}｜手牌 ${displaySlot}</span>` : "";
  }

  function openMagicPreview(index) {
    const card = encounter?.presentation?.magicCards?.[index];
    if (!card) return;
    const copy = magicRevealCopy(card);
    const artVariables = magicArtVariables(card.key);
    els.magicPreviewCard.className = `magic-reveal-card magic-preview-card reveal-${card.key}${artVariables ? " has-card-art" : ""}`;
    els.magicPreviewCard.style.cssText = artVariables;
    els.magicPreviewStep.textContent = `MAGIC ${index + 1} / ${encounter.presentation.magicCards.length}`;
    els.magicPreviewIcon.textContent = copy.icon;
    els.magicPreviewValue.textContent = copy.display.type;
    els.magicPreviewHand.textContent = copy.display.label;
    const copyArt = MAGIC_COPY_PATHS[card.key];
    els.magicPreviewDetail.innerHTML = copyArt
      ? `<img class="magic-detail-art" src="${copyArt}" alt="${copy.description}">${magicBindingCopy(card)}`
      : `<strong>${copy.display.label}</strong><br>${copy.description}${magicBindingCopy(card)}`;
    els.magicPreview.hidden = false;
  }

  function closeMagicPreview() {
    els.magicPreview.hidden = true;
  }

  function finishMagicReveal() {
    if (!encounter || encounter.phase !== "magic-reveal") return;
    els.magicReveal.hidden = true;
    els.magicReveal.removeAttribute("data-stage");
    els.magicDrawFan.hidden = true;
    encounter.revealedCoinBonusX = encounter.coinBonusX;
    encounter.phase = "hand";
    encounter.handEntering = true;
    setMessage(recommendationText(), "");
    render();
    clearTimeout(handEnterTimer);
    const enteringEncounter = encounter;
    handEnterTimer = setTimeout(() => {
      if (!encounter || encounter !== enteringEncounter) return;
      encounter.handEntering = false;
      render();
      startCountdown(enteringEncounter);
    }, isTurbo() ? 260 : 760);
  }

  function revealMagicThenHand() {
    if (!encounter || encounter.phase !== "magic-reveal" || !encounter.presentation) return;
    const cards = encounter.presentation.magicCards;
    const card = cards[magicRevealIndex];
    if (!card) {
      finishMagicReveal();
      return;
    }
    if (!encounter.revealedMagicIndexes.has(magicRevealIndex)) {
      encounter.revealedMagicIndexes.add(magicRevealIndex);
      if (card.key === "coin") encounter.revealedCoinBonusX += Math.max(0, Number(card.value) || 0);
    }
    const copy = magicRevealCopy(card);
    els.magicReveal.dataset.stage = "reveal";
    els.magicDrawFan.hidden = true;
    els.magicRevealCard.style.animation = "none";
    void els.magicRevealCard.offsetWidth;
    els.magicRevealCard.style.animation = "";
    const artVariables = magicArtVariables(card.key);
    els.magicRevealCard.className = `magic-reveal-card reveal-${card.key}${artVariables ? " has-card-art" : ""}`;
    els.magicRevealCard.style.cssText = artVariables;
    els.magicRevealStep.textContent = `MAGIC ${magicRevealIndex + 1} / ${cards.length}`;
    els.magicRevealIcon.textContent = copy.icon;
    els.magicRevealValue.textContent = copy.display.type;
    els.magicRevealHand.textContent = copy.display.label;
    const bindingCopy = magicBindingCopy(card);
    const copyArt = MAGIC_COPY_PATHS[card.key];
    els.magicRevealDetail.innerHTML = copyArt
      ? `<img class="magic-detail-art" src="${copyArt}" alt="${copy.description}">${bindingCopy}`
      : `<strong>${copy.display.label}</strong><br>${copy.description}${bindingCopy}`;
    els.magicReveal.className = `magic-reveal${isTurbo() ? " turbo" : ""}`;
    els.magicReveal.hidden = false;
    render();
    clearTimeout(magicTimer);
    magicTimer = setTimeout(() => {
      if (!encounter || encounter.phase !== "magic-reveal") return;
      magicRevealIndex += 1;
      if (magicRevealIndex < cards.length) revealMagicThenHand();
      else finishMagicReveal();
    }, isTurbo() ? 360 : 1000);
  }

  function showMagicDrawFan(cards) {
    if (!cards.length) {
      finishMagicReveal();
      return;
    }
    const backCount = cards.length;
    const spacing = backCount <= 3 ? 72 : Math.min(52, 260 / Math.max(1, backCount - 1));
    els.magicDrawFan.dataset.label = `DRAW ${cards.length} MAGIC CARD${cards.length > 1 ? "S" : ""}`;
    els.magicDrawFan.innerHTML = Array.from({ length: backCount }, (_value, index) => {
      const offset = index - (backCount - 1) / 2;
      const x = Math.round(offset * spacing);
      const y = Math.round(Math.abs(offset) * 5);
      const rotation = Math.round(offset * 5);
      return `<span style="--fan-x:${x}px;--fan-y:${y}px;--fan-r:${rotation}deg;--fan-delay:${(index * .035).toFixed(3)}s;--fan-delay-fast:${(index * .016).toFixed(3)}s" aria-hidden="true"></span>`;
    }).join("");
    els.magicReveal.className = `magic-reveal${isTurbo() ? " turbo" : ""}`;
    els.magicReveal.dataset.stage = "draw";
    els.magicDrawFan.hidden = false;
    els.magicReveal.hidden = false;
    render();
    clearTimeout(magicTimer);
    magicTimer = setTimeout(revealMagicThenHand, isTurbo() ? 360 : 1050);
  }

  function beginRoundReveal() {
    stopCountdown();
    hideBossSpeech();
    clearTimeout(roundWarningTimer);
    els.roundWarningFx.hidden = true;
    hideResultBoard();
    encounter.phase = "magic-reveal";
    playBossSequence("12_take", "11_idle");
    els.magicReveal.hidden = true;
    magicRevealIndex = 0;
    setMessage("", "");
    render();
    showRoundStartFx();
    clearTimeout(magicTimer);
    magicTimer = setTimeout(() => showMagicDrawFan(encounter?.presentation?.magicCards || []), isTurbo() ? 260 : 940);
  }

  function drawCards() {
    if (!encounter || encounter.phase !== "hand" || encounter.handEntering) return;
    if (countdownRemaining > 0 && countdownRemaining <= 1) {
      setMessage("倒數即將結束，已停止換牌。", "lose");
      return;
    }
    const discarded = new Set(encounter.presentation.discardIndexes);
    if (!discarded.size) {
      setMessage("請先點選要更換的牌。", "lose");
      return;
    }
    if (encounter.presentation.playerDeck.length - discarded.size < 10) {
      setMessage("剩餘牌堆不足，不能再換牌。", "lose");
      return;
    }
    const hasFreeDraw = encounter.presentation.magicCards.some((card) => card.key === "freeDraw") && !encounter.presentation.freeUsed;
    const costX = hasFreeDraw ? 0 : drawCostX(encounter.paidDraws);
    if (!spend(costX)) return;
    const redrawOperation = beginOperation("REDRAW");
    if (hasFreeDraw) encounter.presentation.freeUsed = true;
    else encounter.paidDraws += 1;
    encounter.draws += 1;
    encounter.totalBetX += costX;
    encounter.expandedEffect = "";
    encounter.redrawIndexes = discarded;
    encounter.phase = "redraw-out";
    playSfx("deal");
    setMessage(hasFreeDraw ? "FREE REDRAW 啟用" : `REDRAW ${discarded.size} 張`, "");
    render();
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => {
      if (!encounter || encounter.phase !== "redraw-out") return;
      let redrawAudit = null;
      if (Number.isInteger(encounter.packet.naturalStorySeed)) {
        redrawAudit = NaturalCore.executeRuntimeRedraw(encounter.presentation, {
          story: encounter.packet.storyRecord,
          round: encounter.round,
          tieIndex: encounter.tieRedeals || 0,
          drawNumber: encounter.draws,
          actionSequence: redrawOperation.sequence,
          discardedIndexes: discarded,
          suppressionActive: encounter.suppressionActive,
          suppressionPolicy: encounter.packet.storyConfig?.suppressionPolicy
        });
        encounter.suppressionActive = redrawAudit.suppressionActive;
      } else Rules.redraw(encounter.presentation, discarded);
      completeOperation(redrawOperation, {
        costX,
        free: hasFreeDraw,
        plannedKeepIds: redrawAudit?.plannedKeepIds || [],
        actualKeepIds: redrawAudit?.actualKeepIds || NaturalCore.sortedCardIds(encounter.presentation.playerCards.filter((_card, index) => !discarded.has(index))),
        keepMatched: redrawAudit ? !redrawAudit.deviated : null,
        suppression: redrawAudit
      });
      // 每次換牌完成都重新依實際保留牌與 Joker 邏輯點數排序，保留牌固定靠左。
      encounter.playerCardOrder = buildCardOrder(encounter.presentation.playerCards, encounter.presentation.playerEval, encounter.presentation.discardIndexes);
      encounter.phase = "redraw-in";
      setMessage(recommendationText(), "");
      render();
      redrawTimer = setTimeout(() => {
        if (!encounter || encounter.phase !== "redraw-in") return;
        encounter.phase = "hand";
        encounter.redrawIndexes = null;
        render();
        if (countdownExpired) automaticFightOrFold();
      }, isTurbo() ? 150 : 430);
    }, isTurbo() ? 120 : 280);
  }

  function finishRound(message, tone) {
    // 結果頁保留雙方比較證據，也保留本隻 BOSS 從首次 START 起的全部投入。
    stopCountdown();
    if (encounter) encounter.compareOutcome = "";
    if (encounter.round >= encounter.packet.roundLimit) {
      settleStoryPool(0, false);
      encounter.phase = "resolved-loss";
      setMessage("ROUND 用盡，BOSS 防守成功。換下一隻再戰。", "lose");
      return;
    }
    encounter.phase = "round-result";
    if (!encounter.cardsCleared) playBossSequence("11_idle", "11_idle");
    setMessage(message, tone);
    if (encounter.round === encounter.packet.roundLimit - 1) showLastRoundWarning();
  }

  function hideBossSpeech() {
    clearTimeout(bossSpeechTimer);
    els.bossSpeech.hidden = true;
  }

  function showBossSpeech(text, tone = "", duration = isTurbo() ? 720 : 1700) {
    clearTimeout(bossSpeechTimer);
    els.bossSpeechText.textContent = text;
    els.bossSpeech.className = `boss-speech${tone ? ` ${tone}` : ""}`;
    els.bossSpeech.hidden = false;
    bossSpeechTimer = setTimeout(() => { els.bossSpeech.hidden = true; }, duration);
  }

  function beginBossVictoryDialogue(comparedEncounter, message) {
    if (!encounter || encounter !== comparedEncounter || encounter.phase !== "compare-result") return;
    els.compareFx.hidden = true;
    hideResultBoard();
    encounter.compareOutcome = "";
    encounter.cardsCleared = true;
    // 台詞只留在 BOSS 舞台，不遮牌桌、不延後 CONTINUE。
    showBossSpeech("I WIN THIS TIME!");
    finishRound(message || "BOSS WIN", "lose");
    render();
  }

  function fold() {
    if (!encounter || encounter.phase !== "hand" || encounter.handEntering) return;
    stopCountdown();
    encounter.expandedEffect = "";
    const foldOperation = beginOperation("FOLD");
    completeOperation(foldOperation, { suppressionActive: encounter.suppressionActive });
    encounter.phase = "compare-result";
    encounter.compareOutcome = "boss";
    playBossSequence("21_win_begin", "22_win_loop");
    showResultBoard("boss", "FOLD", "BOSS WIN");
    addHistory("FOLD", "BOSS WIN", "lose");
    render();
    const foldedEncounter = encounter;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!encounter || encounter !== foldedEncounter || encounter.phase !== "compare-result") return;
      beginBossVictoryDialogue(foldedEncounter, "BOSS WIN");
    }, isTurbo() ? 180 : 520);
  }

  function fight() {
    if (!encounter || encounter.phase !== "hand" || encounter.handEntering) return;
    stopCountdown();
    encounter.expandedEffect = "";
    const state = encounter.presentation;
    const fightOperation = beginOperation("FIGHT");
    encounter.pendingFightOperation = completeOperation(fightOperation, { suppressionActive: encounter.suppressionActive });

    // 比牌以最終最佳五張為準；先演 FIGHT 字卡，再在牌桌完成理牌與 BOSS 攤牌。
    encounter.playerCardOrder = buildCardOrder(state.playerCards, state.playerEval);
    encounter.bossCardOrder = buildCardOrder(state.bossCards, state.bossEval);
    encounter.phase = "fight-intro";
    encounter.compareOutcome = "";
    render();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => beginFightReveal(state), showRoundActionFx("FIGHT"));
  }

  function beginFightReveal(state) {
    if (!encounter || encounter.phase !== "fight-intro" || encounter.presentation !== state) return;
    encounter.bossRevealed = true;
    encounter.phase = "compare-reveal";
    encounter.compareOutcome = "";
    els.comparePlayerHand.textContent = handPresentationLabel(state.playerHand);
    els.compareBossHand.textContent = handPresentationLabel(state.bossHand);
    applyCompareHandArt(els.comparePlayerHand, state.playerEval);
    applyCompareHandArt(els.compareBossHand, state.bossEval);
    renderCompareCards(state);
    els.compareVerdict.textContent = "VS";
    els.compareFx.className = `compare-fx${isTurbo() ? " turbo" : ""}`;
    els.compareFx.hidden = false;
    playBossSequence("13_showdown", "11_idle");
    playSfx("compare");
    render();
    clearTimeout(settleTimer);
    // 對手牌完整攤開後，普通模式保留整整 1 秒供玩家確認，再讓雙方牌堆對撞。
    // Turbo 仍保留短暫辨識時間，但只壓縮可省略的停留與破碎表演。
    settleTimer = setTimeout(() => settleFight(state), isTurbo() ? 520 : 1480);
  }

  function automaticFightOrFold() {
    if (!encounter?.presentation) return;
    if (encounter.presentation.playerRank === 0) fold();
    else fight();
  }

  function settleFight(state) {
    if (!encounter || encounter.phase !== "compare-reveal" || encounter.presentation !== state) return;
    const result = Rules.compare(state);
    if (result.tie) {
      playBossSequence("41_draw_begin", "42_draw_loop");
      encounter.phase = "tie-result";
      encounter.compareOutcome = "draw";
      els.compareVerdict.textContent = "DRAW";
      els.compareFx.className = `compare-fx result-draw${isTurbo() ? " turbo" : ""}`;
      showResultBoard("draw", "DRAW", handPresentationLabel(state.playerHand));
      addHistory("DRAW", handPresentationLabel(state.playerHand));
      setMessage("DRAW", "");
      render();
      const tieEncounter = encounter;
      settleTimer = setTimeout(() => {
        if (!encounter || encounter !== tieEncounter || encounter.phase !== "tie-result") return;
        els.compareFx.hidden = true;
        hideResultBoard();
        encounter.tieRedeals += 1;
        createCurrentRound(true);
        encounter.draws = 0;
        encounter.paidDraws = 0;
        encounter.bossRevealed = false;
        beginRoundReveal();
      }, isTurbo() ? 620 : 1850);
      return;
    }
    if (result.playerWins) {
      const magicAudit = Number.isInteger(encounter.packet.naturalStorySeed)
        ? NaturalCore.resolveRuntimeMagic(state, {
          story: encounter.packet.storyRecord,
          actionSequence: encounter.pendingFightOperation?.sequence || encounter.operationSequence,
          suppressionActive: encounter.suppressionActive,
          suppressionPolicy: encounter.packet.storyConfig?.suppressionPolicy
        })
        : { breakdown: Rules.damageBreakdown(state.playerEval, state.magicCards), values: [], suppressionActive: false };
      result.damage = magicAudit.breakdown.total;
      if (encounter.pendingFightOperation) {
        encounter.pendingFightOperation.magicSuppression = magicAudit;
        syncReplayAuditDom();
      }
      encounter.phase = "compare-result";
      encounter.compareOutcome = "player";
      // 不顯示 PLAYER WIN 字卡；撞擊後直接讓 BOSS 牌堆破碎並接傷害。
      els.compareVerdict.textContent = "";
      els.compareFx.className = `compare-fx result-player${isTurbo() ? " turbo" : ""}`;
      addHistory("PLAYER WIN", `${handPresentationLabel(state.playerHand)} · ${result.damage} DMG`, "win");
      setMessage("", "win");
      render();
      const comparedEncounter = encounter;
      settleTimer = setTimeout(() => {
        if (!encounter || encounter !== comparedEncounter || encounter.phase !== "compare-result") return;
        els.compareFx.hidden = true;
        hideResultBoard();
        showCombatResolution(state, result, magicAudit.breakdown);
      }, isTurbo() ? 320 : 540);
      return;
    }
    encounter.phase = "compare-result";
    encounter.compareOutcome = "boss";
    els.compareVerdict.textContent = "";
    els.compareFx.className = `compare-fx result-boss${isTurbo() ? " turbo" : ""}`;
    addHistory("BOSS WIN", handPresentationLabel(state.bossHand), "lose");
    setMessage("", "lose");
    playBossSequence("21_win_begin", "22_win_loop");
    render();
    const comparedEncounter = encounter;
    settleTimer = setTimeout(() => {
      if (!encounter || encounter !== comparedEncounter || encounter.phase !== "compare-result") return;
      beginBossVictoryDialogue(comparedEncounter, "BOSS WIN");
    }, isTurbo() ? 320 : 540);
  }

  function combatEquation(breakdown) {
    const multiplier = breakdown.multiplier !== 1 ? ` × ${breakdown.multiplier}` : "";
    const flat = breakdown.flat ? ` + ${breakdown.flat}` : "";
    return `${breakdown.base}${multiplier}${flat} = ${breakdown.total} DMG`;
  }

  function combatEffectFinalValue(effect) {
    if (effect.key === "flatDamage") return `+${effect.value}`;
    if (effect.key === "joker") return "JOKER";
    return `X${effect.value}`;
  }

  function combatVisualRollValue(effect, index, tick) {
    const sequence = effect.key === "flatDamage" ? [3, 6, 4, 5]
      : effect.key === "crit" ? [1, 5, 2, 4, 3]
        : [1, 3, 2];
    const value = sequence[(tick + index * 2) % sequence.length];
    return effect.key === "flatDamage" ? `+${value}` : `X${value}`;
  }

  function setCombatRollValue(output, value, final = false) {
    if (!output) return;
    output.classList.toggle("settled", final);
    output.classList.toggle("rolling", !final);
    output.innerHTML = `<span class="sr-only">${final ? "本次鎖定值" : "視覺滾動值"} ${value}</span>${value === "JOKER" ? "<b>JOKER</b>" : damageGlyphMarkup(value)}`;
  }

  function combatPreviewDamage(base, effects) {
    let multiplierParts = 0;
    let flat = 0;
    for (const effect of effects) {
      const value = Math.max(0, Number(effect?.value) || 0);
      if (effect?.key === "flatDamage") flat += value;
      else if (effect?.key !== "joker") multiplierParts += value;
    }
    return Math.max(0, Math.round(base * (multiplierParts || 1) + flat));
  }

  function combatEffectAtDisplayValue(effect, displayValue) {
    const value = Number(String(displayValue).match(/\d+/)?.[0] || effect?.value || 0);
    return { ...effect, value };
  }

  function setCombatLiveDamage(value, base = false) {
    const damage = Math.max(0, Math.round(Number(value) || 0));
    els.combatLiveDamage.dataset.damage = String(damage);
    els.combatLiveDamage.classList.toggle("base-damage", base);
    els.combatLiveDamage.innerHTML = `<span>${base ? "HAND DAMAGE" : "LIVE DAMAGE"}</span><strong><span class="sr-only">${damage} DMG</span>${damageGlyphMarkup(damage)}</strong><b>DMG</b>`;
  }

  async function runCombatRandomNumbers(effects, breakdown, token) {
    clearCombatRollTimers();
    const settledEffects = [];
    setCombatLiveDamage(breakdown.base, true);
    for (let index = 0; index < effects.length; index += 1) {
      const effect = effects[index];
      const chips = [...els.combatFxCards.querySelectorAll(".combat-magic-chip")];
      chips.forEach((chip, chipIndex) => {
        chip.classList.toggle("roll-active", chipIndex === index);
        chip.classList.toggle("roll-settled", chipIndex < index);
        chip.classList.toggle("roll-waiting", chipIndex > index);
      });
      await new Promise((resolve) => {
      const output = els.combatFxCards.querySelector(`[data-combat-roll="${index}"]`);
      const finalValue = combatEffectFinalValue(effect);
      const settleAfter = (isTurbo() ? 280 : 720) + index * (isTurbo() ? 150 : 320);
      if (effect.key === "joker") {
        const timer = setTimeout(() => {
          if (token === combatSequenceToken) {
            setCombatRollValue(output, finalValue, true);
            setCombatLiveDamage(combatPreviewDamage(breakdown.base, [...settledEffects, effect]));
          }
          resolve();
        }, Math.max(120, settleAfter - 180));
        combatRollTimers.push(timer);
        return;
      }
      const startedAt = performance.now();
      let tick = 0;
      const spin = () => {
        if (token !== combatSequenceToken) {
          resolve();
          return;
        }
        const elapsed = performance.now() - startedAt;
        if (elapsed >= settleAfter) {
          setCombatRollValue(output, finalValue, true);
          setCombatLiveDamage(combatPreviewDamage(breakdown.base, [...settledEffects, effect]));
          playSfx("compare");
          resolve();
          return;
        }
        const rollingValue = combatVisualRollValue(effect, index, tick);
        setCombatRollValue(output, rollingValue, false);
        setCombatLiveDamage(combatPreviewDamage(breakdown.base, [...settledEffects, combatEffectAtDisplayValue(effect, rollingValue)]), rollingValue === "X1" && settledEffects.length === 0);
        tick += 1;
        const progress = Math.min(1, elapsed / settleAfter);
        const delay = Math.round((isTurbo() ? 28 : 42) + Math.pow(progress, 3) * (isTurbo() ? 72 : 155));
        const timer = setTimeout(spin, delay);
        combatRollTimers.push(timer);
      };
      spin();
      });
      if (token !== combatSequenceToken) return;
      settledEffects.push(effect);
    }
    [...els.combatFxCards.querySelectorAll(".combat-magic-chip")].forEach((chip) => {
      chip.classList.remove("roll-active", "roll-waiting");
      chip.classList.add("roll-settled");
    });
    setCombatLiveDamage(breakdown.total);
  }

  async function beginAttackPlayback(state, result, breakdown, attackTier, token, skipChargeExit = false) {
    if (!encounter || encounter.phase !== "effect-charge" || encounter.presentation !== state || token !== combatSequenceToken) return;
    const attackEncounter = encounter;
    encounter.cardsCleared = true;
    if (!skipChargeExit) {
      encounter.phase = "attack-exit";
      playBossSequence("14_idle_nocard", "14_idle_nocard");
      els.combatFx.className = `combat-fx attack-exit magic-active${isTurbo() ? " turbo" : ""}`;
      render();
      await new Promise((resolve) => {
        combatFxTimer = setTimeout(resolve, isTurbo() ? 70 : 160);
      });
      if (!encounter || encounter !== attackEncounter || encounter.phase !== "attack-exit" || encounter.presentation !== state || token !== combatSequenceToken) return;
    }
    encounter.phase = "attack";
    els.combatFx.className = `combat-fx attack-${attackTier} ${breakdown.activeEffects.length ? "magic-active" : "poker-only"}${isTurbo() ? " turbo" : ""}`;
    els.combatFx.hidden = false;
    render();
    playSfx("attack");
    const attackFinished = await playAttackSpine(attackTier, attackEncounter);
    if (!attackFinished || !encounter || encounter !== attackEncounter || encounter.phase !== "attack" || encounter.presentation !== state || token !== combatSequenceToken) return;
    els.combatFx.hidden = true;
    clearAttackSpine();
    encounter.phase = "damage";
    setMessage(`-${result.damage} HP`, "win");
    playBossSequence("17_damage", null);
    render();
    await new Promise((resolve) => {
      combatFxTimer = setTimeout(resolve, bossAnimationWindowMs("17_damage", 1, 70));
    });
    if (!encounter || encounter !== attackEncounter || encounter.phase !== "damage" || token !== combatSequenceToken) return;
    encounter.hpLeft = Math.max(0, encounter.hpLeft - result.damage);
    encounter.phase = "post-hit";
    playBossSequence("14_idle_nocard", "14_idle_nocard");
    render();
    await new Promise((resolve) => {
      combatFxTimer = setTimeout(resolve, animationWindowMs(0.42, 0));
    });
    if (!encounter || encounter !== attackEncounter || encounter.phase !== "post-hit" || token !== combatSequenceToken) return;
    if (encounter.hpLeft <= 0) {
      setMessage(`${handPresentationLabel(state.playerHand)} 命中！BOSS DEFEATED`, "win");
      beginBossDefeat();
      render();
      return;
    }
    // 傷害完成後以 BOSS 舞台短台詞回應；不遮牌桌，也不阻塞下一回合。
    showBossSpeech("COME BACK AND CHALLENGE ME!", "hurt");
    finishRound("", "win");
    render();
  }

  async function showCombatResolution(state, result, breakdownInput = null) {
    const breakdown = breakdownInput || Rules.damageBreakdown(state.playerEval, state.magicCards);
    const handKey = state.playerHand.key;
    const attackTier = handKey === "straightFlush" ? "finisher"
      : ["fullHouse", "four"].includes(handKey) ? "heavy"
        : ["three", "straight", "flush"].includes(handKey) ? "special"
          : "normal";
    const token = ++combatSequenceToken;
    encounter.phase = "effect-charge";
    const hasHiddenDamageEffect = breakdown.activeEffects.some((effect) => effect.key !== "joker");
    if (!hasHiddenDamageEffect) {
      // 沒有任何需在比牌時揭露的傷害值時，不開黑幕、不秀公式、不等待，直接承接牌堆破碎後的攻擊。
      els.combatFx.hidden = true;
      beginAttackPlayback(state, result, breakdown, attackTier, token, true);
      return;
    }
    render();
    els.combatFxEyebrow.textContent = attackTier === "finisher"
      ? "ULTIMATE ATTACK"
      : breakdown.activeEffects.length ? "MAGIC ACTIVATED" : "POKER HIT";
    els.combatFx.className = `combat-fx effect-charge ${breakdown.activeEffects.length ? "magic-active" : "poker-only"}${isTurbo() ? " turbo" : ""}`;
    els.combatFxCards.innerHTML = breakdown.activeEffects.map((effect, index) => {
      const artVariables = magicArtVariables(effect.key);
      const style = [`--chip-delay:${(index * 0.12).toFixed(2)}s`, `--chip-delay-turbo:${(index * 0.06).toFixed(2)}s`, artVariables].filter(Boolean).join(";");
      const finalValue = combatEffectFinalValue(effect);
      const initialValue = effect.key === "joker" ? "JOKER" : combatVisualRollValue(effect, index, 0);
      const initialMarkup = initialValue === "JOKER" ? `<b>JOKER</b>` : damageGlyphMarkup(initialValue);
      return `<div class="combat-magic-chip magic-${effect.key}${artVariables ? " has-card-art" : ""}" style="${style}" aria-label="${effect.label}，最終鎖定值 ${finalValue}"><span>${effect.type || "MAGIC"}</span><strong>${effect.label}</strong><output class="combat-final-value rolling" data-combat-roll="${index}" data-locked-final="${finalValue}"><span class="sr-only">視覺滾動中；最終鎖定值 ${finalValue}</span>${initialMarkup}</output></div>`;
    }).join("");
    els.combatImpactLabel.textContent = `-${result.damage} HP`;
    els.combatFxTitle.textContent = `${handPresentationLabel(state.playerHand)} HIT`;
    els.combatFxEquation.textContent = combatEquation(breakdown);
    setCombatLiveDamage(breakdown.base, true);
    els.combatFx.hidden = false;
    clearTimeout(combatFxTimer);
    await runCombatRandomNumbers(breakdown.activeEffects, breakdown, token);
    if (!encounter || encounter.presentation !== state || encounter.phase !== "effect-charge" || token !== combatSequenceToken) return;
    els.combatFx.classList.add("formula-ready");
    await new Promise((resolve) => {
      combatFxTimer = setTimeout(resolve, isTurbo() ? 100 : 220);
    });
    beginAttackPlayback(state, result, breakdown, attackTier, token);
  }

  function continueRound() {
    if (!encounter || encounter.phase !== "round-result") return;
    if (!spend(runtimeConfig.entryCostX)) return;
    const continueOperation = beginOperation("CONTINUE");
    encounter.round += 1;
    encounter.draws = 0;
    encounter.paidDraws = 0;
    encounter.tieRedeals = 0;
    // CONTINUE 仍是同一隻 BOSS；新回合入場費必須加到 encounter 累計，不能覆寫前面投入。
    encounter.totalBetX += runtimeConfig.entryCostX;
    encounter.bossRevealed = false;
    encounter.compareOutcome = "";
    createCurrentRound();
    completeOperation(continueOperation, { costX: runtimeConfig.entryCostX, bet: activeBet });
    beginRoundReveal();
  }

  function beginBossDefeat() {
    if (!encounter || encounter.phase !== "post-hit" || encounter.hpLeft > 0) return;
    encounter.phase = "boss-defeat";
    playBossSequence("31_lose_begin", "32_lose_loop");
    playTreasureSequence("level2");
    playSfx("win");
    render();
    // 由 BOSS 自身死亡 Spine 與寶箱升級承接，不插入額外的全屏 DEFEATED 字卡。
    els.bossDefeatFx.hidden = true;
    clearTimeout(defeatFxTimer);
    const defeatedEncounter = encounter;
    defeatFxTimer = setTimeout(() => {
      if (!encounter || encounter !== defeatedEncounter || encounter.phase !== "boss-defeat") return;
      playBossSequence("16_end", null);
      defeatFxTimer = setTimeout(() => {
        if (!encounter || encounter !== defeatedEncounter || encounter.phase !== "boss-defeat") return;
        beginPrizeReveal();
      }, animationWindowMs(1));
    }, animationWindowMs(2));
  }

  function beginPrizeReveal() {
    if (!encounter || encounter.phase !== "boss-defeat" || encounter.hpLeft > 0) return;
    const organicPayoutCredits = (encounter.packet.dice.total + encounter.coinBonusX) * activeBet;
    settleStoryPool(organicPayoutCredits, true);
    els.bossDefeatFx.hidden = true;
    encounter.phase = "prize-reveal";
    encounter.payoutSettled = false;
    prizeRevealState = {
      opened: new Set(), finished: new Set(), settling: false, encounter
    };
    render();
    renderReward();
  }

  function revealPrizeDie(index) {
    const state = prizeRevealState;
    if (!state || state.encounter !== encounter || encounter.phase !== "prize-reveal") return;
    if (state.opened.has(index)) return;
    const die = els.rewardDice.querySelector(`[data-prize-index="${index}"]`);
    if (!die) return;
    const kind = die.dataset.prizeKind;
    // 點擊結果必須先落地；Spine／CSS 只負責各顆骰子的非阻塞演出。
    // 不可用一顆骰子的動畫鎖住整排輸入，否則手機連點會被直接丟棄。
    state.opened.add(index);
    die.disabled = true;
    die.classList.remove("covered", "revealed");
    die.classList.add("rolling");
    const spineRecord = rewardDieSpines.get(index);
    if (spineRecord) {
      spineRecord.spine.skeleton.setSkinByName(spineRecord.multiplier ? `x${spineRecord.face}` : `dice_${spineRecord.face}`);
      spineRecord.spine.skeleton.setSlotsToSetupPose();
      spineRecord.spine.state.timeScale = isTurbo() ? TURBO_TIME_SCALE : 1;
      spineRecord.spine.state.setAnimation(0, spineRecord.multiplier ? "golden_flip" : "normal_flip", false);
    }
    playSfx("reward");
    const dice = encounter.packet.dice;
    const face = kind === "normal"
      ? Number(dice.normalFaces[index])
      : Number(dice.multiplierFaces[index - dice.normalDice]);
    die.setAttribute("aria-label", kind === "normal" ? `普通骰點數 ${face}` : `倍數骰 ×${face}`);
    const totalDice = dice.normalDice + dice.multiplierDice;

    // 每顆骰子各自完成演出；任何一顆都不鎖住其他骰子的點擊。
    const flipDuration = REWARD_DIE_FLIP_SECONDS * 1000 / (isTurbo() ? TURBO_TIME_SCALE : 1) + 40;
    setTimeout(() => {
      if (state !== prizeRevealState || state.encounter !== encounter || !["prize-reveal", "resolved-win"].includes(encounter.phase)) return;
      die.classList.remove("rolling");
      die.classList.add("revealed");
      if (spineRecord) {
        spineRecord.spine.state.timeScale = isTurbo() ? TURBO_TIME_SCALE : 1;
        spineRecord.spine.state.setAnimation(0, spineRecord.multiplier ? "golden_end" : "normal_end", false);
      }
      state.finished.add(index);
      if (state.opened.size === totalDice && state.finished.size === totalDice && !state.settling) {
        state.settling = true;
        void finishPrizeTotal(state);
      }
    }, flipDuration);
  }

  function finishPrizeTotal(state) {
    if (!state || state !== prizeRevealState || state.encounter !== encounter || encounter.phase !== "prize-reveal") return;
    const dice = encounter.packet.dice;
    const totalRewardX = dice.total + encounter.coinBonusX;
    setRewardTotal(totalRewardX);
    els.rewardTotalBlock.hidden = false;
    settlePrizePayout(totalRewardX);
  }

  function settlePrizePayout(totalRewardX) {
    if (!encounter || encounter.payoutSettled) return;
    encounter.payoutSettled = true;
    const payout = totalRewardX * activeBet;
    session.credits += payout;
    session.payout += payout;
    playerState.payoutX += payout;
    activeBetLedger().payoutX += payout;
    savePlayerState();
    encounter.phase = "resolved-win";
    const rewardTier = totalRewardX >= 40 ? "full" : totalRewardX >= 30 ? "mega" : totalRewardX >= 20 ? "big" : totalRewardX >= 10 ? "medium" : "small";
    els.rewardPanel.querySelector(".reward-card").dataset.winTier = rewardTier;
    els.rewardPanel.querySelector(".reward-card").classList.add("complete");
    addHistory("KILL REWARD", `${totalRewardX}x · ${payout.toFixed(payout % 1 ? 2 : 0)} CREDITS`, "win");
    playSfx("collect");
    render();
    clearTimeout(prizeTimer);
    prizeTimer = setTimeout(advanceBoss, isTurbo() ? 650 : 1150);
  }

  function advanceBoss() {
    if (!encounter || !["resolved-win", "resolved-loss"].includes(encounter.phase)) return;
    const previousStar = encounter.packet.star;
    clearTimeout(magicTimer);
    clearTimeout(roundFxTimer);
    clearTimeout(roundWarningTimer);
    clearTimeout(bossSpeechTimer);
    clearTimeout(settleTimer);
    clearTimeout(redrawTimer);
    clearTimeout(combatFxTimer);
    clearTimeout(handEnterTimer);
    clearTimeout(entryStarsTimer);
    clearTimeout(entryMaximumTimer);
    clearTimeout(defeatFxTimer);
    clearTimeout(prizeTimer);
    stopCountdown();
    hideResultBoard();
    clearTimeout(bossSpineRetryTimer);
    els.magicReveal.hidden = true;
    els.roundStartFx.hidden = true;
    els.roundWarningFx.hidden = true;
    els.bossSpeech.hidden = true;
    els.combatFx.hidden = true;
    clearAttackSpine();
    els.compareFx.hidden = true;
    els.bossDefeatFx.hidden = true;
    els.rewardPanel.hidden = true;
    clearRewardDiceSpines();
    prizeRevealState = null;
    archiveEncounterAudit("NEXT_BOSS");
    playerState.index += 1;
    if (playerState.index >= runtimeConfig.cycleSize) {
      playerState.epoch += 1;
      playerState.index = 0;
    }
    savePlayerState();
    spawnBoss(previousStar);
  }

  function openRerollConfirm() {
    if (!encounter || !["ready", "round-result"].includes(encounter.phase)) return;
    els.rerollConfirmCost.textContent = (runtimeConfig.entryCostX * activeBet).toFixed((runtimeConfig.entryCostX * activeBet) % 1 ? 2 : 0);
    els.rerollConfirm.hidden = false;
  }

  function rerollBoss() {
    if (!encounter || !["ready", "round-result"].includes(encounter.phase) || els.rerollConfirm.hidden) return;
    const leavingFixedStory = encounter.packet.storyRuntimeMode === "FIXED";
    els.rerollConfirm.hidden = true;
    if (encounter.round > 0 && !encounter.poolSettlement) settleStoryPool(0, false);
    if (!spend(runtimeConfig.entryCostX, { storySpend: false })) return;
    const rerollOperation = beginOperation("REROLL_BOSS");
    completeOperation(rerollOperation, { costX: runtimeConfig.entryCostX, bet: activeBet });
    const previousStar = encounter.packet.star;
    if (leavingFixedStory) storyExperience = null;
    playerState.index += 1;
    if (playerState.index >= runtimeConfig.cycleSize) {
      playerState.epoch += 1;
      playerState.index = 0;
    }
    savePlayerState();
    archiveEncounterAudit("REROLL_BOSS");
    spawnBoss(previousStar);
    setMessage(leavingFixedStory ? "已離開指定故事並支付更換 BOSS 費用，改抽下一隻。" : "已支付更換 BOSS 費用，改抽下一隻。", "");
  }

  function changeBet(direction) {
    if (!encounter || !["ready", "round-result"].includes(encounter.phase)) return;
    const previousBet = activeBet;
    const previousStar = encounter.packet.star;
    let index = betSteps.findIndex((value) => value >= activeBet);
    if (index < 0) index = betSteps.length - 1;
    index = Math.max(0, Math.min(betSteps.length - 1, index + direction));
    const nextBet = betSteps[index];
    if (nextBet === previousBet) {
      render();
      return;
    }
    if (encounter.round > 0 && !encounter.poolSettlement) settleStoryPool(0, false);
    const betOperation = beginOperation("BET_CHANGE");
    activeBet = nextBet;
    completeOperation(betOperation, { previousBet, nextBet });
    playerState.index += 1;
    if (playerState.index >= runtimeConfig.cycleSize) {
      playerState.epoch += 1;
      playerState.index = 0;
    }
    savePlayerState();
    archiveEncounterAudit("BET_CHANGE");
    spawnBoss(previousStar);
    setMessage(`BET ${activeBet.toFixed(activeBet % 1 ? 2 : 0)}｜已切換對手。`, "");
  }

  function recommendationText() {
    const result = encounter.presentation;
    if (!result) return "";
    const discardCount = result.discardIndexes.size;
    const discardsBoundCard = [...result.discardIndexes].some((index) => Rules.hasAttachedEffect(result.playerCards[index]));
    const boundWarning = discardsBoundCard ? "｜⚠ 包含魔法綁牌" : "";
    const storyStep = encounter.packet.storyRecord?.path?.find((step) =>
      step.round === encounter.round && step.tieIndex === (encounter.tieRedeals || 0)
    );
    const remainingStoryDraws = storyStep ? Math.max(0, storyStep.draws - encounter.draws) : null;
    const storyHint = remainingStoryDraws === null
      ? ""
      : remainingStoryDraws > 0
        ? `｜故事節奏：照自動保留再換 ${remainingStoryDraws} 次`
        : `｜故事節奏：現在 ${storyStep.action}`;
    if (result.playerRank === 0) return discardCount ? `HIGH CARD｜已建議更換 ${discardCount} 張牌${boundWarning}${storyHint}。` : `HIGH CARD｜可 FOLD${storyHint}。`;
    return `${result.playerHand.label}｜建議更換 ${discardCount} 張${boundWarning}｜牌型基礎傷害 ${result.playerEval.damage} DMG；魔法值比牌時揭露${storyHint}。`;
  }

  function magicCards() {
    const result = encounter?.presentation;
    if (!result) return [];
    const activeKeys = new Set(Rules.damageBreakdown(result.playerEval, result.magicCards).activeEffects.map((effect) => effect.key));
    return result.magicCards.map((card, index) => {
      const freeAvailable = card.key === "freeDraw" && !result.freeUsed;
      const freeUsed = card.key === "freeDraw" && result.freeUsed;
      const coinBanked = card.key === "coin";
      const active = activeKeys.has(card.key) || freeAvailable || coinBanked;
      return {
        ...Rules.magicDisplay(card),
        key: card.key,
        index,
        active,
        spent: freeUsed,
        statusLabel: coinBanked ? "BANKED" : freeUsed ? "USED" : freeAvailable ? "FREE" : active ? "ACTIVE" : ""
      };
    });
  }

  function createCurrentRound(tieRedeal = false) {
    encounter.expandedEffect = "";
    encounter.compareOutcome = "";
    encounter.cardsCleared = false;
    encounter.pendingFightOperation = null;
    const bankedCoinBonusX = encounter.coinBonusX;
    const storyConfig = encounter.packet.storyConfig || runtimeNaturalConfig(runtimeConfig);
    const tieIndex = encounter.tieRedeals || 0;
    const roundSeed = Random.hash32(encounter.packet.naturalStorySeed, encounter.round, 1201 + tieIndex * 17);
    encounter.presentation = Rules.createNaturalRound({
      rng: Random.mulberry32(roundSeed),
      magicEnabled: storyConfig.magicEnabled,
      magicRows: storyConfig.magicRows,
      magicCardsPerRound: storyConfig.magicCardsPerRound,
      useHighMagicTickets: encounter.packet.star >= 7,
      playerBadHighRerollPct: storyConfig.playerBadHighRerollPct,
      bossBadHighRerollPct: storyConfig.bossBadHighRerollPct,
      initialRerollLimit: storyConfig.initialRerollLimit
    });
    const storyStep = encounter.packet.storyRecord?.path?.find((step) =>
      step.round === encounter.round && step.tieIndex === (encounter.tieRedeals || 0)
    );
    if (storyStep?.initialKeepCardIds?.length) {
      Rules.applyRecommendedKeepCards(encounter.presentation, storyStep.initialKeepCardIds);
    }
    encounter.coinBonusX += encounter.presentation.coinX;
    encounter.revealedCoinBonusX = bankedCoinBonusX;
    encounter.revealedMagicIndexes = new Set();
    encounter.playerCardOrder = buildCardOrder(encounter.presentation.playerCards, encounter.presentation.playerEval, encounter.presentation.discardIndexes);
    encounter.bossCardOrder = buildCardOrder(encounter.presentation.bossCards, encounter.presentation.bossEval);
  }

  function drawCostX(paidDraws) {
    const costs = runtimeConfig.drawCostsX;
    return costs[Math.min(paidDraws, costs.length - 1)] ?? costs[costs.length - 1] ?? 3;
  }

  function showRoundActionFx(action) {
    clearTimeout(roundFxTimer);
    const key = String(action || "START").toLowerCase();
    const duration = key === "fight" ? isTurbo() ? 220 : 640 : isTurbo() ? 260 : 960;
    els.roundActionLabel.textContent = key.toUpperCase();
    els.roundStartFx.dataset.action = key;
    els.roundStartFx.className = `round-start-fx${isTurbo() ? " turbo" : ""}`;
    els.roundStartFx.hidden = false;
    roundFxTimer = setTimeout(() => { els.roundStartFx.hidden = true; }, duration);
    return duration;
  }

  function showRoundStartFx() {
    return showRoundActionFx("START");
  }

  function showLastRoundWarning() {
    clearTimeout(roundWarningTimer);
    hideBossSpeech();
    els.roundWarningFx.hidden = false;
    roundWarningTimer = setTimeout(() => { els.roundWarningFx.hidden = true; }, isTurbo() ? 720 : 1800);
  }

  function isTurbo() {
    return document.querySelector(".turbo-button").classList.contains("active");
  }

  function animationWindowMs(seconds, bufferMs = 50) {
    const timeScale = isTurbo() ? TURBO_TIME_SCALE : 1;
    return Math.ceil(seconds * 1000 / timeScale + bufferMs);
  }

  function setTurboActive(active) {
    document.querySelector(".turbo-button").classList.toggle("active", active);
    els.menuTurboButton.classList.toggle("active", active);
    els.gameShell.classList.toggle("turbo", active);
    document.querySelector(".turbo-button").setAttribute("aria-pressed", String(active));
    els.menuTurboButton.setAttribute("aria-pressed", String(active));
  }

  function toggleTurboMode() {
    const stablePhase = encounter && ["ready", "hand", "round-result", "resolved-loss", "resolved-win"].includes(encounter.phase);
    if (!stablePhase || encounter.handEntering) {
      setMessage("目前演出完成後才能切換快速模式。", "");
      return;
    }
    setTurboActive(!isTurbo());
    setMessage(isTurbo() ? "快速模式：ON" : "快速模式：OFF", "");
  }

  function setMessage(text, tone) {
    els.combatMessage.textContent = text;
    els.combatMessage.className = `combat-message${tone ? ` ${tone}` : ""}`;
  }

  function originalCardArtMarkup(art, bossSized) {
    const cardWidth = bossSized ? 53 : 90;
    const cardHeight = bossSized ? 68 : 116;
    const sourceWidth = art.rotated ? art.height : art.width;
    const sourceHeight = art.rotated ? art.width : art.height;
    const artWidth = art.rotated ? cardHeight : cardWidth;
    const artHeight = art.rotated ? cardWidth : cardHeight;
    const scaleX = artWidth / sourceWidth;
    const scaleY = artHeight / sourceHeight;
    const transform = art.rotated ? "translate(-50%,-50%) rotate(-90deg)" : "translate(-50%,-50%)";
    const style = [
      `width:${artWidth}px`,
      `height:${artHeight}px`,
      `background-image:url('${art.file}')`,
      `background-size:${(art.atlasWidth * scaleX).toFixed(3)}px ${(art.atlasHeight * scaleY).toFixed(3)}px`,
      `background-position:${(-art.x * scaleX).toFixed(3)}px ${(-art.y * scaleY).toFixed(3)}px`,
      `transform:${transform}`
    ].join(";");
    return `<span class="original-card-art" style="${style}"></span>`;
  }

  function orderedComboIds(evaluation) {
    const cards = [...(evaluation?.cards || [])];
    const counts = cards.reduce((map, card) => {
      if (!card.joker) map.set(card.rank, (map.get(card.rank) || 0) + 1);
      return map;
    }, new Map());
    const straightLike = evaluation?.key === "straight" || evaluation?.key === "straightFlush";
    const wheel = straightLike && cards.some((card) => card.rank === 14) && cards.some((card) => card.rank === 2);
    return cards.sort((left, right) => {
      if (left.joker !== right.joker) return left.joker ? -1 : 1;
      if (!straightLike && counts.get(left.rank) !== counts.get(right.rank)) return (counts.get(right.rank) || 0) - (counts.get(left.rank) || 0);
      const leftRank = wheel && left.rank === 14 ? 1 : left.rank;
      const rightRank = wheel && right.rank === 14 ? 1 : right.rank;
      return rightRank - leftRank || (left.suitIndex || 0) - (right.suitIndex || 0);
    }).map((card) => Rules.cardId(card));
  }

  function compareCardMarkup(card, evaluation, index, extraClass = "") {
    const rankForArt = card.rank === 14 ? 1 : card.rank;
    const artKey = card.joker ? "joker" : `${originalSuitPrefix[card.suit]}${rankForArt}`;
    const directArt = card.joker ? null : DIRECT_CARD_ART[artKey];
    const jokerRank = card.joker ? evaluation?.jokerRank || 14 : 0;
    const label = card.joker ? `JOKER，代替 ${jokerRank}` : `${Rules.cardLabel(card)}${Rules.SUIT_GLYPHS[card.suit] || ""}`;
    const face = card.joker ? jokerCardMarkup(jokerRank)
      : directArt ? directCardMarkup(directArt)
        : originalCardArt[artKey] ? originalCardArtMarkup(originalCardArt[artKey], false)
          : `<div class="card-corner"><b>${Rules.cardLabel(card)}</b><i>${Rules.SUIT_GLYPHS[card.suit] || ""}</i></div>`;
    const shards = Array.from({ length: 6 }, (_value, shardIndex) =>
      `<i class="compare-card-shard shard-${shardIndex + 1}" aria-hidden="true">${face}</i>`
    ).join("");
    return `<div class="playing-card original-art compare-playing-card${extraClass ? ` ${extraClass}` : ""}" style="--compare-index:${index}" aria-label="${label}"><span class="compare-card-face">${face}</span><span class="compare-card-shards" aria-hidden="true">${shards}</span></div>`;
  }

  function applyCompareHandArt(strong, evaluation) {
    const art = HAND_ART[handPresentationKey(evaluation)] || HAND_ART.high;
    const container = strong?.closest?.(".compare-hand");
    if (!container) return;
    container.classList.add("has-hand-art");
    container.style.setProperty("--compare-hand-base", `url("${assetUrl(art.base)}")`);
    container.style.setProperty("--compare-hand-word", `url("${assetUrl(art.word)}")`);
    container.style.setProperty("--compare-hand-word-width", art.wordWidth);
  }

  function renderCompareCards(state) {
    const ordered = (evaluation) => {
      const byId = new Map((evaluation?.cards || []).map((card) => [Rules.cardId(card), card]));
      return orderedComboIds(evaluation).map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
    };
    const evidenceMarkup = (allCards, evaluation) => {
      const best = ordered(evaluation);
      const bestIds = new Set(best.map((card) => Rules.cardId(card)));
      const sixth = (allCards || []).find((card) => !bestIds.has(Rules.cardId(card)));
      return best.map((card, index) => compareCardMarkup(card, evaluation, index)).join("")
        + (sixth ? compareCardMarkup(sixth, evaluation, 5, "compare-sixth-card") : "");
    };
    els.comparePlayerCards.innerHTML = evidenceMarkup(state.playerCards, state.playerEval);
    els.compareBossCards.innerHTML = evidenceMarkup(state.bossCards, state.bossEval);
  }

  function buildCardOrder(cards, evaluation, discardIndexes = null) {
    if (discardIndexes instanceof Set && typeof Rules.sortCardIndexes === "function") {
      return Rules.sortCardIndexes(cards, discardIndexes);
    }
    const comboOrder = new Map(orderedComboIds(evaluation).map((id, index) => [id, index]));
    return cards.map((_card, index) => index).sort((leftIndex, rightIndex) => {
      const left = cards[leftIndex];
      const right = cards[rightIndex];
      const leftDiscard = discardIndexes?.has(leftIndex) ? 1 : 0;
      const rightDiscard = discardIndexes?.has(rightIndex) ? 1 : 0;
      if (leftDiscard !== rightDiscard) return leftDiscard - rightDiscard;
      if (left.joker !== right.joker) return left.joker ? -1 : 1;
      const leftCombo = comboOrder.has(Rules.cardId(left)) ? comboOrder.get(Rules.cardId(left)) : 99;
      const rightCombo = comboOrder.has(Rules.cardId(right)) ? comboOrder.get(Rules.cardId(right)) : 99;
      if (leftCombo !== rightCombo) return leftCombo - rightCombo;
      const leftEffect = hasBoundMagicEffect(left, "crit") ? 2 : hasBoundMagicEffect(left, "flatDamage") ? 1 : 0;
      const rightEffect = hasBoundMagicEffect(right, "crit") ? 2 : hasBoundMagicEffect(right, "flatDamage") ? 1 : 0;
      return rightEffect - leftEffect || right.rank - left.rank || (left.suitIndex || 0) - (right.suitIndex || 0);
    });
  }

  function hasBoundMagicEffect(card, key) {
    return Boolean(card?.magicEffects && Object.prototype.hasOwnProperty.call(card.magicEffects, key));
  }

  function renderCards(container, cards, hidden = false) {
    const values = cards?.length ? cards : Array(6).fill(null);
    const playerHand = container === els.playerCards;
    const bossSized = !playerHand;
    const evaluation = playerHand ? encounter?.presentation?.playerEval : encounter?.presentation?.bossEval;
    const bestIds = new Set((evaluation?.cards || []).map((card) => Rules.cardId(card)));
    const preferredOrder = playerHand ? encounter?.playerCardOrder : encounter?.bossCardOrder;
    const order = preferredOrder?.length === values.length ? preferredOrder : values.map((_card, index) => index);
    container.innerHTML = order.map((sourceIndex, displayIndex) => {
      const card = values[sourceIndex];
      if (hidden) return `<div class="playing-card original-art back" aria-label="暗牌">${directCardMarkup(DIRECT_CARD_ART.back_blue)}</div>`;
      if (!card) return '<div class="playing-card placeholder-card" aria-hidden="true"></div>';
      const redrawMarked = playerHand && encounter?.redrawIndexes?.has(sourceIndex);
      const discard = playerHand && (
        (encounter?.phase === "hand" && encounter.presentation.discardIndexes.has(sourceIndex)) ||
        (encounter?.phase === "redraw-out" && redrawMarked) ||
        (encounter?.phase === "redraw-in" && encounter.presentation.discardIndexes.has(sourceIndex))
      );
      const arranging = playerHand && ["hand", "redraw-out", "redraw-in"].includes(encounter?.phase);
      const kept = arranging && !discard;
      const inBest = bestIds.has(Rules.cardId(card));
      const compareEvidence = ["compare-reveal", "compare-result", "tie-result"].includes(encounter?.phase);
      const resolvedEvidence = !arranging && encounter?.bossRevealed && compareEvidence;
      const boundEffects = ["flatDamage", "crit"]
        .filter((key) => hasBoundMagicEffect(card, key))
        .map((key) => [key, card.magicEffects[key]]);
      const effectBadges = boundEffects.map(([key]) => {
        const display = "?";
        const effectToggle = `${sourceIndex}:${key}`;
        const expanded = playerHand && encounter?.expandedEffect === effectToggle;
        const effectName = key === "crit" ? "暴擊" : "固傷";
        return `<button type="button" class="bound-effect bound-${key}" data-effect-toggle="${effectToggle}" aria-expanded="${expanded}" aria-label="${effectName}已綁定；數值於比牌結算揭露"><span>?</span></button>`;
      }).join("");
      const effectExpanded = playerHand && boundEffects.some(([key]) => encounter?.expandedEffect === `${sourceIndex}:${key}`);
      const rankForArt = card.rank === 14 ? 1 : card.rank;
      const artKey = card.joker ? "joker" : `${originalSuitPrefix[card.suit]}${rankForArt}`;
      const art = originalCardArt[artKey];
      const directArt = card.joker ? null : DIRECT_CARD_ART[artKey];
      const jokerRank = card.joker ? evaluation?.jokerRank || 14 : 0;
      const rankLabel = card.joker ? "JOKER" : Rules.cardLabel(card);
      const glyph = card.joker ? "" : Rules.SUIT_GLYPHS[card.suit];
      const arrangementLabel = !playerHand ? ""
        : arranging ? (discard ? "，待換牌" : "，已鎖定")
          : resolvedEvidence ? (inBest ? "，最終最佳五張" : "，最終第六張") : "";
      const jokerSubstituteLabel = card.joker && compareEvidence ? `，代替 ${jokerRank === 14 ? "A" : jokerRank === 13 ? "K" : jokerRank === 12 ? "Q" : jokerRank === 11 ? "J" : jokerRank}` : "";
      const label = `${rankLabel}${glyph}${jokerSubstituteLabel}${arrangementLabel}${boundEffects.length ? "，魔法綁定牌" : ""}`;
      const stateClasses = `${card.joker ? " joker" : ""}${discard ? " discard" : ""}${kept ? " kept-card" : ""}${resolvedEvidence && inBest ? " best-five" : ""}${resolvedEvidence && !inBest ? " sixth-card" : ""}${boundEffects.length ? " magic-bound" : ""}${effectExpanded ? " effect-expanded" : ""}${redrawMarked && encounter?.phase === "redraw-out" ? " redraw-out" : ""}${redrawMarked && encounter?.phase === "redraw-in" ? " redraw-in" : ""}`;
      if (card.joker) {
        return `<div class="playing-card original-art${stateClasses}" style="--card-index:${displayIndex}" data-card-index="${sourceIndex}" aria-pressed="${discard}" aria-label="${label}">${jokerCardMarkup(jokerRank, compareEvidence)}${effectBadges}</div>`;
      }
      if (directArt) {
        return `<div class="playing-card original-art${stateClasses}" style="--card-index:${displayIndex}" data-card-index="${sourceIndex}" aria-pressed="${discard}" aria-label="${label}">${directCardMarkup(directArt)}${effectBadges}</div>`;
      }
      if (art) {
        return `<div class="playing-card original-art${stateClasses}" style="--card-index:${displayIndex}" data-card-index="${sourceIndex}" aria-pressed="${discard}" aria-label="${label}">${originalCardArtMarkup(art, bossSized)}${effectBadges}</div>`;
      }
      return `<div class="playing-card${stateClasses}" style="--card-index:${displayIndex}" data-card-index="${sourceIndex}" aria-pressed="${discard}" aria-label="${label}"><div class="card-corner"><b>${rankLabel}</b><i>${glyph}</i></div><div class="card-center">${glyph}</div>${effectBadges}</div>`;
    }).join("");
  }

  function buttonMarkup(image, alt, subline) {
    return `<b><img class="action-word" src="assets/mobile/${image}" alt="${alt}"></b><small>${subline}</small>`;
  }

  function renderReward() {
    const dice = encounter.packet.dice;
    let prizeIndex = 0;
    const normal = dice.normalFaces.map((face) => {
      const index = prizeIndex++;
      return `<button type="button" class="die covered" data-prize-index="${index}" data-prize-kind="normal" data-face="${face}" aria-label="揭曉第 ${index + 1} 顆普通骰"><span class="die-cover" aria-hidden="true"></span><span class="die-face">${diePipsMarkup(face)}<span class="die-spine" data-die-spine data-kind="normal" data-face="${face}"></span></span></button>`;
    }).join("");
    const multiplier = dice.multiplierFaces.map((face) => {
      const index = prizeIndex++;
      return `<button type="button" class="die multiplier covered" data-prize-index="${index}" data-prize-kind="multiplier" data-face="${face}" aria-label="揭曉第 ${index - dice.normalDice + 1} 顆倍數骰"><span class="die-cover" aria-hidden="true"></span><span class="die-face"><span class="die-fallback">×${face}</span><span class="die-spine" data-die-spine data-kind="multiplier" data-face="${face}"></span></span></button>`;
    }).join("");
    els.rewardDice.innerHTML = multiplier
      ? `<div class="dice-group normal-dice-group">${normal}</div><span class="times">×</span><div class="dice-group multiplier-dice-group">${multiplier}</div>`
      : `<div class="dice-group normal-dice-group">${normal}</div>`;
    els.rewardDice.className = "reward-dice stage-all";
    setRewardTotal(0);
    els.rewardTotalBlock.hidden = true;
    els.rewardPanel.querySelector(".reward-card").classList.remove("complete");
    els.rewardPanel.querySelector(".reward-card").dataset.winTier = "pending";
    els.rewardPanel.hidden = false;
    document.documentElement.dataset.rewardDiceError = "";
    void mountRewardDiceSpines();
  }

  function render() {
    const packet = encounter.packet;
    const dice = packet.dice;
    const entryCompositionVisible = encounter.entryStarsAnimating || encounter.entryStarsRevealed;
    const treasurePresentation = treasurePresentationForStar(packet.star);
    const lockedTreasureMaximum = maximumRewardForDice(dice);
    const treasureMaximum = encounter.treasureMaximumRevealed
      ? lockedTreasureMaximum
      : treasurePresentation.maximum;
    const currentConfig = runtimeConfig;
    const phaseClass = `phase-${encounter.phase}`;
    const startedClass = session.hasStarted || encounter.round > 0 ? " has-started" : "";
    // qa=1 時只替換前端角色骨架，方便逐隻逐 phase 對原站；正式遊戲封包與數學完全不變。
    const bossSkin = qaBossOverride
      ? bossSkins.find((boss) => boss.key === qaBossOverride)
      : bossSkins[Math.max(0, Math.min(bossSkins.length - 1, packet.star - 1))];
    const skinClass = ` skin-${bossSkin.key}`;
    els.gameShell.className = `game-shell ${phaseClass}${startedClass}${skinClass}${encounter.bossRevealed ? " boss-revealed" : ""}${encounter.handEntering ? " hand-entering" : ""}${encounter.cardsCleared ? " cards-cleared" : ""}${encounter.compareOutcome ? ` compare-${encounter.compareOutcome}` : ""}${isTurbo() ? " turbo" : ""}`;

    els.modelVersion.textContent = packet.storyRuntimeMode === "DYNAMIC" ? `NATURAL ${packet.lockedTargetRtpPct}% · ${packet.storyRecord.classLabel}` : `STORY ${packet.storyRecord.classLabel}`;
    els.updateStatus.textContent = "● LIVE";
    els.updateStatus.classList.remove("pending");
    // 原站 BossDuelCommonUIController.setPlayerBalance() 直接把數值轉成字串；
    // 不自行加千分位或固定兩位小數，避免頁尾資產與正式版式不一致。
    els.credits.textContent = String(session.credits);
    const totalBet = encounter.totalBetX * activeBet;
    // 使用者正式規格：TOTAL BET 顯示本隻 BOSS 的所有入場與付費 REDRAW，任何回合 phase 都不得清零。
    els.betValue.textContent = totalBet
      ? totalBet.toFixed(totalBet % 1 ? 2 : 0)
      : "0";
    const revealedCoinBonusX = Math.max(0, Number(encounter.revealedCoinBonusX) || 0);
    const revealedCoinLabel = revealedCoinBonusX.toFixed(revealedCoinBonusX % 1 ? 2 : 0);
    els.coinBonusPanel.hidden = revealedCoinBonusX <= 0;
    els.coinBonusValue.textContent = `+${revealedCoinLabel}X`;
    els.coinBonusPanel.setAttribute("aria-label", `本隻 BOSS 已累積金幣獎勵加 ${revealedCoinLabel} 倍`);
    els.sessionSpend.textContent = session.spend.toFixed(2);
    els.sessionPayout.textContent = session.payout.toFixed(2);
    els.sessionRtp.textContent = session.spend > 0 ? `${(session.payout / session.spend * 100).toFixed(2)}%` : "—";
    els.personalSpend.textContent = playerState.spendX.toFixed(2);
    els.personalPayout.textContent = playerState.payoutX.toFixed(2);
    const storyBalances = Array.isArray(playerState.storyBucketBalances) ? playerState.storyBucketBalances : [0, 0, 0];
    const signedCredits = (value) => `${Number(value) > 0 ? "+" : ""}${Number(value || 0).toFixed(2)}`;
    const activeStoryBucket = NaturalCore ? NaturalCore.bucketIndexForBet(activeBet) : 0;
    els.personalPool.textContent = signedCredits(storyBalances.reduce((sum, value) => sum + Number(value || 0), 0));
    els.activeBetPool.textContent = NaturalCore
      ? `${NaturalCore.BET_BUCKETS[activeStoryBucket].label}｜${signedCredits(storyBalances[activeStoryBucket])}`
      : "等待故事核心";
    els.supplyDecision.textContent = `自然／${packet.storyRecord.classLabel}／派彩率 ${packet.storyRecord.returnX.toFixed(2)}x`;
    const guaranteedPremiumDice = guaranteedPremiumDiceForStar(packet.star);
    const rainbowStars = entryCompositionVisible
      ? Math.max(guaranteedPremiumDice, Math.min(packet.star, dice.multiplierDice))
      : guaranteedPremiumDice;
    const extraPremiumDice = Math.max(0, rainbowStars - guaranteedPremiumDice);
    const normalStars = packet.star - rainbowStars;
    const guaranteedStart = packet.star - guaranteedPremiumDice;
    els.bossStars.className = `boss-stars${encounter.entryStarsAnimating ? extraPremiumDice ? " entry-star-reveal" : " entry-star-check" : ""}`;
    els.bossStars.innerHTML = Array.from({ length: packet.star }, (_value, index) => {
      const premium = index >= normalStars;
      const guaranteedPremium = index >= guaranteedStart;
      const newlyRevealedPremium = premium && !guaranteedPremium;
      const delay = Math.max(0, index - normalStars) * (isTurbo() ? 80 : 140);
      return `<span class="boss-star-slot${premium ? " premium" : ""}${guaranteedPremium ? " guaranteed-premium" : ""}${newlyRevealedPremium ? " revealed-premium" : ""}" style="--star-delay:${delay}ms"><img class="yellow-star" src="assets/mobile/ui-supplied/star.png" alt="">${premium ? '<img class="rainbow-star" src="assets/mobile/ui-supplied/star-rainbow.png" alt="">' : ""}</span>`;
    }).join("");
    els.bossStars.setAttribute("aria-label", entryCompositionVisible
      ? `${packet.star} 星，${dice.normalDice} 顆普通骰，${dice.multiplierDice} 顆倍數骰`
      : guaranteedPremiumDice
        ? `${packet.star} 星，保底 ${guaranteedPremiumDice} 顆倍數骰；額外倍數骰尚未揭示`
        : `${packet.star} 星，額外倍數骰尚未揭示`);
    els.bossName.textContent = bossSkin.name;
    els.bossName.className = "sr-only";
    els.bossNameArt.hidden = false;
    els.bossNameArt.src = bossSkin.title;
    els.bossNameArt.alt = bossSkin.name;
    if (bossSkin.fallback) els.bossCharacter.src = bossSkin.fallback;
    else els.bossCharacter.removeAttribute("src");
    els.bossCharacter.alt = `${bossSkin.name} Boss`;
    showBossSpine(bossSkin.key, bossSpineEncounterId);
    showTreasureSkin(bossSpineEncounterId, packet.star, treasureMaximum, encounter.treasureMaximumRevealed);
    const roundsLeft = Math.max(1, packet.roundLimit - Math.max(0, encounter.round - 1));
    els.roundsLeft.innerHTML = roundGlyphMarkup(roundsLeft);
    els.roundLimit.innerHTML = roundGlyphMarkup(packet.roundLimit);
    els.roundCount.setAttribute("aria-label", `${roundsLeft} / ${packet.roundLimit}`);
    els.hpText.textContent = `${encounter.hpLeft} / ${packet.hp}`;
    els.hpFill.style.width = `${Math.max(0, encounter.hpLeft / packet.hp * 100)}%`;
    els.diceFormula.textContent = encounter.entryStarsRevealed
      ? dice.multiplierDice > 0 ? `${dice.normalDice}D6 × ${dice.multiplierDice}D6` : `${dice.normalDice}D6`
      : "尚未揭示";
    els.winUpTo.textContent = `${treasureMaximum}X`;
    els.treasureBadge.setAttribute("aria-label", `最高獎金 ${treasureMaximum} 倍，${packet.star} 星 BOSS 固定布牌；${entryCompositionVisible ? "倍數星標已揭示" : "倍數星標尚未揭示"}，實際骰面只在擊殺後揭示`);
    els.tutorialBossCharacter.src = bossSkin.fallback || "assets/mobile/boss-fallback/drunkard.png";
    els.tutorialBossCharacter.alt = `${bossSkin.name} Boss`;
    els.tutorialRound.textContent = `ROUND ${packet.roundLimit}/${packet.roundLimit}`;
    els.tutorialBossName.textContent = bossSkin.name;
    els.tutorialWinUpTo.textContent = `WIN UP TO ${treasureMaximum}X`;
    els.roundRibbon.hidden = false;
    els.bossHud.hidden = false;
    els.treasureBadge.hidden = false;
    const dynamicStoryMode = packet.storyRuntimeMode === "DYNAMIC";
    els.settingsEyebrow.textContent = dynamicStoryMode ? "LIVE NATURAL STORY" : "STORY CATALOG REPLAY";
    els.settingsHeading.textContent = dynamicStoryMode ? "動態故事／三分類分數配籤" : "故事目錄重播狀態";
    els.cyclePositionLabel.textContent = "故事星級";
    els.targetRtpLabel.textContent = "結果分類";
    els.couplingLabel.textContent = "供應模型";
    els.cyclePosition.textContent = `${packet.star} 星｜seed ${packet.naturalStorySeed}`;
    els.targetRtp.textContent = packet.storyRecord.classLabel;
    els.couplingValue.textContent = dynamicStoryMode
      ? `三分類全池各抽 1 個 → 配籤 ${packet.lockedTargetRtpPct}%`
      : "指定 Natural 故事";
    const weightCopy = packet.storyCommit?.weights
      ? `贏多 ${(packet.storyCommit.weights.win * 100).toFixed(2)}%／贏少 ${(packet.storyCommit.weights.push * 100).toFixed(2)}%／輸 ${(packet.storyCommit.weights.lose * 100).toFixed(2)}%`
      : "指定故事不重新抽籤";
    const ticketCopy = Array.isArray(packet.storyCommit?.ticketCounts)
      ? `${Number(packet.storyCommit.ticketBasis || 0).toLocaleString("zh-TW")} 分數籤：贏多 ${packet.storyCommit.ticketCounts[0].toLocaleString("zh-TW")}／贏少 ${packet.storyCommit.ticketCounts[1].toLocaleString("zh-TW")}／輸 ${packet.storyCommit.ticketCounts[2].toLocaleString("zh-TW")}`
      : "";
    const storyBetCredits = packet.storyRecord ? storyCreditsForBet(packet.storyRecord, activeBet) : null;
    const actualResultCopy = storyBetCredits
      ? `劇本總押 ${storyBetCredits.spendX.toFixed(2)}x、總派彩 ${storyBetCredits.payoutX.toFixed(2)}x；BET ${storyBetCredits.bet} 實際點數為押 ${storyBetCredits.totalSpendCredits.toFixed(2)}、派 ${storyBetCredits.totalPayoutCredits.toFixed(2)}`
      : "";
    els.settingsNote.textContent = `贏多、贏少、輸各從完整結果分類等機率抽 1 個；同一 seed 以 X 倍數通用所有 BET。${weightCopy}。${ticketCopy ? `${ticketCopy}。` : ""}${actualResultCopy}。個人劇本水池不參與選劇本。`;
    els.combatLockState.textContent = `seed ${packet.naturalStorySeed}｜${packet.storyRecord.rounds} 回合`;
    els.diceLockState.textContent = encounter.phase === "resolved-win"
      ? `${packet.dice.total}x 已揭露`
      : "已鎖定／未揭露";
    els.magicRow.innerHTML = magicCards().map((card) => {
      const artVariables = magicArtVariables(card.key);
      const style = [`--magic-top:${card.index * 84}px`, artVariables].filter(Boolean).join(";");
      return `<button type="button" class="magic-card magic-${card.key} ${card.spent ? "spent" : card.active ? "active" : "inactive"}${artVariables ? " has-card-art" : ""}" style="${style}" data-magic-preview="${card.index}" aria-label="查看 ${card.label} 大卡說明；${card.spent ? "已使用" : card.active ? "目前生效" : "條件尚未成立"}"><span>${card.type}</span><strong>${card.label}</strong>${card.statusLabel ? `<i>${card.statusLabel}</i>` : ""}</button>`;
    }).join("");
    els.prestartBet.textContent = activeBet.toFixed(activeBet % 1 ? 2 : 0);

    if (encounter.presentation) {
      renderCards(els.playerCards, encounter.presentation.playerCards);
      renderCards(els.bossCards, encounter.presentation.bossCards, !encounter.bossRevealed);
      const playerHandLabel = handPresentationLabel(encounter.presentation.playerHand);
      const playerHandArt = HAND_ART[handPresentationKey(encounter.presentation.playerHand)] || HAND_ART.high;
      els.playerHandName.textContent = playerHandLabel;
      els.playerHandName.classList.toggle("long", playerHandLabel.length > 10);
      els.handPlaque.classList.toggle("low", encounter.presentation.playerRank === 0);
      els.handPlaque.classList.add("has-hand-art");
      els.handPlaque.style.setProperty("--hand-base", `url('${assetUrl(playerHandArt.base)}')`);
      els.handPlaque.style.setProperty("--hand-word", `url('${assetUrl(playerHandArt.word)}')`);
      els.handPlaque.style.setProperty("--hand-word-width", playerHandArt.wordWidth);
      els.handPlaque.setAttribute("aria-label", playerHandLabel);
      els.bossHandName.textContent = encounter.bossRevealed ? handPresentationLabel(encounter.presentation.bossHand) : "HIDDEN";
      const arrangingCards = ["hand", "redraw-out", "redraw-in"].includes(encounter.phase);
      const lockedCards = encounter.presentation.playerCards.length - encounter.presentation.discardIndexes.size;
      const publicBaseDamage = Math.max(0, Number(encounter.presentation.playerEval?.damage) || 0);
      els.damagePreview.textContent = arrangingCards ? `LOCK ${lockedCards}/5 · BASE ${publicBaseDamage}` : `BASE DMG ${publicBaseDamage}`;
      // 原站在一局演出完成、等待 CONTINUE 時已切到 nextRound 視覺狀態：
      // 牌已退場，牌堆標示同時回到 52/52；下一次實際發牌才再顯示剩餘張數。
      const atRoundBoundary = encounter.phase === "round-result";
      document.querySelector(".deck-stack b").textContent = atRoundBoundary
        ? "52/52"
        : `${encounter.presentation.playerDeck.length}/52`;
      els.deckStackButton.disabled = atRoundBoundary;
    } else {
      renderCards(els.playerCards, null);
      renderCards(els.bossCards, Array(6).fill({}), true);
      els.playerHandName.textContent = "等待發牌";
      els.playerHandName.classList.remove("long");
      els.handPlaque.classList.remove("low");
      els.handPlaque.classList.remove("has-hand-art");
      els.handPlaque.style.removeProperty("--hand-base");
      els.handPlaque.style.removeProperty("--hand-word");
      els.handPlaque.style.removeProperty("--hand-word-width");
      els.handPlaque.removeAttribute("aria-label");
      els.bossHandName.textContent = "HIDDEN";
      els.damagePreview.textContent = "DMG —";
      document.querySelector(".deck-stack b").textContent = "52/52";
      els.deckStackButton.disabled = true;
    }

    const ready = encounter.phase === "ready";
    const hand = encounter.phase === "hand" && !encounter.handEntering;
    const betReady = encounter.phase === "bet-ready";
    const magicRevealing = encounter.phase === "magic-reveal";
    const roundResult = encounter.phase === "round-result";
    const comparing = encounter.phase === "compare-reveal";

    els.rerollButton.hidden = !(ready || roundResult);
    els.entryButton.hidden = !(ready || roundResult);
    els.betButton.hidden = !((ready && session.hasStarted) || hand || betReady || magicRevealing || comparing || roundResult);
    els.drawButton.hidden = !((ready && session.hasStarted) || hand || betReady || magicRevealing || comparing || roundResult);
    els.compareButton.hidden = !(hand || betReady || magicRevealing || comparing);
    // 勝局只保留獎勵面板內的 COLLECT；底層 NEXT 僅供敗局使用，避免雙重可操作控制。
    els.nextButton.hidden = encounter.phase !== "resolved-loss";

    if (roundResult) {
      // 原站結果頁中央紅鈕只顯示 CONTINUE，不加自創的 NEXT ROUND 副標。
      els.entryButton.innerHTML = buttonMarkup("text-continue-white.png", "CONTINUE", "");
    } else {
      els.entryButton.innerHTML = buttonMarkup("text-start.png", "START", `${(currentConfig.entryCostX * activeBet).toFixed(2)} CREDITS`);
    }
    els.entryButton.disabled = !(ready || roundResult);
    const compactBet = activeBet.toFixed(activeBet % 1 ? 2 : 0);
    // 原站藍色 REROLL BOSS 籤不顯示價格；費用只在確認窗揭示。
    els.rerollButton.querySelector("small").textContent = "";
    els.betButton.classList.toggle("fold-action", hand);
    els.betButton.innerHTML = hand
      ? buttonMarkup("text-fold.png", "FOLD", "GIVE UP")
      : `${buttonMarkup("text-bet.png", "BET", compactBet)}<span class="bet-hit bet-hit-left" data-bet-direction="-1" aria-hidden="true"></span><span class="bet-hit bet-hit-right" data-bet-direction="1" aria-hidden="true"></span>`;
    els.betButton.disabled = !((ready && session.hasStarted) || hand || betReady || roundResult) || magicRevealing;
    const discardCount = hand ? encounter.presentation.discardIndexes.size : 0;
    const deckCanDraw = hand && encounter.presentation.playerDeck.length - discardCount >= 10;
    els.drawButton.disabled = !hand || !discardCount || !deckCanDraw;
    const freeDraw = hand && encounter.presentation.magicCards.some((card) => card.key === "freeDraw") && !encounter.presentation.freeUsed;
    const nextDrawCost = freeDraw ? 0 : drawCostX(encounter.paidDraws);
    els.drawButton.innerHTML = buttonMarkup(
      "text-redraw.png",
      "REDRAW",
      hand ? (freeDraw ? "FREE" : (nextDrawCost * activeBet).toFixed(nextDrawCost * activeBet % 1 ? 2 : 0)) : ""
    );
    els.compareButton.disabled = !hand;
    els.compareButton.classList.remove("fold-mode");
    els.compareButton.innerHTML = buttonMarkup("text-fight.png", "FIGHT", "COMPARE");
    els.nextButton.innerHTML = buttonMarkup("text-continue-white.png", "CONTINUE", encounter.phase === "resolved-loss" ? "TRY AGAIN" : "NEXT BOSS");
    if (!els.deckPanel.hidden) renderDeckPanel();
  }

  function resetExperience() {
    clearTimeout(magicTimer);
    clearTimeout(roundFxTimer);
    clearTimeout(roundWarningTimer);
    clearTimeout(bossSpeechTimer);
    clearTimeout(settleTimer);
    clearTimeout(redrawTimer);
    clearTimeout(combatFxTimer);
    clearTimeout(handEnterTimer);
    clearTimeout(entryStarsTimer);
    clearTimeout(entryMaximumTimer);
    clearTimeout(defeatFxTimer);
    clearTimeout(prizeTimer);
    clearTimeout(bossSpineRetryTimer);
    combatSequenceToken += 1;
    clearCombatRollTimers();
    stopCountdown();
    els.magicReveal.hidden = true;
    els.magicPreview.hidden = true;
    els.roundStartFx.hidden = true;
    els.roundWarningFx.hidden = true;
    els.bossSpeech.hidden = true;
    els.combatFx.hidden = true;
    clearAttackSpine();
    els.compareFx.hidden = true;
    hideResultBoard();
    els.bossDefeatFx.hidden = true;
    prizeRevealState = null;
    historyEntries = [];
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    playerState = {
      id: `player-${Math.random().toString(36).slice(2, 10)}`, epoch: 0, index: 0,
      spendX: 0, payoutX: 0, targetCreditX: 0, referenceBet: 0, betLedgers: {},
      storyBucketBalances: [0, 0, 0],
      storyPoolTotals: { targetAccrualCredits: 0, organicPayoutCredits: 0, organicActualNetCredits: 0, correctionCredits: 0, corrections: 0, settledBosses: 0 }
    };
    session = { credits: 10000, spend: 0, payout: 0, hasStarted: false };
    activeBet = runtimeConfig.bet;
    savePlayerState();
    encounter = null;
    els.settingsSheet.hidden = true;
    spawnBoss();
    setMessage("試玩紀錄已重置；下一隻會從贏多、贏少、輸完整故事池各抽一個，再動態配籤。", "");
  }

  function primaryAction() {
    if (encounter.phase === "round-result") continueRound();
    else dealRound();
  }

  els.entryButton.addEventListener("click", primaryAction);
  els.rerollButton.addEventListener("click", openRerollConfirm);
  els.rerollCancel.addEventListener("click", () => { els.rerollConfirm.hidden = true; });
  els.rerollAccept.addEventListener("click", rerollBoss);
  els.betButton.addEventListener("click", (event) => {
    if (encounter.phase === "hand") {
      fold();
      return;
    }
    if (encounter.phase === "ready" || encounter.phase === "round-result") {
      const bounds = els.betButton.getBoundingClientRect();
      const hitDirection = Number(event.target.closest("[data-bet-direction]")?.dataset.betDirection);
      const direction = hitDirection || (event.clientX - bounds.left < bounds.width / 2 ? -1 : 1);
      changeBet(direction);
      return;
    }
    setMessage(`BET ${activeBet.toFixed(2)}｜本回合已鎖定。`, "");
  });
  els.betDown.addEventListener("click", () => changeBet(-1));
  els.betUp.addEventListener("click", () => changeBet(1));
  els.drawButton.addEventListener("click", drawCards);
  els.compareButton.addEventListener("click", fight);
  els.playerCards.addEventListener("click", (event) => {
    const effectToggle = event.target.closest("[data-effect-toggle]");
    if (effectToggle) {
      if (!encounter?.presentation || encounter.handEntering || !["hand", "round-result"].includes(encounter.phase)) return;
      const effectKey = effectToggle.dataset.effectToggle;
      encounter.expandedEffect = encounter.expandedEffect === effectKey ? "" : effectKey;
      render();
      return;
    }
    if (!encounter || encounter.phase !== "hand" || encounter.handEntering) return;
    if (countdownRemaining > 0 && countdownRemaining <= 1) {
      setMessage("倒數即將結束，已停止理牌操作。", "lose");
      return;
    }
    const card = event.target.closest("[data-card-index]");
    if (!card) return;
    const index = Number(card.dataset.cardIndex);
    encounter.expandedEffect = "";
    const discarded = encounter.presentation.discardIndexes;
    const selectedCard = encounter.presentation.playerCards[index];
    if (selectedCard?.joker && !discarded.has(index)) {
      setMessage("JOKER 為萬能牌，依理牌規則必須鎖定。", "lose");
      return;
    }
    if (discarded.has(index)) {
      const lockedCount = encounter.presentation.playerCards.length - discarded.size;
      if (lockedCount >= 5) {
        setMessage("最多只能鎖定 5 張牌。", "lose");
        return;
      }
      discarded.delete(index);
    } else {
      discarded.add(index);
    }
    encounter.presentation.userTouched = true;
    recordKeepSelection();
    // 玩家手動新增／取消只改保留狀態，不移動任何牌；只有初始發牌與 REDRAW 完成才重新理牌。
    const discardingBound = discarded.has(index) && Rules.hasAttachedEffect(selectedCard);
    setMessage(
      discardingBound
        ? `注意：這張牌綁定魔法效果，換掉後效果失效。已選 ${discarded.size} 張。`
        : discarded.size ? `已選 ${discarded.size} 張要更換的牌。` : "全部保留；可以直接 FIGHT／FOLD。",
      discardingBound ? "lose" : ""
    );
    render();
  });
  els.magicRow.addEventListener("click", (event) => {
    const card = event.target.closest("[data-magic-preview]");
    if (!card) return;
    openMagicPreview(Number(card.dataset.magicPreview));
  });
  els.magicPreviewClose.addEventListener("click", closeMagicPreview);
  els.magicPreview.addEventListener("click", (event) => {
    if (event.target === els.magicPreview) closeMagicPreview();
  });
  els.rewardDice.addEventListener("click", (event) => {
    const die = event.target.closest("[data-prize-index]");
    if (!die) return;
    revealPrizeDie(Number(die.dataset.prizeIndex));
  });
  els.nextButton.addEventListener("click", advanceBoss);
  els.menuButton.addEventListener("click", () => {
    els.quickMenu.hidden = !els.quickMenu.hidden;
    els.menuButton.setAttribute("aria-expanded", String(!els.quickMenu.hidden));
  });
  els.menuCloseButton.addEventListener("click", () => {
    closeQuickMenu();
  });
  els.modelInfoButton.addEventListener("click", () => { closeQuickMenu(); els.settingsSheet.hidden = false; });
  els.menuHelpButton.addEventListener("click", () => { closeQuickMenu(); openTutorial(0); });
  els.cardHelpButton.addEventListener("click", () => { closeQuickMenu(); els.cardHelpPanel.hidden = false; });
  els.historyButton.addEventListener("click", () => { closeQuickMenu(); renderHistory(); els.historyPanel.hidden = false; });
  els.soundButton.addEventListener("click", () => {
    setAudioEnabled(!audioEnabled);
  });
  els.menuTurboButton.addEventListener("click", toggleTurboMode);
  els.languageButton.addEventListener("click", () => {
    applyLocale(currentLocale === "en" ? "zh-Hant" : "en");
    setMessage(localeText("language"), "");
  });
  els.exitButton.addEventListener("click", () => {
    if (window.confirm(currentLocale === "en" ? "Exit Boss Duel Demo?" : "確定離開 Boss Duel Demo？")) location.assign("about:blank");
  });
  els.deckStackButton.addEventListener("click", () => {
    if (!encounter?.presentation) return;
    renderDeckPanel();
    els.deckPanel.hidden = false;
    els.deckStackButton.setAttribute("aria-expanded", "true");
  });
  els.deckPanelClose.addEventListener("click", () => { els.deckPanel.hidden = true; els.deckStackButton.setAttribute("aria-expanded", "false"); });
  els.deckPanel.addEventListener("click", (event) => { if (event.target === els.deckPanel) els.deckPanelClose.click(); });
  els.cardHelpClose.addEventListener("click", () => { els.cardHelpPanel.hidden = true; });
  els.cardHelpPanel.addEventListener("click", (event) => { if (event.target === els.cardHelpPanel) els.cardHelpPanel.hidden = true; });
  els.historyClose.addEventListener("click", () => { els.historyPanel.hidden = true; });
  els.historyPanel.addEventListener("click", (event) => { if (event.target === els.historyPanel) els.historyPanel.hidden = true; });
  els.handPlaque.addEventListener("click", () => { els.cardHelpPanel.hidden = false; });
  els.closeSettings.addEventListener("click", () => { els.settingsSheet.hidden = true; });
  els.settingsSheet.addEventListener("click", (event) => {
    if (event.target === els.settingsSheet) els.settingsSheet.hidden = true;
  });
  els.tutorialPrev.addEventListener("click", () => { tutorialPage -= 1; updateTutorialPage(); });
  els.tutorialNext.addEventListener("click", () => { tutorialPage += 1; updateTutorialPage(); });
  els.tutorialClose.addEventListener("click", closeTutorial);
  els.tutorialOverlay.addEventListener("click", (event) => {
    if (event.target === els.tutorialOverlay) closeTutorial();
  });
  els.resetButton.addEventListener("click", resetExperience);
  document.querySelector(".help-button").addEventListener("click", () => openTutorial(0));
  document.querySelector(".turbo-button").addEventListener("click", toggleTurboMode);
  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button,a")) playSfx("click");
  }, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.magicPreview.hidden) {
      closeMagicPreview();
      return;
    }
    if (!els.rewardPanel.hidden) return;
    if (!els.rerollConfirm.hidden) {
      els.rerollCancel.click();
      return;
    }
    if (!els.deckPanel.hidden) els.deckPanelClose.click();
    else if (!els.cardHelpPanel.hidden) els.cardHelpClose.click();
    else if (!els.historyPanel.hidden) els.historyClose.click();
    else if (!els.settingsSheet.hidden) els.closeSettings.click();
    else if (!els.tutorialOverlay.hidden) closeTutorial();
    else closeQuickMenu();
  });

  const refitViewport = () => { fitGameToViewport(); layoutBossSpine(); };
  window.addEventListener("resize", refitViewport);
  window.addEventListener("orientationchange", refitViewport);
  window.visualViewport?.addEventListener("resize", refitViewport);
  window.visualViewport?.addEventListener("scroll", refitViewport);

  fitGameToViewport();
  renderCardHelp();
  renderHistory();
  applyLocale(currentLocale);
  setAudioEnabled(audioEnabled, false);
  // 攻擊骨架先在可操作前進入快取，避免首次高牌型在冷載時被截斷或留下空等。
  loadSpineResource("attack").catch(() => {});
  spawnBoss();
  if (localStorage.getItem(TUTORIAL_SKIP_KEY) !== "1" && sessionStorage.getItem(TUTORIAL_SESSION_KEY) !== "1") {
    sessionStorage.setItem(TUTORIAL_SESSION_KEY, "1");
    setTimeout(() => openTutorial(0), 320);
  }
})();
