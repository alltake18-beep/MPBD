"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "機率工具.html"), "utf8");
const lab = fs.readFileSync(path.join(root, "src", "probability", "boss-duel-action-tree-lab.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "src", "probability", "boss-duel-action-tree-worker.js"), "utf8");
const labCss = fs.readFileSync(path.join(root, "src", "probability", "boss-duel-action-tree-lab.css"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "src", "probability", "boss-duel-action-tree-core.js"), "utf8");
const game = fs.readFileSync(path.join(root, "src", "game", "boss-duel-demo.js"), "utf8");
const engineerDoc = fs.readFileSync(path.join(root, "後端文件.html"), "utf8");
const preset = require(path.join(root, "data", "story", "boss-duel-story-preset-v1.js"));
const summaryPreset = require(path.join(root, "data", "story", "boss-duel-story-summary-preset-v1.js"));
const ActionCore = require(path.join(root, "src", "probability", "boss-duel-action-tree-core.js"));
const combined = `${html}\n${lab}\n${coreSource}`;

assert.equal(preset.version, "natural-story-preset-v14");
for (const asset of [
  "src/core/boss-duel-random.js", "src/core/boss-duel-poker-arrangement-core.js", "src/core/boss-duel-rules.js",
  "src/core/boss-duel-story-planner.js", "data/story/boss-duel-story-preset-v1.js", "data/story/boss-duel-story-summary-preset-v1.js",
  "src/core/boss-duel-natural-story-core.js", "src/probability/boss-duel-action-tree-core.js", "src/probability/boss-duel-action-tree-lab.js"
]) {
  assert.match(html, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${asset} must be loaded`);
}
assert.match(html, /boss-duel-action-tree-core\.js\?v=action-tree-v61/);
assert.match(html, /boss-duel-story-summary-preset-v1\.js\?v=story-summary-v8/);
assert.match(html, /src\/core\/boss-duel-poker-arrangement-core\.js\?v=arrange-v10/);
assert.match(engineerDoc, /backend-doc-v15/);

function tag(id) {
  const match = html.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, "i"));
  assert(match, `missing #${id}`);
  return match[0];
}

assert.equal((html.match(/class="control-card"/g) || []).length, 5);
const controlOrder = ["模擬設定", "抑制設定", "個人劇本水池", "遊戲機制", "故事產生"].map((label) => html.indexOf(`<strong>${label}</strong>`));
assert(controlOrder.every((index) => index >= 0));
assert.deepEqual([...controlOrder].sort((a, b) => a - b), controlOrder, "parameter cards must follow the old workflow with story generation last");
const simulationOrder = ["<h3>玩家行為</h3>", "<h3>模擬規格</h3>", "<h3>退幣條件</h3>"].map((label) => lab.indexOf(label));
assert(simulationOrder.every((index) => index >= 0));
assert.deepEqual([...simulationOrder].sort((a, b) => a - b), simulationOrder, "player behavior must precede scale and cashout conditions");
const targetRtpIndex = lab.indexOf('<label>RTP 設定（%）<input id="targetCoreRtp"');
assert(targetRtpIndex > simulationOrder[1] && targetRtpIndex < simulationOrder[2], "target RTP must belong to simulation specifications");
const playerCountIndex = lab.indexOf('simulationInput("playerCount", "玩家數", 1)');
assert(targetRtpIndex < playerCountIndex, "RTP setting must be the first simulation specification field");
const decimalPlacesIndex = lab.indexOf('simulationInput("decimalPlaces", "顯示小數位", 1)');
assert(decimalPlacesIndex > simulationOrder[1] && decimalPlacesIndex < simulationOrder[2], "display decimals must belong to simulation specifications");
assert.match(html, /<summary><span>02<\/span><strong>抑制設定<\/strong>/);
assert.doesNotMatch(combined, /提前離開率|earlyTerminationPct|RTP 容許差（pp）|池尾差容許|rtpTolerancePp|poolTailTolerancePp|波動與報表設定/);

assert.doesNotMatch(html, /八星自然故事目錄|故事目錄驗證|進水起伏|普通局BOSS|高星局BOSS|連殺/);
assert.doesNotMatch(html, /id="storyCarryEnabled"|id="switchGrid"|id="switchesPanel"|功能開關/);
assert.match(html, /<h3 id="carryTitle">個人劇本水池<\/h3>/);
assert.match(html, /遊戲機制（固定啟用）/);
assert.match(html, /原骰獎補正最低倍數/);
assert.match(html, /原骰獎補正最高倍數/);
assert.doesNotMatch(html, /data-panel="suppressionPanel"|id="suppressionPanel"/);
assert.doesNotMatch(html, /即時計算例|普通籤|高星籤|<th>作用<\/th>|<th>啟用<\/th>|前端揭露與稽核/);

const reportLabels = ["模擬資訊", "總覽", "RTP 走勢", "BOSS 切片", "BOSS", "牌型", "魔法卡", "抑制", "個人劇本水池"];
assert.equal((html.match(/data-report-panel=/g) || []).length, reportLabels.length);
let reportIndex = -1;
for (const label of reportLabels) {
  const index = html.indexOf(label, reportIndex + 1);
  assert(index > reportIndex, `report order must include ${label}`);
  reportIndex = index;
}
assert.match(html, /data-report-panel="reportTrendPanel"[^>]*>RTP 走勢<\/button>/);
assert.match(html, /<section id="reportTrendPanel" class="report-panel result-section active"/);
assert.match(html, /<div id="reportOverviewCards" class="summary-blocks"><\/div>/);
for (const label of ["玩家 RTP", "總押注", "總贏分", "擊殺後水池", "平均剩餘水池", "平均幾隻遇到 7–8 星", "抑制機率"]) {
  assert.match(lab, new RegExp(label), `overview must include ${label}`);
}
assert.match(lab, /minimumCredits/);
assert.match(lab, /maximumCredits/);
assert.match(lab, /suppressionStats\?\.suppressedBosses/);
assert.match(html, /<th>星級<\/th><th>RTP<\/th><th>平均賠率 x<\/th><th>平均幾次出現<\/th><th>擊殺率<\/th><th>獲得 Joker 次數<\/th><th>必殺次數<\/th><th>平均換牌次數<\/th><th>BOSS 刷新次數<\/th>/);
assert.match(html, /<th>下注區間<\/th><th>包含下注額<\/th><th>總押注<\/th><th>首次劇本調整<\/th><th>入場／CONTINUE 入池<\/th><th>付費換牌入池<\/th><th>更換 BOSS 入池<\/th><th>實際總派彩<\/th><th>抑制機率<\/th><th>平均剩餘水池<\/th>/);
assert.match(html, /data-report-panel="reportSuppressionPanel">抑制<\/button>/);
assert.doesNotMatch(html, /劇本抽籤|配籤品質/);
assert.match(html, /<span>總贏分<\/span><strong id="simPayout">/);
assert.doesNotMatch(html, /玩家實付獎|Credits/);
assert.doesNotMatch(lab, /\} Credits`/);
assert.doesNotMatch(html, /玩家實際投入|目標 RTP 入池額|自然派彩<\/th>|補正觸發率|期末餘額|守恆誤差/);

for (const id of [
  "simulationGrid", "runSimulationButton", "stopSimulationButton", "copyConfigButton", "copyStatisticsButton", "saveParamsButton", "rewardFloorMultiple", "rewardCeilingMultiple",
  "bossTableBody", "magicTableBody", "handTableBody", "drawFeeGrid", "naturalDealGrid",
  "suppressionRedrawGrid", "suppressionMagicTableBody",
  "tolerancePp", "winMinReturnX", "pushMinReturnX", "candidateDrawMode", "ticketBasis", "maxCandidateAttempts",
  "runInfoBody", "reportOverviewCards",
  "rtpTrendBody", "playerBossBucketBody", "starStatsBody", "handStatsBody", "magicStatsBody",
  "suppressionOverviewBody", "suppressionClassBody", "suppressionStarBody", "suppressionBucketBody",
  "carryBucketBody", "carryStarStoryBody"
]) tag(id);

for (const removedId of [
  "restoreButton", "exportStatisticsButton", "suppressionActivationGrid", "suppressionMagicSwitchGrid", "suppressionPolicySummary", "suppressionRedrawStatsBody", "suppressionMagicStatsBody",
  "bossExperienceBody", "cashoutStatsBody", "drawByHandBody", "spendSourceBody", "payoutSourceBody",
  "carryAuditBody", "correctionHealthBody", "carryBucketTailBody", "storySummaryCards"
]) {
  assert.doesNotMatch(html, new RegExp(`id=["']${removedId}["']`));
}
assert.doesNotMatch(combined, /renderSimulationLegacy|bossExperienceBody|cashoutStatsBody|drawByHandBody|spendSourceBody|payoutSourceBody|carryAuditBody|correctionHealthBody|carryBucketTailBody/);
assert.doesNotMatch(combined, /本次換牌候選抑制設定|本次傷害魔法抑制表/);
assert.match(html, /<h3>各星 BOSS 劇本抽中分布<\/h3>/);
assert.match(html, /<th>星級<\/th><th>BOSS 數<\/th><th>贏多（%）<\/th><th>贏（%）<\/th><th>輸（%）<\/th><th>贏多數量<\/th><th>贏數量<\/th><th>輸數量<\/th>/);
assert.match(lab, /pct\(ratioPct\(byClass\.win, bosses\), 2\),\s*pct\(ratioPct\(byClass\.push, bosses\), 2\),\s*pct\(ratioPct\(byClass\.lose, bosses\), 2\),\s*count\(byClass\.win\), count\(byClass\.push\), count\(byClass\.lose\)/);
assert(fs.existsSync(path.join(root, "src", "probability", "boss-duel-action-tree-worker.js")), "missing cancellable statistics worker");
assert.match(lab, /new Worker\("src\/probability\/boss-duel-action-tree-worker\.js\?v=action-tree-v61"\)/);
assert.match(lab, /activeSimulationWorker \|\| new Worker/, "completed worker must remain available for later simulations");
assert.match(worker, /type: "main-done"/, "main report must be published before independent cashout finishes");
assert.match(worker, /BossDuelProbabilityWorkerState = \{ pool: null \}/, "worker must retain its hydrated story pool");
assert.match(labCss, /width: var\(--statistics-progress, 0%\)/, "statistics button must display determinate progress");
assert.match(lab, /activateReportPanel\("reportOverviewPanel", \{ scroll: true \}\)/, "completed statistics must open and scroll to the overview report");
assert.match(lab, /localStorage\.setItem\(Core\.STORAGE_KEY/);
assert.equal(ActionCore.STORAGE_KEY, "boss-duel:action-tree-carry:config:v2");
assert.match(lab, /schemaVersion: "action-tree-saved-params-v2"/);

assert.match(combined, /id="targetCoreRtp"[^>]*min="80"[^>]*max="99"/);
assert.match(combined, /id="seed"[^>]*placeholder="留白＝每次隨機"/);
assert.match(lab, /value="\$\{esc\(seedInput\)\}" placeholder="留白＝每次隨機"/);
assert.equal(ActionCore.DEFAULT_CONFIG.simulation.decimalPlaces, 2);
assert.equal(Object.hasOwn(ActionCore.DEFAULT_CONFIG.simulation, "earlyTerminationPct"), false);
assert.equal(Object.hasOwn(ActionCore.DEFAULT_CONFIG.simulation, "rtpTolerancePp"), false);
assert.equal(Object.hasOwn(ActionCore.DEFAULT_CONFIG.simulation, "poolTailTolerancePp"), false);
assert.match(lab, /<label>固定 Bet<select data-simulation-field="fixedBet">/);
assert.deepEqual(ActionCore.BET_VALUES, [1, 2, 5, 10, 20, 50, 100, 200, 500, 800, 1000, 1200, 1500, 1800, 2000]);
assert.match(lab, /bucket\.bets\.map\(\(bet\) => `<option value="\$\{bet\}"/);
assert.equal(ActionCore.sanitizeConfig({ simulation: { fixedBet: 3 } }).simulation.fixedBet, 1, "unsupported fixed Bet must return to the official default");
for (const bet of ActionCore.BET_VALUES) assert.equal(ActionCore.sanitizeConfig({ simulation: { fixedBet: bet } }).simulation.fixedBet, bet);
assert.match(tag("candidateDrawMode"), /disabled/);
assert.match(tag("ticketBasis"), /value="1000000"/);
assert.match(tag("maxCandidateAttempts"), /value="10000"/);
assert.match(combined, /FULL_CLASS_UNIFORM_THEN_SCORE_TICKETS/);
assert.match(combined, /buildNaturalStoryPoolFromPreset/);

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "duplicate DOM ids");
const localScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => decodeURIComponent(match[1].split(/[?#]/)[0]));
for (const source of localScripts) assert(fs.existsSync(path.join(root, source)), `missing script ${source}`);

assert.equal(ActionCore.STORY_BET_CONTRACT_VERSION, "story-bet-scaling-v1");
assert.equal(ActionCore.NaturalCore.SUPPRESSION_STORAGE_KEY, "boss-duel:suppression-policy:v5");
assert.deepEqual(
  {
    playerCount: ActionCore.DEFAULT_CONFIG.simulation.playerCount,
    bossesPerPlayer: ActionCore.DEFAULT_CONFIG.simulation.bossesPerPlayer,
    roundSlice: ActionCore.DEFAULT_CONFIG.simulation.roundSlice,
    cashoutPlayerCount: ActionCore.DEFAULT_CONFIG.simulation.cashoutPlayerCount,
    cashoutStartCredits: ActionCore.DEFAULT_CONFIG.simulation.cashoutStartCredits,
    cashoutTargetCredits: ActionCore.DEFAULT_CONFIG.simulation.cashoutTargetCredits
  },
  { playerCount: 1, bossesPerPlayer: 100, roundSlice: 1, cashoutPlayerCount: 1, cashoutStartCredits: 100, cashoutTargetCredits: 200 },
  "probability tool must use the approved default parameter set"
);
assert.equal(ActionCore.DEFAULT_CONFIG.simulation.playerBehavior, "EXTREME");
assert.deepEqual(ActionCore.DEFAULT_CONFIG.suppression.redraw, {
  enabled: true, maxCandidates: 1, improvedAcceptPct: 33, sameOrLowerAcceptPct: 100, forceFinalCandidate: true
});
assert.deepEqual(ActionCore.DEFAULT_CONFIG.suppression.magic.tables.crit.outcomes.map((row) => row.weight), [50, 25, 15, 8, 2]);
assert.deepEqual(ActionCore.DEFAULT_CONFIG.suppression.magic.tables.flatDamage.outcomes.map((row) => row.weight), [60, 30, 8, 2]);
assert.deepEqual(ActionCore.DEFAULT_CONFIG.suppression.magic.tables.handBoost.outcomes.map((row) => row.weight), [50, 30, 20]);
assert.match(lab, /起始資產（分數）/);
assert.match(lab, /退幣目標（分數）/);
assert.doesNotMatch(lab, /起始資產（x）|退幣目標（x）/);
const migratedCashoutConfig = ActionCore.sanitizeConfig({ simulation: { cashoutStartX: 37, cashoutTargetX: 81 } });
assert.equal(migratedCashoutConfig.simulation.cashoutStartCredits, 37);
assert.equal(migratedCashoutConfig.simulation.cashoutTargetCredits, 81);
assert.equal("cashoutStartX" in migratedCashoutConfig.simulation, false);
assert.equal("cashoutTargetX" in migratedCashoutConfig.simulation, false);
const scaled = ActionCore.materializeStoryCredits({ spendX: 2.5, payoutX: 7.5 }, 3333);
assert.equal(scaled.spendCredits, 2.5 * 3333);
assert.equal(scaled.payoutCredits, 7.5 * 3333);
assert.equal(scaled.netX, 5);
assert.equal(scaled.betIndependent, true);

const cashoutConfig = ActionCore.sanitizeConfig({
  ...ActionCore.DEFAULT_CONFIG,
  simulation: {
    ...ActionCore.DEFAULT_CONFIG.simulation,
    playerCount: 1,
    bossesPerPlayer: 1,
    cashoutPlayerCount: 4,
    cashoutStartCredits: 10,
    cashoutTargetCredits: 20
  }
});
const cashoutPool = ActionCore.NaturalCore.buildNaturalStoryPoolFromPreset(cashoutConfig, {
  ...preset,
  naturalSummaries: summaryPreset.naturalSummaries
});
assert.equal(ActionCore.NaturalCore.buildNaturalStoryPoolFromPreset(cashoutConfig, {
  ...preset,
  naturalSummaries: summaryPreset.naturalSummaries
}), cashoutPool, "hydrated story pool must be reused for an unchanged contract");
const progressEvents = [];
const naturalCashoutResult = ActionCore.simulateNaturalModel(cashoutConfig, {
  pool: cashoutPool,
  onProgress: (progress) => progressEvents.push(progress)
});
assert.equal(progressEvents.filter((progress) => progress.phase === "main").length, cashoutConfig.simulation.playerCount);
assert.equal(progressEvents.filter((progress) => progress.phase === "cashout").length, cashoutConfig.simulation.cashoutPlayerCount);
assert.deepEqual(
  ActionCore.simulateIndependentCashout(cashoutConfig, { pool: cashoutPool }),
  naturalCashoutResult.cashout,
  "split independent cashout must match the combined simulation result"
);
assert.equal(naturalCashoutResult.cashout.available, true);
assert.equal(naturalCashoutResult.cashout.targetRtpPct, cashoutConfig.targetCoreRtpPct, "cashout ticketing must use the simulation RTP");
const budgetStory = ActionCore.NaturalCore.simulateNaturalStory(
  cashoutConfig,
  1,
  cashoutPool.naturalCells[1].win[0].seed,
  { includePath: true, maxSpendX: 2 }
);
assert(budgetStory.spendX <= 2 + 1e-9, "profit-seeking cashout replay must not plan paid actions beyond the available score");
const unaffordableEntryResult = ActionCore.simulateIndependentCashout(ActionCore.sanitizeConfig({
  ...cashoutConfig,
  simulation: {
    ...cashoutConfig.simulation,
    fixedBet: 20,
    cashoutPlayerCount: 1,
    cashoutStartCredits: 10,
    cashoutTargetCredits: 200
  }
}), { pool: cashoutPool });
assert.equal(unaffordableEntryResult.successes, 0);
assert.equal(unaffordableEntryResult.deaths, 1);
assert.equal(unaffordableEntryResult.avgPlayedRounds, 0, "a player who cannot pay the configured Bet must stop before entering a Boss");
assert.equal(naturalCashoutResult.cashout.totalPlayers, cashoutConfig.simulation.cashoutPlayerCount);
assert.equal(naturalCashoutResult.cashout.successes + naturalCashoutResult.cashout.deaths, cashoutConfig.simulation.cashoutPlayerCount);
assert(naturalCashoutResult.cashout.avgPlayedRounds > 0, "natural-story cashout players must actually run");
assert.equal(
  naturalCashoutResult.carryBucketStats.reduce((sum, row) => sum + row.totalWagerCredits, 0),
  naturalCashoutResult.totals.spend,
  "three Bet buckets must contain main-simulation wagers only"
);
assert(naturalCashoutResult.carryBucketStats.some((row) => row.entryBetPoolCredits > 0), "successful START and CONTINUE wagers must post to the live pool at locked RTP");
for (const row of naturalCashoutResult.carryBucketStats) {
  assert(Number.isFinite(row.storyOpeningAdjustmentCredits), "each Bet bucket must report the signed first-START story adjustment");
  assert(Number.isFinite(row.entryBetPoolCredits), "each Bet bucket must report live START and CONTINUE accrual");
  assert(Number.isFinite(row.redrawPoolCredits), "each Bet bucket must report live paid-redraw accrual");
  assert(Number.isFinite(row.actualPayoutCredits), "each Bet bucket must report actual total payout debited from the pool");
  assert(Math.abs(
    row.targetAccrualCredits - (row.storyOpeningAdjustmentCredits + row.entryBetPoolCredits + row.redrawPoolCredits)
  ) < 1e-6, "story accrual must equal opening adjustment plus all live in-story wagers at locked RTP");
  assert.equal(
    row.averageEndingBalanceCredits,
    row.endingBalanceCredits / cashoutConfig.simulation.playerCount,
    "average remaining pool must use the actual ending balance after live wager accrual"
  );
}
assert(naturalCashoutResult.carryBucketStats.every((row) => Number.isFinite(row.suppressionRatePct)), "suppression rate must be reported per Bet bucket");
assert.deepEqual(naturalCashoutResult.storyTicketStats.map((row) => row.key), ["win", "push", "lose"]);
assert.equal(naturalCashoutResult.storyTicketStats.reduce((sum, row) => sum + row.selectedCount, 0), naturalCashoutResult.totals.bosses);
assert.equal(naturalCashoutResult.suppressionStats.totalBosses, naturalCashoutResult.totals.bosses);
assert.equal(naturalCashoutResult.suppressionStats.byClass.length, 3);
assert.equal(naturalCashoutResult.suppressionStats.byStar.length, 8);
assert.equal(naturalCashoutResult.poolBalanceRange.playerCount, cashoutConfig.simulation.playerCount);
assert.equal(
  naturalCashoutResult.poolBalanceRange.observations,
  naturalCashoutResult.totals.bosses,
  "post-Boss pool range must contain one observation for every player × Boss result"
);
assert.equal(
  naturalCashoutResult.poolBalanceRange.bossIndexObservations,
  cashoutConfig.simulation.bossesPerPlayer,
  "average pool range must contain one cross-player average for every Boss sequence number"
);
assert.equal(naturalCashoutResult.poolBalanceRange.entryBetPoolCredits, 0);

const behaviorCard = (rank, suit, id, magicEffects) => ({
  rank, suit, id, baseId: id, joker: false, magicEffects
});
const fourFlushHand = [
  behaviorCard(2, "H", "2H"), behaviorCard(4, "H", "4H"),
  behaviorCard(6, "H", "6H"), behaviorCard(8, "H", "8H"),
  behaviorCard(13, "S", "KS", { crit: 2 }), behaviorCard(12, "D", "QD")
];
const officialFourFlush = ActionCore.chooseBehaviorKeepDecision({ playerCards: fourFlushHand }, "OFFICIAL_FUNDED");
const extremeFourFlush = ActionCore.chooseBehaviorKeepDecision({ playerCards: fourFlushHand }, "EXTREME");
assert.equal(officialFourFlush.arrangementKey, "fourFlush");
assert.deepEqual(officialFourFlush.initialKeepCardIds, ["2H", "4H", "6H", "8H"], "smart human behavior must release an unrelated critical card to chase a four-card flush");
assert.deepEqual(extremeFourFlush.initialKeepCardIds, ["2H", "4H", "6H", "8H", "KS"], "extreme behavior must retain critical damage while chasing a high ceiling");

const pairWithEffects = [
  behaviorCard(10, "H", "10H"), behaviorCard(10, "S", "10S"),
  behaviorCard(13, "C", "KC", { crit: 2 }), behaviorCard(12, "D", "QD", { flatDamage: 4 }),
  behaviorCard(7, "C", "7C"), behaviorCard(4, "D", "4D")
];
const officialPair = ActionCore.chooseBehaviorKeepDecision({ playerCards: pairWithEffects }, "OFFICIAL_FUNDED");
assert.deepEqual(officialPair.coreCardIds, ["10H", "10S"]);
assert.deepEqual(officialPair.extraKeepCardIds, ["KC"], "one pair must keep at most one extra effect and prefer critical over flat damage");
assert.equal(officialPair.manualAdjustment, true);

const fourOfAKindWithFlat = [
  behaviorCard(10, "H", "10H"), behaviorCard(10, "S", "10S"),
  behaviorCard(10, "D", "10D"), behaviorCard(10, "C", "10C"),
  behaviorCard(13, "C", "KC", { flatDamage: 4 }), behaviorCard(4, "D", "4D")
];
const officialFourOfAKind = ActionCore.chooseBehaviorKeepDecision({ playerCards: fourOfAKindWithFlat }, "OFFICIAL_FUNDED");
assert.equal(officialFourOfAKind.arrangementKey, "fourOfAKind");
assert.deepEqual(officialFourOfAKind.extraKeepCardIds, ["KC"], "a completed four of a kind may retain the best effect in its open fifth slot");
assert.equal(
  ActionCore.behaviorDrawLimit("OFFICIAL_FUNDED", { smartMaxDraws: 9 }),
  5,
  "smart player must allow at most five total redraws in each round"
);

for (const behavior of ["SMART", "OFFICIAL_FUNDED", "FREE_RIDE", "EXTREME"]) {
  const behaviorConfig = ActionCore.sanitizeConfig({
    ...ActionCore.DEFAULT_CONFIG,
    seed: 123456789,
    simulation: {
      ...ActionCore.DEFAULT_CONFIG.simulation,
      playerBehavior: behavior,
      playerCount: 2,
      bossesPerPlayer: 10,
      cashoutPlayerCount: 1
    }
  });
  const behaviorResult = ActionCore.simulateNaturalModel(behaviorConfig, { pool: cashoutPool, skipCashout: true });
  assert.equal(behaviorResult.totals.bosses, 20, `${behavior} must execute the formal-story population`);
  assert.equal(behaviorResult.poolBalanceRange.observations, 20, `${behavior} must retain every player × Boss pool observation instead of summing players`);
  assert.equal(behaviorResult.poolBalanceRange.bossIndexObservations, 10, `${behavior} must average players separately for each Boss sequence number`);
  assert.equal(behaviorResult.carryBucketStats.length, 3, `${behavior} must produce all three personal-pool buckets`);
  assert.equal(behaviorResult.suppressionStats.totalBosses, 20, `${behavior} must produce suppression statistics`);
  assert.equal(
    behaviorResult.suppressionStats.byClass.filter((row) => row.key !== "lose").reduce((sum, row) => sum + row.suppressedBosses, 0),
    0,
    `${behavior} must never suppress a win or push story`
  );
  if (behavior === "SMART") assert.equal(behaviorResult.suppressionStats.suppressedBosses, 0, "exact story replay must not deviate");
  else assert(behaviorResult.suppressionStats.suppressedBosses > 0, `${behavior} must exercise lose-story deviation suppression in the deterministic sample`);
}

const forcedOff = ActionCore.sanitizeConfig({
  ...ActionCore.DEFAULT_CONFIG,
  mechanics: Object.fromEntries(Object.keys(ActionCore.DEFAULT_CONFIG.mechanics).map((key) => [key, false])),
  carry: { ...ActionCore.DEFAULT_CONFIG.carry, enabled: false },
  suppression: {
    ...ActionCore.DEFAULT_CONFIG.suppression,
    enabled: false,
    activation: { ...ActionCore.DEFAULT_CONFIG.suppression.activation, enabled: false, requireLoseStory: false, requireKeepDeviation: false, latchForBoss: false },
    redraw: { ...ActionCore.DEFAULT_CONFIG.suppression.redraw, enabled: false, forceFinalCandidate: false },
    magic: {
      ...ActionCore.DEFAULT_CONFIG.suppression.magic,
      enabled: false,
      tables: Object.fromEntries(Object.entries(ActionCore.DEFAULT_CONFIG.suppression.magic.tables).map(([key, table]) => [key, { ...table, enabled: false }]))
    }
  },
  ruleSettings: { ...ActionCore.DEFAULT_CONFIG.ruleSettings, refreshCostX: 7 }
});
for (const key of ["actionTreeEnabled", "storyCarryEnabled", "magicEnabled", "jokerEnabled", "freeDrawEnabled", "coinEnabled", "critEnabled", "flatEnabled", "pokerBoostEnabled", "bossRerollEnabled", "paidDrawEnabled", "tieRedealEnabled", "strictNaturalGate"]) {
  assert.equal(forcedOff.mechanics[key], true, `${key} must remain enabled`);
}
assert.equal(forcedOff.mechanics.chainEnabled, false);
assert.equal(forcedOff.carry.enabled, true);
assert.equal(forcedOff.carry.rewardFloorMultiple, 0.1);
assert.equal("rewardFloorPct" in forcedOff.carry, false);
assert.equal(forcedOff.ruleSettings.refreshCostX, 1);
assert.equal(forcedOff.suppression.enabled, true);
assert.equal(forcedOff.suppression.activation.enabled, true);
assert.equal(forcedOff.suppression.redraw.enabled, true);
assert.equal(forcedOff.suppression.redraw.forceFinalCandidate, true);
assert.equal(forcedOff.suppression.magic.enabled, true);
for (const table of Object.values(forcedOff.suppression.magic.tables)) assert.equal(table.enabled, true);
assert.deepEqual(forcedOff.magicRows.map((row) => row[3]), [50, 75, 125, 175, 175, 50, 100, 175, 25, 50]);
assert.equal(forcedOff.magicRows.find((row) => row[0] === "crit")[4], 1, "critical multiplier minimum must be x1");
assert.match(coreSource, /finite\(item\.row\[3\], 0\)/, "all stars must use the one visible magic ticket column");
assert.deepEqual(ActionCore.DEFAULT_CONFIG.bossRows.map(ActionCore.maximumBossRewardX), [6, 36, 72, 144, 216, 288, 432, 576], "Boss theoretical maxima must use reachable dice states");
assert.doesNotMatch(lab, /18 \* Math\.pow\(6, multiplierDice\)/, "obsolete maximum-reward shortcut must not return");

for (const behavior of ["OFFICIAL_FUNDED", "FREE_RIDE", "EXTREME", "SMART"]) {
  const config = ActionCore.sanitizeConfig({ ...ActionCore.DEFAULT_CONFIG, simulation: { ...ActionCore.DEFAULT_CONFIG.simulation, playerBehavior: behavior } });
  assert.equal(config.simulation.playerBehavior, behavior);
}
const rerollConfig = ActionCore.sanitizeConfig({
  ...ActionCore.DEFAULT_CONFIG,
  seed: 20260913,
  simulation: { ...ActionCore.DEFAULT_CONFIG.simulation, playerBehavior: "OFFICIAL_FUNDED", playerCount: 10, bossesPerPlayer: 100, cashoutPlayerCount: 2, fixedBet: 20 }
});
const rerollResult = ActionCore.simulatePlayerModels(rerollConfig, { skipCashout: true });
assert(rerollResult.totals.bossRefreshes > 0, "deterministic reroll sample must contain a reroll");
assert.equal(rerollResult.totals.refreshSpend, rerollResult.totals.bossRefreshes * rerollConfig.simulation.fixedBet, "each active reroll must charge current Bet × 1");

const cashoutBaseConfig = {
  ...ActionCore.DEFAULT_CONFIG,
  seed: 1851072368,
  simulation: {
    ...ActionCore.DEFAULT_CONFIG.simulation,
    playerBehavior: "OFFICIAL_FUNDED",
    playerCount: 2,
    cashoutPlayerCount: 100,
    cashoutStartCredits: 100,
    cashoutTargetCredits: 200
  }
};
const cashoutAt10Bosses = ActionCore.simulatePlayerModels(ActionCore.sanitizeConfig({
  ...cashoutBaseConfig,
  simulation: { ...cashoutBaseConfig.simulation, bossesPerPlayer: 10 }
})).cashout;
const cashoutAt100Bosses = ActionCore.simulatePlayerModels(ActionCore.sanitizeConfig({
  ...cashoutBaseConfig,
  simulation: { ...cashoutBaseConfig.simulation, bossesPerPlayer: 100 }
})).cashout;
assert.deepEqual(cashoutAt10Bosses, cashoutAt100Bosses, "independent cashout simulation must not depend on the main bosses-per-player setting");

assert.match(game, /if \(!spend\(runtimeConfig\.entryCostX, \{ storySpend: false \}\)\) return;/);
assert.match(game, /entryCostX: 1/);
assert.match(game, /options\.poolAccrual !== false/);

console.log(JSON.stringify({
  status: "ok", cacheKey: "action-tree-v61", storyCount: 240000,
  controlCards: 5, reportTabs: reportLabels.length, uniqueDomIds: ids.length, rerolls: rerollResult.totals.bossRefreshes
}, null, 2));
