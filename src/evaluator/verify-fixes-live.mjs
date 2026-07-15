#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exists, latestDirectory, listFilesRecursive, readJson } from '../lib/fs-json.mjs';
import { readFixPlan, verifyFixPlan } from './fix-plan.mjs';

// One-click live verification: run a bounded re-inspection covering only the
// surfaces the open fix items need, then verify the plan against the fresh
// evidence. Cheaper than a full inspection, and the fix statuses still change
// only through observation.

const PLUGINS_BY_ITEM_TYPE = {
  zero_result_query: ['submitted-search'],
  failed_query: ['submitted-search'],
  slow_query: ['submitted-search'],
  unassisted_prefix: ['autocomplete'],
  invisible_dropdown: ['autocomplete', 'rendered-search'],
  rendered_no_products: ['autocomplete', 'rendered-search']
};

function findEvaluationForTarget(rootDir, targetId) {
  const targetPath = path.join('targets', `${targetId}.json`);
  for (const file of listFilesRecursive(path.join(rootDir, 'evaluations')).filter((entry) => entry.endsWith('.json'))) {
    const evaluation = readJson(file);
    if (evaluation.target === targetPath) return { path: path.relative(rootDir, file), evaluation };
  }
  throw new Error(`No evaluation manifest found for target ${targetId}.`);
}

export function verifyFixesLive(rootDir, targetId) {
  const plan = readFixPlan(rootDir, targetId);
  if (!plan) throw new Error(`No fix plan exists for ${targetId}.`);
  const openItems = plan.items.filter((item) => ['open', 'still_failing', 'regressed'].includes(item.status));
  if (openItems.length === 0) {
    return { target_id: targetId, note: 'No open fix items; nothing to verify.', open_items: 0 };
  }

  const plugins = [...new Set(openItems.flatMap((item) => PLUGINS_BY_ITEM_TYPE[item.type] || []))];
  if (plugins.length === 0) throw new Error('Open items have no runnable verification plugins.');
  const { path: evaluationPath, evaluation } = findEvaluationForTarget(rootDir, targetId);
  const availablePlugins = new Set(evaluation.plugins || []);
  const runnable = plugins.filter((plugin) => availablePlugins.has(plugin));
  if (runnable.length === 0) throw new Error('The evaluation manifest does not include the plugins needed for verification.');

  const inspect = spawnSync(
    process.execPath,
    ['src/evaluator/run-inspection.mjs', '--evaluation', evaluationPath, '--only', runnable.join(',')],
    { cwd: rootDir, encoding: 'utf8', timeout: 600000 }
  );
  if (inspect.status !== 0) {
    const tail = `${inspect.stdout || ''}\n${inspect.stderr || ''}`.split('\n').filter(Boolean).slice(-8).join('\n');
    throw new Error(`Verification inspection failed:\n${tail}`);
  }

  const baseDir = path.join(rootDir, evaluation.output.base_dir);
  const runDir = latestDirectory(baseDir);
  if (!runDir || !exists(path.join(runDir, 'inspection-report.json'))) {
    throw new Error('Verification inspection completed but its run directory was not found.');
  }

  const verification = verifyFixPlan(rootDir, path.relative(rootDir, runDir));
  return {
    ...verification,
    verification_run: path.relative(rootDir, runDir),
    plugins_run: runnable
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetId = process.argv[2];
  if (!targetId) {
    console.error('Usage: node src/evaluator/verify-fixes-live.mjs <target-id>');
    process.exit(1);
  }
  console.log(JSON.stringify(verifyFixesLive(process.cwd(), targetId), null, 2));
}
