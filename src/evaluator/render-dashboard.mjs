#!/usr/bin/env node

import path from 'node:path';
import { latestDirectory, readJson, readJsonl, writeText } from '../lib/fs-json.mjs';
import { buildDashboardHtml } from './dashboard-html.mjs';

function parseRunDir(argv) {
  const explicit = argv[0] === '--run' ? argv[1] : argv[0];
  return explicit || latestDirectory('assessments/ridge/inspection-report/GEN-013');
}

const runDir = parseRunDir(process.argv.slice(2));
if (!runDir) {
  console.error('No inspection run directory found.');
  process.exit(1);
}

const report = readJson(path.join(runDir, 'inspection-report.json'));
const timelineRows = readJsonl(path.join(runDir, 'evidence', 'timeline.jsonl'));
const html = buildDashboardHtml({ report, timelineRows, outputDir: runDir });
const outputPath = path.join(runDir, 'dashboard.html');
writeText(outputPath, html);
console.log(`Dashboard written: ${outputPath}`);
