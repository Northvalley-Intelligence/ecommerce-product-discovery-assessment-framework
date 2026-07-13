import { fetchEvidence } from '../lib/http-evidence.mjs';

function normalizeBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

function joinUrl(base, suffix) {
  const normalizedBase = normalizeBase(base);
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${normalizedBase}${normalizedSuffix}`;
}

function endpointSummary(label, evidence) {
  return {
    label,
    url: evidence.url,
    final_url: evidence.final_url,
    method: evidence.method,
    status: evidence.status,
    ok: evidence.ok,
    duration_ms: evidence.duration_ms,
    content_type: evidence.content_type,
    classification: evidence.classification,
    confidence: evidence.status ? 'High' : 'Low',
    text_excerpt: evidence.text_excerpt
  };
}

export function createShopifyAdapter(target) {
  const primaryBase = normalizeBase(target.primary_url);
  const canonicalBase = normalizeBase(target.platform?.canonical_platform_host || target.primary_url);
  const userAgent = target.inspection_defaults?.user_agent || 'Northvalley-Ecommerce-Inspection/0.1';
  const timeoutMs = target.inspection_defaults?.timeout_ms || 15000;

  async function get(url, options = {}) {
    return fetchEvidence(url, {
      timeout_ms: timeoutMs,
      user_agent: userAgent,
      ...options
    });
  }

  return {
    adapter_id: 'shopify-basic-public',
    adapter_version: '0.1.0',
    primaryBase,
    canonicalBase,

    async discoverSiteProfile() {
      const [homepage, robots, products, collections, suggest] = await Promise.all([
        get(joinUrl(primaryBase, '/')),
        get(joinUrl(primaryBase, '/robots.txt')),
        get(joinUrl(canonicalBase, '/products.json?limit=5')),
        get(joinUrl(canonicalBase, '/collections.json?limit=5')),
        get(
          `${joinUrl(canonicalBase, '/search/suggest.json')}?${new URLSearchParams({
            q: 'wallet',
            'resources[type]': 'product,collection,query,page',
            'resources[limit]': '5'
          }).toString()}`
        )
      ]);

      const productCount = Array.isArray(products.json?.products) ? products.json.products.length : null;
      const collectionCount = Array.isArray(collections.json?.collections) ? collections.json.collections.length : null;
      const suggestResources = suggest.json?.resources?.results || {};

      const limitations = [homepage, robots, products, collections, suggest]
        .filter((entry) => entry.classification)
        .map((entry) => ({
          category: entry.classification.category,
          code: entry.classification.code,
          label: entry.classification.label,
          url: entry.url,
          status: entry.status
        }));

      const platformSignals = [
        target.platform?.expected === 'shopify' ? 'Target manifest expects Shopify.' : null,
        productCount !== null ? 'Products JSON returned a Shopify products payload.' : null,
        collectionCount !== null ? 'Collections JSON returned a Shopify collections payload.' : null,
        suggest.json?.resources ? 'Suggest JSON returned a Shopify predictive-search payload.' : null
      ].filter(Boolean);

      return {
        schema_version: 'site-profile-v0.1',
        discovered_at: new Date().toISOString(),
        target: {
          target_id: target.target_id,
          name: target.name,
          primary_url: target.primary_url,
          canonical_platform_host: target.platform?.canonical_platform_host || null
        },
        platform_detection: {
          platform: platformSignals.length >= 2 ? 'shopify' : 'unknown',
          confidence: platformSignals.length >= 3 ? 'High' : platformSignals.length >= 1 ? 'Medium' : 'Low',
          signals: platformSignals
        },
        access: {
          authentication_required: false,
          limitations
        },
        endpoint_discovery: [
          endpointSummary('homepage', homepage),
          endpointSummary('robots', robots),
          endpointSummary('products_json', products),
          endpointSummary('collections_json', collections),
          endpointSummary('search_suggest_json', suggest)
        ],
        catalog_discovery: {
          status: productCount !== null || collectionCount !== null ? 'partial' : 'not_available',
          confidence: productCount !== null && collectionCount !== null ? 'Medium' : 'Low',
          products_sampled: productCount,
          collections_sampled: collectionCount,
          source: 'Shopify public JSON endpoints'
        },
        autocomplete_discovery: {
          status: suggest.ok ? 'available' : 'blocked_or_unavailable',
          confidence: suggest.ok ? 'Medium' : 'Low',
          resources_observed: Object.keys(suggestResources)
        }
      };
    },

    async fetchSubmittedSearch(query) {
      const url = `${joinUrl(primaryBase, '/search')}?${new URLSearchParams({ q: query }).toString()}`;
      // The excerpt must reach past <head> boilerplate so the page title's
      // "N results found" phrasing stays observable evidence.
      return get(url, { accept: 'text/html,*/*', excerpt_chars: 8000 });
    },

    async fetchAutocomplete(query) {
      const url = `${joinUrl(canonicalBase, '/search/suggest.json')}?${new URLSearchParams({
        q: query,
        'resources[type]': 'product,collection,query,page',
        'resources[limit]': '8'
      }).toString()}`;
      return get(url, { accept: 'application/json,*/*' });
    },

    async fetchCollections(limit = 5) {
      return get(joinUrl(canonicalBase, `/collections.json?limit=${limit}`), { accept: 'application/json,*/*' });
    },

    async fetchCollectionPage(handle) {
      return get(joinUrl(primaryBase, `/collections/${handle}`), {
        accept: 'text/html,*/*',
        excerpt_chars: 40000
      });
    },

    async fetchProducts(limit = 3) {
      return get(joinUrl(canonicalBase, `/products.json?limit=${limit}`), { accept: 'application/json,*/*' });
    },

    async fetchRecommendations(productId, limit = 8) {
      const url = `${joinUrl(canonicalBase, '/recommendations/products.json')}?${new URLSearchParams({
        product_id: String(productId),
        limit: String(limit)
      }).toString()}`;
      return get(url, { accept: 'application/json,*/*' });
    },

    async fetchMobilePage(suffix = '/') {
      return get(joinUrl(primaryBase, suffix), {
        accept: 'text/html,*/*',
        excerpt_chars: 20000,
        user_agent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
      });
    }
  };
}
