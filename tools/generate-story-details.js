"use strict";

const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const os = require("os");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outputDir = path.join(root, "reports", "story-detail-parts-v10");
const classKeys = ["win", "push", "lose"];
const requestedWorkerCount = Math.max(1, Number(process.env.BOSS_DUEL_WORKERS || 0) || (os.cpus().length - 1));
const workerCount = Math.min(19, requestedWorkerCount);

function runWorker(job) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: job });
    let settled = false;
    worker.once("message", (row) => {
      settled = true;
      resolve(row);
    });
    worker.once("error", (error) => {
      settled = true;
      reject(error);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) reject(new Error(`${job.star} 星 ${job.classKey} 明細 worker exit ${code}`));
    });
  });
}

async function runMain() {
  const startedAt = Date.now();
  fs.mkdirSync(outputDir, { recursive: true });
  const queue = [];
  for (let star = 1; star <= 8; star += 1) {
    for (const classKey of classKeys) queue.push({ star, classKey });
  }
  const rows = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(workerCount, queue.length) }, async () => {
    while (cursor < queue.length) {
      const job = queue[cursor];
      cursor += 1;
      const row = await runWorker(job);
      rows.push(row);
      process.stdout.write(JSON.stringify({ phase: "detail", ...row }) + "\n");
    }
  });
  await Promise.all(runners);
  rows.sort((left, right) => left.star - right.star || classKeys.indexOf(left.classKey) - classKeys.indexOf(right.classKey));
  const summary = {
    generatedAt: new Date().toISOString(),
    totalStories: rows.reduce((sum, row) => sum + row.count, 0),
    elapsedMs: Date.now() - startedAt,
    workerCount,
    cells: rows
  };
  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({ phase: "complete", ...summary }, null, 2));
}

if (isMainThread) {
  runMain().catch((error) => {
    process.stderr.write(error.stack || error.message);
    process.exitCode = 1;
  });
} else {
  const ActionCore = require(path.join(root, "src", "probability", "boss-duel-action-tree-core.js"));
  const StoryCore = ActionCore.NaturalCore;
  const preset = require(path.join(root, "data", "story", "boss-duel-story-preset-v1.js"));
  const config = StoryCore.normalizeConfig(ActionCore.DEFAULT_CONFIG);
  if (preset.version !== "natural-story-preset-v11" || !StoryCore.presetMatchesOutcomeRules(config, preset)) {
    throw new Error("故事明細只能由現行 natural-story-preset-v11 正式種子產生");
  }
  const seeds = preset.natural?.[workerData.star]?.[workerData.classKey] || [];
  if (seeds.length !== config.storiesPerClass) {
    throw new Error(`${workerData.star} 星 ${workerData.classKey} 不是 ${config.storiesPerClass} 個`);
  }
  const startedAt = Date.now();
  const workbookStory = (story) => ({
    id: story.id,
    seed: story.seed,
    star: story.star,
    classKey: story.classKey,
    plannerVersion: story.plannerVersion,
    killed: story.killed,
    spendX: story.spendX,
    payoutX: story.payoutX,
    netX: story.netX,
    hp: story.hp,
    hpLeft: story.hpLeft,
    rounds: story.rounds,
    actions: story.actions,
    terminationReason: story.terminationReason,
    magicCounts: story.magicCounts,
    decisionMetrics: { profitProbability: story.decisionMetrics?.profitProbability || 0 },
    path: (story.path || []).map((round) => ({
      round: round.round,
      tieIndex: round.tieIndex,
      startHand: round.startHand,
      initialCards: round.initialCards,
      finalCards: round.finalCards,
      finalHand: round.finalHand,
      bossHand: round.bossHand,
      bossCards: round.bossCards,
      draws: round.draws,
      damage: round.damage,
      action: round.action,
      result: round.result,
      routeKey: round.routeKey,
      routeLabel: round.routeLabel,
      autoKeepCardIds: round.autoKeepCardIds,
      initialKeepCardIds: round.initialKeepCardIds,
      manualAdjustment: round.manualAdjustment,
      decisionReason: round.decisionReason,
      drawLog: (round.drawLog || []).map((draw) => ({
        draw: draw.draw,
        free: draw.free,
        feeX: draw.feeX,
        keepCardIds: draw.keepCardIds,
        discardedCardIds: draw.discardedCardIds,
        acceptedCardIds: draw.acceptedCardIds,
        nextKeepCardIds: draw.nextKeepCardIds
      })),
      magicCards: round.magicCards,
      activeCrit: round.activeCrit,
      activeBoost: round.activeBoost,
      activeFlat: round.activeFlat,
      showdownWinProbability: round.showdownWinProbability,
      expectedDamage: round.expectedDamage,
      hasJoker: round.hasJoker,
      bossHpBefore: round.bossHpBefore,
      bossHpAfter: round.bossHpAfter
    }))
  });
  const stories = seeds.map((seed) => {
    const story = StoryCore.simulateNaturalStory(config, workerData.star, seed, { includePath: true });
    if (story.classKey !== workerData.classKey) throw new Error(`${workerData.star} 星 ${seed} 分類重播不一致`);
    return workbookStory(story);
  });
  fs.writeFileSync(path.join(outputDir, `star-${workerData.star}-${workerData.classKey}.json`), JSON.stringify(stories), "utf8");
  parentPort.postMessage({
    star: workerData.star,
    classKey: workerData.classKey,
    count: stories.length,
    elapsedMs: Date.now() - startedAt
  });
}
