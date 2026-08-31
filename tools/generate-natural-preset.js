"use strict";

const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const os = require("os");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const outputRoot = process.env.BOSS_DUEL_OUTPUT_ROOT ? path.resolve(process.env.BOSS_DUEL_OUTPUT_ROOT) : root;
const partsDir = path.join(outputRoot, "reports", "story-preset-parts-v10");
const generatorRevision = "boss-plan-v10-arrange-v9-action-trace-v1-suppression-v1-quota10000";
const requestedWorkerCount = Math.max(1, Number(process.env.BOSS_DUEL_WORKERS || 0) || (os.cpus().length - 1));
const workerCount = Math.min(19, requestedWorkerCount);
const chunkAttempts = Math.max(100, Number(process.env.BOSS_DUEL_CHUNK_ATTEMPTS || 5000));
const ticketGroupTarget = Math.max(0, Number(process.env.BOSS_DUEL_TICKET_GROUPS ?? 256));

function checkpointPath(star) {
  return path.join(partsDir, `natural-star${star}.json`);
}

function blankMap(valueFactory) {
  return Object.fromEntries(["win", "push", "lose"].map((key) => [key, valueFactory()]));
}

function emptyCheckpoint(star, signature) {
  return {
    star,
    signature,
    generatorRevision,
    nextAttempt: 0,
    observed: { win: 0, push: 0, lose: 0, invalid: 0 },
    seeds: blankMap(() => []),
    summaries: blankMap(() => [])
  };
}

function loadCheckpoint(star, signature) {
  const file = checkpointPath(star);
  if (!fs.existsSync(file)) return emptyCheckpoint(star, signature);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  let compatible = parsed.signature === signature;
  if (!compatible) {
    try {
      const stored = JSON.parse(parsed.signature);
      const current = JSON.parse(signature);
      delete stored.rulesVersion;
      delete stored.plannerVersion;
      delete current.rulesVersion;
      delete current.plannerVersion;
      compatible = JSON.stringify(stored) === JSON.stringify(current);
    } catch (_error) {
      compatible = false;
    }
  }
  if (!compatible || parsed.generatorRevision !== generatorRevision) return emptyCheckpoint(star, signature);
  parsed.signature = signature;
  return parsed;
}

function saveCheckpoint(state) {
  fs.writeFileSync(checkpointPath(state.star), JSON.stringify(state), "utf8");
}

function startWorker(payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: payload });
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      resolve(message);
    });
    worker.once("error", (error) => {
      settled = true;
      reject(error);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) reject(new Error(`${payload.star} 星 worker exit ${code}`));
    });
  });
}

async function buildFormalStar(config, star, signature) {
  const state = loadCheckpoint(star, signature);
  const target = config.storiesPerClass;
  const seen = new Set(Object.values(state.seeds).flat().map((seed) => Number(seed) >>> 0));
  const startedAt = Date.now();

  while (["win", "push", "lose"].some((key) => state.seeds[key].length < target)) {
    const remaining = Object.fromEntries(["win", "push", "lose"].map((key) => [key, target - state.seeds[key].length]));
    const caps = Object.fromEntries(["win", "push", "lose"].map((key) => [
      key,
      remaining[key] > 0 ? Math.max(20, Math.ceil(remaining[key] / workerCount * 1.35)) : 0
    ]));
    const jobs = [];
    for (let index = 0; index < workerCount; index += 1) {
      const startAttempt = state.nextAttempt + index * chunkAttempts;
      if (startAttempt >= config.maxGenerationAttemptsPerStar) break;
      jobs.push(startWorker({
        star,
        config,
        startAttempt,
        attemptCount: Math.min(chunkAttempts, config.maxGenerationAttemptsPerStar - startAttempt),
        caps
      }));
    }
    if (!jobs.length) {
      const short = ["win", "push", "lose"].filter((key) => remaining[key] > 0).map((key) => `${key} ${state.seeds[key].length}/${target}`).join("、");
      throw new Error(`${star} 星達到最大生成次數仍不足：${short}`);
    }

    const batch = await Promise.all(jobs);
    state.nextAttempt += batch.reduce((sum, row) => sum + row.attemptCount, 0);
    for (const row of batch) {
      for (const key of ["win", "push", "lose", "invalid"]) state.observed[key] += Number(row.observed[key] || 0);
    }
    const matches = batch.flatMap((row) => row.matches).sort((left, right) => left.attempt - right.attempt);
    for (const match of matches) {
      const key = match.classKey;
      const seed = Number(match.seed) >>> 0;
      if (state.seeds[key].length >= target || seen.has(seed)) continue;
      seen.add(seed);
      state.seeds[key].push(seed);
      state.summaries[key].push(match.summary);
    }
    saveCheckpoint(state);
    process.stdout.write(JSON.stringify({
      phase: "generate",
      star,
      attempts: state.nextAttempt,
      accepted: Object.fromEntries(["win", "push", "lose"].map((key) => [key, state.seeds[key].length])),
      elapsedMs: Date.now() - startedAt
    }) + "\n");
  }

  const accepted = Object.fromEntries(["win", "push", "lose"].map((key) => [key, state.seeds[key].length]));
  return {
    star,
    seeds: state.seeds,
    summaries: state.summaries,
    diagnostic: {
      star,
      attempts: state.nextAttempt,
      totalStories: Object.values(accepted).reduce((sum, value) => sum + value, 0),
      observed: state.observed,
      accepted,
      missing: [],
      elapsedMs: Date.now() - startedAt
    }
  };
}

async function runMain() {
  const ActionCore = require(path.join(root, "boss-duel-action-tree-core.js"));
  const NaturalCore = ActionCore.NaturalCore;
  const configInput = JSON.parse(JSON.stringify(ActionCore.DEFAULT_CONFIG));
  if (process.env.BOSS_DUEL_STORIES_PER_CLASS) {
    configInput.storyPool.storiesPerClass = Number(process.env.BOSS_DUEL_STORIES_PER_CLASS);
  }
  const config = NaturalCore.normalizeConfig(configInput);
  const signature = NaturalCore.poolSignature(config);
  const startedAt = Date.now();
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(partsDir, { recursive: true });
  fs.mkdirSync(path.join(outputRoot, "reports"), { recursive: true });

  const rows = [];
  for (let star = 1; star <= 8; star += 1) rows.push(await buildFormalStar(config, star, signature));

  const generatedAt = new Date().toISOString();
  const preset = {
    version: "natural-story-preset-v10",
    generatorRevision,
    signature,
    generatedAt,
    storiesPerClass: config.storiesPerClass,
    storiesPerStar: config.storiesPerStar,
    natural: {},
    naturalDiagnostics: []
  };
  const summaryPreset = {
    version: "natural-story-summary-preset-v5",
    format: "compact-summary-v1",
    generatorRevision,
    signature,
    generatedAt,
    storiesPerClass: config.storiesPerClass,
    storiesPerStar: config.storiesPerStar,
    naturalSummaries: {}
  };
  for (const row of rows) {
    preset.natural[row.star] = row.seeds;
    summaryPreset.naturalSummaries[row.star] = row.summaries;
    preset.naturalDiagnostics.push(row.diagnostic);
  }

  const DiceCore = require(path.join(root, "dice-first-core.js"));
  const ticketPool = NaturalCore.buildNaturalStoryPoolFromPreset(config, {
    ...preset,
    naturalSummaries: summaryPreset.naturalSummaries
  }, { useCache: false });
  preset.ticketGroupVersion = "score-ticket-groups-v3";
  preset.ticketGroupConfig = {
    targetRtpPct: config.targetRtpPct,
    ticketBasis: config.ticketBasis,
    ticketPreferencePct: config.ticketPreferencePct
  };
  preset.ticketGroups = {};
  preset.ticketGroupDiagnostics = [];
  for (let star = 1; star <= 8; star += 1) {
    const rng = DiceCore.mulberry32(DiceCore.hash32(config.poolSeed, star, 23001));
    const groups = [];
    const seen = new Set();
    let attempts = 0;
    while (groups.length < ticketGroupTarget && attempts < ticketGroupTarget * 20) {
      const commit = NaturalCore.drawStoryCommit(ticketPool, star, config.targetRtpPct, rng, {
        ticketPreferencePct: config.ticketPreferencePct,
        ticketBasis: config.ticketBasis,
        ticketSearchAttempts: config.ticketSearchAttempts,
        ticketCandidateTournamentSize: config.ticketCandidateTournamentSize,
        ticketEarlyExitDeviationPp: config.ticketEarlyExitDeviationPp
      });
      const seeds = commit.candidates.map((story) => story.seed >>> 0);
      const key = seeds.join(":");
      if (!seen.has(key)) {
        seen.add(key);
        groups.push(seeds);
      }
      attempts += 1;
    }
    if (groups.length !== ticketGroupTarget) throw new Error(`${star} 星只能建立 ${groups.length}/${ticketGroupTarget} 組分數配籤候選`);
    preset.ticketGroups[star] = groups;
    preset.ticketGroupDiagnostics.push({ star, groups: groups.length, attempts });
  }

  const js = `"use strict";\n(function(root){\n  const preset = ${JSON.stringify(preset)};\n  if (typeof module === "object" && module.exports) module.exports = preset;\n  root.BossDuelStoryPresetV1 = preset;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
  fs.writeFileSync(path.join(outputRoot, "boss-duel-story-preset-v1.js"), js, "utf8");
  const summaryJs = `"use strict";\n(function(root){\n  const preset = ${JSON.stringify(summaryPreset)};\n  if (typeof module === "object" && module.exports) module.exports = preset;\n  root.BossDuelStorySummaryPresetV1 = preset;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
  fs.writeFileSync(path.join(outputRoot, "boss-duel-story-summary-preset-v1.js"), summaryJs, "utf8");

  const elapsedMs = Date.now() - startedAt;
  const totalStories = 8 * config.storiesPerStar;
  const summary = {
    version: preset.version,
    summaryVersion: summaryPreset.version,
    generatorRevision,
    signature,
    generatedAt,
    storiesPerClass: config.storiesPerClass,
    storiesPerStar: config.storiesPerStar,
    naturalStories: totalStories,
    totalStories,
    elapsedMs,
    storiesPerSecond: totalStories / Math.max(elapsedMs / 1000, 0.001),
    workerCount,
    chunkAttempts,
    naturalDiagnostics: preset.naturalDiagnostics
  };
  fs.writeFileSync(path.join(outputRoot, "reports", "natural-story-diagnostics.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({ phase: "complete", ...summary }, null, 2));
}

if (isMainThread) {
  runMain().catch((error) => {
    process.stderr.write(error.stack || error.message);
    process.exitCode = 1;
  });
} else {
  const DiceCore = require(path.join(root, "dice-first-core.js"));
  const NaturalCore = require(path.join(root, "boss-duel-natural-story-core.js"));
  const matches = [];
  const captured = { win: 0, push: 0, lose: 0 };
  const observed = { win: 0, push: 0, lose: 0, invalid: 0 };
  const summaryClassKeys = NaturalCore.STORY_KEYS.filter((key) => Number(workerData.caps[key] || 0) > 0);
  for (let offset = 0; offset < workerData.attemptCount; offset += 1) {
    const attempt = workerData.startAttempt + offset;
    const seed = DiceCore.hash32(workerData.config.poolSeed, attempt, 7001 + workerData.star * 97);
    const story = NaturalCore.simulateNaturalStory(workerData.config, workerData.star, seed, { includePath: false, summaryClassKeys, fastClassification: true });
    const key = story.classKey;
    if (!NaturalCore.STORY_KEYS.includes(key)) {
      observed.invalid += 1;
      continue;
    }
    observed[key] += 1;
    if (captured[key] >= Number(workerData.caps[key] || 0)) continue;
    captured[key] += 1;
    matches.push({ attempt, seed: seed >>> 0, classKey: key, summary: NaturalCore.packStorySummary(story) });
  }
  parentPort.postMessage({ attemptCount: workerData.attemptCount, observed, matches });
}
