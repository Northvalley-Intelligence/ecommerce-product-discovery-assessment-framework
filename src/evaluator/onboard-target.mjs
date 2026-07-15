#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exists, readJson, writeJson } from '../lib/fs-json.mjs';

const ONBOARD_GENERATION = 'GEN-014';

const STARTER_QUERIES = [
  { suffix: 'new-arrivals', query: 'new arrivals', intent: 'freshness_discovery' },
  { suffix: 'best-sellers', query: 'best sellers', intent: 'popularity_discovery' },
  { suffix: 'sale', query: 'sale', intent: 'price_discovery' },
  { suffix: 'gift', query: 'gift', intent: 'occasion_discovery' },
  { suffix: 'black', query: 'black', intent: 'attribute_discovery' }
];

const STARTER_ADVANCED_SCENARIOS = [
  {
    suffix: 'gift-under-50',
    intent: 'functional_intent',
    query: 'gift under $50'
  },
  {
    suffix: 'something-for-summer',
    intent: 'lifestyle_intent',
    query: 'something for summer'
  }
];

export function normalizeSiteUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) throw new Error('A site URL is required.');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error(`Not a valid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http(s) ecommerce site URLs are supported.');
  }
  const domain = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  if (!domain.includes('.')) throw new Error(`Not a valid ecommerce site host: ${parsed.hostname}`);
  return {
    primary_url: `https://${domain}/`,
    domain
  };
}

export function targetIdFromDomain(domain) {
  return domain
    .split('.')
    .slice(0, -1)
    .join('-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultName(targetId) {
  return targetId
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

// Decision 3A: broad Shopify inspections require maturity Level 2
// (Shopify discovery surfaces); non-Shopify or heavily rendered storefronts
// require Level 3 (rendered capture). Onboarding enforces this fail-closed.
export function currentMaturityLevel(rootDir) {
  const registryPath = path.join(rootDir, 'platform', 'capability-registry.json');
  const maturityPath = path.join(rootDir, 'platform', 'capability-maturity.json');
  if (!exists(registryPath) || !exists(maturityPath)) return 0;
  const statusById = new Map(
    readJson(registryPath).capabilities.map((capability) => [capability.capability_id, capability.status])
  );
  const levels = [...readJson(maturityPath).levels].sort((left, right) => left.level - right.level);
  let achieved = 0;
  for (const level of levels) {
    const satisfied = (level.capabilities || []).every((id) =>
      ['implemented', 'implemented_basic'].includes(statusById.get(id))
    );
    if (!satisfied) break;
    achieved = level.level;
  }
  return achieved;
}

export function onboardTarget(rootDir, { url, name, expected_platform = 'shopify' } = {}) {
  const { primary_url, domain } = normalizeSiteUrl(url);
  const targetId = targetIdFromDomain(domain);
  if (!targetId) throw new Error(`Could not derive a target id from ${domain}.`);

  const maturity = currentMaturityLevel(rootDir);
  const requiredLevel = expected_platform === 'shopify' ? 2 : 3;
  if (maturity < requiredLevel) {
    throw new Error(
      `Decision 3A maturity gate: ${expected_platform} targets require platform capability maturity Level ${requiredLevel}, but this evaluator is at Level ${maturity}. Resolve the missing capabilities before onboarding.`
    );
  }
  if (expected_platform !== 'shopify') {
    throw new Error(
      'Non-Shopify targets pass the Level 3 rendered-capture gate but no non-Shopify adapter exists yet; onboarding stays Shopify-only until adapter groundwork lands.'
    );
  }

  const targetPath = path.join('targets', `${targetId}.json`);
  const queryPackPath = path.join('query-packs', `${targetId}-starter.json`);
  const evaluationPath = path.join('evaluations', `${targetId}-shopify-baseline.json`);

  if (exists(path.join(rootDir, targetPath))) {
    const existing = readJson(path.join(rootDir, targetPath));
    if (existing.domain !== domain) {
      throw new Error(`Target id ${targetId} already exists for a different domain (${existing.domain}).`);
    }
    if (!exists(path.join(rootDir, evaluationPath))) {
      throw new Error(`Target ${targetId} exists but has no baseline evaluation; resolve manually.`);
    }
    return {
      created: false,
      target_id: targetId,
      name: existing.name,
      domain,
      target: targetPath,
      query_pack: queryPackPath,
      evaluation: evaluationPath
    };
  }

  const displayName = String(name || '').trim() || defaultName(targetId);

  writeJson(path.join(rootDir, targetPath), {
    schema_version: 'target-manifest-v0.1',
    target_id: targetId,
    name: displayName,
    primary_url,
    domain,
    platform: {
      expected: 'shopify',
      canonical_platform_host: null,
      confidence: 'unverified',
      source: `Operator onboarded ${domain} through the dashboard on the Shopify-supported path; the inspection verifies platform detection from observed payloads.`
    },
    inspection_defaults: {
      respect_robots: true,
      timeout_ms: 15000,
      user_agent: 'Northvalley-Ecommerce-Inspection/0.1'
    },
    known_limitations: [
      {
        type: 'infrastructure',
        code: 'rendered_capture_not_available',
        notes: 'Rendered UI evidence requires platform capability P008, which is not implemented yet.'
      }
    ]
  });

  writeJson(path.join(rootDir, queryPackPath), {
    schema_version: 'query-pack-v0.1',
    query_pack_id: `${targetId}-starter`,
    name: `${displayName} Starter Pack`,
    domain: 'generic-retail-starter',
    generation: ONBOARD_GENERATION,
    queries: STARTER_QUERIES.map(({ suffix, query, intent }) => ({
      query_id: `${targetId}-${suffix}`,
      query,
      intent,
      expected_relationships: [],
      provenance: {
        source: 'onboarding starter pack',
        reason: 'Broadly applicable retail query used until catalog-derived queries are curated for this store.'
      }
    })),
    advanced_scenarios: STARTER_ADVANCED_SCENARIOS.map(({ suffix, intent, query }) => ({
      scenario_id: `${targetId}-${suffix}`,
      query,
      intent,
      provenance: {
        source: 'onboarding starter pack',
        rule: 'generic-advanced-retrieval-starter'
      }
    }))
  });

  writeJson(path.join(rootDir, evaluationPath), {
    schema_version: 'evaluation-manifest-v0.1',
    evaluation_id: `${targetId}-shopify-baseline`,
    evaluation_type: 'baseline_inspection',
    generation: ONBOARD_GENERATION,
    workspace: 'workspaces/retail-search-research.json',
    target: targetPath,
    site_profile: {
      mode: 'refresh',
      path: path.join('site-profiles', `${domain}.json`),
      max_age_hours: 168
    },
    query_packs: [queryPackPath],
    surfaces: ['submitted_search', 'autocomplete', 'facets', 'recommendations', 'mobile', 'browse', 'rendered_search', 'rendered_product'],
    plugins: ['submitted-search', 'autocomplete', 'facets', 'recommendations', 'mobile', 'browse-graph', 'rendered-search', 'rendered-product'],
    competitors: [],
    rendering: {
      desktop: true,
      mobile: true,
      screenshots: true
    },
    platform_validation: {
      required: true,
      minimum_maturity_level: 2
    },
    output: {
      base_dir: path.join('assessments', targetId, 'inspection-report', ONBOARD_GENERATION)
    }
  });

  return {
    created: true,
    target_id: targetId,
    name: displayName,
    domain,
    target: targetPath,
    query_pack: queryPackPath,
    evaluation: evaluationPath
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2];
  const name = process.argv[3];
  if (!url) {
    console.error('Usage: node src/evaluator/onboard-target.mjs <site-url> [display name]');
    process.exit(1);
  }
  const result = onboardTarget(process.cwd(), { url, name });
  console.log(JSON.stringify(result, null, 2));
}
