#!/usr/bin/env node

// Functional parity check for the GEN-013 pilot: compare a bounded
// inspection run's submitted-search and autocomplete observations against
// the saved GEN-012 expanded IR evidence for the same queries. Blocked
// observations are limitations, not mismatches — the evaluator worked as
// designed when it classified the block instead of inventing evidence.

import path from 'node:path';
import { readJson, readJsonl, writeJson } from '../lib/fs-json.mjs';

function fail(message) {
  console.error(`Parity validation failed: ${message}`);
  process.exit(1);
}

function baselineWorking(score) {
  return typeof score === 'number' && score >= 60;
}

function main() {
  const runDir = process.argv[2];
  const baselinePath = process.argv[3] || 'assessments/dress-up/expanded-ir-evidence/GEN-012/dressup-expanded-ir-evidence.json';
  if (!runDir) {
    fail('Usage: node src/evaluator/validate-pilot-parity.mjs <run-dir> [baseline-evidence.json]');
  }

  const baseline = readJson(baselinePath);
  const baselineByQuery = new Map(baseline.examples.map((example) => [example.query.toLowerCase(), example]));
  const searchRows = readJsonl(path.join(runDir, 'evidence', 'experiments', 'submitted-search.jsonl'));
  const autocompleteRows = readJsonl(path.join(runDir, 'evidence', 'experiments', 'autocomplete.jsonl'));
  const autocompleteByQuery = new Map(autocompleteRows.map((row) => [row.typed_prefix.toLowerCase(), row]));

  const rows = [];
  for (const searchRow of searchRows) {
    const query = searchRow.query.toLowerCase();
    const example = baselineByQuery.get(query);
    if (!example) {
      rows.push({ query: searchRow.query, parity_status: 'no_baseline', note: 'Query has no GEN-012 baseline example.' });
      continue;
    }
    const autocompleteRow = autocompleteByQuery.get(query);

    const searchBlocked = Boolean(searchRow.classification);
    const searchObservedWorking = searchRow.ok && (searchRow.observed?.result_count_hint ?? 0) > 0;
    const searchBaselineWorking = baselineWorking(example.search_score);
    const searchParity = searchBlocked
      ? 'not_comparable_blocked'
      : searchObservedWorking === searchBaselineWorking
        ? 'parity'
        : 'mismatch';

    const autocompleteBlocked = Boolean(autocompleteRow?.classification);
    const autocompleteObservedWorking = Boolean(autocompleteRow?.ok) && (autocompleteRow?.observed?.suggestion_count ?? 0) > 0;
    const autocompleteBaselineWorking = baselineWorking(example.autocomplete_score);
    const autocompleteParity = !autocompleteRow || autocompleteBlocked
      ? 'not_comparable_blocked'
      : autocompleteObservedWorking === autocompleteBaselineWorking
        ? 'parity'
        : 'mismatch';

    rows.push({
      query: searchRow.query,
      search: {
        baseline_score: example.search_score,
        baseline_working: searchBaselineWorking,
        observed_status: searchRow.status,
        observed_result_count_hint: searchRow.observed?.result_count_hint ?? null,
        observed_block: searchRow.classification?.code || null,
        parity_status: searchParity
      },
      autocomplete: {
        baseline_score: example.autocomplete_score,
        baseline_working: autocompleteBaselineWorking,
        observed_status: autocompleteRow?.status ?? null,
        observed_suggestion_count: autocompleteRow?.observed?.suggestion_count ?? null,
        observed_block: autocompleteRow?.classification?.code || null,
        parity_status: autocompleteParity
      }
    });
  }

  const statuses = rows.flatMap((row) => [row.search?.parity_status, row.autocomplete?.parity_status]).filter(Boolean);
  const counts = {
    parity: statuses.filter((status) => status === 'parity').length,
    not_comparable_blocked: statuses.filter((status) => status === 'not_comparable_blocked').length,
    mismatch: statuses.filter((status) => status === 'mismatch').length
  };

  const summary = {
    schema_version: 'pilot-parity-v0.1',
    run_dir: runDir,
    baseline_evidence: baselinePath,
    baseline_generation: baseline.generation,
    compared_queries: rows.length,
    surface_checks: counts,
    overall_status: counts.mismatch > 0 ? 'mismatch' : counts.parity > 0 ? 'parity_within_unblocked_evidence' : 'blocked_no_comparable_evidence',
    note: 'Baseline GEN-012 evidence came from rendered browser capture; this run uses public endpoint fetches only, so parity is judged on whether each surface works, not on exact result counts.',
    rows,
    validated_at: new Date().toISOString()
  };
  writeJson(path.join(runDir, 'pilot-parity.json'), summary);

  console.log(`Pilot parity: ${summary.overall_status} (parity ${counts.parity}, blocked ${counts.not_comparable_blocked}, mismatch ${counts.mismatch})`);
  for (const row of rows) {
    console.log(`- ${row.query}: search=${row.search?.parity_status} autocomplete=${row.autocomplete?.parity_status}`);
  }
  if (counts.mismatch > 0) {
    process.exit(1);
  }
}

main();
