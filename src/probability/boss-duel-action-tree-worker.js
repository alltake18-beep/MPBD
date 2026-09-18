"use strict";

importScripts(
  "../core/boss-duel-random.js?v=action-tree-v64",
  "../core/boss-duel-poker-arrangement-core.js?v=arrange-v10",
  "../core/boss-duel-rules.js?v=action-tree-v64",
  "../core/boss-duel-story-planner.js?v=boss-plan-v12",
  "../core/boss-duel-natural-story-core.js?v=action-tree-v64",
  "boss-duel-action-tree-core.js?v=action-tree-v64"
);

self.BossDuelProbabilityWorkerState = { pool: null };

function reportProgress(runId, phase, percent, detail = {}) {
  self.postMessage({
    type: "progress",
    runId,
    phase,
    percent: Math.max(0, Math.min(100, Number(percent) || 0)),
    ...detail
  });
}

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type !== "simulate") return;
  try {
    const Core = self.BossDuelActionTreeCore;
    const config = Core.sanitizeConfig(message.config);
    reportProgress(message.runId, "pool", 2);
    if (!self.BossDuelStoryPresetV1 || !self.BossDuelStorySummaryPresetV1) importScripts(
      "../../data/story/boss-duel-story-preset-v1.js?v=story-catalog-v17",
      "../../data/story/boss-duel-story-summary-preset-v1.js?v=story-summary-v10"
    );
    const preset = self.BossDuelStoryPresetV1;
    const summary = self.BossDuelStorySummaryPresetV1;
    if (!preset || summary?.signature !== preset.signature) throw new Error("統計摘要與遊戲種子目錄版本不一致");
    const previousPool = self.BossDuelProbabilityWorkerState.pool;
    const pool = Core.NaturalCore.buildNaturalStoryPoolFromPreset(config, {
      ...preset,
      naturalSummaries: summary.naturalSummaries
    });
    if (!pool) throw new Error("遊戲劇本預置與目前正式規則不一致");
    self.BossDuelProbabilityWorkerState.pool = pool;
    reportProgress(message.runId, "pool", 10, { reusedPool: previousPool === pool });
    let lastPercent = 10;
    const runtimeStoryCache = new Map();
    const onProgress = (progress) => {
      const ratio = progress.completedPlayers / Math.max(progress.totalPlayers, 1);
      const percent = progress.phase === "main" ? 10 + ratio * 20 : 30 + ratio * 70;
      if (percent < 100 && percent - lastPercent < 1) return;
      lastPercent = percent;
      reportProgress(message.runId, progress.phase, percent, progress);
    };
    const result = Core.simulateNaturalModel(config, {
      pool,
      skipCashout: true,
      runtimeStoryCache,
      onProgress
    });
    delete result.storyPool;
    self.postMessage({ type: "main-done", runId: message.runId, result });
    result.cashout = Core.simulateIndependentCashout(config, { pool, runtimeStoryCache, onProgress });
    result.runInfo.reportCompletedAt = Date.now();
    result.runInfo.reportElapsedMs = result.runInfo.reportCompletedAt - result.runInfo.reportStartedAt;
    reportProgress(message.runId, "complete", 100);
    self.postMessage({ type: "done", runId: message.runId, result });
  } catch (error) {
    self.postMessage({ type: "error", runId: message.runId, message: error?.message || String(error) });
  }
});
