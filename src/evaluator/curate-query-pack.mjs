#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exists, readJson, writeJson } from '../lib/fs-json.mjs';

// Curates a store-specific query pack from a run's RETAINED catalog evidence
// (site-profile.json catalog_discovery). Never contacts the site: if the run
// predates payload retention, it says so and asks for a re-inspection.

const MAX_COLLECTION_QUERIES = 8;
const MAX_PRODUCT_TYPE_QUERIES = 4;
const MIN_QUERIES = 5;
const MAX_ATTRIBUTES_PER_COLLECTION = 2;

// Attribute words are only claimed when observed in the store's own sampled
// product titles, so DS3 rows stay evidence-backed rather than invented.
const ATTRIBUTE_LEXICON = [
  'black', 'white', 'red', 'blue', 'navy', 'green', 'yellow', 'pink',
  'grey', 'gray', 'beige', 'cream', 'brown', 'purple', 'orange', 'ivory',
  'denim', 'floral', 'striped', 'leather', 'linen', 'knit'
];

export function observedAttributes(products) {
  const seen = new Set();
  for (const product of products || []) {
    const words = String(product.title || '').toLowerCase().split(/[^a-z]+/);
    for (const word of words) {
      if (ATTRIBUTE_LEXICON.includes(word)) seen.add(word);
    }
  }
  return [...seen];
}

export function cleanCollectionTitle(title) {
  const cleaned = String(title || '')
    .replace(/\$\s?\d+(\.\d+)?/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
    .replace(/\b(shop|all|items?|collection|clearance)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return cleaned;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function curateQueryPack(rootDir, runDir) {
  const resolvedRunDir = path.isAbsolute(runDir) ? runDir : path.join(rootDir, runDir);
  const siteProfilePath = path.join(resolvedRunDir, 'site-profile.json');
  const reportPath = path.join(resolvedRunDir, 'inspection-report.json');
  if (!exists(siteProfilePath) || !exists(reportPath)) {
    throw new Error(`Run directory is missing site-profile.json or inspection-report.json: ${runDir}`);
  }
  const siteProfile = readJson(siteProfilePath);
  const report = readJson(reportPath);
  const inspectionId = report.inspection_id;
  const targetId = report.target?.target_id;
  if (!targetId) throw new Error('Inspection report has no target_id.');

  const collections = siteProfile.catalog_discovery?.collections || [];
  const products = siteProfile.catalog_discovery?.products || [];
  if (collections.length === 0 && products.length === 0) {
    throw new Error(
      'This run retains no catalog payloads (it predates catalog evidence retention). Rerun the inspection first, then curate.'
    );
  }

  const queries = [];
  const seenQueries = new Set();

  // Promo-machinery collections ("$25 & Under Sale", "40% Off ...") are how
  // stores merchandise, not how customers search; exclude them from curation.
  const rankedCollections = [...collections]
    .filter((collection) => collection.title && collection.handle)
    .filter((collection) => !/[%$]|\bsale\b|\bclearance\b|\boff\b|\b20\d\d\b|\bpreview\b/i.test(collection.title))
    .sort((left, right) => (right.products_count || 0) - (left.products_count || 0));
  const attributes = observedAttributes(products);
  let collectionIndex = 0;
  for (const collection of rankedCollections) {
    if (queries.length >= MAX_COLLECTION_QUERIES) break;
    const query = cleanCollectionTitle(collection.title);
    if (query.length < 3 || query.length > 40 || seenQueries.has(query)) continue;
    seenQueries.add(query);
    // Attach observed attribute relationships to the top collections so DS3
    // (search + facet) rows are generated from evidence-backed combinations.
    const attributeRelationships =
      collectionIndex < 2
        ? attributes.slice(0, MAX_ATTRIBUTES_PER_COLLECTION).map((attribute) => ({
            type: 'attribute',
            browse_node: collection.handle,
            attribute
          }))
        : [];
    collectionIndex += 1;
    queries.push({
      query_id: `${targetId}-col-${slug(collection.handle)}`,
      query,
      intent: 'category',
      expected_relationships: [
        {
          type: 'collection',
          browse_node: collection.handle
        },
        ...attributeRelationships
      ],
      provenance: {
        source: 'catalog-curation',
        reason: `Derived from observed collection "${collection.title}" (${collection.products_count ?? 'unknown'} products) in inspection ${inspectionId}.${attributeRelationships.length ? ` Attribute relationships (${attributeRelationships.map((rel) => rel.attribute).join(', ')}) observed in sampled product titles.` : ''}`
      }
    });
  }

  // Prefer declared product_type; fall back to product-title endings ("...
  // Graphic Sweatshirt" -> "graphic sweatshirt") when the store leaves it blank.
  const declaredTypes = products.map((product) => String(product.product_type || '').trim().toLowerCase()).filter((type) => type.length >= 3);
  const titleEndings = products
    .map((product) => String(product.title || '').replace(/[^a-zA-Z\s]/g, ' ').trim().toLowerCase().split(/\s+/).slice(-2).join(' '))
    .filter((ending) => ending.length >= 5);
  const productTypes = [...new Set(declaredTypes.length > 0 ? declaredTypes : titleEndings)];
  for (const productType of productTypes.slice(0, MAX_PRODUCT_TYPE_QUERIES)) {
    if (seenQueries.has(productType)) continue;
    seenQueries.add(productType);
    const matchingCollection = rankedCollections.find(
      (collection) => cleanCollectionTitle(collection.title).includes(productType) || collection.handle.includes(slug(productType))
    );
    queries.push({
      query_id: `${targetId}-type-${slug(productType)}`,
      query: productType,
      intent: 'product_type',
      expected_relationships: matchingCollection
        ? [{ type: 'collection', browse_node: matchingCollection.handle }]
        : [],
      provenance: {
        source: 'catalog-curation',
        reason: `Derived from observed product_type on sampled products in inspection ${inspectionId}.`
      }
    });
  }

  if (queries.length < MIN_QUERIES) {
    throw new Error(
      `Catalog evidence only yielded ${queries.length} usable queries (minimum ${MIN_QUERIES}). Inspect a larger catalog sample before curating.`
    );
  }

  const topCollection = rankedCollections.find((collection) => cleanCollectionTitle(collection.title).length >= 3);
  const advancedScenarios = topCollection
    ? [
        {
          scenario_id: `${targetId}-adv-${slug(topCollection.handle)}`,
          query: `something from ${cleanCollectionTitle(topCollection.title)}`,
          intent: 'conversational_search',
          provenance: {
            source: 'catalog-curation',
            rule: 'top-collection-conversational-expansion'
          }
        },
        {
          scenario_id: `${targetId}-adv-gift`,
          query: `gift idea ${cleanCollectionTitle(topCollection.title)}`,
          intent: 'occasion_based',
          provenance: {
            source: 'catalog-curation',
            rule: 'top-collection-occasion-expansion'
          }
        }
      ]
    : [];

  const queryPackPath = path.join('query-packs', `${targetId}-curated.json`);
  writeJson(path.join(rootDir, queryPackPath), {
    schema_version: 'query-pack-v0.1',
    query_pack_id: `${targetId}-curated`,
    name: `${report.target?.name || targetId} Curated Pack`,
    domain: `${targetId}-catalog`,
    generation: 'GEN-014',
    curated_from_inspection: inspectionId,
    queries,
    advanced_scenarios: advancedScenarios
  });

  const evaluationPath = path.join('evaluations', `${targetId}-shopify-baseline.json`);
  let evaluationUpdated = false;
  if (exists(path.join(rootDir, evaluationPath))) {
    const evaluation = readJson(path.join(rootDir, evaluationPath));
    if (!evaluation.query_packs.includes(queryPackPath)) {
      evaluation.query_packs = [queryPackPath];
      writeJson(path.join(rootDir, evaluationPath), evaluation);
    }
    evaluationUpdated = true;
  }

  return {
    curated_from_inspection: inspectionId,
    query_pack: queryPackPath,
    queries: queries.length,
    collection_queries: queries.filter((query) => query.intent === 'category').length,
    product_type_queries: queries.filter((query) => query.intent === 'product_type').length,
    advanced_scenarios: advancedScenarios.length,
    evaluation: evaluationUpdated ? evaluationPath : null
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node src/evaluator/curate-query-pack.mjs <inspection-run-dir>');
    process.exit(1);
  }
  console.log(JSON.stringify(curateQueryPack(process.cwd(), runDir), null, 2));
}
