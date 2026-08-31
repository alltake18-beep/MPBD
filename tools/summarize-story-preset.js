"use strict";

const fs = require("node:fs");
const path = require("node:path");
const seedPreset = require("../boss-duel-story-preset-v1.js");
const summaryPreset = require("../boss-duel-story-summary-preset-v1.js");
const StoryCore = require("../boss-duel-natural-story-core.js");

if (seedPreset.signature !== summaryPreset.signature) throw new Error("故事種子目錄與統計摘要版本不一致");

function blank(star) {
  return {
    star, stories: 0, kills: 0, spendX: 0, payoutX: 0, netX: 0,
    manualStories: 0, manualAdjustments: 0, decisionSteps: 0,
    jokerStories: 0, neverBelowHalf: 0,
    classes: { win: 0, push: 0, lose: 0 }
  };
}

function add(row, story) {
  row.stories += 1;
  row.kills += story.killed ? 1 : 0;
  row.spendX += story.spendX;
  row.payoutX += story.payoutX;
  row.netX += story.netX;
  row.manualStories += Number(story.actions?.manualAdjustments || 0) > 0 ? 1 : 0;
  row.manualAdjustments += Number(story.actions?.manualAdjustments || 0);
  row.decisionSteps += Number(story.rounds || 0) + Number(story.actions?.ties || 0);
  row.jokerStories += Number(story.magicCounts?.joker || 0) > 0 ? 1 : 0;
  row.neverBelowHalf += !story.killed && story.hpLeft >= story.hp / 2 ? 1 : 0;
  row.classes[story.classKey] += 1;
}

function finish(row) {
  const n = Math.max(1, row.stories);
  return {
    ...row,
    killRatePct: row.kills / n * 100,
    averageSpendX: row.spendX / n,
    averagePayoutX: row.payoutX / n,
    averageNetX: row.netX / n,
    overallReturnX: row.payoutX / Math.max(row.spendX, 1e-12),
    manualStoryRatePct: row.manualStories / n * 100,
    manualDecisionStepRatePct: row.manualAdjustments / Math.max(1, row.decisionSteps) * 100
  };
}

const stars = [];
const total = blank("ALL");
for (let star = 1; star <= 8; star += 1) {
  const row = blank(star);
  for (const classKey of ["win", "push", "lose"]) {
    for (const packed of summaryPreset.naturalSummaries?.[star]?.[classKey] || []) {
      const story = StoryCore.unpackStorySummary(packed, star, classKey);
      add(row, story);
      add(total, story);
    }
  }
  stars.push(finish(row));
}

const report = {
  generatedAt: new Date().toISOString(),
  seedPresetVersion: seedPreset.version,
  summaryPresetVersion: summaryPreset.version,
  generatorRevision: seedPreset.generatorRevision,
  storiesPerStar: seedPreset.storiesPerStar,
  total: finish(total),
  stars
};
const output = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
