#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { exists, latestDirectory, readJson, writeJson } from '../src/lib/fs-json.mjs';
import { onboardTarget } from '../src/evaluator/onboard-target.mjs';
import { curateQueryPack } from '../src/evaluator/curate-query-pack.mjs';
import { generateExecutiveReport } from '../src/evaluator/generate-executive-report.mjs';
import { renderExecutivePdf, latexmkAvailable } from '../src/evaluator/render-executive-pdf.mjs';
import { generateFixPlan } from '../src/evaluator/fix-plan.mjs';

// GEN-017 shakedown: run the complete cycle (onboard -> inspect -> curate ->
// re-inspect -> executive report/PDF -> fix plan) across real Shopify stores
// in different verticals, and record honestly what works and what breaks.
// Every step is tolerant: a store that blocks or a stage that fails becomes
// an observation, not an abort.

const STORES = process.argv.slice(2).length
  ? process.argv.slice(2).map((url) => ({ url }))
  : [
      { url: 'https://www.allbirds.com', name: 'Allbirds' },
      { url: 'https://www.brooklinen.com', name: 'Brooklinen' },
      { url: 'https://www.gymshark.com', name: 'Gymshark' },
      { url: 'https://bombas.com', name: 'Bombas' },
      { url: 'https://colourpop.com', name: 'ColourPop' }
    ];

const rootDir = process.cwd();

function runInspection(evaluationPath) {
  const result = spawnSync(process.execPath, ['src/evaluator/run-inspection.mjs', '--evaluation', evaluationPath], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 900000
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const match = output.match(/Inspection complete: (\S+)/);
  return {
    ok: result.status === 0 && !!match,
    run_dir: match ? match[1] : null,
    error: result.status === 0 ? null : output.split('\n').filter(Boolean).slice(-5).join(' | ')
  };
}

function stage(record, name, task) {
  try {
    const value = task();
    record.stages[name] = { ok: true, ...(value && typeof value === 'object' ? value : {}) };
    return value;
  } catch (error) {
    record.stages[name] = { ok: false, error: String(error?.message || error).slice(0, 400) };
    return null;
  }
}

function runSummary(runDir) {
  const report = readJson(path.join(rootDir, runDir, 'inspection-report.json'));
  const dashboard = report.dashboard || {};
  return {
    inspection_id: report.inspection_id,
    status: dashboard.crawl_summary?.overall_inspection_status,
    confidence: dashboard.crawl_summary?.overall_confidence,
    coverage: dashboard.evidence_coverage?.component_coverage_percent,
    platform: dashboard.crawl_summary?.platform_detection?.platform,
    platform_confidence: dashboard.crawl_summary?.platform_detection?.confidence,
    infra_limitations: (report.limitations?.infrastructure_limitations || []).length,
    datasets: Object.fromEntries(Object.entries(report.datasets || {}).map(([id, dataset]) => [id, dataset.rows]))
  };
}

const results = [];
for (const store of STORES) {
  const record = { store: store.url, stages: {} };
  results.push(record);
  console.log(`\n=== ${store.url} ===`);

  const onboarded = stage(record, 'onboard', () => onboardTarget(rootDir, store));
  if (!onboarded) continue;
  record.target_id = onboarded.target_id;

  const firstRun = stage(record, 'inspect_starter', () => {
    const inspection = runInspection(onboarded.evaluation);
    if (!inspection.ok) throw new Error(inspection.error || 'inspection failed');
    return { run_dir: inspection.run_dir, ...runSummary(inspection.run_dir) };
  });
  if (!firstRun) continue;
  console.log(`  starter run: ${firstRun.status} ${firstRun.coverage}% (${firstRun.platform}/${firstRun.platform_confidence})`);

  const curated = stage(record, 'curate', () => curateQueryPack(rootDir, firstRun.run_dir));
  let finalRun = firstRun;
  if (curated) {
    const second = stage(record, 'inspect_curated', () => {
      const inspection = runInspection(onboarded.evaluation);
      if (!inspection.ok) throw new Error(inspection.error || 'inspection failed');
      return { run_dir: inspection.run_dir, ...runSummary(inspection.run_dir) };
    });
    if (second) finalRun = second;
    console.log(`  curated run: ${finalRun.status} ${finalRun.coverage}% DS:${JSON.stringify(finalRun.datasets)}`);
  }

  const executive = stage(record, 'executive_report', () => generateExecutiveReport(rootDir, finalRun.run_dir));
  if (executive) {
    console.log(`  report: ${executive.surfaces_scored} surfaces, ${executive.strengths} strengths, ${executive.issues} issues, ${executive.coverage_gaps} gaps`);
    if (latexmkAvailable()) stage(record, 'executive_pdf', () => renderExecutivePdf(rootDir, finalRun.run_dir));
    if (executive.issues > 0) stage(record, 'fix_plan', () => generateFixPlan(rootDir, finalRun.run_dir));
  }
  record.final_run = finalRun;
}

const summaryPath = path.join(rootDir, 'assessments', 'shakedown-gen017.json');
writeJson(summaryPath, {
  schema_version: 'shakedown-summary-v0.1',
  generation: 'GEN-017',
  ran_at: new Date().toISOString(),
  stores: results
});
console.log(`\nShakedown summary written: ${path.relative(rootDir, summaryPath)}`);
