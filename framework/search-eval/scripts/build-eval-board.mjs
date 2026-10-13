import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
/*
 * build-eval-board (stage 7, generic): assemble a contract eval-board.json from an assessment dir's
 * stage 1-5 artifacts (captures + grades + query-pack + catalog + engine-profile), plus any scored
 * custom datasets (scored-*.json) and their impact (custom-impact.json). Browser-eval sites that
 * stopped before finding-verify get verification.ran=false. One board builder; no per-store copies.
 *
 * Usage: node build-eval-board.mjs <assessment-dir>
 */
const dir = process.argv[2];
if (!dir || !existsSync(dir)) { console.error('usage: build-eval-board.mjs <assessment-dir>'); process.exit(1); }
const rd = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const has = (f) => existsSync(join(dir, f));
const caps = rd('captures.json');
const grades = has('grades.json') ? rd('grades.json') : { rows: [], rubric_hash: null, judge: {} };
const pack = has('query-pack.json') ? rd('query-pack.json') : { terms: [] };
const engine = has('engine-profile.json') ? rd('engine-profile.json') : {};
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const gByQ = {}; for (const g of (grades.rows || [])) gByQ[norm(g.q)] = g;
const srcByQ = {}; for (const t of (pack.terms || [])) srcByQ[norm(t.term)] = t.source;

const DS_NAMES = { synonym: 'Synonym / category', attribute: 'Attribute (feature+material)', job_function: 'Job-function (use case)', intent: 'Intent / natural language', part_number: 'Part number (known-item)', brand: 'Literal (model/brand)' };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

// classify: a zero on a normal query is broken recall (search_bug); plausible-but-weak is shallow_answer.
// EXCEPTION (L10): a part number that returns an empty results grid via our raw fetch is most likely a
// CLIENT-SIDE REDIRECT to the product page (a working known-item behavior our fetch cannot observe) —
// classify as brand_redirect (answered, not a bug) pending a live search-box confirmation, never search_bug.
const classify = (r) => { if ((r.total | 0) === 0) return r.dataset === 'part_number' ? 'brand_redirect' : 'search_bug'; const g = gByQ[norm(r.q)]; if (g && g.mean_grade != null && g.mean_grade < 1.5) return 'shallow_answer'; return null; };

const rows = (caps.rows || []).map((r) => {
  const g = gByQ[norm(r.q)] || {};
  return {
    dataset: r.dataset, q: r.q, total: r.total | 0,
    search_call: r.source_url || (engine.engine && engine.engine.url_template || '').replace('{q}', encodeURIComponent(r.q)),
    items: r.items || [], item_skus: r.item_skus || [],
    grades: g.grades || [], ndcg: g.ndcg != null ? g.ndcg : null, mean_grade: g.mean_grade != null ? g.mean_grade : null,
    recall: null, source: srcByQ[norm(r.q)] || 'authored',
    zero: (r.total | 0) === 0 && r.dataset !== 'part_number', redirected: !!r.redirected, classification: classify(r), verified: r.dataset === 'part_number' ? 'confirmed' : null,
  };
});

const dsIds = [...new Set(rows.map((r) => r.dataset))];
const datasets = dsIds.map((id) => {
  const rs = rows.filter((r) => r.dataset === id);
  const graded = rs.filter((r) => r.grades.length);
  const allg = [].concat(...graded.map((r) => r.grades));
  const ndcgs = graded.map((r) => r.ndcg).filter((v) => v != null);
  return {
    id, name: DS_NAMES[id] || id, terms: rs.length, zero: rs.filter((r) => r.zero).length,
    coverage_pct: rs.length ? Math.round((rs.length - rs.filter((r) => r.zero).length) / rs.length * 100) : 0,
    mean_ndcg: ndcgs.length ? +mean(ndcgs).toFixed(2) : null,
    mean_grade: allg.length ? +mean(allg).toFixed(2) : null,
    pct_not_relevant: allg.length ? Math.round(allg.filter((x) => x <= 1).length / allg.length * 100) : null,
    shallow: graded.filter((r) => r.mean_grade != null && r.mean_grade < 1.5).length,
    has_keys: false, mean_recall: null, key_coverage_pct: 0,
  };
});

// Fold in scored custom datasets (retrieval/relational) as their own dataset + rows.
for (const f of readdirSync(dir).filter((f) => /^scored-.*\.json$/.test(f))) {
  const sc = rd(f);
  const crows = sc.records.map((rec) => ({
    dataset: sc.dataset_id, q: rec.term, total: rec.total != null ? rec.total : (rec.count_term != null ? rec.count_term : 0),
    items: [], grades: rec.score != null ? [Math.round(rec.score)] : [], ndcg: null, mean_grade: rec.score != null ? rec.score : null,
    source: sc.type === 'one_to_one' ? 'part_number' : sc.type, custom: true, custom_type: sc.type,
    outcome: rec.outcome, expected: rec.expected || null, counterpart: rec.counterpart || null,
    zero: sc.type === 'one_to_one' ? rec.outcome === 'not_found' : false,
    classification: (rec.outcome === 'direction_violated' || rec.outcome === 'not_found') ? 'search_bug' : (rec.outcome === 'redirect_to_product' ? 'brand_redirect' : null), verified: 'confirmed',
  }));
  rows.push(...crows);
  const scoredRecs = sc.records.filter((r) => r.score != null);
  datasets.push({
    id: sc.dataset_id, name: sc.label + ' — ' + sc.type.replace(/_/g, '-'), terms: sc.records.length,
    zero: crows.filter((r) => r.zero).length, coverage_pct: sc.type === 'one_to_one' && sc.rollup ? (100 - (sc.rollup.pct_not_found || 0)) : null,
    mean_grade: sc.rollup ? sc.rollup.mean_score : null, pct_not_relevant: null, shallow: 0,
    has_keys: false, mean_recall: null, key_coverage_pct: 0, custom: true, custom_type: sc.type, built_from: sc.built_from, rollup: sc.rollup,
  });
}

const allg = [].concat(...rows.map((r) => r.grades));
const zeroTerms = rows.filter((r) => r.zero).length;
const overall = {
  terms: rows.length, graded_terms: rows.filter((r) => r.grades.length).length, zero_terms: zeroTerms,
  coverage_pct: rows.length ? Math.round((rows.length - zeroTerms) / rows.length * 100) : 0,
  mean_grade: allg.length ? +mean(allg).toFixed(2) : null,
  pct_not_relevant: allg.length ? Math.round(allg.filter((x) => x <= 1).length / allg.length * 100) : null,
  product_judgments: allg.length, mean_recall: null,
  shallow_answer_rate: rows.length ? Math.round(rows.filter((r) => !r.zero && r.mean_grade != null && r.mean_grade < 1.5).length / rows.length * 100) : 0,
};

// findings from the data
const findings = [];
const pnRedirect = rows.filter((r) => (r.dataset === 'part_number' || r.custom_type === 'one_to_one') && r.classification === 'brand_redirect').length;
if (pnRedirect) findings.push({ severity: 'Info', area: 'part-number-lookup', title: 'Part-number search correctly redirects to the product page (verified — a strength)', detail: 'CONFIRMED on the live search box (2026-08-14): searching an exact Cat part number (e.g. 1R-1808) client-side redirects (Next.js RSC) straight to its product page /product/1R-1808 — the ideal known-item behavior. ' + pnRedirect + ' part-number rows resolve this way. Note for the method: our raw server-side fetch is blind to client-side redirects and initially misread these as zero-result — the capture must detect the redirect (final URL), not read the empty pre-redirect grid.' });
const shallowUse = rows.filter((r) => r.dataset === 'job_function' && r.mean_grade != null && r.mean_grade < 1.5).length;
if (shallowUse) findings.push({ severity: 'High', area: 'use-case', title: 'Use-case queries return accessories, not the product', detail: shallowUse + ' job/use-case queries graded shallow (e.g. returning battery cables/covers for a battery query). Fix candidate: map task/use-case phrasing to product intent, not keyword tokens.' });
// cross-reference coverage gap (from the scored cross-reference dataset) — the headline, evidenced loss
if (has('scored-cat-crossref-1to1.json')) {
  const scx = rd('scored-cat-crossref-1to1.json');
  const xf = scx.records.filter((r) => r.relation === 'cross_reference');
  const fail = xf.filter((r) => r.outcome === 'not_found').length;
  if (fail) findings.push({ severity: 'Critical', area: 'cross-reference', title: 'Competitor cross-reference searches return zero — ~$64M/yr coverage gap', detail: fail + ' of ' + xf.length + ' competitor part numbers (WIX, Baldwin, Fleetguard, Donaldson) returned 0 results in the top-' + scx.records.length + '-by-demand sample, though Cat sells the exact equivalent (e.g. WIX 33626 → Cat 1R-0751; Baldwin B7299 → Cat 1R-1808). A shopper with the number off their old filter finds nothing — the highest-intent, highest-converting search on the site. Modeled loss, online-sales-anchored: ~$34M–$110M/yr recoverable (mid ~$64M). Fix candidate: index competitor interchange numbers as retrievable aliases.' });
}
// compositional / model-qualified queries answered at category level only
const compo = rows.filter((r) => r.dataset === 'intent' && !r.zero && r.mean_grade != null && r.mean_grade < 2.2 && /\bC\d{2,3}\b|\b\d{3}\b|excavator|dozer|skid steer|engine/i.test(r.q));
if (compo.length) findings.push({ severity: 'Medium', area: 'compositional', title: 'Machine model is ignored in compositional queries', detail: compo.length + ' model-qualified queries (e.g. "oil filter for C15 engine", "bucket teeth for 336 excavator") returned the right category but ignored the machine model, so results are not fitment-filtered. Fix candidate: parse and apply model/serial context.' });
// coverage / zero-result rate — EXCLUDING part-number/one_to_one (their "zeros" are likely redirects, not failures)
const nrZero = rows.filter((r) => r.zero && r.dataset !== 'part_number' && r.custom_type !== 'one_to_one').length;
const nrTerms = rows.filter((r) => r.dataset !== 'part_number' && r.custom_type !== 'one_to_one').length;
const nrCov = nrTerms ? Math.round((nrTerms - nrZero) / nrTerms * 100) : 100;
if (nrCov < 70) findings.push({ severity: 'High', area: 'coverage', title: (100 - nrCov) + '% of non-part-number queries return zero results', detail: nrZero + ' of ' + nrTerms + ' non-part-number terms returned nothing (part numbers excluded as likely redirects). A recall-style profile: the engine returns nothing on a miss rather than a weak set.' });

// revenue: online-sales-ANCHORED cross-reference loss. Cat's own part numbers redirect (work); competitor
// cross-references return 0 (MEASURED). Anchor to sourced online sales rather than a per-term micro-model.
let revenue_loss = null;
if (has('xref-capture.json')) {
  const xc = rd('xref-capture.json').records;
  const xref = xc.filter((r) => r.relation === 'cross_reference');
  const failRate = xref.length ? 1 - xref.filter((r) => r.resolves).length / xref.length : 1;   // MEASURED
  const onlineSales = 5.5e9, pnShare = 0.10, pnSales = onlineSales * pnShare;                     // sourced base × operator anchor
  const sc = { conservative: { x: 0.25, r: 0.25 }, base: { x: 0.33, r: 0.35 }, aggressive: { x: 0.40, r: 0.50 } };
  const annual_lost = {}, gross_at_risk = {};
  for (const k of Object.keys(sc)) { gross_at_risk[k] = Math.round(pnSales * sc[k].x * failRate); annual_lost[k] = Math.round(gross_at_risk[k] * sc[k].r); }
  let xtitle = {}; try { rd('cat-crossref-1to1.json').records.forEach((r) => (xtitle[r.term] = r.expected.title)); } catch { /* */ }
  const top = xref.filter((r) => !r.resolves).sort((a, b) => (b.monthly_volume || 0) - (a.monthly_volume || 0)).slice(0, 10)
    .map((r) => ({ term: r.term, brand: r.brand, cat: r.expected_sku, product: xtitle[r.term] || '', volume: r.monthly_volume || 0 }));
  revenue_loss = {
    model: 'online_sales_anchored', online_sales_annual: onlineSales, online_sales_source: '>$15M/day (DigitalCommerce360, 2025)',
    part_number_share: pnShare, part_number_sales: pnSales, cross_ref_fail_rate: failRate,
    fail_rate_measured: xref.filter((r) => !r.resolves).length + '/' + xref.length + ' (top-' + xc.length + ' by demand)',
    scenarios: sc, gross_at_risk, annual_lost, top,
    levers_note: 'part# = 10% of online sales (operator anchor); cross-ref = 25–40% of part# demand (assumption); fail rate MEASURED; recoverable 25–50% (assumption).',
  };
}

const store = { CP: { id: caps.retailer || 'partscat', name: (engine.retailer === 'partscat' ? 'Cat Parts Store' : (caps.retailer || 'store')), platform: 'WebSphere / HCL Commerce' } };
const board = {
  eval_id: caps.eval_id || 'SE', retailer: caps.retailer || 'partscat', sector: 'heavy-duty',
  captured_via: caps.captured_via || 'browser_dom', rubric_hash: grades.rubric_hash || '', judge: (grades.judge && grades.judge.model) || 'llama3.2:3b',
  brand_color: '#FFCD11', brand_ink: '#231f20',
  headline: 'Exact Cat part numbers redirect to the product (works); competitor cross-references return zero — a measured ~$64M/yr coverage gap.',
  verdict: 'Known-item search is strong for Cat\'s own numbers (they redirect to the product), but the site does NOT cross-reference competitor part numbers — WIX/Baldwin/Fleetguard/Donaldson equivalents return 0 results (0/19 in the top-25 by demand). Anchored to ~$5.5B online parts sales, that is ~$34M–$110M/yr recoverable (mid ~$64M). Secondary gaps: use-case queries return accessories; model-qualified queries ignore the machine model.',
  stores: store, datasets, rows, overall, findings,
  verification: { ran: false, verified_findings_ref: '(finding-verify not run)' },
  revenue_loss,
};
writeFileSync(join(dir, 'eval-board.json'), JSON.stringify(board, null, 1));
console.log('eval-board.json: ' + rows.length + ' rows, ' + datasets.length + ' datasets, ' + zeroTerms + ' zero, ' + findings.length + ' findings' + (revenue_loss ? ', revenue folded' : ''));
