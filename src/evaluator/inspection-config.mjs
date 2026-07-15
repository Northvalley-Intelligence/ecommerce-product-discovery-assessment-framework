import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, writeJson } from '../lib/fs-json.mjs';
import { onboardTarget } from './onboard-target.mjs';

// Backs the "Create / Edit Inspection Setup" form. An inspection run is
// immutable, so editing an inspection means editing its target's evaluation
// manifest (the recipe); saving re-runs it into a fresh run.

const PLUGIN_LABELS = {
  'submitted-search': 'Search',
  autocomplete: 'Autocomplete',
  facets: 'Filters & Facets',
  recommendations: 'Recommendations',
  mobile: 'Mobile (HTTP)',
  'rendered-search': 'Rendered Storefront (browser + screenshots)'
};

// Plugins offered in the form, in display order. competitor-inspection is
// omitted: it needs a competitor set the simple form does not collect.
const FORM_PLUGINS = ['submitted-search', 'autocomplete', 'facets', 'recommendations', 'mobile', 'rendered-search'];

function pluginSurface(rootDir, pluginId) {
  const metaPath = path.join(rootDir, 'src', 'plugins', pluginId, 'plugin.json');
  return exists(metaPath) ? readJson(metaPath).surface : pluginId.replace(/-/g, '_');
}

export function availablePlugins(rootDir) {
  return FORM_PLUGINS.filter((id) => exists(path.join(rootDir, 'src', 'plugins', id, 'plugin.json'))).map((id) => ({
    id,
    label: PLUGIN_LABELS[id] || id
  }));
}

function evaluationPathForTarget(rootDir, targetId) {
  const direct = path.join(rootDir, 'evaluations', `${targetId}-shopify-baseline.json`);
  if (exists(direct)) return direct;
  const targetRel = path.join('targets', `${targetId}.json`);
  for (const entry of fs.readdirSync(path.join(rootDir, 'evaluations')).filter((name) => name.endsWith('.json'))) {
    const full = path.join(rootDir, 'evaluations', entry);
    if (readJson(full).target === targetRel) return full;
  }
  return null;
}

export function loadInspectionConfig(rootDir, targetId) {
  const plugins = availablePlugins(rootDir);
  if (!targetId) {
    return {
      mode: 'create',
      url: '',
      name: '',
      plugins: plugins.map((plugin) => ({ ...plugin, selected: true })),
      rendering: { desktop: true, mobile: true }
    };
  }
  const evaluationPath = evaluationPathForTarget(rootDir, targetId);
  if (!evaluationPath) throw new Error(`No evaluation manifest found for target ${targetId}.`);
  const evaluation = readJson(evaluationPath);
  const target = readJson(path.join(rootDir, evaluation.target));
  const selected = new Set(evaluation.plugins || []);
  return {
    mode: 'edit',
    target_id: targetId,
    url: target.primary_url,
    name: target.name,
    plugins: plugins.map((plugin) => ({ ...plugin, selected: selected.has(plugin.id) })),
    rendering: {
      desktop: evaluation.rendering?.desktop !== false,
      mobile: evaluation.rendering?.mobile === true
    }
  };
}

export function saveInspectionConfig(rootDir, { target_id, url, name, plugins, rendering } = {}) {
  const chosen = FORM_PLUGINS.filter((id) => (plugins || []).includes(id));
  if (chosen.length === 0) throw new Error('Select at least one plugin to inspect.');
  // rendered-search depends on autocomplete evidence; keep the graph valid.
  if (chosen.includes('rendered-search') && !chosen.includes('autocomplete')) {
    chosen.splice(chosen.indexOf('rendered-search'), 0, 'autocomplete');
  }

  let targetId = target_id;
  if (!targetId) {
    const onboarded = onboardTarget(rootDir, { url, name });
    targetId = onboarded.target_id;
  }

  const evaluationPath = evaluationPathForTarget(rootDir, targetId);
  if (!evaluationPath) throw new Error(`No evaluation manifest found for target ${targetId}.`);
  const evaluation = readJson(evaluationPath);
  evaluation.plugins = chosen;
  evaluation.surfaces = chosen.map((id) => pluginSurface(rootDir, id));
  evaluation.rendering = {
    desktop: rendering?.desktop !== false,
    mobile: rendering?.mobile === true,
    screenshots: rendering?.desktop !== false || rendering?.mobile === true
  };
  writeJson(evaluationPath, evaluation);

  if (name) {
    const target = readJson(path.join(rootDir, evaluation.target));
    if (target.name !== name) {
      target.name = name;
      writeJson(path.join(rootDir, evaluation.target), target);
    }
  }

  return { target_id: targetId, evaluation: path.relative(rootDir, evaluationPath) };
}
