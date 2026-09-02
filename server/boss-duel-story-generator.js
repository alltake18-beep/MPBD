"use strict";

/**
 * Boss Duel 正式劇本產生器。
 *
 * 這個檔案只負責協調現行遊戲核心，不重寫理牌或玩家策略：
 * - src/core/boss-duel-random.js：固定亂數與 seed 衍生
 * - src/core/boss-duel-rules.js：rules-v10
 * - src/core/boss-duel-story-planner.js：boss-plan-v11
 * - src/core/boss-duel-natural-story-core.js：模擬、分類、摘要與重播
 *
 * CLI：
 *   node server/boss-duel-story-generator.js --output <目錄> --release <版本名稱>
 *
 * 程式介面：
 *   const Generator = require("./server/boss-duel-story-generator.js");
 *   await Generator.buildRelease({ outputRoot, releaseVersion });
 *
 * 注意：win／push／lose 是產量與抽取用的「結果分類」，不是 Bet 桶。
 * 同一個 star + seed 產生的 X 倍數劇本可套用所有合法 Bet。
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");

const DiceCore = require("../src/core/boss-duel-random.js");
const Rules = require("../src/core/boss-duel-rules.js");
const StoryPlanner = require("../src/core/boss-duel-story-planner.js");
const NaturalCore = require("../src/core/boss-duel-natural-story-core.js");
const ActionTreeCore = require("../src/probability/boss-duel-action-tree-core.js");

const SERVICE_VERSION = "boss-duel-story-generator-v1";
const GENERATOR_REVISION = "boss-plan-v11-arrange-v10-action-trace-v2-suppression-v4-runtime-quota10000-production-v3";
const PRESET_VERSION = "natural-story-preset-v13";
const SUMMARY_PRESET_VERSION = "natural-story-summary-preset-v8";
const ARRANGEMENT_VERSION = "arrange-v10";
const FORMAL_STORIES_PER_CLASS = 10000;
const FORMAL_STORIES_PER_STAR = 30000;
const FORMAL_TOTAL_STORIES = 240000;
const CLASS_KEYS = Object.freeze(["win", "push", "lose"]);
const SUPPORTED_BETS = Object.freeze((NaturalCore.BET_VALUES || []).slice());
const EXPECTED_RULES_VERSION = "rules-v10";
const EXPECTED_PLANNER_VERSION = "boss-plan-v11";
const EXPECTED_ACTION_TRACE_VERSION = "story-action-trace-v2";
const EXPECTED_SUPPRESSION_VERSION = "deviation-suppression-v4-configurable-tables";
const EXPECTED_STORY_BET_CONTRACT_VERSION = "story-bet-scaling-v1";
const UINT32_MAX = 0xffffffff;

class StoryGenerationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "StoryGenerationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new StoryGenerationError(code, message, details);
}

function assert(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function merge(base, patchValue) {
  if (!isPlainObject(base) || !isPlainObject(patchValue)) return clone(patchValue);
  const result = clone(base);
  for (const [key, value] of Object.entries(patchValue)) {
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? merge(result[key], value)
      : clone(value);
  }
  return result;
}

function finiteInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function currentConfig(overrides = {}) {
  const input = merge(ActionTreeCore.DEFAULT_CONFIG, overrides || {});
  return NaturalCore.normalizeConfig(input);
}

function normalizeConfig(input) {
  if (!input) return currentConfig();
  if (input.storiesPerClass !== undefined && input.storyPool === undefined) return clone(input);
  return currentConfig(input);
}

function assertCurrentCoreVersions() {
  assert(Rules.VERSION === EXPECTED_RULES_VERSION, "CORE_VERSION_MISMATCH", `需要 ${EXPECTED_RULES_VERSION}，目前為 ${Rules.VERSION}`);
  assert(StoryPlanner.VERSION === EXPECTED_PLANNER_VERSION, "CORE_VERSION_MISMATCH", `需要 ${EXPECTED_PLANNER_VERSION}，目前為 ${StoryPlanner.VERSION}`);
  assert(NaturalCore.ACTION_TRACE_VERSION === EXPECTED_ACTION_TRACE_VERSION, "CORE_VERSION_MISMATCH", `需要 ${EXPECTED_ACTION_TRACE_VERSION}，目前為 ${NaturalCore.ACTION_TRACE_VERSION}`);
  assert(NaturalCore.SUPPRESSION_POLICY_VERSION === EXPECTED_SUPPRESSION_VERSION, "CORE_VERSION_MISMATCH", `需要 ${EXPECTED_SUPPRESSION_VERSION}，目前為 ${NaturalCore.SUPPRESSION_POLICY_VERSION}`);
  assert(NaturalCore.STORY_BET_CONTRACT_VERSION === EXPECTED_STORY_BET_CONTRACT_VERSION, "CORE_VERSION_MISMATCH", `需要 ${EXPECTED_STORY_BET_CONTRACT_VERSION}，目前為 ${NaturalCore.STORY_BET_CONTRACT_VERSION}`);
  assert(
    CLASS_KEYS.length === NaturalCore.STORY_KEYS.length && CLASS_KEYS.every((key, index) => key === NaturalCore.STORY_KEYS[index]),
    "CORE_VERSION_MISMATCH",
    "劇本分類鍵必須依序為 win、push、lose"
  );
}

function validateConfig(configInput, options = {}) {
  assertCurrentCoreVersions();
  const config = normalizeConfig(configInput);
  const formal = options.formal !== false;
  const storiesPerClass = finiteInteger(
    options.storiesPerClass ?? config.storiesPerClass,
    FORMAL_STORIES_PER_CLASS,
    1,
    10000000
  );

  assert(Number.isInteger(config.poolSeed) && config.poolSeed >= 0 && config.poolSeed <= UINT32_MAX, "INVALID_CONFIG", "poolSeed 必須是 uint32");
  assert(Array.isArray(config.bossRows) && config.bossRows.length === 8, "INVALID_CONFIG", "bossRows 必須完整包含 1～8 星");
  assert(Array.isArray(config.magicRows) && config.magicRows.length > 0, "INVALID_CONFIG", "magicRows 不可為空");
  assert(Array.isArray(config.handRows) && config.handRows.length > 0, "INVALID_CONFIG", "handRows 不可為空");
  assert(Array.isArray(config.drawFeesX) && config.drawFeesX.length > 0, "INVALID_CONFIG", "drawFeesX 不可為空");
  assert(config.winMinReturnX === 3, "INVALID_CONFIG", "正式贏多分類線必須是 3 倍", { actual: config.winMinReturnX });
  assert(config.pushMinReturnX === 1, "INVALID_CONFIG", "正式贏少分類線必須是 1 倍", { actual: config.pushMinReturnX });
  assert(config.maxGenerationAttemptsPerStar >= storiesPerClass * 3, "INVALID_CONFIG", "每星最大嘗試數不足以容納正式配額");
  if (formal) {
    assert(storiesPerClass === FORMAL_STORIES_PER_CLASS, "INVALID_FORMAL_QUOTA", "正式模式每星每桶必須是 10,000 筆", { actual: storiesPerClass });
    assert(config.storiesPerClass === FORMAL_STORIES_PER_CLASS, "INVALID_FORMAL_QUOTA", "現行設定 storyPool.storiesPerClass 必須是 10,000", { actual: config.storiesPerClass });
    assert(config.storiesPerStar === FORMAL_STORIES_PER_STAR, "INVALID_FORMAL_QUOTA", "現行設定 storiesPerStar 必須是 30,000", { actual: config.storiesPerStar });
  }
  return { config, formal, storiesPerClass };
}

function createBuildProfile(configInput, options = {}) {
  const validated = validateConfig(configInput, options);
  const workerDefault = Math.max(1, (os.cpus()?.length || 2) - 1);
  const workerCount = finiteInteger(options.workerCount, workerDefault, 1, 19);
  const chunkAttempts = finiteInteger(options.chunkAttempts, 1000, 100, 100000);
  const validationChunkSize = finiteInteger(options.validationChunkSize, 1000, 10, 10000);
  const configSignature = NaturalCore.poolSignature(validated.config);
  const releaseSignature = sha256(stableJson({
    serviceVersion: SERVICE_VERSION,
    generatorRevision: GENERATOR_REVISION,
    arrangementVersion: ARRANGEMENT_VERSION,
    storyBetContractVersion: NaturalCore.STORY_BET_CONTRACT_VERSION,
    configSignature
  }));
  return {
    ...validated,
    workerCount,
    chunkAttempts,
    validationChunkSize,
    configSignature,
    releaseSignature,
    maxAttemptsPerStar: finiteInteger(
      options.maxAttemptsPerStar ?? validated.config.maxGenerationAttemptsPerStar,
      validated.config.maxGenerationAttemptsPerStar,
      100,
      100000000
    )
  };
}

function assertStar(starInput) {
  const star = Number(starInput);
  assert(Number.isInteger(star) && star >= 1 && star <= 8, "INVALID_STAR", "BOSS 星級只允許 1～8", { star: starInput });
  return star;
}

function deriveSeed(config, starInput, attemptInput) {
  const star = assertStar(starInput);
  const attempt = Number(attemptInput);
  assert(Number.isSafeInteger(attempt) && attempt >= 0, "INVALID_ATTEMPT", "attempt 必須是非負安全整數", { attempt: attemptInput });
  return DiceCore.hash32(config.poolSeed, attempt, 7001 + star * 97) >>> 0;
}

function generateStory(configInput, starInput, seedInput, options = {}) {
  const config = normalizeConfig(configInput);
  const star = assertStar(starInput);
  const seed = Number(seedInput) >>> 0;
  const story = NaturalCore.simulateNaturalStory(config, star, seed, {
    includePath: options.includePath === true,
    summaryClassKeys: Array.isArray(options.summaryClassKeys) ? options.summaryClassKeys : undefined,
    fastClassification: options.fastClassification === true,
    behavior: "SMART_PROFIT_PLANNER"
  });
  assert(CLASS_KEYS.includes(story.classKey), "INVALID_STORY_RESULT", "劇本沒有合法分類", { star, seed, classKey: story.classKey });
  if (story.spendX !== undefined) {
    assert(Number.isFinite(story.spendX) && story.spendX > 0, "INVALID_STORY_RESULT", "劇本總花費必須大於 0", { star, seed, spendX: story.spendX });
    assert(Number.isFinite(story.payoutX) && story.payoutX >= 0, "INVALID_STORY_RESULT", "劇本總派彩不得為負數", { star, seed, payoutX: story.payoutX });
    const replayClass = NaturalCore.storyClass(story.payoutX / story.spendX, config);
    assert(replayClass === story.classKey, "INVALID_STORY_RESULT", "劇本分類與總派彩／總花費不一致", { star, seed, stored: story.classKey, replay: replayClass });
  }
  return story;
}

function materializeStoryForBet(story, betInput, options = {}) {
  assert(story && CLASS_KEYS.includes(story.classKey), "INVALID_STORY_RESULT", "必須先提供合法的 X 倍數劇本");
  try {
    return NaturalCore.materializeStoryForBet(story, betInput, options);
  } catch (error) {
    fail("INVALID_BET", error.message, { bet: betInput, allowedBets: options.allowedBets });
  }
}

function blankClasses() {
  return { win: [], push: [], lose: [] };
}

function blankObserved() {
  return { win: 0, push: 0, lose: 0, invalid: 0 };
}

function createStarState(profile, starInput) {
  const star = assertStar(starInput);
  return {
    formatVersion: "boss-duel-story-checkpoint-v1",
    serviceVersion: SERVICE_VERSION,
    generatorRevision: GENERATOR_REVISION,
    configSignature: profile.configSignature,
    releaseSignature: profile.releaseSignature,
    star,
    nextAttempt: 0,
    observed: blankObserved(),
    seeds: blankClasses(),
    summaries: blankClasses(),
    updatedAt: new Date().toISOString()
  };
}

function stateCounts(state) {
  return Object.fromEntries(CLASS_KEYS.map((key) => [key, state.seeds[key].length]));
}

function isStarComplete(state, target) {
  return CLASS_KEYS.every((key) => state.seeds[key].length === target);
}

function validateStoredSummary(config, star, classKey, seed, packed) {
  assert(Array.isArray(packed), "INVALID_STORY_SUMMARY", "劇本摘要格式錯誤", { star, classKey, seed });
  const summary = NaturalCore.unpackStorySummary(packed, star, classKey);
  assert((summary.seed >>> 0) === (seed >>> 0), "INVALID_STORY_SUMMARY", "摘要 seed 與索引不同", { star, classKey, seed, summarySeed: summary.seed });
  assert(Number.isFinite(summary.spendX) && summary.spendX > 0, "INVALID_STORY_SUMMARY", "摘要總花費必須大於 0", { star, classKey, seed });
  assert(Number.isFinite(summary.payoutX) && summary.payoutX >= 0, "INVALID_STORY_SUMMARY", "摘要派彩不得為負數", { star, classKey, seed });
  const replayClass = NaturalCore.storyClass(summary.payoutX / summary.spendX, config);
  assert(replayClass === classKey, "INVALID_STORY_SUMMARY", "摘要重算分類與所在桶不同", { star, seed, classKey, replayClass });
  return summary;
}

function validateStarState(profile, state, options = {}) {
  const exact = options.exact === true;
  assert(state?.formatVersion === "boss-duel-story-checkpoint-v1", "CHECKPOINT_INCOMPATIBLE", "checkpoint 格式版本不相容");
  assert(state.generatorRevision === GENERATOR_REVISION, "CHECKPOINT_INCOMPATIBLE", "checkpoint 產生器版本不相容");
  assert(state.configSignature === profile.configSignature, "CHECKPOINT_INCOMPATIBLE", "checkpoint 遊戲設定簽章不相容");
  assert(state.releaseSignature === profile.releaseSignature, "CHECKPOINT_INCOMPATIBLE", "checkpoint 發布簽章不相容");
  const star = assertStar(state.star);
  assert(Number.isSafeInteger(state.nextAttempt) && state.nextAttempt >= 0, "CHECKPOINT_INCOMPATIBLE", "checkpoint nextAttempt 不合法");
  const seen = new Set();
  for (const classKey of CLASS_KEYS) {
    assert(Array.isArray(state.seeds?.[classKey]) && Array.isArray(state.summaries?.[classKey]), "CHECKPOINT_INCOMPATIBLE", "checkpoint 缺少 win／push／lose 結果分類資料", { star, classKey });
    assert(state.seeds[classKey].length === state.summaries[classKey].length, "CHECKPOINT_INCOMPATIBLE", "checkpoint seed 與摘要數量不同", { star, classKey });
    assert(state.seeds[classKey].length <= profile.storiesPerClass, "CHECKPOINT_INCOMPATIBLE", "checkpoint 單一結果分類超過配額", { star, classKey });
    if (exact) assert(state.seeds[classKey].length === profile.storiesPerClass, "QUOTA_NOT_MET", "單一結果分類未達正式配額", { star, classKey, actual: state.seeds[classKey].length, expected: profile.storiesPerClass });
    state.seeds[classKey].forEach((seedInput, index) => {
      const seed = Number(seedInput) >>> 0;
      assert(!seen.has(seed), "DUPLICATE_SEED_IN_STAR", "同一星級的 seed 不得跨桶重複", { star, classKey, seed });
      seen.add(seed);
      validateStoredSummary(profile.config, star, classKey, seed, state.summaries[classKey][index]);
    });
  }
  return state;
}

function scanAttemptRange(configInput, starInput, startAttemptInput, attemptCountInput, wantedClassKeys = CLASS_KEYS) {
  const config = normalizeConfig(configInput);
  const star = assertStar(starInput);
  const startAttempt = finiteInteger(startAttemptInput, -1, 0, Number.MAX_SAFE_INTEGER);
  const attemptCount = finiteInteger(attemptCountInput, 0, 0, 1000000);
  assert(startAttempt >= 0 && attemptCount > 0, "INVALID_ATTEMPT_RANGE", "掃描 attempt 範圍不合法", { startAttempt: startAttemptInput, attemptCount: attemptCountInput });
  const wanted = new Set(wantedClassKeys.filter((key) => CLASS_KEYS.includes(key)));
  const observed = blankObserved();
  const matches = [];
  for (let offset = 0; offset < attemptCount; offset += 1) {
    const attempt = startAttempt + offset;
    const seed = deriveSeed(config, star, attempt);
    const story = generateStory(config, star, seed, {
      includePath: false,
      summaryClassKeys: [...wanted],
      fastClassification: true
    });
    if (!CLASS_KEYS.includes(story.classKey)) {
      observed.invalid += 1;
      continue;
    }
    observed[story.classKey] += 1;
    if (!wanted.has(story.classKey)) continue;
    matches.push({
      attempt,
      seed,
      classKey: story.classKey,
      summary: NaturalCore.packStorySummary(story)
    });
  }
  return { star, startAttempt, attemptCount, observed, matches };
}

function acceptScanResults(profile, state, scanRows) {
  validateStarState(profile, state);
  const rows = scanRows.slice().sort((left, right) => left.startAttempt - right.startAttempt);
  let expectedStart = state.nextAttempt;
  for (const row of rows) {
    assert(row.star === state.star, "INVALID_SCAN_RESULT", "worker 回傳錯誤星級", { expected: state.star, actual: row.star });
    assert(row.startAttempt === expectedStart, "INVALID_SCAN_RESULT", "worker attempt 範圍有缺口或重疊", { expectedStart, actualStart: row.startAttempt });
    assert(Number.isInteger(row.attemptCount) && row.attemptCount > 0, "INVALID_SCAN_RESULT", "worker attemptCount 不合法");
    expectedStart += row.attemptCount;
    for (const key of [...CLASS_KEYS, "invalid"]) state.observed[key] += Number(row.observed?.[key] || 0);
  }

  const acceptedSeeds = new Set(CLASS_KEYS.flatMap((key) => state.seeds[key].map((seed) => Number(seed) >>> 0)));
  const matches = rows.flatMap((row) => row.matches || []).sort((left, right) => left.attempt - right.attempt);
  for (const match of matches) {
    const classKey = match.classKey;
    assert(CLASS_KEYS.includes(classKey), "INVALID_SCAN_RESULT", "worker 回傳未知分類", { classKey });
    assert(Number.isSafeInteger(match.attempt) && match.attempt >= state.nextAttempt && match.attempt < expectedStart, "INVALID_SCAN_RESULT", "worker 回傳 attempt 超出批次範圍", { attempt: match.attempt });
    const seed = Number(match.seed) >>> 0;
    const expectedSeed = deriveSeed(profile.config, state.star, match.attempt);
    assert(seed === expectedSeed, "INVALID_SCAN_RESULT", "worker 回傳 seed 與 attempt 不一致", { star: state.star, attempt: match.attempt, seed, expectedSeed });
    if (state.seeds[classKey].length >= profile.storiesPerClass || acceptedSeeds.has(seed)) continue;
    validateStoredSummary(profile.config, state.star, classKey, seed, match.summary);
    acceptedSeeds.add(seed);
    state.seeds[classKey].push(seed);
    state.summaries[classKey].push(match.summary);
  }
  state.nextAttempt = expectedStart;
  state.updatedAt = new Date().toISOString();
  validateStarState(profile, state);
  return state;
}

function atomicWrite(file, content) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const descriptor = fs.openSync(temporary, "w");
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

function saveCheckpoint(file, profile, state) {
  validateStarState(profile, state);
  atomicWrite(file, `${JSON.stringify(state)}\n`);
}

function loadCheckpoint(file, profile, star) {
  if (!fs.existsSync(file)) return createStarState(profile, star);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("CHECKPOINT_INCOMPATIBLE", `checkpoint 無法解析：${file}`, { cause: error.message });
  }
  assert(parsed.star === star, "CHECKPOINT_INCOMPATIBLE", "checkpoint 星級不一致", { expected: star, actual: parsed.star });
  return validateStarState(profile, parsed);
}

function startWorker(payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { serviceVersion: SERVICE_VERSION, ...payload } });
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      worker.removeAllListeners();
      worker.terminate().finally(callback);
    };
    worker.once("message", (message) => {
      finish(() => message?.error
        ? reject(new StoryGenerationError(message.error.code || "WORKER_FAILED", message.error.message, message.error.details))
        : resolve(message));
    });
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new StoryGenerationError("WORKER_FAILED", code === 0 ? "worker 未回傳結果" : `worker exit ${code}`));
      }
    });
  });
}

async function buildStarClassCatalog(profileInput, starInput, options = {}) {
  const profile = profileInput?.configSignature ? profileInput : createBuildProfile(profileInput, options);
  const star = assertStar(starInput);
  const checkpointFile = options.checkpointFile;
  const state = checkpointFile
    ? loadCheckpoint(checkpointFile, profile, star)
    : createStarState(profile, star);
  validateStarState(profile, state);

  while (!isStarComplete(state, profile.storiesPerClass)) {
    if (state.nextAttempt >= profile.maxAttemptsPerStar) {
      fail("QUOTA_NOT_MET", `${star} 星達到最大生成次數仍未收滿三種結果分類`, {
        star,
        attempts: state.nextAttempt,
        counts: stateCounts(state),
        observed: state.observed
      });
    }
    const wantedClassKeys = CLASS_KEYS.filter((key) => state.seeds[key].length < profile.storiesPerClass);
    const jobs = [];
    let cursor = state.nextAttempt;
    for (let index = 0; index < profile.workerCount && cursor < profile.maxAttemptsPerStar; index += 1) {
      const attemptCount = Math.min(profile.chunkAttempts, profile.maxAttemptsPerStar - cursor);
      jobs.push({
        mode: "scan",
        config: profile.config,
        star,
        startAttempt: cursor,
        attemptCount,
        wantedClassKeys
      });
      cursor += attemptCount;
    }
    assert(jobs.length > 0, "QUOTA_NOT_MET", `${star} 星沒有可執行的 attempt 範圍`);
    const rows = options.useWorkers === false
      ? jobs.map((job) => scanAttemptRange(job.config, job.star, job.startAttempt, job.attemptCount, job.wantedClassKeys))
      : await Promise.all(jobs.map(startWorker));
    acceptScanResults(profile, state, rows);
    if (checkpointFile) saveCheckpoint(checkpointFile, profile, state);
    if (typeof options.onProgress === "function") {
      options.onProgress({
        phase: "generate",
        star,
        attempts: state.nextAttempt,
        accepted: stateCounts(state),
        observed: clone(state.observed)
      });
    }
  }
  validateStarState(profile, state, { exact: true });
  return state;
}

function buildPreset(profile, states, generatedAt = new Date().toISOString()) {
  assert(Array.isArray(states) && states.length === 8, "QUOTA_NOT_MET", "正式發布必須包含 1～8 星 checkpoint");
  const preset = {
    version: PRESET_VERSION,
    generatorRevision: GENERATOR_REVISION,
    signature: profile.configSignature,
    releaseSignature: profile.releaseSignature,
    generatedAt,
    storiesPerClass: profile.storiesPerClass,
    storiesPerStar: profile.storiesPerClass * CLASS_KEYS.length,
    natural: {},
    naturalDiagnostics: []
  };
  const summaryPreset = {
    version: SUMMARY_PRESET_VERSION,
    format: "compact-summary-v1",
    generatorRevision: GENERATOR_REVISION,
    signature: profile.configSignature,
    releaseSignature: profile.releaseSignature,
    generatedAt,
    storiesPerClass: profile.storiesPerClass,
    storiesPerStar: profile.storiesPerClass * CLASS_KEYS.length,
    naturalSummaries: {}
  };

  for (let star = 1; star <= 8; star += 1) {
    const state = states.find((row) => row.star === star);
    assert(state, "QUOTA_NOT_MET", `缺少 ${star} 星 checkpoint`);
    validateStarState(profile, state, { exact: true });
    preset.natural[star] = clone(state.seeds);
    summaryPreset.naturalSummaries[star] = clone(state.summaries);
    preset.naturalDiagnostics.push({
      star,
      attempts: state.nextAttempt,
      totalStories: profile.storiesPerClass * CLASS_KEYS.length,
      observed: clone(state.observed),
      accepted: stateCounts(state),
      missing: []
    });
  }
  return { preset, summaryPreset };
}

function validatePreset(profileInput, preset, summaryPreset, options = {}) {
  const profile = profileInput?.configSignature ? profileInput : createBuildProfile(profileInput, options);
  assert(preset?.signature === profile.configSignature, "SIGNATURE_MISMATCH", "劇本索引簽章與現行規則不同");
  assert(summaryPreset?.signature === profile.configSignature, "SIGNATURE_MISMATCH", "劇本摘要簽章與現行規則不同");
  assert(preset.generatorRevision === GENERATOR_REVISION, "SIGNATURE_MISMATCH", "劇本索引產生器版本不同");
  assert(summaryPreset.generatorRevision === GENERATOR_REVISION, "SIGNATURE_MISMATCH", "劇本摘要產生器版本不同");
  const counts = {};
  let totalStories = 0;
  for (let star = 1; star <= 8; star += 1) {
    counts[star] = {};
    const seen = new Set();
    for (const classKey of CLASS_KEYS) {
      const seeds = preset.natural?.[star]?.[classKey];
      const summaries = summaryPreset.naturalSummaries?.[star]?.[classKey];
      assert(Array.isArray(seeds) && seeds.length === profile.storiesPerClass, "QUOTA_NOT_MET", `${star} 星 ${classKey} seed 不是 ${profile.storiesPerClass} 筆`);
      assert(Array.isArray(summaries) && summaries.length === profile.storiesPerClass, "QUOTA_NOT_MET", `${star} 星 ${classKey} 摘要不是 ${profile.storiesPerClass} 筆`);
      seeds.forEach((seedInput, index) => {
        const seed = Number(seedInput) >>> 0;
        assert(!seen.has(seed), "DUPLICATE_SEED_IN_STAR", `${star} 星出現重複 seed`, { star, classKey, seed });
        seen.add(seed);
        validateStoredSummary(profile.config, star, classKey, seed, summaries[index]);
      });
      counts[star][classKey] = seeds.length;
      totalStories += seeds.length;
    }
  }
  const expectedTotal = 8 * CLASS_KEYS.length * profile.storiesPerClass;
  assert(totalStories === expectedTotal, "QUOTA_NOT_MET", `正式故事總數必須是 ${expectedTotal}`, { actual: totalStories });
  if (profile.formal) assert(totalStories === FORMAL_TOTAL_STORIES, "QUOTA_NOT_MET", "正式故事總數必須是 240,000", { actual: totalStories });
  return { ok: true, totalStories, counts, configSignature: profile.configSignature, releaseSignature: profile.releaseSignature };
}

function validateReplayBatch(configInput, entries) {
  const config = normalizeConfig(configInput);
  const digest = crypto.createHash("sha256");
  let checked = 0;
  for (const entry of entries) {
    const story = generateStory(config, entry.star, entry.seed, { includePath: true });
    const packed = NaturalCore.packStorySummary(story);
    assert(
      JSON.stringify(packed) === JSON.stringify(entry.summary),
      "REPLAY_MISMATCH",
      "完整重播與正式摘要不同",
      { star: entry.star, classKey: entry.classKey, seed: entry.seed }
    );
    assert(story.classKey === entry.classKey, "REPLAY_MISMATCH", "完整重播分類與正式桶不同", { star: entry.star, classKey: entry.classKey, seed: entry.seed, replayClass: story.classKey });
    digest.update(`${entry.star}:${entry.classKey}:${entry.seed}:`);
    digest.update(JSON.stringify(story.path));
    checked += 1;
  }
  return { checked, actionTraceSha256: digest.digest("hex") };
}

async function runConcurrent(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

async function validateAllReplays(profile, preset, summaryPreset, options = {}) {
  validatePreset(profile, preset, summaryPreset);
  const jobs = [];
  for (let star = 1; star <= 8; star += 1) {
    for (const classKey of CLASS_KEYS) {
      const seeds = preset.natural[star][classKey];
      const summaries = summaryPreset.naturalSummaries[star][classKey];
      for (let start = 0; start < seeds.length; start += profile.validationChunkSize) {
        jobs.push({
          mode: "validate",
          config: profile.config,
          entries: seeds.slice(start, start + profile.validationChunkSize).map((seed, offset) => ({
            star,
            classKey,
            seed,
            summary: summaries[start + offset]
          }))
        });
      }
    }
  }
  let checked = 0;
  const results = await runConcurrent(jobs, profile.workerCount, async (job) => {
    const result = options.useWorkers === false
      ? validateReplayBatch(job.config, job.entries)
      : await startWorker(job);
    checked += result.checked;
    if (typeof options.onProgress === "function") options.onProgress({ phase: "validate-replay", checked, total: 8 * CLASS_KEYS.length * profile.storiesPerClass });
    return result;
  });
  const combinedDigest = sha256(results.map((row) => row.actionTraceSha256).join(":"));
  const expected = 8 * CLASS_KEYS.length * profile.storiesPerClass;
  assert(checked === expected, "REPLAY_MISMATCH", "全量重播筆數不完整", { checked, expected });
  return { ok: true, checked, actionTraceSha256: combinedDigest };
}

function safeReleaseName(value) {
  const name = String(value || "");
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name), "INVALID_RELEASE_NAME", "releaseVersion 只允許英數、點、底線與連字號，且長度不得超過 80");
  return name;
}

function assertChildPath(parentInput, childInput) {
  const parent = path.resolve(parentInput);
  const child = path.resolve(childInput);
  const relative = path.relative(parent, child);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "UNSAFE_OUTPUT_PATH", "輸出路徑必須位於指定 outputRoot 內", { parent, child });
  return child;
}

function fileRecord(file, root) {
  const content = fs.readFileSync(file);
  return {
    path: path.relative(root, file).replaceAll("\\", "/"),
    bytes: content.length,
    sha256: sha256(content)
  };
}

function presetJavascript(globalName, value) {
  return `"use strict";\n(function(root){\n  const preset = ${JSON.stringify(value)};\n  if (typeof module === "object" && module.exports) module.exports = preset;\n  root.${globalName} = preset;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
}

function removeCheckpointDirectory(stagingRoot, checkpointRoot) {
  const staging = path.resolve(stagingRoot);
  const checkpoint = path.resolve(checkpointRoot);
  assert(path.dirname(checkpoint) === staging && path.basename(checkpoint) === ".checkpoints", "UNSAFE_OUTPUT_PATH", "拒絕清除非 staging 內的 checkpoint");
  if (fs.existsSync(checkpoint)) fs.rmSync(checkpoint, { recursive: true, force: true });
}

async function buildRelease(options = {}) {
  assert(options.outputRoot, "INVALID_CONFIG", "buildRelease 必須提供 outputRoot");
  const releaseVersion = safeReleaseName(options.releaseVersion);
  const profile = createBuildProfile(options.config, { ...options, formal: true });
  const outputRoot = path.resolve(options.outputRoot);
  const releasesRoot = path.join(outputRoot, "releases");
  const stagingRoot = assertChildPath(releasesRoot, path.join(releasesRoot, `${releaseVersion}.staging`));
  const finalRoot = assertChildPath(releasesRoot, path.join(releasesRoot, releaseVersion));
  const checkpointRoot = path.join(stagingRoot, ".checkpoints");
  assert(!fs.existsSync(finalRoot), "RELEASE_ALREADY_EXISTS", `正式版本已存在，拒絕覆寫：${finalRoot}`);
  fs.mkdirSync(checkpointRoot, { recursive: true });

  const progress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const states = [];
  for (let star = 1; star <= 8; star += 1) {
    states.push(await buildStarClassCatalog(profile, star, {
      checkpointFile: path.join(checkpointRoot, `star-${star}.json`),
      onProgress: progress
    }));
  }

  const generatedAt = new Date().toISOString();
  const { preset, summaryPreset } = buildPreset(profile, states, generatedAt);
  const structuralValidation = validatePreset(profile, preset, summaryPreset);
  const replayValidation = await validateAllReplays(profile, preset, summaryPreset, { onProgress: progress });

  const storyDataRoot = path.join(stagingRoot, "data", "story");
  fs.mkdirSync(storyDataRoot, { recursive: true });
  const presetFile = path.join(storyDataRoot, "boss-duel-story-preset-v1.js");
  const summaryFile = path.join(storyDataRoot, "boss-duel-story-summary-preset-v1.js");
  const diagnosticsFile = path.join(storyDataRoot, "natural-story-diagnostics.json");
  atomicWrite(presetFile, presetJavascript("BossDuelStoryPresetV1", preset));
  atomicWrite(summaryFile, presetJavascript("BossDuelStorySummaryPresetV1", summaryPreset));
  atomicWrite(diagnosticsFile, `${JSON.stringify({
    version: PRESET_VERSION,
    serviceVersion: SERVICE_VERSION,
    generatorRevision: GENERATOR_REVISION,
    releaseVersion,
    generatedAt,
    configSignature: profile.configSignature,
    releaseSignature: profile.releaseSignature,
    structuralValidation,
    replayValidation,
    naturalDiagnostics: preset.naturalDiagnostics
  }, null, 2)}\n`);

  const artifactFiles = [presetFile, summaryFile, diagnosticsFile];
  const manifest = {
    version: "boss-duel-story-release-manifest-v1",
    serviceVersion: SERVICE_VERSION,
    generatorRevision: GENERATOR_REVISION,
    releaseVersion,
    generatedAt,
    rulesVersion: Rules.VERSION,
    plannerVersion: StoryPlanner.VERSION,
    arrangementVersion: ARRANGEMENT_VERSION,
    actionTraceVersion: NaturalCore.ACTION_TRACE_VERSION,
    suppressionPolicyVersion: NaturalCore.SUPPRESSION_POLICY_VERSION,
    storyBetContractVersion: NaturalCore.STORY_BET_CONTRACT_VERSION,
    configSignature: profile.configSignature,
    releaseSignature: profile.releaseSignature,
    classificationBasis: "TOTAL_PAYOUT_OVER_TOTAL_SPEND",
    thresholds: { winMinReturnX: 3, pushMinReturnX: 1 },
    storiesPerClass: FORMAL_STORIES_PER_CLASS,
    storiesPerStar: FORMAL_STORIES_PER_STAR,
    totalStories: FORMAL_TOTAL_STORIES,
    counts: structuralValidation.counts,
    replayValidation,
    files: artifactFiles.map((file) => fileRecord(file, stagingRoot))
  };
  const manifestFile = path.join(stagingRoot, "manifest.json");
  atomicWrite(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  removeCheckpointDirectory(stagingRoot, checkpointRoot);
  fs.mkdirSync(releasesRoot, { recursive: true });
  fs.renameSync(stagingRoot, finalRoot);
  const publishedManifest = path.join(finalRoot, "manifest.json");
  const pointer = {
    version: "boss-duel-current-story-release-v1",
    releaseVersion,
    releasePath: path.relative(outputRoot, finalRoot).replaceAll("\\", "/"),
    manifestSha256: fileRecord(publishedManifest, finalRoot).sha256,
    publishedAt: new Date().toISOString()
  };
  atomicWrite(path.join(outputRoot, "current-release.json"), `${JSON.stringify(pointer, null, 2)}\n`);
  progress({ phase: "complete", releaseVersion, finalRoot, totalStories: FORMAL_TOTAL_STORIES });
  return { manifest, pointer, finalRoot };
}

function parseCliArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    assert(token.startsWith("--"), "INVALID_CLI_ARGUMENT", `未知參數：${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    assert(value !== undefined && !value.startsWith("--"), "INVALID_CLI_ARGUMENT", `${token} 缺少值`);
    values[key] = value;
    index += 1;
  }
  assert(values.output, "INVALID_CLI_ARGUMENT", "缺少 --output <目錄>");
  assert(values.release, "INVALID_CLI_ARGUMENT", "缺少 --release <版本名稱>");
  let config;
  if (values.config) {
    config = JSON.parse(fs.readFileSync(path.resolve(values.config), "utf8"));
  }
  return {
    outputRoot: path.resolve(values.output),
    releaseVersion: values.release,
    config,
    workerCount: values.workers ? Number(values.workers) : undefined,
    chunkAttempts: values["chunk-attempts"] ? Number(values["chunk-attempts"]) : undefined,
    validationChunkSize: values["validation-chunk-size"] ? Number(values["validation-chunk-size"]) : undefined
  };
}

async function runWorker() {
  try {
    if (workerData.mode === "scan") {
      parentPort.postMessage(scanAttemptRange(
        workerData.config,
        workerData.star,
        workerData.startAttempt,
        workerData.attemptCount,
        workerData.wantedClassKeys
      ));
      return;
    }
    if (workerData.mode === "validate") {
      parentPort.postMessage(validateReplayBatch(workerData.config, workerData.entries));
      return;
    }
    fail("WORKER_FAILED", `未知 worker mode：${workerData.mode}`);
  } catch (error) {
    parentPort.postMessage({
      error: {
        code: error.code || "WORKER_FAILED",
        message: error.message,
        details: error.details || {}
      }
    });
  }
}

const publicApi = {
  SERVICE_VERSION,
  GENERATOR_REVISION,
  PRESET_VERSION,
  SUMMARY_PRESET_VERSION,
  ARRANGEMENT_VERSION,
  FORMAL_STORIES_PER_CLASS,
  FORMAL_STORIES_PER_STAR,
  FORMAL_TOTAL_STORIES,
  CLASS_KEYS,
  SUPPORTED_BETS,
  StoryGenerationError,
  currentConfig,
  normalizeConfig,
  validateConfig,
  createBuildProfile,
  deriveSeed,
  generateStory,
  materializeStoryForBet,
  createStarState,
  stateCounts,
  isStarComplete,
  validateStarState,
  scanAttemptRange,
  acceptScanResults,
  saveCheckpoint,
  loadCheckpoint,
  buildStarClassCatalog,
  buildPreset,
  validatePreset,
  validateReplayBatch,
  validateAllReplays,
  buildRelease,
  parseCliArguments
};

module.exports = publicApi;

if (!isMainThread && workerData?.serviceVersion === SERVICE_VERSION) {
  runWorker();
} else if (isMainThread && require.main === module) {
  buildRelease({
    ...parseCliArguments(process.argv.slice(2)),
    onProgress(message) {
      process.stdout.write(`${JSON.stringify(message)}\n`);
    }
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({
      code: error.code || "STORY_GENERATION_FAILED",
      message: error.message,
      details: error.details || {}
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
