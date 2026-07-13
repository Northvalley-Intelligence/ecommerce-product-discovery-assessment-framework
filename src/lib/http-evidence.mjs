const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PACING_MS = 1200;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [3000, 8000];

let pacingChain = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// All evidence requests share one politeness queue so bursts of parallel
// probes cannot exceed the target's rate limits (see FND-GEN013-003).
function enqueuePaced(task, pacingMs) {
  const scheduled = pacingChain.then(async () => {
    const result = await task();
    await sleep(pacingMs);
    return result;
  });
  pacingChain = scheduled.catch(() => {});
  return scheduled;
}

function isTransient(result) {
  return result.status === 429 || (result.status !== null && result.status >= 500) || result.classification?.code === 'network_error';
}

export function classifyResponse({ status, text = '', headers = {} }) {
  const lowerText = text.toLowerCase();
  const server = String(headers.server || '').toLowerCase();
  const contentServer = String(headers.get?.('server') || '').toLowerCase();
  const effectiveServer = server || contentServer;

  if (status === 401 || status === 403) {
    if (effectiveServer.includes('cloudflare') || lowerText.includes('cloudflare') || lowerText.includes('attention required')) {
      return {
        category: 'infrastructure',
        code: 'cloudflare_challenge',
        label: 'Cloudflare challenge'
      };
    }
    return {
      category: 'infrastructure',
      code: 'access_denied',
      label: 'Access denied'
    };
  }

  if (status === 429) {
    return {
      category: 'infrastructure',
      code: 'rate_limited',
      label: 'Rate limited'
    };
  }

  if (status >= 500) {
    return {
      category: 'infrastructure',
      code: 'server_error',
      label: 'Server error'
    };
  }

  if (status >= 400) {
    return {
      category: 'infrastructure',
      code: 'http_error',
      label: 'HTTP error'
    };
  }

  return null;
}

export async function fetchEvidence(url, options = {}) {
  const pacingMs = options.pacing_ms ?? DEFAULT_PACING_MS;
  const maxRetries = options.max_retries ?? DEFAULT_MAX_RETRIES;

  let result = await enqueuePaced(() => fetchEvidenceOnce(url, options), pacingMs);
  let attempts = 1;
  while (isTransient(result) && attempts <= maxRetries) {
    await sleep(RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]);
    result = await enqueuePaced(() => fetchEvidenceOnce(url, options), pacingMs);
    attempts += 1;
  }
  return { ...result, attempts };
}

async function fetchEvidenceOnce(url, options = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout_ms || DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'user-agent': options.user_agent || 'Northvalley-Ecommerce-Inspection/0.1',
        accept: options.accept || '*/*'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return {
      ok: response.ok,
      url,
      final_url: response.url,
      method: options.method || 'GET',
      status: response.status,
      status_text: response.statusText,
      duration_ms: Date.now() - startedAt,
      content_type: contentType,
      headers: {
        server: response.headers.get('server') || null,
        cache_control: response.headers.get('cache-control') || null
      },
      classification: classifyResponse({
        status: response.status,
        text,
        headers: response.headers
      }),
      text_excerpt: text.replace(/\s+/g, ' ').slice(0, options.excerpt_chars || 500),
      json
    };
  } catch (error) {
    return {
      ok: false,
      url,
      final_url: null,
      method: options.method || 'GET',
      status: null,
      status_text: null,
      duration_ms: Date.now() - startedAt,
      content_type: null,
      headers: {},
      classification: {
        category: 'infrastructure',
        code: error.name === 'AbortError' ? 'browser_timeout' : 'network_error',
        label: error.name === 'AbortError' ? 'Browser timeout' : 'Network error'
      },
      text_excerpt: '',
      json: null,
      error: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}
