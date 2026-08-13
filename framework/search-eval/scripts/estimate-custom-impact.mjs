import { readFileSync, writeFileSync } from 'node:fs';
/*
 * estimate-custom-impact: annual revenue-at-risk for custom datasets, from the per-record
 * loss_fraction (score-custom-dataset) x the inline monthly_volume the operator brought. No full-set
 * Keyword Planner pass needed. Same model as the main estimator, applied to any scored custom dataset:
 *   monthly_lost = volume x market_share x conversion x aov x loss_fraction ; annual = x12.
 * Meant to fold into estimate-search-revenue-loss.mjs / the board revenue_loss; standalone for now.
 *
 * Usage: node estimate-custom-impact.mjs <scored.json> [scored2.json ...] [--config cfg.json] [--out out.json]
 */
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const files = args.filter((a) => !a.startsWith('--') && a.endsWith('.json') && a !== flag('config') && a !== flag('out'));
const DEFAULTS = { retailer: 'partscat', months_per_year: 12, scenarios: {
  conservative: { market_share: 0.02, conversion_rate: 0.02, aov: 70 },
  base: { market_share: 0.03, conversion_rate: 0.03, aov: 90 },
  aggressive: { market_share: 0.05, conversion_rate: 0.04, aov: 120 },
} };
const cfg = flag('config') ? { ...DEFAULTS, ...JSON.parse(readFileSync(flag('config'), 'utf8')) } : DEFAULTS;

const perTerm = [];
for (const f of files) {
  const sc = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of sc.records) {
    if (r.loss_fraction == null || !(r.monthly_volume > 0) || r.loss_fraction <= 0) continue;
    const row = { dataset: sc.dataset_id, type: sc.type, term: r.term, outcome: r.outcome, volume: r.monthly_volume, loss_fraction: r.loss_fraction, lost: {} };
    for (const s of Object.keys(cfg.scenarios)) { const p = cfg.scenarios[s]; row.lost[s] = Math.round(r.monthly_volume * p.market_share * p.conversion_rate * p.aov * r.loss_fraction * cfg.months_per_year); }
    perTerm.push(row);
  }
}
perTerm.sort((a, b) => (b.lost.base || 0) - (a.lost.base || 0));
const totals = {}; for (const s of Object.keys(cfg.scenarios)) totals[s] = perTerm.reduce((a, r) => a + (r.lost[s] || 0), 0);

const result = { generated_from: files, retailer: cfg.retailer, disclaimer: 'MODELED ESTIMATE from operator-supplied monthly volumes x type-aware loss_fraction. Not audited revenue; a range.', assumptions: cfg.scenarios, annual_lost: totals, contributing_terms: perTerm.length, per_term: perTerm };
if (flag('out')) writeFileSync(flag('out'), JSON.stringify(result, null, 1));
const moneyC = (n) => n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n);
console.log('ANNUAL revenue at risk (custom datasets): conservative ' + moneyC(totals.conservative) + ' | base ' + moneyC(totals.base) + ' | aggressive ' + moneyC(totals.aggressive));
console.log('contributing terms: ' + perTerm.length);
perTerm.slice(0, 6).forEach((r) => console.log('  ' + moneyC(r.lost.base).padStart(8) + '  ' + r.term + '  (' + r.outcome + ', vol ' + r.volume.toLocaleString('en-US') + ')'));
