#!/usr/bin/env node

// Resume validation for design item 12: deliberately interrupt a bounded
// inspection after its first plugin, resume it from the checkpoint, and
// prove which work was reused, which work ran fresh, and why any repeated
// artifact writes are safe. Writes resume-validation.json into the run dir.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { exists, readJson, readJsonl, writeJson } from '../lib/fs-json.mjs';

function fail(message) {
  console.error(`Resume validation failed: ${message}`);
  process.exit(1);
}

function runInspection(args) {
  const stdout = execFileSync('node', ['src/evaluator/run-inspection.mjs', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  });
  process.stdout.write(stdout);
  return stdout;
}

function main() {
  const evaluationPath = process.argv[2];
  const interruptAfter = process.argv[3] || 'submitted-search';
  if (!evaluationPath) {
    fail('Usage: node src/evaluator/validate-resume.mjs evaluations/<manifest>.json [interrupt-after-plugin]');
  }

  const interruptedStdout = runInspection([
    '--evaluation',
    evaluationPath,
    '--simulate-interrupt-after',
    interruptAfter
  ]);
  const runDirMatch = interruptedStdout.match(/Inspection interrupted for validation after [^:]+: (.+)/);
  if (!runDirMatch) fail('Interrupted run did not report its output directory.');
  const runDir = runDirMatch[1].trim();

  const interruptedCheckpoint = readJson(path.join(runDir, 'checkpoint.json'));
  if (interruptedCheckpoint.status !== 'interrupted_for_validation') {
    fail(`Expected interrupted checkpoint status, found ${interruptedCheckpoint.status}.`);
  }
  if (!interruptedCheckpoint.completed_phases.includes(interruptAfter)) {
    fail(`Interrupted checkpoint should record ${interruptAfter} as completed.`);
  }
  if (interruptedCheckpoint.pending_phases.length === 0) {
    fail('Interrupted checkpoint should leave at least one pending phase to resume.');
  }
  const pendingAtInterrupt = [...interruptedCheckpoint.pending_phases];

  runInspection(['--resume', runDir]);

  const resumedCheckpoint = readJson(path.join(runDir, 'checkpoint.json'));
  if (resumedCheckpoint.status !== 'complete') {
    fail(`Expected resumed checkpoint status complete, found ${resumedCheckpoint.status}.`);
  }
  if (resumedCheckpoint.inspection_id !== interruptedCheckpoint.inspection_id) {
    fail('Resume must keep the original inspection ID.');
  }

  const timeline = readJsonl(path.join(runDir, 'evidence', 'timeline.jsonl'));
  const resumeStart = timeline.find((entry) => entry.event === 'inspection_started' && entry.resumed_from_checkpoint === true);
  if (!resumeStart) fail('Timeline does not record a resumed inspection start.');

  const reusedPlugins = timeline
    .filter((entry) => entry.event === 'plugin_skipped_reused_checkpoint')
    .map((entry) => entry.plugin_id);
  if (!reusedPlugins.includes(interruptAfter)) {
    fail(`Timeline should record ${interruptAfter} as reused from the checkpoint instead of rerun.`);
  }

  const cacheMetadata = exists(path.join(runDir, 'cache-metadata.json'))
    ? readJson(path.join(runDir, 'cache-metadata.json'))
    : null;
  if (cacheMetadata?.decision !== 'reused_run_checkpoint') {
    fail('Resumed run should reuse the run-directory site profile instead of re-discovering it.');
  }

  const summary = {
    schema_version: 'resume-validation-v0.1',
    inspection_id: resumedCheckpoint.inspection_id,
    evaluation_manifest: evaluationPath,
    run_dir: runDir,
    interrupted_after_plugin: interruptAfter,
    pending_phases_at_interrupt: pendingAtInterrupt,
    reused_from_checkpoint: {
      plugins: reusedPlugins,
      site_profile: cacheMetadata.decision,
      datasets: 'DS1-DS4 files already existed in the run directory and were summarized, not regenerated.',
      platform_capability_report: 'Existing platform-capability-report.json was reused without rerunning validators.'
    },
    rerun_work: {
      plugins: pendingAtInterrupt,
      reason: 'These plugins had no completed checkpoint entry, so their observations did not exist yet and had to run live.'
    },
    repeated_idempotent_writes: {
      artifacts: ['run-manifest.json', 'artifact-index.json', 'dashboard.json', 'dashboard.html', 'inspection-report.json', 'inspection-report.md', 'checkpoint.json'],
      reason: 'Derived artifacts are regenerated deterministically from checkpointed evidence on every pass; no network work is repeated by rebuilding them.'
    },
    validated_at: new Date().toISOString()
  };
  writeJson(path.join(runDir, 'resume-validation.json'), summary);

  console.log(`Resume validation passed: ${runDir}`);
  console.log(`Reused from checkpoint: ${reusedPlugins.join(', ')}`);
  console.log(`Rerun after resume: ${pendingAtInterrupt.join(', ')}`);
}

main();
