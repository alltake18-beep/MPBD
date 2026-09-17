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
  const credits = (value, digits = reportDigits) => number(value).toLocaleString("zh-Hant", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const signedCredits = (value, digits = reportDigits) => `${number(value) > 0 ? "+" : ""}${credits(value, digits)}`;
  const count = (value) => Math.round(number(value)).toLocaleString("zh-Hant");
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  const signedX = (value, digits = 3) => `${number(value) > 0 ? "+" : ""}${x(value, digits)}`;

  let config = Core.sanitizeConfig(Core.DEFAULT_CONFIG);
  let hasSavedConfig = false;
  let savedSeedInput = "";
  try {
    const storedConfig = JSON.parse(localStorage.getItem(Core.STORAGE_KEY) || "null");
    if (storedConfig) {
      config = Core.sanitizeConfig(storedConfig.config || storedConfig);
      savedSeedInput = storedConfig.config ? String(storedConfig.seedInput || "") : "";
      hasSavedConfig = true;
    }
  } catch (_error) {
    config = Core.sanitizeConfig(Core.DEFAULT_CONFIG);
  }
  if (!hasSavedConfig) try {
    const storedSuppression = JSON.parse(localStorage.getItem(Core.NaturalCore.SUPPRESSION_STORAGE_KEY) || "null");
    if (storedSuppression) config.suppression = Core.NaturalCore.normalizeSuppressionPolicy(storedSuppression);
  } catch (_error) {
    config.suppression = Core.NaturalCore.normalizeSuppressionPolicy(config.suppression);
  }
  config = Core.sanitizeConfig(config);
  config.modelId = "natural-story-v4-full-class-ticket";
  config.versions.storyPool = "natural-240000-boss-plan-v11-score-ticket";
  let design = null;
  let storyPoolCells = [];
  let catalogPool = null;
  let simulationResult = null;
  let simulationHash = "";
  let dirty = false;
  let mechanicsDirty = false;
  let savedParamsHash = "";
  let activeSimulationWorker = null;
  let simulationRunId = 0;
  let simulationRunning = false;

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
    field("rewardFloorMultiple", config.carry.rewardFloorMultiple);
    field("rewardCeilingMultiple", config.carry.rewardCeilingMultiple);
  }

  function readFixedControls() {
    config.targetCoreRtpPct = number($("targetCoreRtp")?.value, 96);
    config.tolerancePp = number($("tolerancePp")?.value, 0.01);
    config.storyPool.winMinReturnX = number($("winMinReturnX")?.value, 3);
    config.storyPool.pushMinReturnX = number($("pushMinReturnX")?.value, 1);
    config.storyPool.candidateDrawMode = "FULL_CLASS_UNIFORM";
    config.storyPool.ticketBasis = number($("ticketBasis")?.value, 1000000);
    config.storyPool.maxCandidateAttempts = number($("maxCandidateAttempts")?.value, 10000);
    config.ticketMode = "DYNAMIC";
    config.seedMode = "FIXED";
    const seedText = $("seed")?.value.trim() || "";
    if (seedText !== "") config.seed = Math.round(number(seedText, config.seed));
    config.carry.enabled = true;
    config.mechanics.storyCarryEnabled = true;
    config.carry.rewardFloorMultiple = number($("rewardFloorMultiple")?.value, 0.1);
    config.carry.rewardCeilingMultiple = number($("rewardCeilingMultiple")?.value, 10);
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
      ? `已從贏多、贏少、輸三個完整分類各等機率抽一個自然故事，再配成 ${pct(config.targetCoreRtpPct, 3)}；實際總押注與劇本預定總押注的差額按同一 RTP 比例調整個人劇本水池。`
      : poolReady
        ? "240,000 個正式故事已完成 24 個星級 × 結果分類資料格的數量、自然分類與重播契約驗證；可繼續執行三分類全池抽取與分數配籤模擬。"
      : naturalState.issues.slice(0, 4).join("；");
  }

  function setState(id, pass, text) {
    const element = $(id);
    element.textContent = text;
    element.className = pass ? "valid" : "error";
  }

  function renderNaturalMetrics() {
    const state = naturalChecks();
    const status = $("naturalStatus");
    status.className = `pending-box ${state.pending ? "warn" : state.pass ? "valid" : "error"}`;
    status.innerHTML = `<strong>${state.pending ? "等待驗證" : state.pass ? "故事池驗證完成" : "故事池驗證失敗"}</strong><span>${state.pending ? "按「開始統計」後自動檢查 24 個結果資料格各 10,000 局、分類與重播契約。" : state.pass ? "8 星的贏多、贏少、輸各 10,000 局，全部具備種子與版本化操作重播契約。" : state.issues.slice(0, 4).join("；")}</span>`;
  }

  function buildMechanics() {
    const simulationInput = (key, label, step) => `<label>${label}<input data-simulation-field="${key}" type="number" step="${step}" value="${config.simulation[key]}"></label>`;
    const seedInput = $("seed")?.value ?? savedSeedInput;
    const betMode = `<label>Bet 模式<select data-simulation-field="betMode"><option value="FIXED"${config.simulation.betMode === "FIXED" ? " selected" : ""}>固定 Bet</option><option value="RANDOM_B1"${config.simulation.betMode === "RANDOM_B1" ? " selected" : ""}>第一組 Bet 隨機</option><option value="RANDOM_ALL"${config.simulation.betMode === "RANDOM_ALL" ? " selected" : ""}>全部 Bet 隨機</option><option value="SCHEDULED"${config.simulation.betMode === "SCHEDULED" ? " selected" : ""}>排程 Bet</option></select></label>`;
    const fixedBet = `<label>固定 Bet<select data-simulation-field="fixedBet">${Core.NaturalCore.BET_BUCKETS.map((bucket) => `<optgroup label="${esc(bucket.label)}">${bucket.bets.map((bet) => `<option value="${bet}"${Number(config.simulation.fixedBet) === bet ? " selected" : ""}>${bet}</option>`).join("")}</optgroup>`).join("")}</select></label>`;
    const playerBehaviorOptions = [
      ["SMART", "逐利玩家（真實劇情／含理牌）"],
      ["OFFICIAL_FUNDED", "聰明玩家（官方策略）"],
      ["FREE_RIDE", "白嫖玩家"],
      ["EXTREME", "極端玩家"]
    ];
    const playerBehavior = `<label>玩家行為<select data-simulation-field="playerBehavior">${playerBehaviorOptions.map(([value, label]) => `<option value="${value}"${config.simulation.playerBehavior === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
    $("simulationGrid").innerHTML = `
      <section class="param-group">
        <h3>玩家行為</h3>
        <div class="field-list">
          ${playerBehavior}
        </div>
      </section>
      <section class="param-group">
        <h3>模擬規格</h3>
        <div class="field-list">
          <label>RTP 設定（%）<input id="targetCoreRtp" type="number" min="80" max="99" step="0.001" value="${config.targetCoreRtpPct}"></label>
          ${simulationInput("playerCount", "玩家數", 1)}
          ${simulationInput("bossesPerPlayer", "每位玩家 BOSS 數", 1)}
          ${simulationInput("roundSlice", "RTP 切片 BOSS 數", 1)}
          ${betMode}
          ${fixedBet}
          ${simulationInput("decimalPlaces", "顯示小數位", 1)}
          <label>模擬種子<input id="seed" type="number" min="0" max="4294967295" step="1" value="${esc(seedInput)}" placeholder="留白＝每次隨機"></label>
        </div>
      </section>
      <section class="param-group">
        <h3>退幣條件</h3>
        <div class="field-list">
          ${simulationInput("cashoutPlayerCount", "獨立玩家數", 1)}
          ${simulationInput("cashoutStartCredits", "起始資產（分數）", 0.1)}
          ${simulationInput("cashoutTargetCredits", "退幣目標（分數）", 0.1)}
        </div>
      </section>`;
    $("bossTableBody").innerHTML = config.bossRows.map((row, rowIndex) => {
      const theoreticalMax = Core.maximumBossRewardX(row);
      return `<tr>${row.map((value, columnIndex) => `<td><input data-boss-row="${rowIndex}" data-column="${columnIndex}" type="number" step="${columnIndex === 0 || columnIndex === 5 ? 1 : 0.01}" value="${value}" ${columnIndex === 0 ? "readonly" : ""}></td>`).join("")}<td><output>${count(theoreticalMax)}x</output></td></tr>`;
    }).join("");
    $("magicTableBody").innerHTML = config.magicRows.map((row, rowIndex) => `<tr>${[0, 1, 3, 4, 5].map((columnIndex) => `<td><input data-magic-row="${rowIndex}" data-column="${columnIndex}" type="${columnIndex < 2 ? "text" : "number"}" step="0.01"${row[0] === "crit" && columnIndex === 4 ? ' min="1"' : ""} value="${esc(row[columnIndex])}" ${columnIndex === 0 ? "readonly" : ""}></td>`).join("")}</tr>`).join("");
    $("handTableBody").innerHTML = config.handRows.map((row, rowIndex) => `<tr>${[0, 1, 4].map((columnIndex) => `<td><input data-hand-row="${rowIndex}" data-column="${columnIndex}" type="${columnIndex < 2 ? "text" : "number"}" step="1" value="${esc(row[columnIndex])}" ${columnIndex === 0 ? "readonly" : ""}></td>`).join("")}</tr>`).join("");
    $("drawFeeGrid").innerHTML = config.drawFeesX.map((value, index) => `<label>第 ${index + 1} 次<input data-draw-fee="${index}" type="number" min="0" step="0.01" value="${value}"></label>`).join("");
    $("naturalDealGrid").innerHTML = `<label>REROLL BOSS 費用（x）<input type="number" value="1" readonly><span class="field-help">固定為當前押注額 × 1。</span></label>` + [
      ["deckStopCount", "牌堆停止張數", 1],
      ["playerBadHighRerollPct", "玩家爛高牌重抽率（%）", 0.1],
      ["bossBadHighRerollPct", "Boss 爛高牌重抽率（%）", 0.1],
      ["initialRerollLimit", "起手重抽上限", 1],
      ["magicCardsPerRound", "每回合魔法卡張數", 1]
    ].map(([key, label, step]) => `<label>${label}<input data-rule-field="${key}" type="number" min="0" step="${step}" value="${config.ruleSettings[key]}"></label>`).join("");
    const suppressionNumber = (path, label, help, value, step = 1) => `<label>${label}<input data-suppression-path="${path}" type="number" min="0" step="${step}" value="${value}"><span class="field-help">${help}</span></label>`;
    const suppression = config.suppression;
    $("suppressionRedrawGrid").innerHTML = [
      suppressionNumber("redraw.improvedAcceptPct", "牌型升級候選接受率（％）", "候選牌型升級時，被接受的機率。", suppression.redraw.improvedAcceptPct, 0.1),
      suppressionNumber("redraw.sameOrLowerAcceptPct", "同級／下降候選接受率（％）", "候選牌型同級或下降時，被接受的機率。", suppression.redraw.sameOrLowerAcceptPct, 0.1),
      suppressionNumber("redraw.maxCandidates", "單次最多候選數", "一次換牌最多檢查的候選數量。", suppression.redraw.maxCandidates, 1)
    ].join("");
    const suppressionTableMeta = {
      crit: ["暴擊倍率", "CRITICAL"],
      flatDamage: ["固定傷害", "FIXED DMG"],
      handBoost: ["牌型傷害倍率", "三條／四條／順子／同花／葫蘆等全部共用"]
    };
    $("suppressionMagicTableBody").innerHTML = Object.entries(suppressionTableMeta).flatMap(([key, meta]) => {
      const table = suppression.magic.tables[key];
      return table.outcomes.map((outcome, index) => `<tr><th>${index === 0 ? meta[0] : ""}</th><td>${index === 0 ? meta[1] : ""}</td><td><input data-suppression-table="${key}" data-outcome-index="${index}" data-outcome-field="value" type="number" min="0" step="0.01" value="${outcome.value}"></td><td><input data-suppression-table="${key}" data-outcome-index="${index}" data-outcome-field="weight" type="number" min="0" max="100" step="0.01" value="${outcome.weight}"></td></tr>`);
    }).join("");
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
      const output = target.closest("tr")?.querySelector("output");
      if (output) output.textContent = `${count(Core.maximumBossRewardX(row))}x`;
    }
    if (target.matches("[data-magic-row]")) {
      const column = Number(target.dataset.column);
      const row = config.magicRows[Number(target.dataset.magicRow)];
      row[column] = target.type === "number" ? number(target.value) : target.value;
      if (column === 3) row[2] = row[3];
      if (row[0] === "crit" && column === 4 && row[column] < 1) {
        row[column] = 1;
        target.value = "1";
      }
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
  }

  function readSimulationControls() {
    document.querySelectorAll("[data-simulation-field]").forEach((target) => {
      config.simulation[target.dataset.simulationField] = target.tagName === "SELECT" ? target.value : number(target.value);
    });
  }

  function renderSimulation(result) {
    reportDigits = Math.max(0, Math.min(8, Math.trunc(number(result.config.simulation.decimalPlaces, 2))));
    const t = result.totals;
    const c = result.cashout;
    const ratioPct = (part, total) => number(part) / Math.max(number(total), 1e-9) * 100;
    const rowHtml = (cells, heading = false) => `<tr>${cells.map((cell, index) => index === 0 && heading ? `<th>${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`;
    const suppressedBosses = (result.carryBucketStats || []).reduce((sum, row) => sum + number(row.suppressedBosses), 0);
    const suppressionBosses = (result.carryBucketStats || []).reduce((sum, row) => sum + number(row.bosses), 0);

    $("simSpend").textContent = credits(t.spend);
    $("simPayout").textContent = credits(t.net);
    $("simGrossRtp").textContent = pct(t.grossRtpPct, 4);
    $("simNetRtp").textContent = pct(t.netRtpPct, 4);
    $("simOffset").textContent = pct(ratioPct(suppressedBosses, suppressionBosses), 2);
    $("simKillAbort").textContent = `${pct(t.killRatePct, 2)}／${pct(100 - t.killRatePct, 2)}`;
    $("simRoundsDraws").textContent = `${t.avgRoundsPerBoss.toFixed(2)}／${t.avgDrawsPerBoss.toFixed(2)}`;
    $("simCarry").textContent = signedCredits(t.endingCarryX / Math.max(result.config.simulation.playerCount, 1));

    const highStarRows = result.starStats.filter((row) => row.star >= 7);
    const highStarCount = highStarRows.reduce((sum, row) => sum + row.count, 0);
    const handByKey = Object.fromEntries(result.handStats.map((row) => [row.key, row]));
    const avgDrawsFor = (keys) => {
      const rows = keys.map((key) => handByKey[key]).filter(Boolean);
      const hands = rows.reduce((sum, row) => sum + row.playerFinal, 0);
      const draws = rows.reduce((sum, row) => sum + row.compareDraws, 0);
      return hands ? (draws / hands).toFixed(2) : "—";
    };
    const drawSummary = [
      ["順子（含以上）", ["straight", "flush", "fullHouse", "four", "straightFlush"]],
      ["同花", ["flush"]], ["葫蘆", ["fullHouse"]], ["四條", ["four"]], ["同花順", ["straightFlush"]]
    ].map(([label, keys]) => [label, avgDrawsFor(keys)]);
    const organicPayout = number(t.bossGross) + number(t.handGross) + number(t.magicGross);
    const poolRange = result.poolBalanceRange || {};
    const poolRangeText = `${signedCredits(poolRange.minimumCredits)}～${signedCredits(poolRange.maximumCredits)}`;
    const averagePoolRangeText = `${signedCredits(poolRange.averageMinimumCredits)}～${signedCredits(poolRange.averageMaximumCredits)}`;
    const summaryGroups = [
      ["整體", "overall", [
        ["玩家 RTP", pct(t.netRtpPct, 4)], ["總押注", credits(t.spend)], ["總贏分", credits(t.net)],
        ["擊殺後水池", poolRangeText], ["平均剩餘水池", averagePoolRangeText]
      ], "five-equal"],
      ["BOSS", "boss", [
        ["挑戰總次數", count(t.bosses)], ["擊殺率", pct(t.killRatePct, 2)],
        ["平均獲得 Joker", t.jokerDraws ? `${(t.rounds / t.jokerDraws).toFixed(2)} 回合／次` : "—"],
        ["BOSS 平均賠率", t.bossRewardCount ? `${(t.bossRewardXSum / t.bossRewardCount).toFixed(2)}x` : "—"],
        ["平均幾隻遇到 7–8 星", highStarCount ? (t.bosses / highStarCount).toFixed(2) : "—"],
        ["抑制機率", pct(number(result.suppressionStats?.suppressedBosses) / Math.max(number(t.bosses), 1) * 100, 2)]
      ]],
      ["獨立統計", "pool", c.available === false ? [
        ["退幣率", "—"], ["平均遊玩回合", "—"], ["死亡平均回合", "—"], ["平均擊殺 BOSS", "—"]
      ] : [
        ["退幣率", pct(c.cashoutRatePct, 2)], ["平均遊玩回合", c.avgPlayedRounds.toFixed(reportDigits)],
        ["死亡平均回合", c.avgDeathRounds.toFixed(reportDigits)], ["平均擊殺 BOSS", c.avgBossKills.toFixed(reportDigits)]
      ]],
      ["比牌牌型／換牌次數", "boss-draw", drawSummary],
      ["RTP 佔比", "share", [
        ["BOSS", pct(ratioPct(t.bossGross, organicPayout), 2)],
        ["牌型", pct(ratioPct(t.handGross, organicPayout), 2)],
        ["魔法卡", pct(ratioPct(t.magicGross, organicPayout), 2)]
      ]]
    ];
    $("reportOverviewCards").innerHTML = summaryGroups.map(([title, tone, items, layout]) => `
      <section class="summary-panel" data-tone="${tone}"${layout ? ` data-layout="${layout}"` : ""}>
        <h4>${title}</h4>
        <div class="summary-metric-grid">
          ${items.map(([label, value]) => `<div class="summary-metric"><span class="summary-label">${label}</span><strong>${value}</strong></div>`).join("")}
        </div>
      </section>
    `).join("");

    const behaviorLabels = {
      SMART: "逐利玩家（真實劇情／含理牌）", OFFICIAL_FUNDED: "聰明玩家（官方策略）",
      FREE_RIDE: "白嫖玩家", EXTREME: "極端玩家"
    };
    const betModeLabels = { FIXED: "固定 Bet", RANDOM_B1: "第一組 Bet 隨機", RANDOM_ALL: "全部 Bet 隨機", SCHEDULED: "排程 Bet" };
    $("runInfoBody").innerHTML = [
      ["統計時間", new Date(result.runInfo.reportCompletedAt).toLocaleString("zh-Hant")],
      ["統計花費時間", `${Math.max(0, result.runInfo.reportElapsedMs)}ms`],
      ["玩家行為", behaviorLabels[result.config.simulation.playerBehavior] || esc(result.config.simulation.playerBehavior)],
      ["單注 Bet", `${betModeLabels[result.config.simulation.betMode] || esc(result.config.simulation.betMode)}／${result.config.simulation.fixedBet}`],
      ["總人數", count(result.config.simulation.playerCount)],
      ["每人 BOSS 數", count(result.config.simulation.bossesPerPlayer)],
      ["BOSS 切片", count(result.config.simulation.roundSlice)],
      ["種子", String(result.config.seed)],
      ["退幣玩家數", c.available === false ? "—" : count(c.totalPlayers)],
      ["退幣起始資產", credits(result.config.simulation.cashoutStartCredits)],
      ["退幣目標資產", credits(result.config.simulation.cashoutTargetCredits)],
      ["RTP 設定", pct(result.config.targetCoreRtpPct, 3)]
    ].map((row) => rowHtml(row, true)).join("");

    let cumulativeKills = 0;
    $("rtpTrendBody").innerHTML = result.roundSlices.map((row) => {
      cumulativeKills += row.kills;
      return rowHtml([`${row.startBoss}～${row.endBoss}`, pct(row.cumulativeNetRtpPct, 3), pct(row.netRtpPct, 3), count(cumulativeKills)], true);
    }).join("");

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
      row.bucket === 1000 ? "≥1000x" : `${row.bucket}x`, pct(ratioPct(cumulativeByBucket.get(row.bucket), totalBucketSpend), 3),
      row.count ? (totalBucketCount / row.count).toFixed(2) : "—", count(row.count)
    ], true)).join("");

    $("starStatsBody").innerHTML = result.starStats.map((row) => {
      const avgRewardX = row.bossRewardCount ? row.bossRewardXSum / row.bossRewardCount : 0;
      return rowHtml([`${row.star}★`, pct(ratioPct(row.bossGross, t.spend), 3), row.bossRewardCount ? x(avgRewardX) : "—",
        row.count ? (t.bosses / row.count).toFixed(2) : "—", pct(ratioPct(row.kills, row.count), 2),
        count(row.jokerDraws), count(row.straightFlushKills), (row.draws / Math.max(row.count, 1)).toFixed(2), count(row.refreshes)], true);
    }).join("");

    const totalStartHands = result.handStats.reduce((sum, row) => sum + row.playerStart, 0);
    const totalFinalHands = result.handStats.reduce((sum, row) => sum + row.playerFinal, 0);
    const totalBossHands = result.handStats.reduce((sum, row) => sum + row.bossFinal, 0);
    $("handStatsBody").innerHTML = result.handStats.map((row) => rowHtml([
      esc(row.label), pct(ratioPct(row.payout, t.spend), 3), pct(ratioPct(row.playerWins, row.playerFinal), 2),
      pct(ratioPct(row.playerStart, totalStartHands), 3), pct(ratioPct(row.playerFinal, totalFinalHands), 3),
      pct(ratioPct(row.bossFinal, totalBossHands), 3), (row.damage / Math.max(row.playerFinal, 1)).toFixed(3), row.baseDamage.toFixed(2)
    ], true)).join("");
    $("magicStatsBody").innerHTML = result.magicStats.map((row) => rowHtml([
      esc(row.label), count(row.draws), pct(ratioPct(row.effective, row.draws), 2), row.draws ? (t.rounds / row.draws).toFixed(2) : "—"
    ], true)).join("");

    const reportClassLabel = (key, fallback) => key === "win" ? "贏多" : key === "push" ? "贏" : key === "lose" ? "輸" : fallback;
    const suppression = result.suppressionStats;
    const unavailableMessage = "本次統計沒有可顯示的抑制資料。";
    $("suppressionOverviewBody").innerHTML = suppression ? [
      ["主要模擬 BOSS 數", count(suppression.totalBosses)],
      ["抽中輸劇本 BOSS 數", count(suppression.loseStoryBosses)],
      ["啟用抑制 BOSS 數", count(suppression.suppressedBosses)],
      ["未啟用抑制 BOSS 數", count(suppression.unsuppressedBosses)],
      ["整體抑制機率", pct(suppression.suppressionRatePct, 2)],
      ["輸劇本抑制機率", pct(suppression.loseStorySuppressionRatePct, 2)]
    ].map((row) => rowHtml(row, true)).join("") : `<tr><td colspan="2">${unavailableMessage}</td></tr>`;
    $("suppressionClassBody").innerHTML = suppression?.byClass?.length ? suppression.byClass.map((row) => rowHtml([
      reportClassLabel(row.key, row.label), count(row.bosses), count(row.suppressedBosses), pct(row.suppressionRatePct, 2)
    ], true)).join("") : `<tr><td colspan="4">${unavailableMessage}</td></tr>`;
    $("suppressionStarBody").innerHTML = suppression?.byStar?.length ? suppression.byStar.map((row) => rowHtml([
      `${row.star}★`, count(row.bosses), count(row.suppressedBosses), pct(row.suppressionRatePct, 2)
    ], true)).join("") : `<tr><td colspan="4">${unavailableMessage}</td></tr>`;
    $("suppressionBucketBody").innerHTML = (result.carryBucketStats || []).length ? result.carryBucketStats.map((row) => rowHtml([
      row.label, row.bets.join("／"), count(row.bosses), count(row.suppressedBosses), pct(row.suppressionRatePct, 2)
    ], true)).join("") : `<tr><td colspan="5">${unavailableMessage}</td></tr>`;

    $("carryBucketBody").innerHTML = result.carryBucketStats.map((row) => rowHtml([
      row.label, row.bets.join("／"), credits(row.totalWagerCredits), signedCredits(row.storyOpeningAdjustmentCredits),
      credits(row.entryBetPoolCredits), credits(row.redrawPoolCredits), credits(row.bossRerollPoolCredits), credits(row.actualPayoutCredits),
      pct(row.suppressionRatePct, 2), signedCredits(row.averageEndingBalanceCredits)
    ], true)).join("");
    $("carryStarStoryBody").innerHTML = Array.from({ length: 8 }, (_unused, index) => {
      const star = index + 1;
      const byClass = Object.fromEntries(["win", "push", "lose"].map((key) => [
        key, (result.cellStats || []).find((row) => row.star === star && row.key === key)?.count || 0
      ]));
      const bosses = byClass.win + byClass.push + byClass.lose;
      return rowHtml([
        `${star}★`, count(bosses),
        pct(ratioPct(byClass.win, bosses), 2),
        pct(ratioPct(byClass.push, bosses), 2),
        pct(ratioPct(byClass.lose, bosses), 2),
        count(byClass.win), count(byClass.push), count(byClass.lose)
      ], true);
    }).join("");

    $("copyStatisticsButton").disabled = false;
    $("resultsArea").classList.remove("is-hidden");
  }

  function clearSimulation(message = "參數已變更，請重新執行") {
    if (simulationRunning && activeSimulationWorker) {
      activeSimulationWorker.terminate();
      activeSimulationWorker = null;
    }
    simulationRunning = false;
    simulationRunId += 1;
    simulationResult = null;
    simulationHash = "";
    $("simulationState").textContent = message;
    ["simSpend", "simPayout", "simGrossRtp", "simNetRtp", "simOffset", "simKillAbort", "simRoundsDraws", "simCarry"].forEach((id) => { $(id).textContent = "—"; });
    ["reportOverviewCards", "runInfoBody", "rtpTrendBody", "storyTrendBody", "playerBossBucketBody", "starStatsBody",
      "handStatsBody", "magicStatsBody", "suppressionOverviewBody", "suppressionClassBody", "suppressionStarBody", "suppressionBucketBody",
      "playerDistributionBody", "storyBucketBody", "roundBucketBody",
      "cellStatsBody", "treeStatsBody", "carryBucketBody", "carryStarStoryBody", "terminationStatsBody",
      "riskFindingsBody", "ticketHealthBody", "ticketWeightBody", "ticketSamplesBody", "ticketStarHealthBody", "storySelectionCoverageBody", "settlementFunnelBody", "correctionCoverageBody",
      "classMigrationBody"].forEach((id) => { if ($(id)) $(id).innerHTML = ""; });
    $("copyStatisticsButton").disabled = true;
    setSimulationButtons(false);
    const resultsArea = $("resultsArea");
    if (resultsArea) resultsArea.classList.add("is-hidden");
    document.querySelector(".simulation-metrics")?.classList.add("is-hidden");
  }

  function recompute(options = {}) {
    if (options.readTree) readTreeMatrix();
    readFixedControls();
    design = null;
    updateSaveParamsButtonState();
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
    updateSaveParamsButtonState();
  }

  function setSimulationButtons(running) {
    const button = $("runSimulationButton");
    button.disabled = running;
    button.classList.toggle("is-statistics-progress", running);
    button.setAttribute("aria-busy", running ? "true" : "false");
    button.style.setProperty("--statistics-progress", running ? "0%" : "100%");
    $("stopSimulationButton").disabled = !running;
  }

  function updateSimulationProgress(message) {
    const percent = Math.max(0, Math.min(100, number(message.percent, 0)));
    $("runSimulationButton").style.setProperty("--statistics-progress", `${percent}%`);
    if (message.phase === "pool") {
      $("simulationState").textContent = message.reusedPool
        ? "正式故事水池已快取，準備執行主要模擬。"
        : "正在載入並整理 240,000 筆正式故事…";
    } else if (message.phase === "main") {
      $("simulationState").textContent = `主要模擬：玩家 ${count(message.completedPlayers)}／${count(message.totalPlayers)}；已完成 ${count(message.bosses)} 隻 BOSS。`;
    } else if (message.phase === "cashout") {
      $("simulationState").textContent = `獨立退幣：玩家 ${count(message.completedPlayers)}／${count(message.totalPlayers)}；已執行 ${count(message.rounds)} 回合。`;
    } else if (message.phase === "complete") {
      $("simulationState").textContent = "正在整理統計報表…";
    }
  }

  function activateReportPanel(panelId, options = {}) {
    const tabs = $("statisticsReportTabs");
    const reports = $("statisticsReports");
    const target = $(panelId);
    if (!tabs || !reports || !target) return;
    tabs.querySelectorAll("button[data-report-panel]").forEach((button) => {
      button.classList.toggle("active", button.dataset.reportPanel === panelId);
    });
    reports.querySelectorAll(".report-panel").forEach((panel) => panel.classList.toggle("active", panel.id === panelId));
    if (options.scroll) requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function beginSimulation(message) {
    if (simulationRunning && activeSimulationWorker) {
      activeSimulationWorker.terminate();
      activeSimulationWorker = null;
    }
    simulationRunning = true;
    simulationRunId += 1;
    setSimulationButtons(true);
    $("simulationState").textContent = message;
    return simulationRunId;
  }

  function stopSimulation() {
    if (!simulationRunning) return;
    if (activeSimulationWorker) activeSimulationWorker.terminate();
    activeSimulationWorker = null;
    simulationRunning = false;
    simulationRunId += 1;
    setSimulationButtons(false);
    $("simulationState").textContent = "已停止統計；目前參數與上一份完成的結果均已保留。";
  }

  function runSimulation(options = {}) {
    readFixedControls();
    readTreeMatrix();
    config = Core.sanitizeConfig(config);
    const runId = beginSimulation("正在載入正式故事資料…");
    requestAnimationFrame(() => {
      if (runId !== simulationRunId) return;
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
            replayVerified: naturalRows.every((story) => story.seed !== undefined && story.classKey === tree && story.plannerVersion === "boss-plan-v11")
          });
        }
        config.versions.storyPool = pool.version;
        simulationHash = currentHash();
        $("resultsArea").classList.add("is-hidden");
        $("copyStatisticsButton").disabled = true;
        $("simulationState").textContent = "正式故事資料載入完成，準備執行統計。";
        if (options.runAfterLoad) runRuntimeSimulation(runId);
      } catch (error) {
        catalogPool = null;
        clearSimulation(`故事產生失敗：${error.message}`);
      }
      if (!options.runAfterLoad && runId === simulationRunId) {
        simulationRunning = false;
        setSimulationButtons(false);
      }
    });
  }

  function runRuntimeSimulation(existingRunId = null) {
    readFixedControls();
    readTreeMatrix();
    readSimulationControls();
    const usesNaturalStories = true;
    if (usesNaturalStories && !catalogPool) {
      $("simulationState").textContent = "請先載入 240,000 個正式故事。";
      simulationRunning = false;
      setSimulationButtons(false);
      return;
    }
    if ($("seed").value.trim() === "") config.seed = randomSimulationSeed();
    config.seedMode = "FIXED";
    config = Core.sanitizeConfig(config);
    const suppressionState = Core.NaturalCore.validateSuppressionPolicy(config.suppression);
    if (!suppressionState.pass) {
      $("simulationState").textContent = `抑制參數錯誤：${suppressionState.issues.join("；")}`;
      simulationRunning = false;
      setSimulationButtons(false);
      return;
    }
    hydrateFixedControls();
    const behaviorLabel = config.simulation.playerBehavior === "SMART" ? "逐利" : config.simulation.playerBehavior === "OFFICIAL_FUNDED" ? "聰明" : config.simulation.playerBehavior === "FREE_RIDE" ? "白嫖" : "極端";
    const status = `正在以${behaviorLabel}玩家抽取正式劇本並執行實際行為，從三個完整分類各等機率抽 1 個候選，再配成 ${config.targetCoreRtpPct}%…`;
    const runId = existingRunId ?? beginSimulation(status);
    $("simulationState").textContent = status;
    try {
      const worker = activeSimulationWorker || new Worker("src/probability/boss-duel-action-tree-worker.js?v=action-tree-v61");
      activeSimulationWorker = worker;
      worker.onmessage = (event) => {
        if (runId !== simulationRunId || event.data?.runId !== runId) return;
        if (event.data.type === "progress") {
          updateSimulationProgress(event.data);
          return;
        }
        if (event.data.type === "error") {
          clearSimulation(`動態模擬失敗：${event.data.message}`);
          return;
        }
        if (event.data.type === "main-done") {
          simulationResult = event.data.result;
          simulationHash = currentHash();
          renderSimulation(simulationResult);
          $("copyStatisticsButton").disabled = true;
          $("simulationState").textContent = "主要模擬已完成；正在執行獨立退幣統計…";
          return;
        }
        if (event.data.type !== "done") return;
        simulationResult = event.data.result;
        simulationHash = currentHash();
        renderSimulation(simulationResult);
        $("simulationState").textContent = `完成：${count(simulationResult.totals.bosses)} 隻 BOSS；已套用${behaviorLabel}玩家行為，動態配籤最大誤差 ${number(simulationResult.totals.ticketErrorPpMax).toFixed(9)}pp。`;
        simulationRunning = false;
        setSimulationButtons(false);
        activateReportPanel("reportOverviewPanel", { scroll: true });
      };
      worker.onerror = (event) => {
        if (runId !== simulationRunId) return;
        if (activeSimulationWorker) activeSimulationWorker.terminate();
        activeSimulationWorker = null;
        clearSimulation(`動態模擬失敗：${event.message || "背景統計無法啟動"}`);
      };
      worker.postMessage({ type: "simulate", runId, config });
    } catch (error) {
      clearSimulation(`動態模擬失敗：${error.message}`);
    }
  }

  function startSimulation() {
    readFixedControls();
    readSimulationControls();
    const catalogMatchesClassification = catalogPool
      && catalogPool.config?.winMinReturnX === config.storyPool.winMinReturnX
      && catalogPool.config?.pushMinReturnX === config.storyPool.pushMinReturnX;
    if (!catalogMatchesClassification) runSimulation({ runAfterLoad: true });
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
      v: "frontend-v103",
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
      setTimeout(() => { $("copyConfigButton").textContent = "複製目前參數"; }, 1400);
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

  function paramsHash() {
    return hashValue({ config, seedInput: $("seed")?.value.trim() || "" });
  }

  function updateSaveParamsButtonState() {
    const button = $("saveParamsButton");
    if (!button) return;
    const hasUnsavedChanges = paramsHash() !== savedParamsHash;
    button.classList.toggle("secondary", !hasUnsavedChanges);
    button.dataset.hasUnsavedChanges = hasUnsavedChanges ? "true" : "false";
  }

  function saveParams() {
    readFixedControls();
    readTreeMatrix();
    readSimulationControls();
    config = Core.sanitizeConfig(config);
    const seedInput = $("seed").value.trim();
    localStorage.setItem(Core.STORAGE_KEY, JSON.stringify({
      schemaVersion: "action-tree-saved-params-v2",
      seedInput,
      config
    }));
    savedSeedInput = seedInput;
    savedParamsHash = paramsHash();
    updateSaveParamsButtonState();
    $("saveParamsButton").textContent = "已保存";
    setTimeout(() => { $("saveParamsButton").textContent = "保存參數"; }, 1400);
  }

  function bindEvents() {
    const globalIds = new Set(["targetCoreRtp", "tolerancePp", "winMinReturnX", "pushMinReturnX", "ticketBasis", "maxCandidateAttempts", "seed", "rewardFloorMultiple", "rewardCeilingMultiple"]);
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
      if (target.matches("[data-simulation-field], [data-rule-field], [data-boss-row], [data-magic-row], [data-hand-row], [data-draw-fee], [data-suppression-path], [data-suppression-table]")) {
        readMechanicTarget(target);
        markDirty(!target.matches("[data-simulation-field]"));
        config = Core.sanitizeConfig(config);
        if (target.matches("[data-suppression-path], [data-suppression-table]")) {
          persistSuppressionPolicy();
          buildMechanics();
        }
        recompute({ readTree: !target.matches("[data-boss-row]") });
      }
    });
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
      activateReportPanel(button.dataset.reportPanel);
    });
    $("runSimulationButton").addEventListener("click", startSimulation);
    $("stopSimulationButton").addEventListener("click", stopSimulation);
    $("copyStatisticsButton").addEventListener("click", copyStatistics);
    $("copyConfigButton").addEventListener("click", copyConfig);
    $("saveParamsButton").addEventListener("click", saveParams);
  }

  function init() {
    design = null;
    buildMechanics();
    hydrateFixedControls();
    field("seed", savedSeedInput);
    savedParamsHash = paramsHash();
    updateSaveParamsButtonState();
    setSimulationButtons(false);
    bindEvents();
  }

  init();
})();
