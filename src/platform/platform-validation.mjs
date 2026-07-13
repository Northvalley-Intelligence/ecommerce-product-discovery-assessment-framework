import path from 'node:path';
import { readJson, writeJson } from '../lib/fs-json.mjs';

const PASS = 'pass';
const WARN = 'warn';
const FAIL = 'fail';

function statusForCapability(capability) {
  if (capability.status === 'implemented') return PASS;
  if (capability.status === 'implemented_basic') return WARN;
  return FAIL;
}

function notesForCapability(capability) {
  if (capability.status === 'implemented') return 'Capability is implemented for the current evaluator version.';
  if (capability.status === 'implemented_basic') {
    return 'Capability is available as a bounded implementation and may need expansion after real inspections.';
  }
  return 'Capability is registered but not implemented in this evaluator version.';
}

function affectedCapabilities(changedIds, dependencyGraph) {
  const changed = new Set(changedIds || []);
  const affected = new Set(changed);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const entry of dependencyGraph.dependencies || []) {
      if (entry.depends_on?.some((id) => affected.has(id)) && !affected.has(entry.capability_id)) {
        affected.add(entry.capability_id);
        expanded = true;
      }
    }
  }
  return [...affected].sort();
}

export function runPlatformValidation({
  generation,
  target,
  outputDir,
  changedCapabilities = []
}) {
  const registry = readJson('platform/capability-registry.json');
  const dependencyGraph = readJson('platform/capability-dependency-graph.json');
  const suite = readJson('platform/validation-suite.json');
  const affected = affectedCapabilities(changedCapabilities, dependencyGraph);

  const validatorByCapability = new Map(
    (suite.validators || []).map((validator) => [validator.capability_id, validator.validator_id])
  );

  const checks = (registry.capabilities || []).map((capability) => ({
    capability_id: capability.capability_id,
    name: capability.name,
    validator: validatorByCapability.get(capability.capability_id) || capability.validator,
    status: statusForCapability(capability),
    capability_status: capability.status,
    maturity_level: capability.maturity_level,
    affected_by_change: affected.length === 0 ? false : affected.includes(capability.capability_id),
    notes: notesForCapability(capability)
  }));

  const counts = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 }
  );

  const report = {
    schema_version: 'platform-capability-report-v0.1',
    generation,
    target_id: target.target_id,
    generated_at: new Date().toISOString(),
    overall_status: counts.fail > 0 ? 'warn' : counts.warn > 0 ? 'warn' : 'pass',
    evidence_quality: counts.fail > 0 ? 'partial' : counts.warn > 0 ? 'bounded' : 'complete',
    capability_counts: counts,
    changed_capabilities: changedCapabilities,
    affected_capabilities: affected,
    checks,
    platform_gap_classification_rule:
      'Capability failures describe evaluator maturity and must not be emitted as ecommerce findings.'
  };

  if (outputDir) {
    writeJson(path.join(outputDir, 'platform-capability-report.json'), report);
  }

  return report;
}
