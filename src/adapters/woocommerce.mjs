// WooCommerce inspection adapter (slice 1).
//
// Uses the public WooCommerce Store API (/wp-json/wc/store/v1/*), which modern
// WooCommerce stores expose read-only without auth. Unlike the Shopify adapter
// this one keeps its own fetch wrapper so it can read response headers the
// shared http-evidence helper does not surface (notably X-WP-Total, the exact
// product count). Every call returns an evidence record so captures stay honest.

function normalizeBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

// A category name that is operational/merchandising rather than a real product
// browse node (promos, channel tags, restock buckets). Heuristic, labelled as
// such wherever it is used so counts are never overstated as "real" categories.
const OPERATIONAL_CATEGORY = /\b(available on|back in stock|promo|sale|clearance|bundle|stack|featured|new|best ?sell|gift|wholesale|subscription|uncategor)/i;

export function createWooCommerceAdapter(target, options = {}) {
  const primaryBase = normalizeBase(target.primary_url || target.url);
  const storeApi = `${primaryBase}/wp-json/wc/store/v1`;
  const userAgent = options.user_agent || 'Northvalley-Ecommerce-Inspection/0.1';
  const timeoutMs = options.timeout_ms || 15000;

  async function wooFetch(url, { accept = 'application/json' } = {}) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        headers: { 'user-agent': userAgent, accept },
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }
      return {
        url,
        final_url: response.url,
        ok: response.ok,
        status: response.status,
        content_type: response.headers.get('content-type') || '',
        total: numberOrNull(response.headers.get('x-wp-total')),
        total_pages: numberOrNull(response.headers.get('x-wp-totalpages')),
        json,
        text_excerpt: text.replace(/\s+/g, ' ').slice(0, 300),
        duration_ms: Date.now() - started
      };
    } catch (error) {
      return { url, final_url: null, ok: false, status: null, content_type: '', total: null, total_pages: null, json: null, error: String(error && error.message || error), duration_ms: Date.now() - started };
    }
  }

  return {
    adapter_id: 'woocommerce-store-api',
    adapter_version: '0.1.0',
    primaryBase,
    storeApi,
    wooFetch,

    // Confirm the platform and that the Store API is reachable.
    async detectPlatform() {
      const [home, probe] = await Promise.all([
        wooFetch(`${primaryBase}/`, { accept: 'text/html' }),
        wooFetch(`${storeApi}/products?per_page=1`)
      ]);
      const storeApiOk = probe.ok && Array.isArray(probe.json);
      return {
        platform: storeApiOk || /woocommerce/i.test(home.text_excerpt || '') ? 'woocommerce' : 'unknown',
        store_api_reachable: probe.ok && Array.isArray(probe.json),
        store_api_status: probe.status,
        homepage_status: home.status,
        evidence: [endpointSummary('homepage', home), endpointSummary('store_api_products_probe', probe)]
      };
    },

    // Catalog scale: total SKUs (X-WP-Total) and browse nodes (categories) with
    // parent/child hierarchy so we can report the number of browse levels.
    async discoverCatalog() {
      const productsProbe = await wooFetch(`${storeApi}/products?per_page=1`);
      const skuCount = productsProbe.total;

      const categories = [];
      let page = 1;
      let pages = 1;
      // Categories are small; paginate fully but cap defensively.
      do {
        const res = await wooFetch(`${storeApi}/products/categories?per_page=100&page=${page}`);
        if (!res.ok || !Array.isArray(res.json)) break;
        for (const category of res.json) {
          categories.push({
            id: category.id,
            name: category.name,
            slug: category.slug,
            parent: category.parent || 0,
            count: category.count ?? null
          });
        }
        pages = res.total_pages || 1;
        page += 1;
      } while (page <= pages && page <= 10);

      const byId = new Map(categories.map((category) => [category.id, category]));
      const depthOf = (category) => {
        let depth = 1;
        let current = category;
        const seen = new Set();
        while (current && current.parent && byId.has(current.parent) && !seen.has(current.id)) {
          seen.add(current.id);
          current = byId.get(current.parent);
          depth += 1;
        }
        return depth;
      };
      const browseLevels = categories.length ? Math.max(...categories.map(depthOf)) : 0;
      const substantive = categories.filter((category) => !OPERATIONAL_CATEGORY.test(category.name));

      return {
        sku_count: skuCount,
        sku_count_source: 'X-WP-Total header on /products',
        browse_nodes: categories.length,
        browse_nodes_substantive: substantive.length,
        browse_nodes_operational_heuristic: categories.length - substantive.length,
        browse_levels: browseLevels,
        top_level_nodes: categories.filter((category) => !category.parent).length,
        categories,
        evidence: [endpointSummary('products_count_probe', productsProbe)]
      };
    },

    // Submitted search: what the store returns for a query (result count + top hits).
    async fetchSubmittedSearch(query, limit = 10) {
      const res = await wooFetch(`${storeApi}/products?search=${encodeURIComponent(query)}&per_page=${limit}`);
      const results = Array.isArray(res.json)
        ? res.json.map((product) => ({ id: product.id, name: product.name, permalink: product.permalink, price: product.prices?.price ?? null }))
        : [];
      return {
        query,
        result_count: res.total != null ? res.total : results.length,
        returned: results.length,
        status: res.status,
        results,
        evidence: endpointSummary('submitted_search', res)
      };
    },

    // Facets: global product attributes are WooCommerce's faceted-navigation
    // dimensions. Report how many exist, how many are filterable (have term
    // archives), and term counts for the top filterable ones. Also measure
    // attribute/variation coverage across a product sample.
    async discoverFacets(sampleSize = 15) {
      const attrsRes = await wooFetch(`${storeApi}/products/attributes`);
      const attributes = Array.isArray(attrsRes.json) ? attrsRes.json : [];
      const filterable = attributes.filter((attribute) => attribute.has_archives);
      // Term counts for up to 8 filterable attributes (bounded to stay cheap).
      const topFacets = [];
      for (const attribute of filterable.slice(0, 8)) {
        const termsRes = await wooFetch(`${storeApi}/products/attributes/${attribute.id}/terms`);
        const terms = Array.isArray(termsRes.json) ? termsRes.json : [];
        topFacets.push({ id: attribute.id, name: attribute.name, term_count: terms.length, top_terms: terms.slice(0, 6).map((term) => term.name) });
      }
      topFacets.sort((left, right) => right.term_count - left.term_count);

      const sampleRes = await wooFetch(`${storeApi}/products?per_page=${sampleSize}&orderby=popularity`);
      const sample = Array.isArray(sampleRes.json) ? sampleRes.json : [];
      const withAttributes = sample.filter((product) => (product.attributes || []).length > 0).length;
      const variable = sample.filter((product) => product.type === 'variable' || (product.variations || []).length > 0).length;

      return {
        attribute_count: attributes.length,
        filterable_count: filterable.length,
        top_facets: topFacets,
        sample_size: sample.length,
        products_with_attributes: withAttributes,
        variable_products: variable,
        evidence: [endpointSummary('attributes', attrsRes), endpointSummary('facet_sample', sampleRes)]
      };
    },

    // WooCommerce core has no dedicated autocomplete/suggest endpoint, so this
    // is prefix product search (type-ahead) over the Store API - labelled as
    // such wherever surfaced so it is never mistaken for a real suggest API.
    async fetchAutocomplete(prefix, limit = 6) {
      const res = await wooFetch(`${storeApi}/products?search=${encodeURIComponent(prefix)}&per_page=${limit}`);
      const suggestions = Array.isArray(res.json)
        ? res.json.map((product) => ({ id: product.id, name: product.name, permalink: product.permalink }))
        : [];
      return {
        prefix,
        method: 'prefix product search (WooCommerce has no native autocomplete endpoint)',
        suggestion_count: res.total != null ? res.total : suggestions.length,
        suggestions,
        status: res.status,
        evidence: endpointSummary('autocomplete_prefix_search', res)
      };
    },

    async fetchProductSample(limit = 15) {
      const res = await wooFetch(`${storeApi}/products?per_page=${limit}&orderby=popularity`);
      const products = Array.isArray(res.json)
        ? res.json.map((product) => ({ id: product.id, name: product.name, type: product.type ?? null }))
        : [];
      return { products, evidence: endpointSummary('product_sample', res) };
    },

    async fetchCategoryProducts(categoryId, limit = 10) {
      const res = await wooFetch(`${storeApi}/products?category=${encodeURIComponent(categoryId)}&per_page=${limit}`);
      return { category_id: categoryId, result_count: res.total ?? (Array.isArray(res.json) ? res.json.length : 0), status: res.status };
    }
  };
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function endpointSummary(label, res) {
  return {
    label,
    url: res.url,
    final_url: res.final_url,
    status: res.status,
    ok: res.ok,
    content_type: res.content_type,
    total: res.total ?? null,
    duration_ms: res.duration_ms,
    text_excerpt: res.text_excerpt || null
  };
}
