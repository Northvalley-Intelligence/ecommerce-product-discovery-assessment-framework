import { readFileSync, writeFileSync } from 'node:fs';
/*
 * Estimate annual revenue lost to poor on-site search relevance, from real Google demand + graded relevance.
 *
 * Model (per term, per month):
 *   target_shoppers          = volume × market_share          // Target's share of the term's national search demand
 *   buyers_if_search_worked  = target_shoppers × conversion_rate
 *   revenue_opportunity      = buyers_if_search_worked × aov
 *   loss_fraction            = clamp((accept_grade − grade) / accept_grade, 0, 1)   // grade ≥ accept ⇒ 0 loss
 *   monthly_lost             = revenue_opportunity × loss_fraction
 *   annual_lost              = monthly_lost × 12
 *   total                    = Σ annual_lost over demand-matched terms
 *
 * This is a MODELED ESTIMATE from a bounded query sample with stated assumptions — not audited fact.
 * It requires REAL demand volumes (Keyword Planner). It never fabricates volumes. Output is a range.
 *
 * Usage:
 *   node scripts/estimate-search-revenue-loss.mjs <eval-board.json> <demand-volume.json> [--config cfg.json] [--out out.json]
 */
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flag = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const boardPath = positional[0];
const demandPath = positional[1];
const outPath = flag('out') || null;
if (!boardPath || !demandPath) { console.error('usage: estimate-search-revenue-loss.mjs <eval-board.json> <demand-volume.json> [--config cfg.json] [--out out.json]'); process.exit(1); }

// ---- Assumptions (override any via --config JSON) ---------------------------------------------
// accept_grade: at/above this 0–3 grade a term is "good enough" and contributes no loss.
// scenarios: market_share (Target's share of the term's national demand), conversion_rate
//   (share of Target-bound shoppers who buy when search works), aov (average order value, $).
const DEFAULTS = {
  retailer: 'target',
  accept_grade: 2.0,
  months_per_year: 12,
  scenarios: {
    conservative: { market_share: 0.02, conversion_rate: 0.015, aov: 45 },
    base: { market_share: 0.035, conversion_rate: 0.025, aov: 60 },
    aggressive: { market_share: 0.05, conversion_rate: 0.035, aov: 75 },
  },
  // Rationale for defaults (documented so the estimate is auditable):
  notes: {
    market_share: 'Target\'s rough share of US general-merchandise online demand for a term; adjust per real traffic share.',
    conversion_rate: 'Share of Target-bound shoppers who purchase when on-site search returns relevant results (site-search users convert above site average).',
    aov: 'Target average order value in USD.',
    accept_grade: 'A term grading >= 2.0/3 is treated as acceptable (no loss); below that, loss scales linearly to grade 0.',
  },
};
const cfgPath = flag('config');
const cfg = cfgPath ? { ...DEFAULTS, ...JSON.parse(readFileSync(cfgPath, 'utf8')) } : DEFAULTS;
if (cfgPath && JSON.parse(readFileSync(cfgPath, 'utf8')).scenarios) cfg.scenarios = JSON.parse(readFileSync(cfgPath, 'utf8')).scenarios;

const board = JSON.parse(readFileSync(boardPath, 'utf8'));
const demand = JSON.parse(readFileSync(demandPath, 'utf8'));
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

// per-term info from the board: grade, dataset, zero-result, assortment-gap.
// A zero-result SEARCH BUG (returns nothing but the retailer stocks it) is a FULL lost sale;
// an assortment gap (retailer doesn't stock the type) is merchandising, not search — excluded.
// Contract-aligned: use the board's `classification` (search_bug / assortment_gap / shallow_answer)
// where present; fall back to the legacy `assortment_gap` flag. Carry recall so keyed terms can be
// priced on missed inventory (a recall engine loses the products it fails to return, not just grade).
const info = {};
for (const r of (board.rows || [])) {
  const k = norm(r.q);
  if (info[k]) continue;
  const cls = r.classification;
  info[k] = {
    grade: r.mean_grade, ds: r.dataset, recall: r.recall != null ? r.recall : null,
    zero: !!r.zero || (r.total || 0) === 0 || cls === 'search_bug' || cls === 'true_empty',
    gap: cls === 'assortment_gap' || !!r.assortment_gap,
  };
}
const volOf = {};
for (const m of (demand.matched || [])) { if (m.volume != null) volOf[norm(m.term)] = { volume: m.volume, raw: m.raw }; }

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lossFraction = (g) => clamp((cfg.accept_grade - g) / cfg.accept_grade, 0, 1);

const perTerm = [];
for (const k of Object.keys(volOf)) {
  const it = info[k];
  if (!it) continue;
  if (it.gap) continue;                            // assortment gap — not a search loss
  let lf, gradeShown, basis;
  if (it.zero) { lf = 1.0; gradeShown = 0; basis = 'zero-result'; }            // returns nothing but stocked — full lost sale
  else if (it.grade == null) continue;              // captured but not graded — skip
  else { lf = lossFraction(it.grade); gradeShown = it.grade; basis = 'grade'; } // shallow-answer loss scaled by grade
  // NOTE: recall (missed inventory) is shown on the board as its own metric, not folded into the money
  // model — it is sensitive to search-side capture completeness, so keeping it separate stays honest.
  if (lf <= 0) continue;
  const v = volOf[k].volume;
  const row = { term: k, dataset: it.ds || null, volume: v, grade: gradeShown, zero: !!it.zero, loss_basis: basis, loss_fraction: +lf.toFixed(3), lost: {} };
  for (const s of Object.keys(cfg.scenarios)) {
    const p = cfg.scenarios[s];
    const monthly = v * p.market_share * p.conversion_rate * p.aov * lf;
    row.lost[s] = Math.round(monthly * cfg.months_per_year);
  }
  perTerm.push(row);
}
perTerm.sort((a, b) => (b.lost.base || 0) - (a.lost.base || 0));

const totals = {};
for (const s of Object.keys(cfg.scenarios)) totals[s] = perTerm.reduce((sum, r) => sum + (r.lost[s] || 0), 0);

const contributing = perTerm.filter((r) => r.lost.base > 0);

// Extrapolation: if the same approach were applied to N search terms with a similar average
// demand + failure profile, the annual loss scales by (N / priced_terms). Illustrative projection.
const projectTo = flag('project') ? Number(flag('project')) : 1000;
const basisTerms = perTerm.length;
const perTermAvg = {}; const projected = {};
for (const s of Object.keys(cfg.scenarios)) {
  perTermAvg[s] = basisTerms ? Math.round(totals[s] / basisTerms) : 0;
  projected[s] = Math.round(perTermAvg[s] * projectTo);
}
const extrapolation = {
  method: 'Average annual loss per demand-priced term (annual_lost / priced_terms) scaled to project_to terms.',
  basis_terms: basisTerms,
  per_term_avg_annual: perTermAvg,
  project_to: projectTo,
  projected_annual: projected,
  caveat: 'Illustrative projection: assumes the next ' + projectTo + ' search terms share a similar average demand and failure profile as the measured sample. Real query catalogs follow a long-tail demand distribution, so validate against actual query logs.',
};

const result = {
  generated_from: { board: boardPath, demand: demandPath, eval_id: board.eval_id || null, retailer: cfg.retailer },
  disclaimer: 'MODELED ESTIMATE from a bounded query sample using stated assumptions and REAL Keyword Planner volumes. Not audited revenue. A production figure needs the retailer\'s own query logs, traffic share, AOV and conversion. Reported as a range.',
  assumptions: { accept_grade: cfg.accept_grade, months_per_year: cfg.months_per_year, scenarios: cfg.scenarios, notes: cfg.notes },
  coverage: { demand_terms: Object.keys(volOf).length, graded_and_priced: perTerm.length, contributing_terms: contributing.length },
  annual_lost: totals,
  extrapolation,
  per_term: perTerm,
};
const out = JSON.stringify(result, null, 1);
if (outPath) writeFileSync(outPath, out);
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
console.log('Terms: ' + perTerm.length + ' priced, ' + contributing.length + ' contributing loss');
console.log('ANNUAL revenue at risk (bounded ' + perTerm.length + '-term sample):');
console.log('  conservative ' + fmt(totals.conservative) + '  |  base ' + fmt(totals.base) + '  |  aggressive ' + fmt(totals.aggressive));
console.log('PROJECTED to ' + projectTo + ' terms (avg ' + fmt(perTermAvg.base) + '/term × ' + projectTo + '):');
console.log('  conservative ' + fmt(projected.conservative) + '  |  base ' + fmt(projected.base) + '  |  aggressive ' + fmt(projected.aggressive));
console.log('Top contributors (base):');
contributing.slice(0, 8).forEach((r) => console.log('  ' + fmt(r.lost.base).padStart(10) + '  ' + r.term + '  (vol ' + r.volume.toLocaleString('en-US') + ', grade ' + r.grade + ')'));
if (outPath) console.log('wrote ' + outPath);
