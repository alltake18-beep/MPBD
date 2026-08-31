(function initBossDuelPokerArrangementLab() {
  "use strict";

  const Core = window.BossDuelPokerArrangementLabCore;
  if (!Core) throw new Error("Boss Duel poker arrangement lab core is unavailable");

  const SUIT_PREFIX = Object.freeze({ S: "s", H: "h", D: "d", C: "f" });
  const PRESETS = Object.freeze([
    { id: "p01", label: "01 皇家同花順", cards: ["H10","H11","H12","H13","H14","C2"] },
    { id: "p02", label: "02 同花順", cards: ["H5","H6","H7","H8","H9","C2"] },
    { id: "p03", label: "03 四條", cards: ["C7","D7","H7","S7","C14","D2"] },
    { id: "p04", label: "04 聽雙頭同花順", cards: ["H5","H6","H7","H8","C14","D12"] },
    { id: "p05", label: "05 聽一同花順", cards: ["H5","H6","H8","H9","C14","D12"] },
    { id: "p06", label: "06 葫蘆", cards: ["C7","D7","H7","C9","D9","S13"] },
    { id: "p07", label: "07 同花", cards: ["H2","H5","H8","H11","H13","C3"] },
    { id: "p08", label: "08 順子", cards: ["C5","D6","H7","S8","C9","D14"] },
    { id: "p09", label: "09 三條", cards: ["C7","D7","H7","C2","D12","S13"] },
    { id: "p10", label: "10 四花缺一花", cards: ["H2","H5","H8","H11","C9","D13"] },
    { id: "p11", label: "11 兩對", cards: ["C7","D7","H9","S9","C2","D12"] },
    { id: "p12", label: "12 聽雙頭順", cards: ["C5","D6","H7","S8","C14","D12"] },
    { id: "p13", label: "13 三花缺二花", cards: ["H2","H8","H11","C4","D7","S13"] },
    { id: "p14", label: "14 缺一順", cards: ["C5","D6","H8","S9","C14","D12"] },
    { id: "p15", label: "15 一對", cards: ["C7","D7","H2","S5","C9","D12"] },
    { id: "p16", label: "16 二花缺三花", cards: ["H2","H9","S4","S12","D7","C13"] },
    { id: "p17", label: "17 三連順（手動只留前三張）", cards: ["C5","D6","H7","S2","C14","D12"], manualKeep: [0,1,2] },
    { id: "p18", label: "18 聽二順（手動只留前三張）", cards: ["C2","D4","H5","S8","C11","D13"], manualKeep: [0,1,2] },
    { id: "effect-four", label: "效果牌：四張核心暴擊優先", cards: ["C7","D7","H9","S9","C14","D13"], crit: 4, flat: 5 },
    { id: "effect-three", label: "效果牌：三張核心各留一張", cards: ["C7","D7","H7","S14","C13","D2"], crit: 3, flat: 4 },
    { id: "joker-best", label: "Joker：已有五張成牌仍必須參與", cards: ["H10","H11","H12","H13","H14","C2"], joker: 5 },
    { id: "replace-free", label: "替換：無效果同點數換花色", cards: ["H6","C5","S4","H3","C3","H4"], manualKeep: [0,1,2,3] },
    { id: "replace-effect", label: "替換：暴擊花色鎖定紅心", cards: ["H6","C5","S4","H3","C3","H4"], manualKeep: [0,1,2,3], crit: 0 }
  ]);

  const state = {
    hand: [],
    selectedIds: new Set(),
    currentPlan: null,
    mode: "auto",
    remainingDeck: [],
    lastRedraw: null,
    changeText: "載入手牌後依正式優先序建立建議。"
  };

  const dom = Object.fromEntries([
    "presetSelect", "jokerSlotSelect", "critSlotSelect", "flatSlotSelect", "loadPresetButton",
    "randomHandButton", "redrawButton", "validationError", "deckCount", "handCards", "liveHandTypeValue", "modeLabel",
    "priorityValue", "structureValue", "goalValue", "suitValue", "coreValue", "extraValue",
    "oldKeepValue", "replacementValue", "changeValue", "cardEditorBody", "applyEditorButton", "priorityList"
  ].map((id) => [id, document.getElementById(id)]));

  function parseCard(code, slot) {
    const suit = code.slice(0, 1);
    const rank = Number(code.slice(1));
    return Core.naturalCard(rank, suit, `${rank}${suit}`);
  }

  function cloneCard(card) {
    return {
      ...card,
      effects: { crit: Boolean(card.effects?.crit), flat: Boolean(card.effects?.flat) }
    };
  }

  function shuffle(items) {
    const output = items.slice();
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }

  function slotOptions(select, includeNone = true) {
    select.textContent = "";
    if (includeNone) select.append(new Option("無", "-1"));
    for (let index = 0; index < 6; index += 1) select.append(new Option(`第 ${index + 1} 張`, String(index)));
  }

  function buildControls() {
    for (const preset of PRESETS) dom.presetSelect.append(new Option(preset.label, preset.id));
    slotOptions(dom.jokerSlotSelect);
    slotOptions(dom.critSlotSelect);
    slotOptions(dom.flatSlotSelect);

    for (let index = 0; index < 6; index += 1) {
      const row = document.createElement("tr");
      const position = document.createElement("td");
      position.textContent = `第 ${index + 1} 張`;
      const suitCell = document.createElement("td");
      const rankCell = document.createElement("td");
      const effectCell = document.createElement("td");
      effectCell.className = "editor-effects";
      effectCell.dataset.editorEffect = String(index);

      const suit = document.createElement("select");
      suit.dataset.editorSuit = String(index);
      for (const suitCode of Core.SUITS) suit.append(new Option(Core.SUIT_LABELS[suitCode], suitCode));
      const rank = document.createElement("select");
      rank.dataset.editorRank = String(index);
      for (let value = 14; value >= 2; value -= 1) rank.append(new Option(Core.rankLabel(value), String(value)));
      suitCell.append(suit);
      rankCell.append(rank);
      row.append(position, suitCell, rankCell, effectCell);
      dom.cardEditorBody.append(row);
    }

    for (let priority = 1; priority < Core.PRIORITIES.length; priority += 1) {
      const item = document.createElement("li");
      item.dataset.priority = String(priority);
      item.textContent = Core.PRIORITIES[priority].label;
      dom.priorityList.append(item);
    }
  }

  function setError(message = "") {
    dom.validationError.hidden = !message;
    dom.validationError.textContent = message;
  }

  function currentSelectedCards() {
    return state.hand.filter((card) => state.selectedIds.has(Core.cardId(card)));
  }

  function arrangeCurrentHand() {
    state.hand = Core.arrangeHandForDisplay(state.hand, state.currentPlan, state.selectedIds);
  }

  function resetDeck() {
    const unavailable = new Set(state.hand.filter((card) => !card.joker).map(Core.cardId));
    state.remainingDeck = shuffle(Core.makeDeck().filter((card) => !unavailable.has(Core.cardId(card))));
  }

  function assignEffects(hand, critIndex, flatIndex) {
    return hand.map((card, index) => ({
      ...cloneCard(card),
      effects: {
        crit: index === critIndex,
        flat: index === flatIndex
      }
    }));
  }

  function applyAutomaticPlan(changeText) {
    state.currentPlan = Core.planHand(state.hand);
    state.selectedIds = new Set(state.currentPlan.keepCards.map(Core.cardId));
    arrangeCurrentHand();
    state.mode = "auto";
    state.lastRedraw = null;
    state.changeText = changeText || "系統依正式優先序建立初始保留建議。";
  }

  function loadPreset(id = dom.presetSelect.value) {
    const preset = PRESETS.find((row) => row.id === id) || PRESETS[0];
    dom.presetSelect.value = preset.id;
    let hand = preset.cards.map(parseCard);
    if (Number.isInteger(preset.joker)) hand[preset.joker] = Core.jokerCard(`JOKER-${preset.joker}`);
    hand = assignEffects(hand, Number.isInteger(preset.crit) ? preset.crit : -1, Number.isInteger(preset.flat) ? preset.flat : -1);
    const manualKeepIds = preset.manualKeep
      ? preset.manualKeep.map((index) => Core.cardId(hand[index]))
      : null;
    state.hand = hand;
    dom.jokerSlotSelect.value = Number.isInteger(preset.joker) ? String(preset.joker) : "-1";
    dom.critSlotSelect.value = Number.isInteger(preset.crit) ? String(preset.crit) : "-1";
    dom.flatSlotSelect.value = Number.isInteger(preset.flat) ? String(preset.flat) : "-1";
    resetDeck();
    applyAutomaticPlan();
    if (manualKeepIds) {
      state.selectedIds = new Set(manualKeepIds);
      state.currentPlan = Core.analyzeSelection(currentSelectedCards());
      arrangeCurrentHand();
      state.mode = "manual";
      state.changeText = `完整六張的自動目標不是第 ${preset.id.slice(1)}；玩家手動只留三張後才進入此級。`;
    }
    syncEditorsFromHand();
    setError();
    render();
  }

  function randomHand() {
    const hand = shuffle(Core.makeDeck()).slice(0, 6).map(cloneCard);
    state.hand = assignEffects(hand, -1, -1);
    dom.presetSelect.value = PRESETS[0].id;
    dom.jokerSlotSelect.value = "-1";
    dom.critSlotSelect.value = "-1";
    dom.flatSlotSelect.value = "-1";
    resetDeck();
    applyAutomaticPlan("已建立隨機六張手牌並重新提供系統建議。");
    syncEditorsFromHand();
    setError();
    render();
  }

  function syncEditorsFromHand() {
    let jokerIndex = -1;
    let critIndex = -1;
    let flatIndex = -1;
    state.hand.forEach((card, index) => {
      const suit = dom.cardEditorBody.querySelector(`[data-editor-suit="${index}"]`);
      const rank = dom.cardEditorBody.querySelector(`[data-editor-rank="${index}"]`);
      if (card.joker) {
        jokerIndex = index;
      } else {
        suit.value = card.suit;
        rank.value = String(card.rank);
      }
      if (Core.hasCrit(card)) critIndex = index;
      if (Core.hasFlat(card)) flatIndex = index;
    });
    dom.jokerSlotSelect.value = String(jokerIndex);
    dom.critSlotSelect.value = String(critIndex);
    dom.flatSlotSelect.value = String(flatIndex);
    updateEditorEffects();
  }

  function updateEditorEffects() {
    state.hand.forEach((card, index) => {
      const labels = [];
      if (card.joker) labels.push("Joker");
      if (Core.hasCrit(card)) labels.push("暴擊");
      if (Core.hasFlat(card)) labels.push("固傷");
      dom.cardEditorBody.querySelector(`[data-editor-effect="${index}"]`).textContent = labels.join("＋") || "—";
    });
  }

  function applyEditorValues() {
    const jokerIndex = Number(dom.jokerSlotSelect.value);
    const critIndex = Number(dom.critSlotSelect.value);
    const flatIndex = Number(dom.flatSlotSelect.value);
    const hand = [];
    const naturalIds = new Set();
    for (let index = 0; index < 6; index += 1) {
      let card;
      if (index === jokerIndex) {
        card = Core.jokerCard(`JOKER-${index}`);
      } else {
        const suit = dom.cardEditorBody.querySelector(`[data-editor-suit="${index}"]`).value;
        const rank = Number(dom.cardEditorBody.querySelector(`[data-editor-rank="${index}"]`).value);
        card = Core.naturalCard(rank, suit, `${rank}${suit}`);
        if (naturalIds.has(Core.cardId(card))) {
          setError(`第 ${index + 1} 張與前方牌重複；同一副牌不能出現兩張 ${Core.cardLabel(card)}。`);
          return;
        }
        naturalIds.add(Core.cardId(card));
      }
      hand.push(card);
    }
    state.hand = assignEffects(hand, critIndex, flatIndex);
    resetDeck();
    applyAutomaticPlan("指定牌面或效果已變更，系統重新建立初始建議。");
    syncEditorsFromHand();
    setError();
    updateEditorEffects();
    render();
  }

  function cardArtPath(card) {
    if (card.joker) return null;
    const rank = card.rank === 14 ? 1 : card.rank;
    return `assets/mobile/cards/${SUIT_PREFIX[card.suit]}${rank}.png`;
  }

  function cardMarkup(card) {
    if (card.joker) {
      return `<span class="joker-art"><img src="assets/mobile/joker-card/face.png" alt=""><img src="assets/mobile/joker-card/title.png" alt="JOKER"></span>`;
    }
    return `<img class="card-art" src="${cardArtPath(card)}" alt="">`;
  }

  function toggleCard(card) {
    const id = Core.cardId(card);
    const before = state.currentPlan;
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      if (state.selectedIds.size >= 5) {
        setError("最多只能保留五張；請先取消一張再加入。");
        return;
      }
      state.selectedIds.add(id);
    }
    setError();
    state.currentPlan = Core.analyzeSelection(currentSelectedCards());
    state.mode = "manual";
    state.lastRedraw = null;
    const beforeText = before?.priority ? `#${before.priority} ${before.label}` : before?.label || "無核心";
    const afterText = state.currentPlan.priority ? `#${state.currentPlan.priority} ${state.currentPlan.label}` : state.currentPlan.label;
    state.changeText = beforeText === afterText
      ? `${afterText} 核心維持；玩家的額外保留受到保護，系統不會在本次換牌前勾回已取消的牌。`
      : `${beforeText} → ${afterText}；保留集合形成更高優先結構後立即改用新目標。`;
    syncEditorsFromHand();
    render();
  }

  function redraw() {
    const oldKeep = currentSelectedCards();
    const need = 6 - oldKeep.length;
    if (state.remainingDeck.length < need) resetDeck();
    const drawn = state.remainingDeck.splice(0, need).map((card) => ({ ...cloneCard(card), effects: { crit: false, flat: false } }));
    let drawIndex = 0;
    const oldSelected = new Set(oldKeep.map(Core.cardId));
    const newHand = state.hand.map((card) => oldSelected.has(Core.cardId(card)) ? card : drawn[drawIndex++]);
    const before = state.currentPlan;
    const reconciled = Core.reconcileAfterRedraw(newHand, oldKeep);
    state.hand = newHand;
    state.selectedIds = new Set(reconciled.keepCards.map(Core.cardId));
    state.currentPlan = reconciled.plan;
    state.mode = "redraw";
    state.lastRedraw = reconciled;
    const beforeText = before?.priority ? `#${before.priority} ${before.label}` : before?.label || "無核心";
    const afterText = state.currentPlan.priority ? `#${state.currentPlan.priority} ${state.currentPlan.label}` : state.currentPlan.label;
    if (beforeText !== afterText) {
      state.changeText = `${beforeText} → ${afterText}；舊保留仍保留，新增或合法替換後形成新目標。`;
    } else {
      state.changeText = `${afterText} 維持；舊保留未被系統直接取消。`;
    }
    arrangeCurrentHand();
    syncEditorsFromHand();
    setError();
    render();
  }

  function formatCards(cards) {
    if (!cards?.length) return "—";
    return cards.map((card) => {
      const effect = Core.effectLabel(card);
      return `${Core.cardLabel(card)}${effect ? `［${effect}］` : ""}`;
    }).join("、");
  }

  function renderCards() {
    const coreIds = new Set(state.currentPlan.coreCards.map(Core.cardId));
    const selectedIds = state.selectedIds;
    dom.handCards.textContent = "";
    state.hand.forEach((card, index) => {
      const selected = selectedIds.has(Core.cardId(card));
      const isCore = selected && coreIds.has(Core.cardId(card));
      const status = isCore ? "核心" : selected ? "額外" : "更換";
      const button = document.createElement("button");
      button.type = "button";
      button.className = `playing-card-button ${isCore ? "is-core" : selected ? "is-extra" : "is-loose"}`;
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", `第 ${index + 1} 張 ${Core.cardLabel(card)}，${status}${Core.effectLabel(card) ? `，${Core.effectLabel(card)}` : ""}`);
      button.innerHTML = `${cardMarkup(card)}<span class="card-state">${status}</span>${Core.hasCrit(card) ? '<span class="effect-badge crit">暴擊</span>' : ""}${Core.hasFlat(card) ? '<span class="effect-badge flat">固傷</span>' : ""}`;
      button.addEventListener("click", () => toggleCard(card));
      dom.handCards.append(button);
    });
  }

  function renderAudit() {
    const plan = state.currentPlan;
    dom.liveHandTypeValue.textContent = plan.priority ? `#${String(plan.priority).padStart(2, "0")} ${plan.label}` : plan.label;
    dom.priorityValue.textContent = plan.priority ? `#${plan.priority}` : "—";
    dom.structureValue.textContent = plan.label;
    const completions = plan.completionRanks?.length
      ? `（可補 ${plan.completionRanks.map(Core.rankLabel).join("／")}）`
      : "";
    dom.goalValue.textContent = `${plan.goal}${completions}`;
    dom.suitValue.textContent = plan.targetSuit ? Core.SUIT_LABELS[plan.targetSuit] : "不鎖花色";
    dom.coreValue.textContent = formatCards(plan.coreCards);
    dom.extraValue.textContent = formatCards(plan.extraCards);
    dom.modeLabel.textContent = state.mode === "manual" ? "玩家手動保留" : state.mode === "redraw" ? "REDRAW 後重新建議" : "系統自動建議";
    dom.changeValue.textContent = state.changeText;

    if (state.lastRedraw) {
      dom.oldKeepValue.textContent = formatCards(state.lastRedraw.oldKeepCards);
      const legal = state.lastRedraw.legalReplacements;
      const appliedIds = new Set(state.lastRedraw.appliedReplacements.map((row) => `${Core.cardId(row.from)}>${Core.cardId(row.to)}`));
      dom.replacementValue.textContent = legal.length
        ? legal.map((row) => `${Core.cardLabel(row.from)} → ${Core.cardLabel(row.to)}（${row.reason}${appliedIds.has(`${Core.cardId(row.from)}>${Core.cardId(row.to)}`) ? "，已採用" : ""}）`).join("；")
        : "本次沒有符合規格的同點數換花色";
    } else {
      dom.oldKeepValue.textContent = "尚未 REDRAW";
      dom.replacementValue.textContent = "尚未 REDRAW";
    }

    dom.priorityList.querySelectorAll("li").forEach((item) => {
      item.classList.toggle("is-current", Number(item.dataset.priority) === plan.priority);
    });
  }

  function render() {
    renderCards();
    renderAudit();
    dom.deckCount.textContent = `牌堆 ${state.remainingDeck.length} / 52`;
    dom.redrawButton.disabled = state.selectedIds.size > 5;
    updateEditorEffects();
  }

  buildControls();
  dom.loadPresetButton.addEventListener("click", () => loadPreset());
  dom.randomHandButton.addEventListener("click", randomHand);
  dom.redrawButton.addEventListener("click", redraw);
  dom.applyEditorButton.addEventListener("click", applyEditorValues);
  dom.jokerSlotSelect.addEventListener("change", applyEditorValues);
  dom.critSlotSelect.addEventListener("change", applyEditorValues);
  dom.flatSlotSelect.addEventListener("change", applyEditorValues);
  loadPreset(PRESETS[0].id);
})();
