"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "機率工具.html"), "utf8");
const lab = fs.readFileSync(path.join(root, "src", "probability", "boss-duel-action-tree-lab.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "src", "probability", "boss-duel-action-tree-core.js"), "utf8");
const game = fs.readFileSync(path.join(root, "src", "game", "boss-duel-demo.js"), "utf8");
const engineerDoc = fs.readFileSync(path.join(root, "後端文件.html"), "utf8");
const preset = require(path.join(root, "data", "story", "boss-duel-story-preset-v1.js"));
const ActionCore = require(path.join(root, "src", "probability", "boss-duel-action-tree-core.js"));
const combined = `${html}\n${lab}\n${coreSource}`;

assert.equal(preset.version, "natural-story-preset-v13");
for (const asset of [
  "src/core/boss-duel-random.js", "src/core/boss-duel-poker-arrangement-core.js", "src/core/boss-duel-rules.js",
  "src/core/boss-duel-story-planner.js", "data/story/boss-duel-story-preset-v1.js", "data/story/boss-duel-story-summary-preset-v1.js",
  "src/core/boss-duel-natural-story-core.js", "src/probability/boss-duel-action-tree-core.js", "src/probability/boss-duel-action-tree-lab.js"
]) {
  assert.match(html, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${asset} must be loaded`);
}
assert.match(html, /boss-duel-action-tree-core\.js\?v=action-tree-v36/);
assert.match(html, /boss-duel-story-summary-preset-v1\.js\?v=story-summary-v7/);
assert.match(html, /src\/core\/boss-duel-poker-arrangement-core\.js\?v=arrange-v10/);
assert.match(html, /href="%E5%BE%8C%E7%AB%AF%E6%96%87%E4%BB%B6\.html\?v=backend-doc-v9"/);
assert.match(engineerDoc, /backend-doc-v9/);

function tag(id) {
  const match = html.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, "i"));
  assert(match, `missing #${id}`);
  return match[0];
}

assert.equal((html.match(/class="control-card"/g) || []).length, 4);
const controlOrder = ["模擬設定", "個人劇本水池", "遊戲機制", "故事產生"].map((label) => html.indexOf(`<strong>${label}</strong>`));
assert(controlOrder.every((index) => index >= 0));
assert.deepEqual([...controlOrder].sort((a, b) => a - b), controlOrder, "parameter cards must follow the old workflow with story generation last");
const simulationOrder = ["<h3>玩家行為</h3>", "<h3>模擬規格</h3>", "<h3>退幣條件</h3>"].map((label) => lab.indexOf(label));
assert(simulationOrder.every((index) => index >= 0));
assert.deepEqual([...simulationOrder].sort((a, b) => a - b), simulationOrder, "player behavior must precede scale and cashout conditions");

assert.doesNotMatch(html, /八星自然故事目錄|故事目錄驗證|進水起伏|普通局BOSS|高星局BOSS|連殺/);
assert.doesNotMatch(html, /id="storyCarryEnabled"|id="switchGrid"|id="switchesPanel"|功能開關/);
assert.match(html, /個人劇本水池（固定啟用）/);
assert.match(html, /遊戲機制（固定啟用）/);
assert.match(html, /REROLL BOSS 固定收取「當前押注額 × 1」/);

const reportLabels = ["模擬資訊", "總覽", "RTP 走勢", "BOSS 切片", "BOSS", "牌型", "魔法卡", "個人劇本水池"];
assert.equal((html.match(/data-report-panel=/g) || []).length, reportLabels.length);
let reportIndex = -1;
for (const label of reportLabels) {
  const index = html.indexOf(label, reportIndex + 1);
  assert(index > reportIndex, `report order must include ${label}`);
  reportIndex = index;
}

for (const id of [
  "simulationGrid", "runSimulationButton", "copyConfigButton", "copyStatisticsButton", "rewardFloorPct", "rewardCeilingMultiple",
  "bossTableBody", "magicTableBody", "handTableBody", "drawFeeGrid", "naturalDealGrid",
  "suppressionActivationGrid", "suppressionRedrawGrid", "suppressionMagicSwitchGrid", "suppressionMagicTableBody", "suppressionPolicySummary",
  "tolerancePp", "winMinReturnX", "pushMinReturnX", "candidateDrawMode", "ticketBasis", "maxCandidateAttempts",
  "runInfoBody", "reportOverviewCards", "bossExperienceBody", "cashoutStatsBody", "drawByHandBody", "spendSourceBody", "payoutSourceBody",
  "rtpTrendBody", "playerBossBucketBody", "starStatsBody", "handStatsBody", "magicStatsBody", "storySummaryCards",
  "carryBucketBody", "carryAuditBody", "correctionHealthBody", "carryBucketTailBody"
]) tag(id);

assert.match(combined, /id="targetCoreRtp"[^>]*min="80"[^>]*max="99"/);
assert.match(combined, /id="seed"[^>]*placeholder="留白＝每次隨機"/);
assert.match(tag("candidateDrawMode"), /disabled/);
assert.match(tag("ticketBasis"), /value="1000000"/);
assert.match(tag("maxCandidateAttempts"), /value="10000"/);
assert.match(combined, /FULL_CLASS_UNIFORM_THEN_SCORE_TICKETS/);
assert.match(combined, /buildNaturalStoryPoolFromPreset/);
assert.match(html, /1–10、20–200、500–2000/);
assert.match(html, /合法骰面/);
assert.match(html, /10%～1,000%/);

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "duplicate DOM ids");
const localScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => decodeURIComponent(match[1].split(/[?#]/)[0]));
for (const source of localScripts) assert(fs.existsSync(path.join(root, source)), `missing script ${source}`);

assert.equal(ActionCore.STORY_BET_CONTRACT_VERSION, "story-bet-scaling-v1");
const scaled = ActionCore.materializeStoryCredits({ spendX: 2.5, payoutX: 7.5 }, 3333);
assert.equal(scaled.spendCredits, 2.5 * 3333);
assert.equal(scaled.payoutCredits, 7.5 * 3333);
assert.equal(scaled.netX, 5);
assert.equal(scaled.betIndependent, true);

const forcedOff = ActionCore.sanitizeConfig({
  ...ActionCore.DEFAULT_CONFIG,
  mechanics: Object.fromEntries(Object.keys(ActionCore.DEFAULT_CONFIG.mechanics).map((key) => [key, false])),
  carry: { ...ActionCore.DEFAULT_CONFIG.carry, enabled: false },
  ruleSettings: { ...ActionCore.DEFAULT_CONFIG.ruleSettings, refreshCostX: 7 }
});
for (const key of ["actionTreeEnabled", "storyCarryEnabled", "magicEnabled", "jokerEnabled", "freeDrawEnabled", "coinEnabled", "critEnabled", "flatEnabled", "pokerBoostEnabled", "bossRerollEnabled", "paidDrawEnabled", "tieRedealEnabled", "strictNaturalGate"]) {
  assert.equal(forcedOff.mechanics[key], true, `${key} must remain enabled`);
}
assert.equal(forcedOff.mechanics.chainEnabled, false);
assert.equal(forcedOff.carry.enabled, true);
assert.equal(forcedOff.ruleSettings.refreshCostX, 1);

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

assert.match(game, /if \(!spend\(runtimeConfig\.entryCostX, \{ storySpend: false \}\)\) return;/);
assert.match(game, /entryCostX: 1/);
assert.match(game, /options\.poolAccrual !== false/);

console.log(JSON.stringify({
  status: "ok", cacheKey: "action-tree-v36", storyCount: 240000,
  controlCards: 4, reportTabs: reportLabels.length, uniqueDomIds: ids.length, rerolls: rerollResult.totals.bossRefreshes
}, null, 2));
