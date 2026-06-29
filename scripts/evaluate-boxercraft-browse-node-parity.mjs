import fs from 'node:fs';
import path from 'node:path';

const generationId = 'GEN-007';
const baseUrl = 'https://boxercraft.com';
const shop = 'boxercraft1985.myshopify.com';
const boostBaseUrl = 'https://services.mybcapps.com/bc-sf-filter';
const outputDir = path.join('assessments', 'boxercraft', 'browse-node-parity', generationId);
const resultPath = path.join(outputDir, 'browse-node-parity.json');
const summaryPath = path.join(outputDir, 'browse-node-parity.md');

const warnings = [];
const failures = [];

fs.mkdirSync(outputDir, { recursive: true });

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function textKey(value) {
  return normalizeText(value).toLowerCase();
}

function slug(value) {
  return textKey(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function relative(pathname) {
  return pathname.split(path.sep).join('/');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0 ecommerce-product-discovery-assessment/0.1'
        },
        ...options
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after'));
          error.retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 2500 * attempt;
        }
        throw error;
      }
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < 5) await sleep(error.retryAfterMs || 600 * attempt);
    }
  }
  throw lastError;
}

function productUrl(product) {
  return `${baseUrl}/products/${product.handle}`;
}

function productSummary(product) {
  return {
    title: normalizeText(product.title),
    handle: product.handle || null,
    url: product.handle ? productUrl(product) : null,
    product_type: product.product_type || null,
    collections: (product.collections || []).slice(0, 12).map((collection) => ({
      title: collection.title,
      handle: collection.handle
    }))
  };
}

function uniqueProducts(products) {
  const seen = new Set();
  const unique = [];
  for (const product of products || []) {
    const key = product.handle || `${product.title}-${unique.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(product);
  }
  return unique;
}

function byHandle(products) {
  return new Map((products || [])
    .filter((product) => product.handle)
    .map((product) => [product.handle, product]));
}

function classifyNode(collection) {
  const handle = textKey(collection.handle);
  const title = textKey(collection.title);
  const combined = `${handle} ${title}`;
  if ((collection.products_count || 0) === 0) return 'empty';
  if (handle === 'all') return 'global_catalog';
  if (/fan-shop|spiritwear|university|longhorns|high school/.test(combined)) return 'fan_shop';
  if (/about-town|all-star-moms|back-to-school|black-friday|breast-care|awareness|celebrate|class-of|cyber-monday|easy-essentials|fall-favorites|feminine-flirty|friends-and-family|game-day|go-green|green-monday|labor-day|halloween|new-year|mothers-day|mother's day|fathers-day|father's day|made-for-movement|must-haves|new-color-alert|pink-lp|simply-stylish|spring-color-pop|st-patrick|independence-day|4th of july|summer|sunshine|tailgate|welcome|signing-up|low-stock|warmer-weather|weekend/.test(combined)) {
    return 'campaign_or_merchandising';
  }
  return 'category';
}

function cleanQueryText(value) {
  return normalizeText(value)
    .replace(/&/g, ' and ')
    .replace(/[!'".,:]/g, ' ')
    .replace(/\bBoxercraft\b/gi, ' ')
    .replace(/\bSoft\b/gi, ' ')
    .replace(/\bCollection\b/gi, ' ')
    .replace(/\bClothing\b/gi, ' ')
    .replace(/\bApparel\b/gi, ' ')
    .replace(/\bFan Shop\b/gi, ' ')
    .replace(/\bLoungewear Activewear\b/gi, 'loungewear activewear')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseFromHandle(handle) {
  return normalizeText(handle)
    .replace(/-/g, ' ')
    .replace(/\bfan shop apparel\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveQuery(collection, nodeType) {
  if (nodeType === 'empty') return null;
  if (nodeType === 'global_catalog') return null;

  const handlePhrase = phraseFromHandle(collection.handle);
  const titlePhrase = cleanQueryText(collection.title);
  const handleTokens = handlePhrase.split(' ').filter(Boolean);
  const titleTokens = titlePhrase.split(' ').filter(Boolean);

  if (collection.handle === 'blankets') {
    return {
      query: 'blankets',
      query_source: 'handle_exact',
      alternate_queries: [titlePhrase].filter(Boolean)
    };
  }

  if (nodeType === 'fan_shop') {
    return {
      query: titlePhrase || handlePhrase,
      query_source: 'visible_node_label_without_generic_suffix',
      alternate_queries: [handlePhrase].filter((query) => query && query !== titlePhrase)
    };
  }

  if (nodeType === 'category' && handleTokens.length > 0 && handleTokens.length <= 4) {
    return {
      query: handlePhrase,
      query_source: 'collection_handle',
      alternate_queries: [titlePhrase].filter((query) => query && query !== handlePhrase)
    };
  }

  return {
    query: titleTokens.length ? titlePhrase : handlePhrase,
    query_source: titleTokens.length ? 'visible_node_label' : 'collection_handle',
    alternate_queries: [handlePhrase].filter((query) => query && query !== titlePhrase)
  };
}

async function fetchCollections() {
  const collections = [];
  const pageStatuses = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${baseUrl}/collections.json?limit=250&page=${page}`;
    const data = await fetchJson(url);
    const pageCollections = data.collections || [];
    pageStatuses.push({ page, count: pageCollections.length });
    if (pageCollections.length === 0) break;
    collections.push(...pageCollections);
    if (pageCollections.length < 250) break;
  }
  return { collections, page_statuses: pageStatuses };
}

async function fetchCollectionProducts(collection) {
  const products = [];
  const pageStatuses = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${baseUrl}/collections/${collection.handle}/products.json?limit=250&page=${page}`;
    const data = await fetchJson(url);
    const pageProducts = data.products || [];
    pageStatuses.push({ page, count: pageProducts.length });
    if (pageProducts.length === 0) break;
    products.push(...pageProducts);
    if (pageProducts.length < 250) break;
  }
  return {
    source: `${baseUrl}/collections/${collection.handle}/products.json?limit=250&page=N`,
    page_statuses: pageStatuses,
    products: uniqueProducts(products)
  };
}

async function fetchBoostSearchProducts(query) {
  const products = [];
  let totalProduct = null;
  const pageStatuses = [];
  for (let page = 1; page <= 80; page += 1) {
    const params = new URLSearchParams({
      shop,
      q: query,
      page: String(page),
      limit: '20'
    });
    const url = `${boostBaseUrl}/search?${params}`;
    const data = await fetchJson(url);
    const pageProducts = data.products || [];
    totalProduct = data.total_product ?? totalProduct;
    pageStatuses.push({ page, count: pageProducts.length });
    if (pageProducts.length === 0) break;
    products.push(...pageProducts);
    if (Number.isFinite(totalProduct) && products.length >= totalProduct) break;
    if (pageProducts.length < 20) break;
  }
  return {
    source: `${boostBaseUrl}/search?shop=${shop}&q=${encodeURIComponent(query)}&page=N&limit=20`,
    total_product: totalProduct,
    page_statuses: pageStatuses,
    products: uniqueProducts(products)
  };
}

async function fetchBoostSuggestions(query) {
  const params = new URLSearchParams({
    shop,
    q: query,
    page: '1',
    limit: '20'
  });
  const url = `${boostBaseUrl}/search/suggest?${params}`;
  const data = await fetchJson(url);
  return {
    source: `${boostBaseUrl}/search/suggest?shop=${shop}&q=${encodeURIComponent(query)}&limit=20`,
    all_empty: data.all_empty ?? null,
    total_product: data.total_product ?? null,
    products: uniqueProducts(data.products || [])
  };
}

function compareProducts(browseProducts, searchProducts, autocompleteProducts) {
  const browseMap = byHandle(browseProducts);
  const searchMap = byHandle(searchProducts);
  const autocompleteMap = byHandle(autocompleteProducts);

  const searchOnly = [...searchMap.entries()]
    .filter(([handle]) => !browseMap.has(handle))
    .map(([, product]) => product);
  const browseOnly = [...browseMap.entries()]
    .filter(([handle]) => !searchMap.has(handle))
    .map(([, product]) => product);
  const autocompleteOnly = [...autocompleteMap.entries()]
    .filter(([handle]) => !browseMap.has(handle))
    .map(([, product]) => product);
  const autocompleteBrowseHits = [...autocompleteMap.entries()]
    .filter(([handle]) => browseMap.has(handle))
    .map(([, product]) => product);
  const browseMissingAutocomplete = [...browseMap.entries()]
    .filter(([handle]) => !autocompleteMap.has(handle))
    .map(([, product]) => product);

  return {
    search_only_count: searchOnly.length,
    browse_only_count: browseOnly.length,
    autocomplete_only_count: autocompleteOnly.length,
    autocomplete_browse_hit_count: autocompleteBrowseHits.length,
    browse_missing_autocomplete_count: browseMissingAutocomplete.length,
    search_recalls_all_browse_products: browseProducts.length > 0 && browseOnly.length === 0,
    browse_covers_all_search_products: searchOnly.length === 0,
    exact_search_browse_product_match: searchOnly.length === 0 && browseOnly.length === 0,
    autocomplete_has_browse_product: autocompleteBrowseHits.length > 0,
    search_only_products: searchOnly.slice(0, 12).map(productSummary),
    browse_only_products: browseOnly.slice(0, 12).map(productSummary),
    autocomplete_only_products: autocompleteOnly.slice(0, 12).map(productSummary),
    autocomplete_browse_hit_products: autocompleteBrowseHits.slice(0, 12).map(productSummary)
  };
}

function evaluatedForScore(node) {
  return node.status === 'evaluated' && ['category', 'fan_shop'].includes(node.node_type);
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function nodeLine(node) {
  return `| ${node.title} | ${node.query || 'n/a'} | ${node.browse_product_count} | ${node.search_total_product ?? node.search_product_count} | ${node.autocomplete_product_count} | ${node.comparison.search_only_count} | ${node.comparison.browse_only_count} |`;
}

function topNodes(nodes, predicate, sorter, limit = 12) {
  return nodes.filter(predicate).sort(sorter).slice(0, limit);
}

function buildFindings(nodes, summary) {
  const findings = [];
  const blanket = nodes.find((node) => node.handle === 'blankets');
  if (blanket?.comparison?.search_only_count > 0) {
    findings.push({
      id: 'FND-GEN007-001',
      severity: 'High',
      category: 'Browse Search Autocomplete Parity',
      summary: 'The all-node parity pass confirms the Blankets browse node under-exposes products returned by search and autocomplete.',
      evidence: [
        `Browse node /collections/blankets returned ${blanket.browse_product_count} products from the public collection products feed.`,
        `Boost search for "blankets" returned ${blanket.search_total_product} products.`,
        `Boost autocomplete for "blankets" returned ${blanket.autocomplete_total_product} total products and ${blanket.autocomplete_product_count} product suggestions in the response.`,
        `Search/autocomplete-only product sample: ${blanket.comparison.search_only_products.map((product) => product.title).join(', ')}.`
      ],
      customer_impact: 'A customer who browses the Blankets collection can miss a product that another customer can find through search or autocomplete.',
      business_impact: 'Category browse can under-represent available themed or team-specific products, reducing discovery for shoppers who navigate instead of searching.',
      recommendation: 'Add a browse-node parity rule that checks every public collection against the corresponding search and autocomplete product set before reporting parity.'
    });
  }

  if (summary.core_nodes_with_exact_search_browse_match < summary.core_nodes_evaluated) {
    findings.push({
      id: 'FND-GEN007-002',
      severity: 'High',
      category: 'All Browse Node Parity',
      summary: 'Search and browse product sets are not equal across the evaluated core browse nodes.',
      evidence: [
        `${summary.core_nodes_with_exact_search_browse_match}/${summary.core_nodes_evaluated} category or fan-shop nodes had exact search/browse product-set parity.`,
        `${summary.core_nodes_with_search_only_products} category or fan-shop nodes exposed search-only products.`,
        `${summary.core_nodes_with_browse_only_products} category or fan-shop nodes exposed browse-only products.`
      ],
      customer_impact: 'Customers can see different product availability depending on whether they search, use autocomplete, or browse.',
      business_impact: 'The site can misstate catalog coverage and create inconsistent merchandising paths across high-intent surfaces.',
      recommendation: 'Use this all-node parity evaluator as the required basis for parity claims and tune collection membership, search indexing, and autocomplete payloads together.'
    });
  }

  if (summary.core_nodes_with_no_autocomplete_browse_hit > 0) {
    findings.push({
      id: 'FND-GEN007-003',
      severity: 'Medium',
      category: 'Autocomplete Browse Parity',
      summary: 'Autocomplete does not consistently surface products from the corresponding browse node.',
      evidence: [
        `${summary.core_nodes_with_no_autocomplete_browse_hit}/${summary.core_nodes_evaluated} category or fan-shop nodes returned no autocomplete product that matched the corresponding browse-node feed.`
      ],
      customer_impact: 'Customers typing a browse-node term may not see product suggestions that reinforce the category path.',
      business_impact: 'Autocomplete may underuse existing merchandising work and can fail to bridge customers from keyword entry to the right browse area.',
      recommendation: 'For each priority browse node, verify that autocomplete includes either direct product suggestions from the node or an explicit collection/category suggestion.'
    });
  }

  return findings;
}

function buildMarkdown(result) {
  const nodes = result.nodes.filter((node) => node.status === 'evaluated');
  const coreNodes = nodes.filter(evaluatedForScore);
  const topSearchOnly = topNodes(
    coreNodes,
    (node) => node.comparison.search_only_count > 0,
    (a, b) => b.comparison.search_only_count - a.comparison.search_only_count
  );
  const topBrowseOnly = topNodes(
    coreNodes,
    (node) => node.comparison.browse_only_count > 0,
    (a, b) => b.comparison.browse_only_count - a.comparison.browse_only_count
  );
  const blanket = result.nodes.find((node) => node.handle === 'blankets');

  const lines = [
    '# Boxercraft Browse Node Parity Evaluation',
    '',
    `Generated: ${result.generated_at}`,
    `Generation: ${result.generation_id}`,
    '',
    '## Summary',
    '',
    `- Public collections discovered: ${result.summary.public_collections_discovered}`,
    `- Evaluated non-empty browse nodes: ${result.summary.evaluated_nodes}`,
    `- Scored category/fan-shop browse nodes: ${result.summary.core_nodes_evaluated}`,
    `- Exact search/browse product-set parity on core nodes: ${result.summary.core_nodes_with_exact_search_browse_match}/${result.summary.core_nodes_evaluated}`,
    `- Core nodes with search-only products: ${result.summary.core_nodes_with_search_only_products}`,
    `- Core nodes with browse-only products: ${result.summary.core_nodes_with_browse_only_products}`,
    `- Core nodes with no autocomplete browse product hit: ${result.summary.core_nodes_with_no_autocomplete_browse_hit}`,
    `- Collection metadata/feed count mismatches: ${result.summary.collection_metadata_count_mismatches}`,
    '',
    '## Blankets Finding',
    '',
    blanket
      ? `The Blankets node used query \`${blanket.query}\`. Browse returned ${blanket.browse_product_count} products; search returned ${blanket.search_total_product} products; autocomplete reported ${blanket.autocomplete_total_product} total products and returned ${blanket.autocomplete_product_count} product suggestions. Search-only products: ${blanket.comparison.search_only_products.map((product) => product.title).join(', ') || 'none'}.`
      : 'The Blankets node was not found in this run.',
    '',
    '## Top Core Nodes With Search-Only Products',
    '',
    '| Browse node | Query | Browse products | Search products | Autocomplete products | Search-only | Browse-only |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...(topSearchOnly.length ? topSearchOnly.map(nodeLine) : ['| None | n/a | 0 | 0 | 0 | 0 | 0 |']),
    '',
    '## Top Core Nodes With Browse-Only Products',
    '',
    '| Browse node | Query | Browse products | Search products | Autocomplete products | Search-only | Browse-only |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...(topBrowseOnly.length ? topBrowseOnly.map(nodeLine) : ['| None | n/a | 0 | 0 | 0 | 0 | 0 |']),
    '',
    '## Method',
    '',
    '- Public browse nodes came from `/collections.json`.',
    '- Browse products came from `/collections/{handle}/products.json` with pagination.',
    '- Search products came from the Boost search API with pagination.',
    '- Autocomplete products came from the Boost suggestion API. The suggestion API returns a smaller product list than full search, so autocomplete parity is scored separately from full search/browse parity.',
    '- Global catalog and empty collections are recorded but excluded from the core parity denominator.',
    ''
  ];

  return lines.join('\n');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const collectionRun = await fetchCollections();
  const nodes = [];

  for (const collection of collectionRun.collections) {
    const nodeType = classifyNode(collection);
    const queryDef = deriveQuery(collection, nodeType);
    const baseNode = {
      handle: collection.handle,
      title: collection.title,
      url: `${baseUrl}/collections/${collection.handle}`,
      node_type: nodeType,
      collection_reported_product_count: collection.products_count || 0,
      updated_at: collection.updated_at || null,
      query: queryDef?.query || null,
      query_source: queryDef?.query_source || null,
      alternate_queries: queryDef?.alternate_queries || []
    };

    if (!queryDef?.query) {
      nodes.push({
        ...baseNode,
        status: nodeType === 'empty' ? 'skipped_empty_collection' : 'skipped_no_corresponding_query',
        reason: nodeType === 'global_catalog'
          ? 'Global all-products collection has no single corresponding search/autocomplete query.'
          : 'Empty collection has no products to compare.'
      });
      continue;
    }

    try {
      const browse = await fetchCollectionProducts(collection);
      const search = await fetchBoostSearchProducts(queryDef.query);
      const autocomplete = await fetchBoostSuggestions(queryDef.query);
      const comparison = compareProducts(browse.products, search.products, autocomplete.products);
      const metadataMismatch = (collection.products_count || 0) !== browse.products.length;

      nodes.push({
        ...baseNode,
        status: 'evaluated',
        browse_source: browse.source,
        search_source: search.source,
        autocomplete_source: autocomplete.source,
        browse_product_count: browse.products.length,
        search_total_product: search.total_product,
        search_product_count: search.products.length,
        autocomplete_total_product: autocomplete.total_product,
        autocomplete_product_count: autocomplete.products.length,
        collection_metadata_count_matches_browse_feed: !metadataMismatch,
        collection_metadata_delta: (collection.products_count || 0) - browse.products.length,
        browse_products: browse.products.slice(0, 24).map(productSummary),
        search_products: search.products.slice(0, 24).map(productSummary),
        autocomplete_products: autocomplete.products.slice(0, 12).map(productSummary),
        comparison
      });
      await sleep(180);
    } catch (error) {
      warnings.push(`${collection.title} (${collection.handle}) could not be evaluated: ${error.message}`);
      nodes.push({
        ...baseNode,
        status: 'error',
        error: error.message
      });
    }
  }

  const evaluatedNodes = nodes.filter((node) => node.status === 'evaluated');
  const coreNodes = evaluatedNodes.filter(evaluatedForScore);
  const summary = {
    public_collections_discovered: collectionRun.collections.length,
    evaluated_nodes: evaluatedNodes.length,
    skipped_nodes: nodes.length - evaluatedNodes.length,
    core_nodes_evaluated: coreNodes.length,
    core_nodes_with_exact_search_browse_match: coreNodes.filter((node) => node.comparison.exact_search_browse_product_match).length,
    core_nodes_search_browse_exact_match_rate: percent(coreNodes.filter((node) => node.comparison.exact_search_browse_product_match).length, coreNodes.length),
    core_nodes_where_search_recalls_all_browse_products: coreNodes.filter((node) => node.comparison.search_recalls_all_browse_products).length,
    core_nodes_where_browse_covers_all_search_products: coreNodes.filter((node) => node.comparison.browse_covers_all_search_products).length,
    core_nodes_with_search_only_products: coreNodes.filter((node) => node.comparison.search_only_count > 0).length,
    core_nodes_with_browse_only_products: coreNodes.filter((node) => node.comparison.browse_only_count > 0).length,
    core_nodes_with_no_autocomplete_browse_hit: coreNodes.filter((node) => !node.comparison.autocomplete_has_browse_product).length,
    collection_metadata_count_mismatches: evaluatedNodes.filter((node) => !node.collection_metadata_count_matches_browse_feed).length,
    node_type_counts: nodes.reduce((counts, node) => {
      counts[node.node_type] = (counts[node.node_type] || 0) + 1;
      return counts;
    }, {})
  };

  const result = {
    generation_id: generationId,
    generated_at: generatedAt,
    target: {
      company_name: 'Boxercraft',
      base_url: baseUrl
    },
    method: {
      collection_feed: `${baseUrl}/collections.json?limit=250&page=N`,
      browse_feed_pattern: `${baseUrl}/collections/{handle}/products.json?limit=250&page=N`,
      search_api_pattern: `${boostBaseUrl}/search?shop=${shop}&q={query}&page=N&limit=20`,
      autocomplete_api_pattern: `${boostBaseUrl}/search/suggest?shop=${shop}&q={query}&limit=20`,
      core_score_node_types: ['category', 'fan_shop'],
      excluded_from_core_score: ['global_catalog', 'empty', 'campaign_or_merchandising'],
      note: 'Autocomplete API returns a smaller product suggestion payload than full search; autocomplete parity is scored as suggestion coverage, not full search recall.'
    },
    collection_page_statuses: collectionRun.page_statuses,
    summary,
    findings: buildFindings(nodes, summary),
    warnings,
    failures,
    nodes
  };

  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(summaryPath, buildMarkdown(result));

  if (failures.length > 0) {
    console.error(`Browse-node parity evaluation failed with ${failures.length} failures.`);
    process.exit(1);
  }

  console.log('Browse-node parity evaluation completed');
  console.log(`Collections discovered: ${summary.public_collections_discovered}`);
  console.log(`Evaluated nodes: ${summary.evaluated_nodes}`);
  console.log(`Core exact search/browse parity: ${summary.core_nodes_with_exact_search_browse_match}/${summary.core_nodes_evaluated}`);
  console.log(`Evidence: ${relative(resultPath)}`);
  console.log(`Summary: ${relative(summaryPath)}`);
}

await main();
