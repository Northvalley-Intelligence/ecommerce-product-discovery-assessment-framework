import path from 'node:path';
import { appendJsonl } from '../../lib/fs-json.mjs';
import { createRenderedSession } from '../../lib/rendered-evidence.mjs';

// Platform capability P008 applied to product pages: observe what a customer
// actually sees on a product page and retain a screenshot, so the report can
// speak to product-page quality rather than only the products.json payload.

const PRODUCT_LIMIT = 5;

function productUrl(primaryUrl, handle) {
  const base = String(primaryUrl || '').replace(/\/+$/, '');
  return `${base}/products/${handle}`;
}

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'rendered-product.jsonl');
  const screenshotsDir = path.join(context.outputDir, 'evidence', 'screenshots');

  if (context.evaluation.rendering?.desktop !== true) {
    return {
      plugin_id: 'rendered-product',
      status: 'skipped',
      evidence_file: outputPath,
      observations: 0,
      completed_observations: 0,
      blocked_observations: 0,
      confidence: 'Unknown',
      evidence_quality: 'not_run',
      skip_reason: 'Rendering is not enabled in this evaluation manifest.',
      infrastructure_limitations: []
    };
  }

  const products = (context.siteProfile.catalog_discovery?.products || [])
    .filter((product) => product.handle)
    .slice(0, PRODUCT_LIMIT);

  if (products.length === 0) {
    return {
      plugin_id: 'rendered-product',
      status: 'blocked',
      evidence_file: outputPath,
      observations: 0,
      completed_observations: 0,
      blocked_observations: 0,
      confidence: 'Low',
      evidence_quality: 'limitation_record',
      infrastructure_limitations: [
        { code: 'no_product_handles', label: 'No product handles were discovered to render', status: null, endpoint: null }
      ]
    };
  }

  let session;
  try {
    session = await createRenderedSession({
      userAgent: context.target.inspection_defaults?.user_agent,
      timeoutMs: context.target.inspection_defaults?.timeout_ms ? context.target.inspection_defaults.timeout_ms + 10000 : undefined
    });
  } catch (error) {
    return {
      plugin_id: 'rendered-product',
      status: 'blocked',
      evidence_file: outputPath,
      observations: 0,
      completed_observations: 0,
      blocked_observations: 0,
      confidence: 'Low',
      evidence_quality: 'limitation_record',
      infrastructure_limitations: [
        { code: 'browser_unavailable', label: 'Headless browser could not be launched', status: null, endpoint: null, notes: String(error?.message || error).slice(0, 200) }
      ]
    };
  }

  const rows = [];
  try {
    for (const product of products) {
      const url = productUrl(context.target.primary_url, product.handle);
      const capture = await session.captureProductPage(url, path.join(screenshotsDir, `rendered-product-${product.handle}.png`));
      const observed = capture.observed || {};
      const row = {
        schema_version: 'rendered-product-observation-v0.1',
        inspection_id: context.inspectionId,
        plugin_id: 'rendered-product',
        product_handle: product.handle,
        endpoint: url,
        final_url: capture.final_url,
        status: capture.status,
        ok: capture.ok,
        duration_ms: capture.duration_ms,
        classification: capture.classification,
        screenshot: capture.screenshot,
        observed,
        completeness: {
          has_price: !!observed.price,
          has_title: !!observed.product_title,
          has_image: (observed.image_count || 0) > 0,
          has_variants: (observed.variant_option_count || 0) > 0,
          add_to_cart_present: !!observed.add_to_cart_present
        },
        confidence: capture.ok ? 'High' : 'Low',
        evidence_quality: capture.ok ? 'rendered_browser_capture' : 'limitation_record',
        provenance: { capability_id: 'P008', run_at: new Date().toISOString() }
      };
      rows.push(row);
      appendJsonl(outputPath, row);
      context.timeline('plugin_observation_recorded', {
        plugin_id: 'rendered-product',
        product_handle: product.handle,
        rendered_ok: capture.ok,
        has_price: !!observed.price
      });
    }
  } finally {
    await session.close();
  }

  const completed = rows.filter((row) => row.ok).length;
  const blocked = rows.length - completed;
  const limitations = rows
    .filter((row) => row.classification?.category === 'infrastructure')
    .map((row) => ({ code: row.classification.code, label: row.classification.label, query_id: row.product_handle, status: row.status, endpoint: row.endpoint }));
  return {
    plugin_id: 'rendered-product',
    status: completed > 0 ? (blocked > 0 ? 'warn' : 'pass') : 'blocked',
    evidence_file: outputPath,
    observations: rows.length,
    completed_observations: completed,
    blocked_observations: blocked,
    confidence: completed === rows.length && rows.length > 0 ? 'High' : completed > 0 ? 'Medium' : 'Low',
    evidence_quality: completed === rows.length && rows.length > 0 ? 'rendered' : 'partial',
    infrastructure_limitations: limitations
  };
}
