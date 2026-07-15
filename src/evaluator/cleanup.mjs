#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exists, readJsonl } from '../lib/fs-json.mjs';

// Inspection artifact cleanup. Operates ONLY on timestamped run directories
// (assessments/<target>/inspection-report/<generation>/GEN-<gen>-<timestamp>Z).
// Never touches target manifests, evaluations, query packs, fix plans, or the
// inspection-history index - those are cheap and load-bearing. Every policy
// supports a dry run so the operator sees exactly what would be freed first.

const RUN_DIR_PATTERN = /^GEN-\d{3}-\d{8}T\d{6}Z$/;

function dirSize(dirPath) {
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += dirSize(entryPath);
    else total += fs.statSync(entryPath).size;
  }
  return total;
}

function collectRunDirs(rootDir) {
  const assessmentsDir = path.join(rootDir, 'assessments');
  if (!exists(assessmentsDir)) return [];
  const runs = [];
  for (const target of fs.readdirSync(assessmentsDir, { withFileTypes: true })) {
    if (!target.isDirectory()) continue;
    const reportRoot = path.join(assessmentsDir, target.name, 'inspection-report');
    if (!exists(reportRoot)) continue;
    for (const generation of fs.readdirSync(reportRoot, { withFileTypes: true })) {
      if (!generation.isDirectory()) continue;
      const genDir = path.join(reportRoot, generation.name);
      for (const run of fs.readdirSync(genDir, { withFileTypes: true })) {
        if (run.isDirectory() && RUN_DIR_PATTERN.test(run.name)) {
          const runPath = path.join(genDir, run.name);
          runs.push({
            target_id: target.name,
            generation: generation.name,
            run_id: run.name,
            path: runPath,
            rel_path: path.relative(rootDir, runPath),
            size_bytes: dirSize(runPath)
          });
        }
      }
    }
  }
  return runs;
}

function latestReferencedRunIds(rootDir) {
  // Runs named as the last-verified inspection in any fix plan are protected so
  // cleanup never breaks a fix plan's verification lineage.
  const referenced = new Set();
  const assessmentsDir = path.join(rootDir, 'assessments');
  if (!exists(assessmentsDir)) return referenced;
  for (const target of fs.readdirSync(assessmentsDir, { withFileTypes: true })) {
    if (!target.isDirectory()) continue;
    const planPath = path.join(assessmentsDir, target.name, 'fix-plan.json');
    if (!exists(planPath)) continue;
    try {
      const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      if (plan.last_verification_inspection) referenced.add(plan.last_verification_inspection);
      if (plan.updated_from_inspection) referenced.add(plan.updated_from_inspection);
    } catch {
      // ignore unreadable plan
    }
  }
  return referenced;
}

// Captures (screenshots + raw HTTP/HTML dumps) are the heavy part of a run.
// This policy reclaims that space while keeping the structured evidence,
// datasets, and reports — so reports still render and fixes still verify.
const CAPTURE_SUBDIRS = [['evidence', 'screenshots'], ['raw']];

function captureBytes(runDir) {
  let total = 0;
  const targets = [];
  for (const parts of CAPTURE_SUBDIRS) {
    const dir = path.join(runDir, ...parts);
    if (exists(dir) && fs.statSync(dir).isDirectory()) {
      total += dirSize(dir);
      targets.push(dir);
    }
  }
  return { total, targets };
}

function planCaptureRemovals(rootDir) {
  const runs = collectRunDirs(rootDir).map((run) => {
    const { total, targets } = captureBytes(run.path);
    return { ...run, capture_bytes: total, capture_targets: targets };
  }).filter((run) => run.capture_bytes > 0);
  return {
    policy: 'captures-only',
    total_runs: runs.length,
    remove: runs,
    keep_list: [],
    freed_bytes: runs.reduce((sum, run) => sum + run.capture_bytes, 0)
  };
}

function planRemovals(rootDir, { policy = 'keep-latest', keep = 1 } = {}) {
  if (policy === 'captures-only') return planCaptureRemovals(rootDir);
  const runs = collectRunDirs(rootDir);
  const protectedIds = latestReferencedRunIds(rootDir);
  const byTarget = new Map();
  for (const run of runs) {
    if (!byTarget.has(run.target_id)) byTarget.set(run.target_id, []);
    byTarget.get(run.target_id).push(run);
  }

  const toRemove = [];
  const kept = [];
  for (const [, targetRuns] of byTarget) {
    const sorted = targetRuns.sort((left, right) => right.run_id.localeCompare(left.run_id));
    for (let index = 0; index < sorted.length; index += 1) {
      const run = sorted[index];
      const withinKeepWindow = policy === 'keep-latest' && index < Math.max(1, keep);
      const protectedByPlan = protectedIds.has(run.run_id);
      if (policy === 'all-runs') {
        if (protectedByPlan) kept.push({ ...run, reason: 'referenced by fix plan' });
        else toRemove.push(run);
      } else if (withinKeepWindow || protectedByPlan) {
        kept.push({ ...run, reason: withinKeepWindow ? 'within keep window' : 'referenced by fix plan' });
      } else {
        toRemove.push(run);
      }
    }
  }

  const freedBytes = toRemove.reduce((sum, run) => sum + run.size_bytes, 0);
  return { policy, keep, total_runs: runs.length, remove: toRemove, keep_list: kept, freed_bytes: freedBytes };
}

export function previewCleanup(rootDir, options) {
  const plan = planRemovals(rootDir, options);
  return {
    policy: plan.policy,
    keep: plan.keep,
    total_runs: plan.total_runs,
    runs_to_remove: plan.remove.length,
    runs_kept: plan.keep_list.length,
    freed_bytes: plan.freed_bytes,
    freed_mb: Math.round((plan.freed_bytes / (1024 * 1024)) * 10) / 10,
    remove: plan.remove.map((run) => ({ target_id: run.target_id, run_id: run.run_id, rel_path: run.rel_path, size_bytes: run.capture_bytes ?? run.size_bytes }))
  };
}

export function runCleanup(rootDir, options) {
  const plan = planRemovals(rootDir, options);
  const removed = [];
  for (const run of plan.remove) {
    if (plan.policy === 'captures-only') {
      // Remove only the capture subdirs, leaving structured evidence intact.
      for (const dir of run.capture_targets || []) fs.rmSync(dir, { recursive: true, force: true });
      removed.push({ target_id: run.target_id, run_id: run.run_id, rel_path: run.rel_path, size_bytes: run.capture_bytes });
    } else {
      fs.rmSync(run.path, { recursive: true, force: true });
      removed.push({ target_id: run.target_id, run_id: run.run_id, rel_path: run.rel_path, size_bytes: run.size_bytes });
    }
  }
  return {
    policy: plan.policy,
    keep: plan.keep,
    removed_count: removed.length,
    kept_count: plan.keep_list.length,
    freed_bytes: plan.freed_bytes,
    freed_mb: Math.round((plan.freed_bytes / (1024 * 1024)) * 10) / 10,
    removed
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const policy = args.includes('--all') ? 'all-runs' : 'keep-latest';
  const keepArg = args.indexOf('--keep');
  const keep = keepArg >= 0 ? Number(args[keepArg + 1]) : 1;
  const fn = apply ? runCleanup : previewCleanup;
  console.log(JSON.stringify(fn(process.cwd(), { policy, keep }), null, 2));
  if (!apply) console.log('\n(dry run — pass --apply to delete)');
}
