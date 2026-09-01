"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "機率工具.html");
const html = fs.readFileSync(htmlPath, "utf8");
const engineerDoc = fs.readFileSync(path.join(root, "後端文件.html"), "utf8");
const preset = require(path.join(root, "data", "story", "boss-duel-story-preset-v1.js"));
const ActionCore = require(path.join(root, "src", "probability", "boss-duel-action-tree-core.js"));

assert.equal(preset.version, "natural-story-preset-v11");

for (const asset of [
  "src/core/boss-duel-random.js", "src/core/boss-duel-poker-arrangement-core.js", "src/core/boss-duel-rules.js",
  "src/core/boss-duel-story-planner.js", "data/story/boss-duel-story-preset-v1.js", "src/core/boss-duel-natural-story-core.js",
  "src/probability/boss-duel-action-tree-core.js", "src/probability/boss-duel-action-tree-lab.js"
]) {
  assert.match(html, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${asset} must be loaded`);
}
assert.match(html, /boss-duel-action-tree-core\.js\?v=action-tree-v33/);
assert.match(html, /boss-duel-story-summary-preset-v1\.js\?v=story-summary-v5/);
assert.match(html, /src\/core\/boss-duel-poker-arrangement-core\.js\?v=arrange-v9/);
assert.match(html, /class="app-shell action-tree-tool"/);
assert.match(html, /class="workbench"/);
assert.match(html, /href="%E5%BE%8C%E7%AB%AF%E6%96%87%E4%BB%B6\.html\?v=backend-doc-v6"/);
assert.match(engineerDoc, /backend-doc-v6/);
assert.match(engineerDoc, /候選池固定為十種不同魔法卡/);
assert.match(html, /data-panel="suppressionPanel"/);
for (const id of ["suppressionActivationGrid", "suppressionRedrawGrid", "suppressionMagicSwitchGrid", "suppressionMagicTableBody", "suppressionPolicySummary"]) tag(id);
assert.match(html, /所有牌型傷害魔法卡共用/);
assert.match(html, /id="resultsArea"[^>]*is-hidden/);
assert.equal((html.match(/class="control-card"/g) || []).length, 5);
assert.equal((html.match(/data-report-panel=/g) || []).length, 7);
assert.doesNotMatch(html, /reportChainPanel|chainStatsBody|連殺/);
assert.match(html, /id="simulationPanel" class="tab-panel active"/);
assert.doesNotMatch(html, /id="simulationPanel"[^>]*compat-hidden/);

function tag(id) {
  const match = html.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, "i"));
  assert(match, `missing #${id}`);
  return match[0];
}

assert.match(tag("targetCoreRtp"), /type="number"/);
assert.doesNotMatch(tag("targetCoreRtp"), /readonly|disabled/);
assert.match(tag("targetCoreRtp"), /min="80"/);
assert.match(tag("targetCoreRtp"), /max="99"/);
assert.match(tag("winMinReturnX"), /value="3"/);
assert.match(tag("pushMinReturnX"), /value="1"/);
assert.match(tag("candidateDrawMode"), /disabled/);
assert.match(tag("ticketBasis"), /value="1000000"/);
assert.match(tag("maxCandidateAttempts"), /value="10000"/);
assert.match(tag("seed"), /placeholder="留白＝每次隨機"/);
assert.doesNotMatch(html, /id="seedMode"|種子模式/);
assert.match(html, /配籤 RTP 容許差/);
assert.match(html, /95\.99%～96\.01%/);
assert.match(html, /id="runSimulationButton"[^>]*>開始模擬</);
assert.match(html, /id="copyConfigButton"[^>]*>複製參數</);
assert.match(html, /id="copyStatisticsButton"[^>]*>複製統計資料</);
assert.doesNotMatch(html, /匯入既有 40,000|24 格自然故事完整欄位|版本保存與發布/);
assert.doesNotMatch(html, /比牌階級|直接派彩x/);
assert.match(html, /第 16 次起沿用第 15 次費用/);
assert.doesNotMatch(html, /id="minPushPct"/);
assert.doesNotMatch(html, /id="ticketWinPct"|id="ticketPushPct"|id="ticketLosePct"|id="ticketMode"/);
assert.match(html, /分數籤總數/);
assert.match(html, /id="ticketSamplesBody"/);

const localScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => decodeURIComponent(match[1].split(/[?#]/)[0]));
for (const source of localScripts) assert(fs.existsSync(path.join(root, source)), `missing script ${source}`);
const combined = `${html}\n${localScripts.map((source) => fs.readFileSync(path.join(root, source), "utf8")).join("\n")}`;
assert.match(combined, /FULL_CLASS_UNIFORM_THEN_SCORE_TICKETS/);
assert.match(html, /劇本以 X 倍數通用所有 Bet/);
assert.equal(ActionCore.STORY_BET_CONTRACT_VERSION, "story-bet-scaling-v1");
const betOneStory = ActionCore.materializeStoryCredits({ spendX: 2.5, payoutX: 7.5 }, 1);
const futureBetStory = ActionCore.materializeStoryCredits({ spendX: 2.5, payoutX: 7.5 }, 3333);
assert.equal(betOneStory.netX, futureBetStory.netX);
assert.equal(futureBetStory.spendCredits, 2.5 * 3333);
assert.equal(futureBetStory.payoutCredits, 7.5 * 3333);
assert.equal(futureBetStory.betIndependent, true);

for (const behavior of ["OFFICIAL_FUNDED", "FREE_RIDE", "EXTREME", "SMART"]) {
  assert.match(combined, new RegExp(`value="${behavior}"|\\["${behavior}"`), `missing player model ${behavior}`);
  const config = ActionCore.sanitizeConfig({ ...ActionCore.DEFAULT_CONFIG, simulation: { ...ActionCore.DEFAULT_CONFIG.simulation, playerBehavior: behavior } });
  assert.equal(config.simulation.playerBehavior, behavior, `player model ${behavior} must survive sanitization`);
}
for (const behavior of ["OFFICIAL_FUNDED", "FREE_RIDE", "EXTREME"]) {
  const config = ActionCore.sanitizeConfig({ ...ActionCore.DEFAULT_CONFIG, simulation: { ...ActionCore.DEFAULT_CONFIG.simulation, playerBehavior: behavior, playerCount: 2, bossesPerPlayer: 3, cashoutPlayerCount: 2 } });
  const result = ActionCore.simulatePlayerModels(config, { skipCashout: true });
  assert.equal(result.totals.bosses, 6, `${behavior} must run the requested Boss count`);
}

for (const required of [
  /240,000/, /正式故事/, /贏多/, /贏少/, /輸/,
  /Bet 1–10/, /20–200/, /500–2000/, /合法骰面/, /10%～1,000%/, /同花順基礎傷害 30/,
  /buildNaturalStoryPoolFromPreset/, /selectedStoryExperience/, /openStoryExperience/, /storyMode/
]) assert.match(combined, required, `missing new model contract ${required}`);

assert.doesNotMatch(html, /記憶點故事目前隱藏|記憶點故事保留在檔案/);
assert.match(html, /贏多：總派彩 ÷ 總押 ≥ 3x/);
assert.match(html, /贏少：1x ≤ 總派彩 ÷ 總押 &lt; 3x/);
assert.match(html, /輸：總派彩 ÷ 總押 &lt; 1x/);
assert.match(combined, /syncStoryExperienceIndexOptions/);
assert.doesNotMatch(html, /每格平均 100 個|該格擊殺故事數 ÷ 100|每格自然故事 100/);

for (const obsolete of [/action-tree-v6/, /10,000 籤/, /持平 40%/, /中途終止率/, /同花順必殺/, /Phase-0/]) {
  assert.doesNotMatch(combined, obsolete, `obsolete model text remains: ${obsolete}`);
}

for (const id of [
  "winMinReturnX", "pushMinReturnX", "winClassificationRule", "pushClassificationRule", "loseClassificationRule",
  "rewardFloorPct", "rewardCeilingMultiple",
  "simulationGrid", "actionTreeMatrixBody", "bossTableBody", "magicTableBody", "handTableBody",
  "reportOverviewCards", "storySummaryCards", "starStatsBody", "cellStatsBody",
  "treeStatsBody", "handStatsBody", "magicStatsBody", "carryAuditBody", "terminationStatsBody",
  "storyExperienceStar", "storyExperienceSource", "storyExperienceClass", "storyExperienceIndex",
  "storyExperienceSummary", "storyExperienceOpen", "naturalClassAverageBody", "naturalClassStatsBody",
  "runSimulationButton", "copyConfigButton", "copyStatisticsButton", "carryBucketBody", "riskFindingsBody", "ticketHealthBody", "ticketWeightBody", "ticketStarHealthBody", "storySelectionCoverageBody",
  "settlementFunnelBody", "correctionHealthBody", "correctionCoverageBody", "carryBucketTailBody", "classMigrationBody"
]) tag(id);

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "duplicate DOM ids");

const engineerSections = ["terms", "script", "draw", "tickets", "play", "suppress", "pool", "reroll", "examples", "data", "backend"];
let lastEngineerSection = -1;
for (const id of engineerSections) {
  const index = engineerDoc.indexOf(`id="${id}"`);
  assert(index > lastEngineerSection, `engineer document section order must include ${id}`);
  lastEngineerSection = index;
}
assert.match(engineerDoc, /四步結算/);
assert.match(engineerDoc, /三個真實候選/);
assert.match(engineerDoc, /完整實例/);
assert.match(engineerDoc, /個人劇本水池/);
assert.match(engineerDoc, /Boss Duel 後端文件/);
assert.match(engineerDoc, /人工智慧可以做/);
assert.match(engineerDoc, /每筆花費按目標 RTP 入桶/);
assert.match(engineerDoc, /原獎 10%/);
assert.match(engineerDoc, /R₀ × 1,000%/);
assert.match(engineerDoc, /deviation-suppression-v3-configurable-tables/);
assert.match(engineerDoc, /只有金幣卡立即公開實際加成/);
assert.match(engineerDoc, /共用一張「牌型傷害倍率抑制表」/);
assert.doesNotMatch(engineerDoc, /個人差額池|個人故事差額池|StoryCommit|Credits|PASS/);

const suppressionConfig = ActionCore.sanitizeConfig({
  suppression: {
    redraw: { improvedAcceptPct: 12.5, sameOrLowerAcceptPct: 87.5, maxCandidates: 44 },
    magic: { tables: { handBoost: { outcomes: [{ value: 7, weight: 3 }, { value: 9, weight: 1 }] } } }
  }
});
assert.equal(suppressionConfig.suppression.redraw.improvedAcceptPct, 12.5);
assert.equal(suppressionConfig.suppression.redraw.sameOrLowerAcceptPct, 87.5);
assert.equal(suppressionConfig.suppression.redraw.maxCandidates, 44);
assert.deepEqual(suppressionConfig.suppression.magic.tables.handBoost.outcomes, [{ value: 7, weight: 3 }, { value: 9, weight: 1 }]);
assert.equal(ActionCore.NaturalCore.SUPPRESSION_POLICY_VERSION, "deviation-suppression-v3-configurable-tables");
assert.equal(ActionCore.NaturalCore.POOL_SETTLEMENT_VERSION, "target-rtp-personal-pool-v2-reservation");
assert.deepEqual(ActionCore.DEFAULT_CONFIG.suppression.magic.tables.crit.outcomes.map((row) => row.weight), [69, 25, 3, 2, 1]);
assert.deepEqual(ActionCore.DEFAULT_CONFIG.suppression.magic.tables.flatDamage.outcomes.map((row) => row.weight), [70, 25, 3, 2]);
assert.deepEqual(ActionCore.DEFAULT_CONFIG.suppression.magic.tables.handBoost.outcomes.map((row) => row.weight), [80, 19, 1]);

console.log(JSON.stringify({
  status: "ok", cacheKey: "action-tree-v33", storyCount: 240000,
  localScripts, uniqueDomIds: ids.length, catalogOnly: false, fullClassUniformTickets: true
}, null, 2));
