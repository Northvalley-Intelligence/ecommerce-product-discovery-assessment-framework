import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJson, exists } from '../lib/fs-json.mjs';

export function readPluginMetadata(pluginId) {
  const metadataPath = path.join('src', 'plugins', pluginId, 'plugin.json');
  if (!exists(metadataPath)) {
    throw new Error(`Plugin metadata not found: ${metadataPath}`);
  }
  return readJson(metadataPath);
}

export async function loadPlugin(pluginId) {
  const metadata = readPluginMetadata(pluginId);
  const modulePath = path.resolve('src', 'plugins', pluginId, 'index.mjs');
  if (!exists(modulePath)) {
    throw new Error(`Plugin implementation not found: ${modulePath}`);
  }
  const module = await import(pathToFileURL(modulePath).href);
  if (typeof module.run !== 'function') {
    throw new Error(`Plugin ${pluginId} must export run(context)`);
  }
  return {
    metadata,
    run: module.run
  };
}

export function buildPluginGraph(pluginIds) {
  const metadata = pluginIds.map(readPluginMetadata);
  const known = new Set(pluginIds);
  const graph = metadata.map((plugin) => {
    const declaredDependencies = plugin.depends_on || [];
    const missingDependencies = declaredDependencies.filter((dependency) => !known.has(dependency));
    if (missingDependencies.length > 0) {
      throw new Error(`Plugin ${plugin.plugin_id} missing dependencies: ${missingDependencies.join(', ')}`);
    }
    return {
      plugin_id: plugin.plugin_id,
      depends_on: declaredDependencies
    };
  });

  const sorted = [];
  const temporary = new Set();
  const permanent = new Set();
  const byId = new Map(graph.map((entry) => [entry.plugin_id, entry]));

  function visit(pluginId) {
    if (permanent.has(pluginId)) return;
    if (temporary.has(pluginId)) {
      throw new Error(`Plugin dependency cycle detected at ${pluginId}`);
    }
    temporary.add(pluginId);
    for (const dependency of byId.get(pluginId)?.depends_on || []) {
      visit(dependency);
    }
    temporary.delete(pluginId);
    permanent.add(pluginId);
    sorted.push(pluginId);
  }

  for (const pluginId of pluginIds) {
    visit(pluginId);
  }

  return {
    schema_version: 'plugin-dependency-graph-v0.1',
    plugins: metadata,
    graph,
    execution_order: sorted
  };
}
