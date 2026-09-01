"use strict";

(function actionTreeLab() {
  const Core = window.BossDuelActionTreeCore;
  if (!Core) throw new Error("自然故事核心未載入。");

  const $ = (id) => document.getElementById(id);
  const treeKeys = Core.TREE_KEYS;
  const treeLabels = Core.TREE_LABELS;
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  let reportDigits = 2;
  const pct = (value, digits = reportDigits) => `${number(value).toFixed(digits)}%`;
  const x = (value, digits = reportDigits) => `${number(value).toLocaleString("zh-Hant", { minimumFractionDigits: digits, maximumFractionDigits: digits })}x`;
  const count = (value) => Math.round(number(value)).toLocaleString("zh-Hant");
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  const signedX = (value, digits = 3) => `${number(value) > 0 ? "+" : ""}${x(value, digits)}`;

  let config = Core.sanitizeConfig(Core.DEFAULT_CONFIG);
  try {
    const storedSuppression = JSON.parse(localStorage.getItem(Core.NaturalCore.SUPPRESSION_STORAGE_KEY) || "null");
    if (storedSuppression) config.suppression = Core.NaturalCore.normalizeSuppressionPolicy(storedSuppression);
  } catch (_error) {
    config.suppression = Core.NaturalCore.normalizeSuppressionPolicy(config.suppression);
  }
  config.modelId = "natural-story-v4-full-class-ticket";
  config.versions.storyPool = "natural-240000-boss-plan-v10-score-ticket";
  let design = null;
  let storyPoolCells = [];
  let catalogPool = null;
  let simulationResult = null;
  let simulationHash = "";
  let dirty = false;
  let mechanicsDirty = false;

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  function hashValue(value) {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `AT-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
  }

  function currentHash() { return hashValue({ config, storyPoolCells }); }

  function field(id, value) {
    const element = $(id);
    if (element) element.value = value ?? "";
  }

  function checked(id, value) {
    const element = $(id);
    if (element) element.checked = Boolean(value);
  }

  function syncStoryExperienceIndexOptions() {
    const select = $("storyExperienceIndex");
    if (!select) return;
    const star = Number($("storyExperienceStar")?.value || 1);
    const classKey = $("storyExperienceClass")?.value || "win";
    const total = catalogPool?.naturalCells?.[star]?.[classKey]?.length ?? 0;
    if (total === 0) {
      select.innerHTML = '<option value="-1">此分類 0 局</option>';
      select.value = "-1";
      select.disabled = true;
      return;
    }
    select.disabled = false;
    const previous = Math.min(Math.max(0, Math.round(number(select.value, 0))), total - 1);
    select.innerHTML = Array.from({ length: total }, (_, index) => `<option value="${index}">#${index + 1}</option>`).join("");
    select.value = String(previous);
  }

  function renderClassificationRule() {
    const win = number(config.storyPool.winMinReturnX, 3);
    const push = number(config.storyPool.pushMinReturnX, 1);
    if ($("winClassificationRule")) $("winClassificationRule").textContent = `贏多：總派彩 ÷ 總押 ≥ ${win}x`;
    if ($("pushClassificationRule")) $("pushClassificationRule").textContent = `贏少：${push}x ≤ 總派彩 ÷ 總押 < ${win}x`;
    if ($("loseClassificationRule")) $("loseClassificationRule").textContent = `輸：總派彩 ÷ 總押 < ${push}x`;
  }

  function hydrateFixedControls() {
    field("targetCoreRtp", config.targetCoreRtpPct);
    field("tolerancePp", config.tolerancePp);
    field("winMinReturnX", config.storyPool.winMinReturnX);
    field("pushMinReturnX", config.storyPool.pushMinReturnX);
    field("candidateDrawMode", "FULL_CLASS_UNIFORM");
    field("ticketBasis", config.storyPool.ticketBasis);
    field("maxCandidateAttempts", config.storyPool.maxCandidateAttempts);
    renderClassificationRule();
    syncStoryExperienceIndexOptions();
    checked("storyCarryEnabled", config.carry.enabled);
    field("correctionBothWays", String(config.carry.correctionBothWays));
    field("baselineRecognitionMode", config.carry.baselineRecognitionMode);
    field("deviationBandPct", config.carry.deviationBandPctOfPlannedSpend);
    field("maxDeductionPct", config.carry.maxDeductionPctOfGross);
    field("maxDeductionX", config.carry.maxDeductionX);
    field("minNetPct", config.carry.minGuaranteedNetPctOfGross);
    field("maxCreditPct", config.carry.maxCreditPctOfGross);
    field("maxCreditX", config.carry.maxCreditX);
    field("rewardFloorPct", config.carry.rewardFloorPct);
    field("rewardCeilingMultiple", config.carry.rewardCeilingMultiple);
    field("disconnectMode", config.carry.disconnectMode);
    checked("termExplicitAbandon", config.carry.eligibleTermination.explicitAbandon);
    checked("termBossReroll", config.carry.eligibleTermination.bossReroll);
    checked("termBetSwitch", config.carry.eligibleTermination.betSwitch);
    checked("termRoundExhausted", config.carry.eligibleTermination.roundExhausted);
    renderNaturalMetrics();
  }

  function readFixedControls() {
    config.targetCoreRtpPct = number($("targetCoreRtp").value, 96);
    config.tolerancePp = number($("tolerancePp").value, 0.01);
    config.storyPool.winMinReturnX = number($("winMinReturnX").value, 3);
    config.storyPool.pushMinReturnX = number($("pushMinReturnX").value, 1);
    config.storyPool.candidateDrawMode = "FULL_CLASS_UNIFORM";
    config.storyPool.ticketBasis = number($("ticketBasis").value, 1000000);
    config.storyPool.maxCandidateAttempts = number($("maxCandidateAttempts").value, 10000);
    config.ticketMode = "DYNAMIC";
    config.seedMode = "FIXED";
    const seedText = $("seed").value.trim();
    if (seedText !== "") config.seed = Math.round(number(seedText, config.seed));
    config.carry.enabled = $("storyCarryEnabled").checked;
    config.mechanics.storyCarryEnabled = config.carry.enabled;
    config.carry.correctionBothWays = $("correctionBothWays").value === "true";
    config.carry.baselineRecognitionMode = $("baselineRecognitionMode").value;
    config.carry.deviationBandPctOfPlannedSpend = number($("deviationBandPct").value, 0);
    config.carry.maxDeductionPctOfGross = number($("maxDeductionPct").value, 50);
    config.carry.maxDeductionX = number($("maxDeductionX").value, 100);
    config.carry.minGuaranteedNetPctOfGross = number($("minNetPct").value, 50);
    config.carry.maxCreditPctOfGross = number($("maxCreditPct").value, 50);
    config.carry.rewardCorrectionPct = Math.min(config.carry.maxDeductionPctOfGross, config.carry.maxCreditPctOfGross);
    config.carry.maxCreditX = number($("maxCreditX").value, 100);
    config.carry.rewardFloorPct = number($("rewardFloorPct").value, 10);
    config.carry.rewardCeilingMultiple = number($("rewardCeilingMultiple").value, 10);
    config.carry.disconnectMode = $("disconnectMode").value;
    config.carry.eligibleTermination.explicitAbandon = $("termExplicitAbandon").checked;
    config.carry.eligibleTermination.bossReroll = $("termBossReroll").checked;
    config.carry.eligibleTermination.betSwitch = $("termBetSwitch").checked;
    config.carry.eligibleTermination.roundExhausted = $("termRoundExhausted").checked;
    config = Core.sanitizeConfig(config);
    field("winMinReturnX", config.storyPool.winMinReturnX);
    field("pushMinReturnX", config.storyPool.pushMinReturnX);
    field("candidateDrawMode", "FULL_CLASS_UNIFORM");
    field("ticketBasis", config.storyPool.ticketBasis);
    field("maxCandidateAttempts", config.storyPool.maxCandidateAttempts);
    renderClassificationRule();
  }

  function randomSimulationSeed() {
    return typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 4294967296);
  }

  function renderTreeMatrix() {
    const tbody = $("actionTreeMatrixBody");
    tbody.innerHTML = config.stars.map((star) => {
      const poolReady = storyPoolCells.filter((cell) => cell.star === star.star).length === 3;
      const starCells = storyPoolCells.filter((cell) => cell.star === star.star);
      const byTree = Object.fromEntries(starCells.map((cell) => [cell.tree, cell]));
      const status = poolReady ? "240,000 正式故事已建" : "等待產生";
      return `<tr data-star="${star.star}">
        <th scope="row">${star.star}★</th>
        <td><input data-tree-field="bossTickets" type="number" min="0" step="1" value="${star.bossTickets}"></td>
        <td>${starCells.reduce((sum, cell) => sum + number(cell.naturalCount), 0) || config.storyPool.storiesPerStar}</td>
        ${treeKeys.map((key) => `<td class="tree-${key}">${byTree[key]?.naturalCount ?? "—"}</td>`).join("")}
        <td>每 BOSS 動態</td>
        <td>${poolReady && starCells.every((cell) => cell.replayVerified) ? "已驗證" : "待驗證"}</td>
        <td><span class="status ${poolReady ? "valid" : "warn"}">${status}</span></td>
      </tr>`;
    }).join("");
  }

  function renderNaturalClassAverages() {
    const body = $("naturalClassAverageBody");
    const statsBody = $("naturalClassStatsBody");
    if (!body || !statsBody) return;
    if (!catalogPool) {
      body.innerHTML = Array.from({ length: 8 }, (_, index) => `<tr><th>${index + 1}★</th><td>—</td><td>—</td><td>—</td></tr>`).join("");
      statsBody.innerHTML = Array.from({ length: 8 }, (_, index) => treeKeys.map((classKey) => `<tr><th>${index + 1}★</th><td>${esc(treeLabels[classKey])}</td>${Array.from({ length: 23 }, () => "<td>—</td>").join("")}</tr>`).join("")).join("");
      return;
    }
    const averageCell = (rows) => rows.length ? x(rows.reduce((sum, story) => sum + story.returnX, 0) / rows.length) : "—";
    body.innerHTML = Array.from({ length: 8 }, (_, index) => {
      const star = index + 1;
      const cells = catalogPool.naturalCells[star];
      return `<tr><th>${star}★</th><td>${averageCell(cells.win)}</td><td>${averageCell(cells.push)}</td><td>${averageCell(cells.lose)}</td></tr>`;
    }).join("");
    const mean = (rows, getter) => rows.reduce((sum, story) => sum + getter(story), 0) / Math.max(rows.length, 1);
    statsBody.innerHTML = Array.from({ length: 8 }, (_, index) => {
      const star = index + 1;
      return treeKeys.map((classKey) => {
        const rows = catalogPool.naturalCells[star][classKey];
        if (!rows.length) return `<tr><th>${star}★</th><td>${esc(treeLabels[classKey])}</td>${Array.from({ length: 23 }, () => "<td>—</td>").join("")}</tr>`;
        const kills = rows.filter((story) => story.killed).length;
        const spend = rows.reduce((sum, story) => sum + story.spendX, 0);
        const payout = rows.reduce((sum, story) => sum + story.payoutX, 0);
        return `<tr><th>${star}★</th><td>${esc(treeLabels[classKey])}</td><td>${count(rows.length)}</td><td>${pct(kills / rows.length * 100)}</td><td>${pct((rows.length - kills) / rows.length * 100)}</td><td>${pct(payout / Math.max(spend, 1e-12) * 100)}</td><td>${x(mean(rows, (story) => story.spendX))}</td><td>${x(mean(rows, (story) => story.payoutX))}</td><td>${x(mean(rows, (story) => story.returnX))}</td><td>${signedX(mean(rows, (story) => story.netX))}</td><td>${x(mean(rows, (story) => story.payoutParts.boss))}</td><td>${x(mean(rows, (story) => story.payoutParts.hand))}</td><td>${x(mean(rows, (story) => story.payoutParts.coin))}</td><td>${mean(rows, (story) => story.hp).toFixed(2)}</td><td>${mean(rows, (story) => story.hpLeft).toFixed(2)}</td><td>${mean(rows, (story) => story.rounds).toFixed(2)}</td><td>${mean(rows, (story) => story.actions.totalDraws).toFixed(2)}</td><td>${mean(rows, (story) => story.actions.paidDraws).toFixed(2)}</td><td>${mean(rows, (story) => story.actions.freeDraws).toFixed(2)}</td><td>${mean(rows, (story) => story.totalDamage).toFixed(2)}</td><td>${mean(rows, (story) => story.actions.fights).toFixed(2)}</td><td>${mean(rows, (story) => story.actions.folds).toFixed(2)}</td><td>${mean(rows, (story) => story.actions.playerRoundWins).toFixed(2)}</td><td>${mean(rows, (story) => story.actions.playerRoundLosses).toFixed(2)}</td><td>${mean(rows, (story) => story.actions.ties).toFixed(2)}</td></tr>`;
      }).join("");
    }).join("");
  }

  function readTreeMatrix() {
    document.querySelectorAll("#actionTreeMatrixBody tr[data-star]").forEach((row) => {
      const star = config.stars.find((item) => item.star === Number(row.dataset.star));
      if (!star) return;
      const get = (name) => row.querySelector(`[data-tree-field="${name}"]`);
      star.bossTickets = Math.round(number(get("bossTickets")?.value, star.bossTickets));
      if (config.bossRows[star.star - 1]) config.bossRows[star.star - 1][5] = star.bossTickets;
    });
  }

  function designChecks() {
    const issues = [];
    if (config.storyPool.storiesPerClass !== 10000 || config.storyPool.storiesPerStar !== 30000) issues.push("遊戲故事池每星三分類必須各 10,000 局");
    if (!(config.storyPool.winMinReturnX > config.storyPool.pushMinReturnX)) issues.push("贏多門檻必須大於贏少門檻");
    if (config.handRows.find((row) => row[0] === "straightFlush")?.[4] !== 30) issues.push("同花順正式傷害必須為 30");
    return { pass: issues.length === 0, issues };
  }

  function carryChecks() {
    const c = config.carry;
    const issues = [];
    if (!c.enabled) issues.push("個人劇本水池未啟用");
    if (!c.correctionBothWays) issues.push("個人劇本水池必須正負雙向補正");
    if (c.rewardFloorPct !== 10) issues.push("逐利玩家 BOSS 原骰獎最低必須為原獎 10%");
    if (c.rewardCeilingMultiple !== 10) issues.push("逐利玩家 BOSS 原骰獎最高必須為原獎 10 倍（1,000%）");
    return { pass: issues.length === 0, issues };
  }

  function naturalChecks() {
    if (storyPoolCells.length !== 24) return { pass: false, pending: true, issues: ["尚未建立 8 星 × 3 分類的故事目錄"] };
    const issues = [];
    storyPoolCells.forEach((cell) => {
      const label = `${cell.star}星${treeLabels[cell.tree] || cell.tree}`;
      if (!cell.replayVerified) issues.push(`${label}尚未完成合法重播`);
      if (cell.naturalCount !== config.storyPool.storiesPerClass) issues.push(`${label}不是 ${config.storyPool.storiesPerClass} 局`);
    });
    for (let star = 1; star <= 8; star += 1) {
      const total = storyPoolCells.filter((cell) => cell.star === star).reduce((sum, cell) => sum + cell.naturalCount, 0);
      if (total !== config.storyPool.storiesPerStar) issues.push(`${star}星實跑故事不是 ${config.storyPool.storiesPerStar} 局`);
    }
    return { pass: issues.length === 0, pending: false, issues };
  }

  function simulationChecks() {
    if (!simulationResult || simulationHash !== currentHash()) return { pass: false, pending: true, issues: ["目前參數尚未完成模擬"] };
    const error = Math.abs(simulationResult.totals.telescopeErrorX);
    const issues = [];
    if (error > 1e-7) issues.push(`個人劇本水池守恆誤差 ${error}`);
    if (!Number.isFinite(simulationResult.totals.grossRtpPct)) issues.push("毛 RTP 無法計算");
    if (!Number.isFinite(simulationResult.totals.netRtpPct)) issues.push("淨 RTP 無法計算");
    if (simulationResult.totals.ticketErrorPpMax > config.tolerancePp) issues.push(`逐 BOSS 三候選配籤誤差 ${simulationResult.totals.ticketErrorPpMax.toFixed(9)}pp 超標`);
    return { pass: issues.length === 0, pending: false, issues };
  }

  function renderSummary() {
    const naturalState = naturalChecks();
    const poolReady = naturalState.pass;
    const simulationReady = Boolean(simulationResult && simulationHash === currentHash());
    $("overallGrossRtp").textContent = simulationReady ? pct(simulationResult.totals.grossRtpPct, 4) : "待模擬";
    $("grossRtpDelta").textContent = simulationReady ? `目標 ${pct(config.targetCoreRtpPct, 3)}` : "先建池，再執行逐 BOSS 動態配籤";
    $("maxStarError").textContent = simulationReady ? `${number(simulationResult.totals.ticketErrorPpMax).toFixed(9)}pp` : "待模擬";
    $("rtpSwingState").textContent = simulationReady ? "自然結果已結算" : "等待動態模擬";
    $("rtpSwingNote").textContent = "抽劇本與每筆花費入池共用目標 RTP；三桶只在擊殺後以合法骰面補正";
    setState("pushFloorState", poolReady, poolReady ? "正式故事 240,000" : "待建池");
    $("ticketState").textContent = simulationReady ? "逐 BOSS 已求解" : poolReady ? "可執行" : "等待故事";
    $("ticketState").className = simulationReady ? "valid" : "warn";
    $("naturalGateState").textContent = naturalState.pending ? "待驗證" : naturalState.pass ? "通過" : "阻擋";
    $("naturalGateState").className = naturalState.pending ? "warn" : naturalState.pass ? "valid" : "error";
    $("publishState").textContent = poolReady ? "可體驗" : "等待故事";
    $("publishState").className = poolReady ? "valid" : "warn";
    $("validationState").textContent = simulationReady ? "三分類全池抽取／分數配籤已執行" : poolReady ? "正式故事目錄完成" : naturalState.pending ? "等待 240,000 個正式故事" : "故事目錄阻擋";
    $("validationState").className = poolReady ? "valid" : "warn";
    $("validationMessage").textContent = simulationReady
      ? `已從贏多、贏少、輸三個完整分類各等機率抽一個自然故事，再配成 ${pct(config.targetCoreRtpPct, 3)}；每筆花費也按同一 RTP 比例加入個人劇本水池。`
      : poolReady
        ? "240,000 個正式故事已完成 24 個星級 × 結果分類資料格的數量、自然分類與重播契約驗證；可繼續執行三分類全池抽取與分數配籤模擬。"
      : naturalState.issues.slice(0, 4).join("；");
  }

  function setState(id, pass, text) {
    const element = $(id);
    element.textContent = text;
    element.className = pass ? "valid" : "error";
  }

  function updateExample() {
    const actualSpend = Math.max(0, number($("exampleBaselineSpend").value));
    const organicPayout = Math.max(0, number($("exampleActualSpend").value));
    const before = number($("examplePoolBefore").value);
    const originalBossReward = Math.max(0, number($("exampleGrossReward").value));
    const targetAccrual = actualSpend * config.targetCoreRtpPct / 100;
    const preCorrectionPool = before + targetAccrual - organicPayout;
    const increaseLimit = originalBossReward * (config.carry.rewardCeilingMultiple - 1);
    const decreaseLimit = originalBossReward * (1 - config.carry.rewardFloorPct / 100);
    const correctionLimit = preCorrectionPool >= 0 ? increaseLimit : decreaseLimit;
    const theoreticalOffset = Math.sign(preCorrectionPool) * Math.min(Math.abs(preCorrectionPool), correctionLimit);
    const finalPayout = organicPayout + theoreticalOffset;
    const after = preCorrectionPool - theoreticalOffset;
    $("exampleSpendDelta").textContent = signedX(targetAccrual);
    $("exampleRawPool").textContent = signedX(preCorrectionPool);
    $("exampleOffset").textContent = theoreticalOffset >= 0 ? `最多補正 ${signedX(theoreticalOffset)}` : `最多扣抵 ${signedX(theoreticalOffset)}`;
    $("exampleOffset").title = "本列先顯示上下界內的理論值；正式結算還必須選同骰型可實際骰出的合法結果。";
    const offset = theoreticalOffset;
    $("exampleOffset").className = offset > 0 ? "positive" : offset < 0 ? "negative" : "";
    $("exampleNetReward").textContent = x(finalPayout);
    $("examplePoolAfter").textContent = signedX(after);
  }

  function renderNaturalMetrics() {
    const state = naturalChecks();
    const status = $("naturalStatus");
    status.className = `pending-box ${state.pending ? "warn" : state.pass ? "valid" : "error"}`;
    status.innerHTML = `<strong>${state.pending ? "等待驗證" : state.pass ? "故事池驗證完成" : "故事池驗證失敗"}</strong><span>${state.pending ? "按「開始模擬」後自動檢查 24 個結果資料格各 10,000 局、分類與重播契約。" : state.pass ? "8 星的贏多、贏少、輸各 10,000 局，全部具備種子與版本化操作重播契約。" : state.issues.slice(0, 4).join("；")}</span>`;
  }

  const switchLabels = {
    actionTreeEnabled: "自然故事池／三候選", magicEnabled: "魔法卡", jokerEnabled: "Joker",
    freeDrawEnabled: "免費換牌", coinEnabled: "金幣卡", critEnabled: "暴擊卡", flatEnabled: "固傷卡",
    pokerBoostEnabled: "牌型傷害卡", bossRerollEnabled: "REROLL BOSS",
    paidDrawEnabled: "付費 REDRAW", tieRedealEnabled: "完全平手免費重發"
  };

  function buildMechanics() {
    $("switchGrid").innerHTML = Object.entries(switchLabels).map(([key, label]) => `<div class="switch-row"><strong>${label}</strong><label class="switch" aria-label="${label}"><input data-mechanic-switch="${key}" type="checkbox" ${config.mechanics[key] ? "checked" : ""}><span></span></label></div>`).join("");
    const simulationInput = (key, label, step) => `<label>${label}<input data-simulation-field="${key}" type="number" step="${step}" value="${config.simulation[key]}"></label>`;
    const betMode = `<label>Bet 模式<select data-simulation-field="betMode"><option value="FIXED"${config.simulation.betMode === "FIXED" ? " selected" : ""}>固定 Bet</option><option value="RANDOM_B1"${config.simulation.betMode === "RANDOM_B1" ? " selected" : ""}>第一組 Bet 隨機</option><option value="RANDOM_ALL"${config.simulation.betMode === "RANDOM_ALL" ? " selected" : ""}>全部 Bet 隨機</option><option value="SCHEDULED"${config.simulation.betMode === "SCHEDULED" ? " selected" : ""}>排程 Bet</option></select></label>`;
    const playerBehaviorOptions = [
      ["SMART", "逐利玩家（真實劇情／含理牌）"],
      ["OFFICIAL_FUNDED", "聰明玩家（官方策略）"],
      ["FREE_RIDE", "白嫖玩家"],
      ["EXTREME", "極端玩家"]
    ];
    const playerBehavior = `<label>玩家行為<select data-simulation-field="playerBehavior">${playerBehaviorOptions.map(([value, label]) => `<option value="${value}"${config.simulation.playerBehavior === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
    $("simulationGrid").innerHTML = `
      <section class="param-group">
        <h3>模擬規模</h3>
        <div class="field-list">
          ${simulationInput("playerCount", "玩家數", 1)}
          ${simulationInput("bossesPerPlayer", "每位玩家 Boss 數", 1)}
          ${simulationInput("roundSlice", "RTP 切片 Boss 數", 1)}
        </div>
      </section>
      <section class="param-group">
        <h3>玩家與 Bet</h3>
        <div class="field-list">
          ${playerBehavior}
          ${betMode}
          ${simulationInput("fixedBet", "固定 Bet", 0.01)}
          ${simulationInput("earlyTerminationPct", "三玩家統計提前離開率（%）", 0.1)}
        </div>
      </section>
      <details class="nested-param-card simulation-advanced" open>
        <summary>退幣統計設定</summary>
        <section class="param-group">
          <h3>退幣條件（退幣率是跑完後的結果）</h3>
          <div class="field-list">
            ${simulationInput("cashoutPlayerCount", "獨立玩家數", 1)}
            ${simulationInput("cashoutStartX", "起始資產（x）", 0.1)}
            ${simulationInput("cashoutTargetX", "退幣目標（x）", 0.1)}
          </div>
        </section>
      </details>
      <details class="nested-param-card simulation-advanced" open>
        <summary>波動與報表設定</summary>
        <section class="param-group">
          <h3>波動與報表</h3>
          <div class="field-list">
            ${simulationInput("decimalPlaces", "報表小數位", 1)}
            ${simulationInput("rtpTolerancePp", "RTP 容許差（pp）", 0.01)}
            ${simulationInput("poolTailTolerancePp", "池尾差容許（pp）", 0.01)}
          </div>
        </section>
      </details>`;
    $("bossTableBody").innerHTML = config.bossRows.map((row, rowIndex) => {
      const multiplierDice = number(row[9]) > 0 ? 3 : number(row[8]) > 0 ? 2 : number(row[7]) > 0 ? 1 : 0;
      const theoreticalMax = 18 * Math.pow(6, multiplierDice);
      return `<tr>${row.map((value, columnIndex) => `<td><input data-boss-row="${rowIndex}" data-column="${columnIndex}" type="number" step="${columnIndex === 0 || columnIndex === 5 ? 1 : 0.01}" value="${value}" ${columnIndex === 0 ? "readonly" : ""}></td>`).join("")}<td><output>${count(theoreticalMax)}x</output></td></tr>`;
    }).join("");
    $("magicTableBody").innerHTML = config.magicRows.map((row, rowIndex) => `<tr>${row.map((value, columnIndex) => `<td>${columnIndex === 7 ? `<label class="switch compact-switch" aria-label="${esc(row[1])}啟用"><input data-magic-row="${rowIndex}" data-column="${columnIndex}" type="checkbox" ${value ? "checked" : ""}><span></span></label>` : columnIndex === 0 || columnIndex === 1 || columnIndex === 6 ? `<input data-magic-row="${rowIndex}" data-column="${columnIndex}" type="text" value="${esc(value)}" ${columnIndex === 0 ? "readonly" : ""}>` : `<input data-magic-row="${rowIndex}" data-column="${columnIndex}" type="number" step="0.01" value="${value}">`}</td>`).join("")}</tr>`).join("");
    $("handTableBody").innerHTML = config.handRows.map((row, rowIndex) => `<tr>${[0, 1, 4].map((columnIndex) => `<td><input data-hand-row="${rowIndex}" data-column="${columnIndex}" type="${columnIndex < 2 ? "text" : "number"}" step="1" value="${esc(row[columnIndex])}" ${columnIndex === 0 ? "readonly" : ""}></td>`).join("")}</tr>`).join("");
    $("drawFeeGrid").innerHTML = config.drawFeesX.map((value, index) => `<label>第 ${index + 1} 次<input data-draw-fee="${index}" type="number" min="0" step="0.01" value="${value}"></label>`).join("");
    $("naturalDealGrid").innerHTML = [
      ["refreshCostX", "REROLL BOSS 費用（x）", 0.1],
      ["deckStopCount", "牌堆停止張數", 1],
      ["playerBadHighRerollPct", "玩家爛高牌重抽率（%）", 0.1],
      ["bossBadHighRerollPct", "Boss 爛高牌重抽率（%）", 0.1],
      ["initialRerollLimit", "起手重抽上限", 1],
      ["magicCardsPerRound", "每回合魔法卡張數", 1]
    ].map(([key, label, step]) => `<label>${label}<input data-rule-field="${key}" type="number" min="0" step="${step}" value="${config.ruleSettings[key]}"></label>`).join("");
    const suppressionSwitch = (path, label, value) => `<div class="switch-row"><strong>${label}</strong><label class="switch" aria-label="${label}"><input data-suppression-path="${path}" type="checkbox" ${value ? "checked" : ""}><span></span></label></div>`;
    const suppressionNumber = (path, label, value, step = 1) => `<label>${label}<input data-suppression-path="${path}" type="number" min="0" step="${step}" value="${value}"></label>`;
    const suppression = config.suppression;
    $("suppressionActivationGrid").innerHTML = [
      suppressionSwitch("enabled", "抑制總開關", suppression.enabled),
      suppressionSwitch("activation.enabled", "偏離觸發開關", suppression.activation.enabled),
      suppressionSwitch("activation.requireOriginalStoryMiss", "只允許原劇本未擊殺時觸發", suppression.activation.requireOriginalStoryMiss),
      suppressionSwitch("activation.requireKeepDeviation", "保留牌 ID 必須與劇本不同", suppression.activation.requireKeepDeviation),
      suppressionSwitch("activation.latchForBoss", "觸發後維持至本隻 Boss 結束", suppression.activation.latchForBoss)
    ].join("");
    $("suppressionRedrawGrid").innerHTML = [
      suppressionSwitch("redraw.enabled", "換牌候選抑制", suppression.redraw.enabled),
      suppressionNumber("redraw.improvedAcceptPct", "牌型升級候選接受率（%）", suppression.redraw.improvedAcceptPct, 0.1),
      suppressionNumber("redraw.sameOrLowerAcceptPct", "同級／下降候選接受率（%）", suppression.redraw.sameOrLowerAcceptPct, 0.1),
      suppressionNumber("redraw.maxCandidates", "單次最多候選數", suppression.redraw.maxCandidates, 1),
      suppressionSwitch("redraw.forceFinalCandidate", "最後一個候選強制接受", suppression.redraw.forceFinalCandidate)
    ].join("");
    $("suppressionMagicSwitchGrid").innerHTML = suppressionSwitch("magic.enabled", "傷害魔法改抽抑制表", suppression.magic.enabled);
    const suppressionTableMeta = {
      crit: ["暴擊倍率", "CRITICAL"],
      flatDamage: ["固定傷害", "FIXED DMG"],
      handBoost: ["牌型傷害倍率", "三條／四條／順子／同花／葫蘆等全部共用"]
    };
    $("suppressionMagicTableBody").innerHTML = Object.entries(suppressionTableMeta).flatMap(([key, meta]) => {
      const table = suppression.magic.tables[key];
      return table.outcomes.map((outcome, index) => `<tr><th>${index === 0 ? meta[0] : ""}</th><td>${index === 0 ? meta[1] : ""}</td><td><input data-suppression-table="${key}" data-outcome-index="${index}" data-outcome-field="value" type="number" min="0" step="0.01" value="${outcome.value}"></td><td><input data-suppression-table="${key}" data-outcome-index="${index}" data-outcome-field="weight" type="number" min="0" max="100" step="0.01" value="${outcome.weight}"></td><td>${index === 0 ? `<label class="switch compact-switch" aria-label="${meta[0]}抑制表啟用"><input data-suppression-table-enabled="${key}" type="checkbox" ${table.enabled ? "checked" : ""}><span></span></label>` : ""}</td></tr>`);
    }).join("");
    const expectedValue = (table) => {
      const totalWeight = table.outcomes.reduce((sum, row) => sum + Math.max(0, number(row.weight)), 0);
      return totalWeight > 0 ? table.outcomes.reduce((sum, row) => sum + number(row.value) * Math.max(0, number(row.weight)), 0) / totalWeight : 0;
    };
    const weightTotal = (table) => table.outcomes.reduce((sum, row) => sum + Math.max(0, number(row.weight)), 0);
    $("suppressionPolicySummary").textContent = `${Core.NaturalCore.SUPPRESSION_POLICY_VERSION}｜目前期望：暴擊 ${expectedValue(suppression.magic.tables.crit).toFixed(3)}x、固傷 +${expectedValue(suppression.magic.tables.flatDamage).toFixed(3)}、共用牌型傷害 ${expectedValue(suppression.magic.tables.handBoost).toFixed(3)}x。三表權重合計：${weightTotal(suppression.magic.tables.crit).toFixed(2)}%／${weightTotal(suppression.magic.tables.flatDamage).toFixed(2)}%／${weightTotal(suppression.magic.tables.handBoost).toFixed(2)}%。傷害值在比牌結算才公開；抑制時不沿用正常表原值。`;
  }

  function setNestedValue(target, path, value) {
    const keys = String(path).split(".");
    let cursor = target;
    keys.slice(0, -1).forEach((key) => {
      if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
      cursor = cursor[key];
    });
    cursor[keys[keys.length - 1]] = value;
  }

  function persistSuppressionPolicy() {
    localStorage.setItem(Core.NaturalCore.SUPPRESSION_STORAGE_KEY, JSON.stringify(config.suppression));
  }

  function readMechanicTarget(target) {
    if (target.matches("[data-mechanic-switch]")) {
      const key = target.dataset.mechanicSwitch;
      config.mechanics[key] = target.checked;
      if (key === "storyCarryEnabled") {
        config.carry.enabled = target.checked;
        checked("storyCarryEnabled", target.checked);
      }
    }
    if (target.matches("[data-simulation-field]")) config.simulation[target.dataset.simulationField] = target.tagName === "SELECT" ? target.value : number(target.value);
    if (target.matches("[data-rule-field]")) config.ruleSettings[target.dataset.ruleField] = number(target.value);
    if (target.matches("[data-boss-row]")) {
      const rowIndex = Number(target.dataset.bossRow);
      config.bossRows[rowIndex][Number(target.dataset.column)] = number(target.value);
      if (Number(target.dataset.column) === 5 && config.stars[rowIndex]) config.stars[rowIndex].bossTickets = Math.round(number(target.value));
      const row = config.bossRows[rowIndex];
      const multiplierDice = number(row[9]) > 0 ? 3 : number(row[8]) > 0 ? 2 : number(row[7]) > 0 ? 1 : 0;
      const output = target.closest("tr")?.querySelector("output");
      if (output) output.textContent = `${count(18 * Math.pow(6, multiplierDice))}x`;
    }
    if (target.matches("[data-magic-row]")) {
      const column = Number(target.dataset.column);
      config.magicRows[Number(target.dataset.magicRow)][column] = target.type === "checkbox" ? (target.checked ? 1 : 0) : target.type === "number" ? number(target.value) : target.value;
    }
    if (target.matches("[data-hand-row]")) {
      const column = Number(target.dataset.column);
      config.handRows[Number(target.dataset.handRow)][column] = target.type === "number" ? number(target.value) : target.value;
    }
    if (target.matches("[data-draw-fee]")) config.drawFeesX[Number(target.dataset.drawFee)] = number(target.value);
    if (target.matches("[data-suppression-path]")) {
      setNestedValue(config.suppression, target.dataset.suppressionPath, target.type === "checkbox" ? target.checked : number(target.value));
    }
    if (target.matches("[data-suppression-table]")) {
      const table = config.suppression.magic.tables[target.dataset.suppressionTable];
      const outcomeIndex = Number(target.dataset.outcomeIndex);
      if (!table.outcomes[outcomeIndex]) table.outcomes[outcomeIndex] = { value: 0, weight: 0 };
      table.outcomes[outcomeIndex][target.dataset.outcomeField] = number(target.value);
    }
    if (target.matches("[data-suppression-table-enabled]")) {
      config.suppression.magic.tables[target.dataset.suppressionTableEnabled].enabled = target.checked;
    }
  }

  function readSimulationControls() {
    document.querySelectorAll("[data-simulation-field]").forEach((target) => {
      config.simulation[target.dataset.simulationField] = target.tagName === "SELECT" ? target.value : number(target.value);
    });
  }

  function preparePlayerModelReport(result) {
    const t = result.totals;
    const spend = Math.max(number(t.spend), 1e-9);
    const baselineSpend = Math.max(number(t.baselineSpend), 1e-9);
    Object.assign(t, {
      ticketErrorPpMax: 0,
      actualSpendDeltaCredits: number(t.spend) - number(t.baselineSpend),
      actualSpendVsPlannedPct: number(t.spend) / baselineSpend * 100,
      committedNetCredits: number(t.gross) - number(t.baselineSpend),
      organicActualNetCredits: number(t.gross) - number(t.spend),
      actualNetCredits: number(t.net) - number(t.spend),
      poolZeroProjectedRtpPct: number(t.gross) / spend * 100,
      spendBasisRtpDriftPp: number(t.gross) / spend * 100 - number(t.grossRtpPct),
      poolZeroProjectedTargetDriftPp: number(t.gross) / spend * 100 - number(result.config.targetCoreRtpPct)
    });
    result.riskFindings = [{
      severity: "INFO", code: "ORIGINAL_PLAYER_MODEL",
      evidence: "本次使用三玩家統計模型，不抽逐利玩家的真實故事候選。",
      impact: "三候選配籤、故事覆蓋與合法骰面補正表不適用；其他玩家、退幣、RTP、牌型與魔法統計仍有效。"
    }];
    result.ticketHealth = {
      commits: t.bosses, candidateSetsTried: 0, rejectedCandidateSets: 0, firstAttemptRatePct: 0,
      avgAttempts: 0, p95Attempts: 0, p99Attempts: 0, maxAttempts: 0,
      maxWeightP95Pct: 0, maxWeightP99Pct: 0, maxWeightPct: 0,
      avgEffectiveChoices: 0, minEffectiveChoices: 0, weightStats: []
    };
    result.ticketStarStats = [];
    result.storySelectionCoverage = [];
    result.settlementFunnel = { candidateStoriesDrawn: 0, commits: t.bosses, settlements: t.bosses, pending: 0, note: "三玩家統計模型不使用真實故事候選" };
    result.carryBucketStats = [];
    result.correctionHealth = { exactReplay: false, opportunities: 0, applied: 0, requestedAbsCredits: 0, appliedAbsCredits: 0, utilizationPct: 0, partial: 0, capLimited: 0, reasons: { UNKNOWN: t.bosses } };
    result.correctionCoverageStats = [];
    result.carryBucketTailStats = [];
    result.classMigration = [];
    return result;
  }

  function renderSimulation(result) {
    if (!result.ticketHealth) result = preparePlayerModelReport(result);
    reportDigits = Math.max(0, Math.min(8, Math.trunc(number(result.config.simulation.decimalPlaces, 2))));
    const t = result.totals;
    const p = result.playerDistribution;
    const c = result.cashout;
    const a = result.actionStats;
    const ticket = result.ticketHealth;
    const correctionHealth = result.correctionHealth;
    const smartStoryModel = result.config.simulation.playerBehavior === "SMART";
    const ratioPct = (part, total) => number(part) / Math.max(number(total), 1e-9) * 100;
    const rowHtml = (cells, heading = false) => `<tr>${cells.map((cell, index) => index === 0 && heading ? `<th>${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`;

    $("simSpend").textContent = x(t.spend);
    $("simPayout").textContent = x(t.net);
    $("simGrossRtp").textContent = pct(t.grossRtpPct, 4);
    $("simNetRtp").textContent = pct(t.netRtpPct, 4);
    $("simOffset").textContent = `補 ${x(t.bonus)}／扣 ${x(t.deduction)}`;
    $("simKillAbort").textContent = `${pct(t.killRatePct, 2)}／${pct(100 - t.killRatePct, 2)}`;
    $("simRoundsDraws").textContent = `${t.avgRoundsPerBoss.toFixed(2)}／${t.avgDrawsPerBoss.toFixed(2)}`;
    $("simCarry").textContent = `${signedX(t.endingCarryX)}（守恆誤差 ${x(t.telescopeErrorX, 8)}）`;
    document.querySelector(".simulation-metrics")?.classList.remove("is-hidden");

    $("reportOverviewCards").innerHTML = [
      ["玩家 RTP", pct(t.netRtpPct, 4)],
      ["總投入", x(t.spend)],
      ["玩家實付獎", x(t.net)],
      ["挑戰 BOSS", count(t.bosses)],
      ["擊殺率", pct(t.killRatePct, 2)],
      ["平均回合／BOSS", t.avgRoundsPerBoss.toFixed(2)],
      ["平均換牌／BOSS", t.avgDrawsPerBoss.toFixed(2)]
    ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");

    const highStarRows = result.starStats.filter((row) => row.star >= 7);
    const highStarCount = highStarRows.reduce((sum, row) => sum + row.count, 0);
    const highStarRewardX = highStarRows.reduce((sum, row) => sum + row.bossRewardXSum, 0);
    const highStarRewardCount = highStarRows.reduce((sum, row) => sum + row.bossRewardCount, 0);
    $("bossExperienceBody").innerHTML = [
      ["挑戰總次數", count(t.bosses), "實際建立並結算的 BOSS"],
      ["擊殺率", pct(t.killRatePct, 2), "擊殺 BOSS ÷ 挑戰總次數"],
      ["平均獲得 Joker", t.jokerDraws ? `${(t.rounds / t.jokerDraws).toFixed(2)} 回合／次` : "—", "只計實際抽出的 Joker"],
      ["BOSS 獎平均賠率", t.bossRewardCount ? `${(t.bossRewardXSum / t.bossRewardCount).toFixed(2)}x` : "—", "只計成功派發的 BOSS 擊殺獎"],
      ["三候選配籤最大誤差", `${number(t.ticketErrorPpMax).toFixed(9)}pp`, "每隻 BOSS 依三個具體自然故事即時求解"],
      ["BOSS 獎補正觸發率", pct(t.correctionRatePct, 2), "擊殺且同桶有可由合法骰面吸收的餘額時立即處理"],
      ["7–8 星 BOSS 獎平均賠率", highStarRewardCount ? `${(highStarRewardX / highStarRewardCount).toFixed(2)}x` : "—", "只計 7–8 星成功派發的 BOSS 獎"],
      ["平均幾隻遇到 7–8 星", highStarCount ? (t.bosses / highStarCount).toFixed(2) : "—", "全部 BOSS ÷ 7–8 星出現次數"]
    ].map((row) => rowHtml(row, true)).join("");

    $("cashoutStatsBody").innerHTML = c.available === false
      ? rowHtml(["—", "—", "—", "—", "—", "—", "—"])
      : rowHtml([
        count(c.totalPlayers), count(c.successes), count(c.deaths), pct(c.cashoutRatePct, 2),
        c.avgPlayedRounds.toFixed(reportDigits), c.avgDeathRounds.toFixed(reportDigits), c.avgBossKills.toFixed(reportDigits)
      ]);

    const handByKey = Object.fromEntries(result.handStats.map((row) => [row.key, row]));
    const avgDrawsFor = (keys) => {
      const rows = keys.map((key) => handByKey[key]).filter(Boolean);
      const hands = rows.reduce((sum, row) => sum + row.playerFinal, 0);
      const draws = rows.reduce((sum, row) => sum + row.compareDraws, 0);
      return hands ? (draws / hands).toFixed(2) : "—";
    };
    $("drawByHandBody").innerHTML = [
      ["順子（含以上）", ["straight", "flush", "fullHouse", "four", "straightFlush"]],
      ["同花", ["flush"]], ["葫蘆", ["fullHouse"]], ["四條", ["four"]], ["同花順", ["straightFlush"]]
    ].map(([label, keys]) => rowHtml([label, avgDrawsFor(keys)], true)).join("");

    const behaviorLabels = {
      SMART: "逐利玩家（真實劇情／含理牌）", OFFICIAL_FUNDED: "聰明玩家（官方策略）", FREE_RIDE: "白嫖玩家", EXTREME: "極端玩家",
      KILL_FOCUS: "擊殺策略", SAVE_DRAWS: "節省換牌", HEAVY_DRAWS: "重度換牌"
    };
    const betModeLabels = { FIXED: "固定 Bet", RANDOM_B1: "第一組 Bet 隨機", RANDOM_ALL: "全部 Bet 隨機", SCHEDULED: "排程 Bet" };
    $("runInfoBody").innerHTML = [
      ["統計時間", new Date(result.runInfo.reportCompletedAt).toLocaleString("zh-Hant"), "本次模擬完成時間"],
      ["統計花費時間", `${Math.max(0, result.runInfo.reportElapsedMs)}ms`, result.config.simulation.playerBehavior === "SMART" ? "真實故事池逐局動態配籤" : "三玩家獨立統計模型"],
      ["玩家行為", behaviorLabels[result.config.simulation.playerBehavior] || esc(result.config.simulation.playerBehavior), "本次只跑一種策略"],
      ["Bet 模式", betModeLabels[result.config.simulation.betMode] || esc(result.config.simulation.betMode), `固定 Bet ${result.config.simulation.fixedBet}`],
      ["玩家數", count(result.config.simulation.playerCount), smartStoryModel ? "逐利玩家的獨立退幣統計尚未建立，報表留空" : `退幣另跑 ${count(result.config.simulation.cashoutPlayerCount)} 人`],
      ["每位玩家 BOSS 數", count(result.config.simulation.bossesPerPlayer), "主模擬目標"],
      ["RTP 切片", `${count(result.config.simulation.roundSlice)} BOSS`, "玩家 RTP 走勢的區間大小"],
      ["種子", String(result.config.seed), "相同參數與種子可重現"],
      ["遊戲故事池", result.config.simulation.playerBehavior === "SMART" ? esc(result.config.versions.storyPool) : "不適用（三玩家統計模型）", result.config.simulation.playerBehavior === "SMART" ? "每星贏多、贏少、輸各固定 10,000 局；本輪主模擬沿劇本操作，實際玩家偏離分布待後續策略確認" : "三個玩家模型使用獨立統計路徑"]
    ].map((row) => rowHtml(row, true)).join("");

    $("spendSourceBody").innerHTML = [
      ["START／CONTINUE", t.entrySpend], ["付費 REDRAW", t.drawSpend], ["REROLL BOSS", t.refreshSpend]
    ].map(([label, value]) => rowHtml([label, x(value), pct(ratioPct(value, t.spend), 2)], true)).join("");

    const payoutRows = [
      ["BOSS 擊殺獎", t.bossGross], ["牌型獎", t.handGross], ["魔法卡獎", t.magicGross],
      [t.bonus >= t.deduction ? "個人劇本水池補正" : "個人劇本水池扣抵", t.bonus - t.deduction]
    ];
    $("payoutSourceBody").innerHTML = payoutRows.map(([label, value]) =>
      rowHtml([label, value === null ? "—" : x(value), value === null ? "—" : pct(ratioPct(value, t.spend), 3)], true)
    ).join("");

    let cumulativeKills = 0;
    $("rtpTrendBody").innerHTML = result.roundSlices.map((row) => {
      cumulativeKills += row.kills;
      return rowHtml([
        `${row.startBoss}～${row.endBoss}`, pct(row.cumulativeNetRtpPct, 3), pct(row.netRtpPct, 3), count(cumulativeKills)
      ], true);
    }).join("");

    $("storyTrendBody").innerHTML = result.roundSlices.map((row) => rowHtml([
      `${row.startBoss}～${row.endBoss}`, count(row.count), pct(row.grossRtpPct, 3), pct(row.netRtpPct, 3),
      pct(row.cumulativeGrossRtpPct, 3), pct(row.cumulativeNetRtpPct, 3), x(row.bonus), x(row.deduction), signedX(row.avgEndingCarryX)
    ], true)).join("");

    const playerBucketRows = result.payoutBuckets.playerBoss || [];
    const totalBucketCount = playerBucketRows.reduce((sum, row) => sum + row.count, 0);
    const totalBucketSpend = playerBucketRows.reduce((sum, row) => sum + row.spend, 0);
    let cumulativePlayerPayout = 0;
    const cumulativeByBucket = new Map();
    [...playerBucketRows].sort((left, right) => left.bucket - right.bucket).forEach((row) => {
      cumulativePlayerPayout += row.net;
      cumulativeByBucket.set(row.bucket, cumulativePlayerPayout);
    });
    $("playerBossBucketBody").innerHTML = [...playerBucketRows].sort((left, right) => right.bucket - left.bucket).map((row) => rowHtml([
      row.bucket === 1000 ? "≥1000x" : `${row.bucket}x`,
      pct(ratioPct(cumulativeByBucket.get(row.bucket), totalBucketSpend), 3),
      row.count ? (totalBucketCount / row.count).toFixed(2) : "—",
      count(row.count)
    ], true)).join("");

    const auditBucketRows = (rows) => rows.filter((row) => row.count > 0).sort((left, right) => right.bucket - left.bucket).map((row) => rowHtml([
      `${row.bucket}x`, count(row.count), (t.bosses / Math.max(row.count, 1)).toFixed(2),
      pct(ratioPct(row.gross, row.spend), 3), pct(ratioPct(row.net, row.spend), 3)
    ], true)).join("");
    $("storyBucketBody").innerHTML = auditBucketRows(result.payoutBuckets.story);
    $("roundBucketBody").innerHTML = auditBucketRows(result.payoutBuckets.round);

    $("starStatsBody").innerHTML = result.starStats.map((row) => {
      const avgRewardX = row.bossRewardCount ? row.bossRewardXSum / row.bossRewardCount : 0;
      return rowHtml([
        `${row.star}★`, count(row.count), row.count ? (t.bosses / row.count).toFixed(2) : "—",
        pct(ratioPct(row.kills, row.count), 2), pct(ratioPct(row.net, row.spend), 3), pct(ratioPct(row.bossGross, t.spend), 3),
        row.bossRewardCount ? `${x(row.minBossRewardX)}／${x(avgRewardX)}／${x(row.maxBossRewardX)}` : "—",
        count(row.jokerDraws), count(row.straightFlushKills), (row.draws / Math.max(row.count, 1)).toFixed(2),
        (row.drawSpendX / Math.max(row.count, 1)).toFixed(2), count(row.refreshes)
      ], true);
    }).join("");

    $("cellStatsBody").innerHTML = result.cellStats.map((row) => rowHtml([
      `${row.star}★`, treeLabels[row.key], count(row.count), x(row.spend),
      pct(ratioPct(row.gross, row.baselineSpend), 3), pct(ratioPct(row.net, row.spend), 3),
      pct(ratioPct(row.kills, row.count), 2), pct(ratioPct(row.aborts, row.count), 2),
      (row.rounds / Math.max(row.count, 1)).toFixed(2), (row.draws / Math.max(row.count, 1)).toFixed(2)
    ], true)).join("");

    $("treeStatsBody").innerHTML = result.treeStats.map((row) => rowHtml([
      treeLabels[row.key], count(row.count), x(row.spend), x(row.gross), x(row.net),
      pct(ratioPct(row.gross, row.baselineSpend), 3), pct(ratioPct(row.net, row.spend), 3),
      pct(ratioPct(row.kills, row.count), 2), pct(ratioPct(row.aborts, row.count), 2),
      (row.rounds / Math.max(row.count, 1)).toFixed(2), (row.draws / Math.max(row.count, 1)).toFixed(2)
    ], true)).join("");

    const totalStartHands = result.handStats.reduce((sum, row) => sum + row.playerStart, 0);
    const totalFinalHands = result.handStats.reduce((sum, row) => sum + row.playerFinal, 0);
    const totalBossHands = result.handStats.reduce((sum, row) => sum + row.bossFinal, 0);
    $("handStatsBody").innerHTML = result.handStats.map((row) => rowHtml([
      esc(row.label), pct(ratioPct(row.payout, t.spend), 3), pct(ratioPct(row.playerWins, row.playerFinal), 2),
      pct(ratioPct(row.playerStart, totalStartHands), 3), pct(ratioPct(row.playerFinal, totalFinalHands), 3),
      pct(ratioPct(row.bossFinal, totalBossHands), 3),
      (row.damage / Math.max(row.playerFinal, 1)).toFixed(3), row.baseDamage.toFixed(2)
    ], true)).join("");

    $("magicStatsBody").innerHTML = result.magicStats.map((row) => rowHtml([
      esc(row.label), count(row.draws), pct(ratioPct(row.effective, row.draws), 2),
      row.draws ? (t.rounds / row.draws).toFixed(2) : "—"
    ], true)).join("");

    $("storySummaryCards").innerHTML = [
      ["劇情原定投入", x(t.baselineSpend)], ["玩家實際投入", x(t.spend)],
      ["劇情承諾獎", x(t.gross)], ["玩家最終實付獎", x(t.net)],
      ["劇情承諾 RTP", pct(t.grossRtpPct, 4)], ["玩家現金 RTP", pct(t.netRtpPct, 4)],
      ["個人劇情水池補正／扣抵", `${x(t.bonus)}／${x(t.deduction)}`],
      ["期末個人劇情水池", `${signedX(t.endingCarryX)}／誤差 ${x(t.telescopeErrorX, 8)}`]
    ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");

    const riskLabels = {
      TICKET_STARVATION: "配籤飢餓／近乎單一路徑", CANDIDATE_REJECTION_BIAS: "不可解候選組造成重抽偏差",
      ACTUAL_SPEND_RTP_DRIFT: "實際投入偏離造成現金 RTP 漂移",
      EXACT_REPLAY_BLIND_SPOT: "精準重播遮蔽補正風險", DICE_CORRECTION_GAPS: "合法骰面補正缺口",
      BET_BUCKET_COVERAGE: "Bet 桶抽樣不足", PENDING_COMMIT_DURABILITY: "START 後 pending commit 不耐中斷",
      SETTLEMENT_IDEMPOTENCY: "結算缺少後端冪等保護"
    };
    $("riskFindingsBody").innerHTML = result.riskFindings.map((row) => rowHtml([
      row.severity, riskLabels[row.code] || row.code, esc(row.evidence), esc(row.impact)
    ], true)).join("");

    $("ticketHealthBody").innerHTML = [
      ["已承諾 BOSS", count(ticket.commits), "每隻 BOSS 最後只選一個故事"],
      ["候選組評估／重抽", `${count(ticket.candidateSetsTried)}／${count(ticket.rejectedCandidateSets)}`, "只有無法跨過目標 RTP 或有候選變成 0 籤時，才把三分類重新各抽一次"],
      ["第一組可直接配籤", pct(ticket.firstAttemptRatePct, 2), "三分類內不做分數挑選；第一組可解就直接使用"],
      ["抽取組數 Avg／P95／P99／Max", `${ticket.avgAttempts.toFixed(2)}／${ticket.p95Attempts.toFixed(0)}／${ticket.p99Attempts.toFixed(0)}／${ticket.maxAttempts}`, "候選抽取只檢查能否合法配籤，不比較哪組更接近某種分類比例"],
      ["分類比例目標", "未設定", "現行模型沒有 6／55／39 或其他固定分類比例"],
      ["單一故事最大權重 P95／P99／Max", `${pct(ticket.maxWeightP95Pct, 2)}／${pct(ticket.maxWeightP99Pct, 2)}／${pct(ticket.maxWeightPct, 2)}`, "越接近 100%，三選一越像單一路徑"],
      ["有效選項數 Avg／Min", `${ticket.avgEffectiveChoices.toFixed(3)}／${ticket.minEffectiveChoices.toFixed(3)}`, "3 代表均勻三選；接近 1 代表幾乎只有一個會中"],
      [`${count(config.storyPool.ticketBasis)} 整數籤最大 RTP 誤差`, `${number(t.ticketErrorPpMax).toFixed(9)}pp`, "使用實際總押、總派彩與目標 RTP 差額分數驗算"]
    ].map((row) => rowHtml(row, true)).join("");
    $("ticketWeightBody").innerHTML = ticket.weightStats.map((row) => rowHtml([
      row.label, pct(row.avgPct, 2), pct(row.minPct, 3), pct(row.p01Pct, 3), pct(row.p05Pct, 3),
      pct(row.p50Pct, 2), pct(row.p95Pct, 2), pct(row.p99Pct, 2), pct(row.maxPct, 3),
      pct(row.below1PctRate, 2), pct(row.below5PctRate, 2)
    ], true)).join("");
    const signedCredits = (value) => `${number(value) > 0 ? "+" : ""}${number(value).toLocaleString("zh-Hant", { maximumFractionDigits: 2 })}`;
    const candidateCell = (sample, classKey) => {
      const candidateIndex = treeKeys.indexOf(classKey);
      const story = sample.candidates?.find((row) => row.classKey === classKey);
      if (!story) return "—";
      const ticketCount = sample.ticketCounts?.[candidateIndex] || 0;
      const weight = number(sample.weights?.[classKey], ticketCount / Math.max(number(sample.ticketBasis), 1));
      const score = number(sample.scorePoints?.[candidateIndex], 0) * number(sample.bet, 1);
      return `<strong>${esc(treeLabels[classKey])}</strong><br>押 ${number(story.spendCredits).toLocaleString("zh-Hant")}／派 ${number(story.payoutCredits).toLocaleString("zh-Hant")}<br>結果 ${signedCredits(story.netCredits)}<br>分數 ${signedCredits(score)}<br>${count(ticketCount)} 籤（${pct(weight * 100, 2)}）`;
    };
    if ($("ticketSamplesBody")) $("ticketSamplesBody").innerHTML = (result.ticketSamples || []).map((sample, index) => rowHtml([
      count(index + 1), `${sample.star}★／${number(sample.bet).toLocaleString("zh-Hant")}`,
      candidateCell(sample, "win"), candidateCell(sample, "push"), candidateCell(sample, "lose"),
      `<strong>${esc(treeLabels[sample.selectedClass] || sample.selectedClass)}</strong>`,
      `${pct(sample.weightedRtpPct, 5)}<br>誤差 ${number(sample.rtpErrorPp).toFixed(6)}pp`
    ], true)).join("");
    $("ticketStarHealthBody").innerHTML = result.ticketStarStats.map((row) => rowHtml([
      `${row.star}★`, count(row.commits), pct(row.firstAttemptRatePct, 2),
      `${row.avgAttempts.toFixed(2)}／${row.p99Attempts.toFixed(0)}／${row.maxAttempts}`,
      pct(row.minWeightPct, 3), pct(row.below1PctRate, 2),
      `${pct(row.maxWeightP99Pct, 2)}／${pct(row.maxWeightPct, 2)}`, row.avgEffectiveChoices.toFixed(3)
    ], true)).join("");
    $("storySelectionCoverageBody").innerHTML = result.storySelectionCoverage.map((row) => rowHtml([
      `${row.star}★`, row.label, count(row.catalogStories), count(row.candidateUnique), count(row.selectedUnique),
      count(row.selectedCount), count(row.neverCandidate), count(row.neverSelected), count(row.maxSelectedRepeats)
    ], true)).join("");
    const funnel = result.settlementFunnel;
    $("settlementFunnelBody").innerHTML = rowHtml([
      count(funnel.candidateStoriesDrawn), count(funnel.commits), count(funnel.settlements), count(funnel.pending), esc(funnel.note)
    ]);

    $("playerDistributionBody").innerHTML = [
      ["劇本承諾 RTP", pct(p.grossRtpP10, 3), pct(p.grossRtpP50, 3), pct(p.grossRtpP90, 3), pct(p.grossRtpP95, 3), pct(p.grossRtpP99, 3), "—"],
      ["玩家 RTP", pct(p.rtpP10, 3), pct(p.rtpP50, 3), pct(p.rtpP90, 3), pct(p.rtpP95, 3), pct(p.rtpP99, 3), pct(p.rtpMax, 3)],
      ["玩家淨值", x(p.profitP10), x(p.profitP50), x(p.profitP90), x(p.profitP95), x(p.profitP99), x(p.profitMax)],
      ["期末個人劇本水池", x(p.carryP10), x(p.carryP50), x(p.carryP90), x(p.carryP95), x(p.carryP99), `${x(p.carryMin)}～${x(p.carryMax)}`]
    ].map((row) => `<tr><th>${row[0]}</th>${row.slice(1).map((value) => `<td>${value}</td>`).join("")}</tr>`).join("");

    const carryTailPp = Math.abs(t.endingCarryX) / Math.max(t.spend, 1e-9) * 100;
    $("carryAuditBody").innerHTML = [
      ["劇情原定投入／玩家實際投入", `${x(t.baselineSpend)}／${x(t.spend)}`, `實際－原定 ${signedX(t.actualSpendDeltaCredits)}；比率 ${pct(t.actualSpendVsPlannedPct, 3)}`],
      ["目標 RTP 入池額", signedX(t.targetAccrualCredits), `玩家實際投入 × ${pct(config.targetCoreRtpPct, 3)}`],
      ["自然派彩／自然淨結果", `${x(t.organicPayout)}／${signedX(t.organicActualNetCredits)}`, "自然派彩從同桶扣除；淨結果＝自然派彩－玩家實際投入"],
      ["BOSS 合法骰面補正／扣抵", `${x(t.bonus)}／${x(t.deduction)}`, `原獎 10%～1,000%（0.1～10 倍）；觸發率 ${pct(t.correctionRatePct, 2)}`],
      ["玩家最終淨結果", signedX(t.actualNetCredits), "玩家最終實付獎－玩家實際投入"],
      ["期末個人劇情水池", signedX(t.endingCarryX), `占實際投入 ${pct(carryTailPp, 4)}`],
      ["守恆：期末池＝目標 RTP 入池額－玩家最終派彩", x(t.telescopeErrorX, 8), Math.abs(t.telescopeErrorX) < 1e-7 ? "通過" : "阻擋"],
      ["池尾歸零時的現金 RTP 投影", pct(t.poolZeroProjectedRtpPct, 4), `本次抽中劇情承諾 RTP ${pct(t.grossRtpPct, 4)}；每筆花費入池比例誤差 ${t.spendBasisRtpDriftPp >= 0 ? "+" : ""}${t.spendBasisRtpDriftPp.toFixed(4)}pp；相對目標總差 ${t.poolZeroProjectedTargetDriftPp >= 0 ? "+" : ""}${t.poolZeroProjectedTargetDriftPp.toFixed(4)}pp`],
      ["玩家 RTP 標準差", pct(p.rtpStdDev, 3), "越高代表個人起伏越大"],
      ["玩家淨值 CVaR 99%", x(p.profitCvar99), "最高 1% 玩家淨值的平均"],
      ["單一劇本淨值標準差", x(result.volatility.storyProfitStdDevX), `P95 ${x(result.volatility.storyProfitP95X)}／P99 ${x(result.volatility.storyProfitP99X)}`],
      ["單一劇本 CVaR 99%", x(result.volatility.storyProfitCvar99X), "最上方 1% 平均平台責任"]
    ].map((row) => rowHtml(row, true)).join("");

    $("carryBucketBody").innerHTML = result.carryBucketStats.map((row) => rowHtml([
      row.label, row.bets.join("／"), count(row.bosses), signedX(row.targetAccrualCredits),
      signedX(row.organicPayoutCredits), signedX(row.currentBossGapCredits),
      x(row.correctionIncreaseCredits), x(row.correctionDecreaseCredits),
      pct(row.correctionRatePct, 2), signedX(row.endingBalanceCredits)
    ], true)).join("");

    const correctionReasonLabels = {
      APPLIED: "已套用合法骰面", ZERO_POOL: "差額為 0", NOT_KILLED: "未擊殺，無 BOSS 獎可改",
      NO_ORIGINAL_REWARD: "原 BOSS 獎為 0", NO_LEGAL_OUTCOME: "原獎 10%～1,000% 內沒有可用合法骰面",
      CORRECTION_DISABLED: "補正已關閉", UNKNOWN: "未分類"
    };
    const correctionRows = [
      ["本次資料型態", "目標 RTP 水池", "花費按目標 RTP 入桶，自然派彩出桶"],
      ["補正機會／實際套用", `${count(correctionHealth.opportunities)}／${count(correctionHealth.applied)}`, "只有非零差額才算補正機會"],
      ["需求／實際吸收", `${x(correctionHealth.requestedAbsCredits)}／${x(correctionHealth.appliedAbsCredits)}`, `吸收率 ${pct(correctionHealth.utilizationPct, 2)}`],
      ["部分吸收／上下界卡住", `${count(correctionHealth.partial)}／${count(correctionHealth.capLimited)}`, "剩餘差額會留在相同下注區間的個人劇本水池"]
    ];
    Object.entries(correctionHealth.reasons).forEach(([key, value]) => correctionRows.push([correctionReasonLabels[key] || key, count(value), "本次 BOSS 的補正結果原因"]));
    $("correctionHealthBody").innerHTML = correctionRows.map((row) => rowHtml(row, true)).join("");
    $("correctionCoverageBody").innerHTML = result.correctionCoverageStats.map((row) => rowHtml([
      `${row.star}★`, count(row.stories), count(row.killed), pct(row.upAvailablePct, 2), pct(row.downAvailablePct, 2),
      pct(row.upFullCapPct, 2), pct(row.downFullCapPct, 2), pct(row.avgUpCapacityPct, 2), pct(row.avgDownCapacityPct, 2),
      pct(row.avgMinUpStepPct, 2), pct(row.avgMinDownStepPct, 2)
    ], true)).join("");
    $("carryBucketTailBody").innerHTML = result.carryBucketTailStats.map((row) => rowHtml([
      row.label, count(row.positivePlayers), count(row.negativePlayers), count(row.zeroPlayers), signedX(row.meanCredits),
      x(row.absP50Credits), x(row.absP90Credits), x(row.absP95Credits), x(row.absP99Credits), x(row.maxAbsCredits),
      pct(ratioPct(row.endingAbsCredits, row.spendCredits), 4)
    ], true)).join("");
    $("classMigrationBody").innerHTML = result.classMigration.map((row) => rowHtml([
      row.fromLabel, row.toLabel, count(row.count), pct(row.ratePct, 2)
    ], true)).join("");

    const reasonLabels = {
      KILLED: "擊殺完成", BOSS_ESCAPED: "回合耗盡／未擊殺", USER_EXIT: "玩家提前離開",
      REROLL: "更換 BOSS", DISCONNECT_EXPIRED: "斷線到期", INSUFFICIENT_FUNDS: "資產不足"
    };
    $("terminationStatsBody").innerHTML = Object.entries(a.terminationStats).map(([key, value]) =>
      rowHtml([reasonLabels[key] || key, count(value), pct(ratioPct(value, t.bosses), 2)], true)
    ).join("");

    $("copyStatisticsButton").disabled = false;
    $("exportStatisticsButton").disabled = false;
    const resultsArea = $("resultsArea");
    if (resultsArea) resultsArea.classList.remove("is-hidden");
  }

  function clearSimulation(message = "參數已變更，請重新執行") {
    simulationResult = null;
    simulationHash = "";
    $("simulationState").textContent = message;
    ["simSpend", "simPayout", "simGrossRtp", "simNetRtp", "simOffset", "simKillAbort", "simRoundsDraws", "simCarry"].forEach((id) => { $(id).textContent = "—"; });
    ["reportOverviewCards", "storySummaryCards", "bossExperienceBody", "cashoutStatsBody", "drawByHandBody", "runInfoBody",
      "spendSourceBody", "payoutSourceBody", "rtpTrendBody", "storyTrendBody", "playerBossBucketBody", "starStatsBody",
      "handStatsBody", "magicStatsBody", "playerDistributionBody", "storyBucketBody", "roundBucketBody",
      "cellStatsBody", "treeStatsBody", "carryBucketBody", "carryAuditBody", "terminationStatsBody",
      "riskFindingsBody", "ticketHealthBody", "ticketWeightBody", "ticketSamplesBody", "ticketStarHealthBody", "storySelectionCoverageBody", "settlementFunnelBody", "correctionHealthBody", "correctionCoverageBody",
      "carryBucketTailBody", "classMigrationBody"].forEach((id) => { if ($(id)) $(id).innerHTML = ""; });
    $("copyStatisticsButton").disabled = true;
    $("exportStatisticsButton").disabled = true;
    const resultsArea = $("resultsArea");
    if (resultsArea) resultsArea.classList.add("is-hidden");
    document.querySelector(".simulation-metrics")?.classList.add("is-hidden");
  }

  function recompute(options = {}) {
    if (options.readTree) readTreeMatrix();
    readFixedControls();
    design = null;
    renderTreeMatrix();
    updateExample();
    renderNaturalMetrics();
    renderSummary();
  }

  function markDirty(mechanic = false) {
    dirty = true;
    if (mechanic) {
      mechanicsDirty = true;
      $("mechanicsDirtyState").textContent = "遊戲機制已變更：StoryPool、自然度與模擬結果都必須重建。";
      $("mechanicsDirtyState").className = "dirty-note warn";
      storyPoolCells = [];
      catalogPool = null;
      config.versions.storyPool = "pending";
    }
    clearSimulation();
  }

  function runSimulation(options = {}) {
    readFixedControls();
    readTreeMatrix();
    config = Core.sanitizeConfig(config);
    $("runSimulationButton").disabled = true;
    $("simulationState").textContent = "正在載入 240,000 個正式故事摘要並驗證 24 個結果資料格各 10,000 局…";
    requestAnimationFrame(() => {
      try {
        const summaryPreset = window.BossDuelStorySummaryPresetV1;
        const seedPreset = window.BossDuelStoryPresetV1;
        if (!summaryPreset || summaryPreset.signature !== seedPreset?.signature) throw new Error("統計摘要與遊戲種子目錄版本不一致");
        const pool = Core.NaturalCore.buildNaturalStoryPoolFromPreset(config, {
          ...seedPreset,
          naturalSummaries: summaryPreset.naturalSummaries
        });
        if (!pool) throw new Error("遊戲故事預置與目前正式規則不一致");
        catalogPool = pool;
        simulationResult = null;
        storyPoolCells = [];
        for (let star = 1; star <= 8; star += 1) for (const tree of treeKeys) {
          const naturalRows = pool.naturalCells?.[star]?.[tree] || [];
          storyPoolCells.push({
            star, tree, sampleSize: naturalRows.length,
            naturalCount: naturalRows.length,
            replayVerified: naturalRows.every((story) => story.seed !== undefined && story.classKey === tree && story.plannerVersion === "boss-plan-v10")
          });
        }
        config.versions.storyPool = pool.version;
        simulationHash = currentHash();
        $("resultsArea").classList.add("is-hidden");
        $("copyStatisticsButton").disabled = true;
        $("exportStatisticsButton").disabled = true;
        $("simulationState").textContent = "完成：240,000 個正式故事（每星三分類各 10,000），準備執行統計。";
        syncStoryExperienceIndexOptions();
        $("storyExperienceOpen").closest("details").open = true;
        renderStoryExperience();
        renderNaturalClassAverages();
        renderNaturalMetrics();
        renderTreeMatrix();
        if (options.runAfterLoad) runRuntimeSimulation();
      } catch (error) {
        catalogPool = null;
        renderStoryExperience();
        renderNaturalClassAverages();
        clearSimulation(`故事產生失敗：${error.message}`);
      }
      if (!options.runAfterLoad || !catalogPool) $("runSimulationButton").disabled = false;
      renderSummary();
    });
  }

  function runRuntimeSimulation() {
    readFixedControls();
    readTreeMatrix();
    readSimulationControls();
    const usesNaturalStories = config.simulation.playerBehavior === "SMART";
    if (usesNaturalStories && !catalogPool) {
      $("simulationState").textContent = "請先載入 240,000 個正式故事。";
      return;
    }
    if ($("seed").value.trim() === "") config.seed = randomSimulationSeed();
    config.seedMode = "FIXED";
    config = Core.sanitizeConfig(config);
    const suppressionState = Core.NaturalCore.validateSuppressionPolicy(config.suppression);
    if (!suppressionState.pass) {
      $("simulationState").textContent = `抑制參數錯誤：${suppressionState.issues.join("；")}`;
      return;
    }
    hydrateFixedControls();
    $("simulationState").textContent = usesNaturalStories
      ? `正在以逐利玩家重播真實劇情，從三個完整分類各等機率抽 1 個候選，再配成 ${config.targetCoreRtpPct}%…`
      : `正在以${config.simulation.playerBehavior === "OFFICIAL_FUNDED" ? "聰明" : config.simulation.playerBehavior === "FREE_RIDE" ? "白嫖" : "極端"}玩家跑獨立統計模型…`;
    $("runSimulationButton").disabled = true;
    requestAnimationFrame(() => {
      try {
        simulationResult = usesNaturalStories
          ? Core.simulateNaturalModel(config, { pool: catalogPool })
          : Core.simulatePlayerModels(config);
        simulationHash = currentHash();
        renderSimulation(simulationResult);
        $("simulationState").textContent = usesNaturalStories
          ? `完成：${count(simulationResult.totals.bosses)} 隻 BOSS；動態配籤最大誤差 ${number(simulationResult.totals.ticketErrorPpMax).toFixed(9)}pp。`
          : `完成：${count(simulationResult.totals.bosses)} 隻 BOSS；已套用三玩家行為與退幣統計。`;
      } catch (error) {
        clearSimulation(`動態模擬失敗：${error.message}`);
      }
      $("runSimulationButton").disabled = false;
      renderSummary();
    });
  }

  function startSimulation() {
    readFixedControls();
    readSimulationControls();
    const catalogMatchesClassification = catalogPool
      && catalogPool.config?.winMinReturnX === config.storyPool.winMinReturnX
      && catalogPool.config?.pushMinReturnX === config.storyPool.pushMinReturnX;
    if (config.simulation.playerBehavior === "SMART" && !catalogMatchesClassification) runSimulation({ runAfterLoad: true });
    else runRuntimeSimulation();
  }

  function selectedStoryExperience() {
    if (!catalogPool) return null;
    const star = Number($("storyExperienceStar").value);
    const source = "NATURAL";
    const classKey = $("storyExperienceClass").value;
    const index = Number($("storyExperienceIndex").value);
    const rows = catalogPool.naturalCells?.[star]?.[classKey];
    const story = rows?.[index] || null;
    return story ? { story, star, source, classKey, index } : null;
  }

  function renderStoryExperience() {
    const selected = selectedStoryExperience();
    $("storyExperienceOpen").disabled = !selected;
    if (!selected) {
      if (catalogPool) {
        const star = Number($("storyExperienceStar").value);
        const classKey = $("storyExperienceClass").value;
        const label = treeLabels[classKey] || classKey;
        $("storyExperienceSummary").textContent = `${star} 星「${label}」目前 0 局；這是實跑分類結果，不補造案例。`;
      } else {
        $("storyExperienceSummary").textContent = "請先載入 240,000 個正式故事。";
      }
      return;
    }
    const { story, source, index } = selected;
    const finish = story.killed ? `${story.rounds}/${story.roundLimit} 回合擊殺` : `${story.rounds} 回合未擊殺`;
    const headline = `#${index + 1}｜自然｜seed ${story.seed}｜${finish}｜投入 ${story.spendX.toFixed(2)}x｜獎 ${story.payoutX.toFixed(2)}x｜派彩／總押 ${story.returnX.toFixed(2)}x｜淨額 ${story.netX >= 0 ? "+" : ""}${story.netX.toFixed(2)} Bet`;
    const storyText = `自然實跑：最佳牌型 ${story.storyMoments.bestHandKey}，換牌 ${story.actions.totalDraws} 次，玩家勝回合 ${story.actions.playerRoundWins} 次；具備 ${Core.NaturalCore.ACTION_TRACE_VERSION}／${Core.NaturalCore.SUPPRESSION_POLICY_VERSION} 重播契約。`;
    $("storyExperienceSummary").innerHTML = `${esc(headline)}<br>${esc(storyText)}`;
  }

  function openStoryExperience() {
    const selected = selectedStoryExperience();
    if (!selected) return;
    const { story, source } = selected;
    const params = new URLSearchParams({
      v: "frontend-v92",
      storyMode: "1",
      storyStar: String(story.star),
      storySeed: String(story.seed),
      storySource: "NATURAL"
    });
    persistSuppressionPolicy();
    window.open(`遊戲Demo.html?${params}`, "_blank", "noopener");
  }

  async function copyConfig() {
    readFixedControls();
    readSimulationControls();
    const exportValue = {
      schemaVersion: "natural-story-v4-full-class-ticket", exportedAt: new Date().toISOString(), configHash: currentHash(),
      seedInput: $("seed").value.trim() === "" ? "留白，每次執行隨機" : $("seed").value.trim(),
      config, storyPoolValidation: { cells: storyPoolCells }
    };
    const text = JSON.stringify(exportValue, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      $("copyConfigButton").textContent = "已複製";
      setTimeout(() => { $("copyConfigButton").textContent = "複製參數"; }, 1400);
    } catch (_) {
      const blob = new Blob([text], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `boss-duel-action-tree-${currentHash()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  }

  function statisticsExportValue() {
    if (!simulationResult) return null;
    return {
      schemaVersion: "action-tree-statistics-v2",
      exportedAt: new Date().toISOString(),
      configHash: currentHash(),
      modelRevision: config.modelId,
      targetGrossRtpPct: config.targetCoreRtpPct,
      phase: storyPoolCells.length === 24 ? "BUILT_IN_STORY_POOL_READY" : "PLAYER_MODEL_READY",
      result: simulationResult
    };
  }

  async function copyStatistics() {
    const payload = statisticsExportValue();
    if (!payload) return;
    const textValue = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(textValue);
      $("copyStatisticsButton").textContent = "已複製";
      setTimeout(() => { $("copyStatisticsButton").textContent = "複製統計資料"; }, 1400);
    } catch (_) { downloadStatistics(textValue); }
  }

  function downloadStatistics(textValue = "") {
    const payload = statisticsExportValue();
    if (!payload) return;
    const content = textValue || JSON.stringify(payload, null, 2);
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `boss-duel-statistics-${currentHash()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function restoreDefaults() {
    config = Core.sanitizeConfig(Core.DEFAULT_CONFIG);
    config.modelId = "natural-story-v4-full-class-ticket";
    config.versions.storyPool = "natural-240000-boss-plan-v10-score-ticket";
    storyPoolCells = [];
    simulationResult = null;
    catalogPool = null;
    simulationHash = "";
    dirty = true;
    mechanicsDirty = false;
    field("seed", "");
    hydrateFixedControls();
    design = null;
    buildMechanics();
    persistSuppressionPolicy();
    renderTreeMatrix();
    renderNaturalClassAverages();
    clearSimulation("已還原新模型範例，請執行模擬");
    updateExample();
    renderNaturalMetrics();
    renderSummary();
  }

  function bindEvents() {
    const globalIds = new Set(["targetCoreRtp", "tolerancePp", "winMinReturnX", "pushMinReturnX", "ticketBasis", "maxCandidateAttempts", "seed",
      "storyCarryEnabled", "correctionBothWays", "baselineRecognitionMode", "deviationBandPct", "maxDeductionPct", "maxDeductionX", "minNetPct", "maxCreditPct", "maxCreditX",
      "disconnectMode", "termExplicitAbandon", "termBossReroll", "termBetSwitch", "termRoundExhausted"]);
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("[data-tree-field]")) {
        markDirty(false);
        recompute({ readTree: true });
        return;
      }
      if (globalIds.has(target.id)) {
        markDirty(false);
        recompute({ readTree: true });
        return;
      }
      if (target.matches("[data-mechanic-switch], [data-simulation-field], [data-rule-field], [data-boss-row], [data-magic-row], [data-hand-row], [data-draw-fee], [data-suppression-path], [data-suppression-table], [data-suppression-table-enabled]")) {
        readMechanicTarget(target);
        markDirty(!target.matches("[data-simulation-field]"));
        config = Core.sanitizeConfig(config);
        if (target.matches("[data-suppression-path], [data-suppression-table], [data-suppression-table-enabled]")) {
          persistSuppressionPolicy();
          buildMechanics();
        }
        recompute({ readTree: !target.matches("[data-boss-row]") });
      }
    });
    ["exampleBaselineSpend", "exampleActualSpend", "examplePoolBefore", "exampleGrossReward"].forEach((id) => $(id).addEventListener("input", updateExample));
    document.querySelector(".tabs").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-panel]");
      if (!button) return;
      const scope = button.closest("[data-tab-scope]") || button.parentElement;
      const buttons = [...scope.querySelectorAll("button[data-panel]")];
      const panelIds = new Set(buttons.map((item) => item.dataset.panel));
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      panelIds.forEach((id) => {
        const panel = $(id);
        if (panel) panel.classList.toggle("active", id === button.dataset.panel);
      });
    });
    $("statisticsReportTabs").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-report-panel]");
      if (!button) return;
      $("statisticsReportTabs").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
      $("statisticsReports").querySelectorAll(".report-panel").forEach((panel) => panel.classList.toggle("active", panel.id === button.dataset.reportPanel));
    });
    $("runSimulationButton").addEventListener("click", startSimulation);
    ["storyExperienceStar", "storyExperienceClass"].forEach((id) =>
      $(id).addEventListener("change", () => { syncStoryExperienceIndexOptions(); renderStoryExperience(); })
    );
    ["storyExperienceSource", "storyExperienceIndex"].forEach((id) =>
      $(id).addEventListener("change", renderStoryExperience)
    );
    $("storyExperienceOpen").addEventListener("click", openStoryExperience);
    $("copyStatisticsButton").addEventListener("click", copyStatistics);
    $("exportStatisticsButton").addEventListener("click", () => downloadStatistics());
    $("restoreButton").addEventListener("click", restoreDefaults);
    $("copyConfigButton").addEventListener("click", copyConfig);
  }

  function init() {
    hydrateFixedControls();
    design = null;
    buildMechanics();
    renderTreeMatrix();
    renderStoryExperience();
    renderNaturalClassAverages();
    updateExample();
    renderSummary();
    bindEvents();
  }

  init();
})();
