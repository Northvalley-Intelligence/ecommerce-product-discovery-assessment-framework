import { readFileSync, writeFileSync } from 'node:fs';
// Derive /tmp/target-report-data.json (for gen-target-report.mjs) from the eval board.
// Includes: overall, datasets, worst, best, all, equiv (synonym equivalence), findings, demand_candidates.
const board = JSON.parse(readFileSync('target-eval-board.json', 'utf8'));
const out = process.argv[2] || '/tmp/target-report-data.json';

const rows = board.rows.map((r) => ({ q: r.q, dataset: r.dataset, ndcg: r.ndcg_pinned == null ? null : Math.round(r.ndcg_pinned * 100), grade: r.mean_grade, sample: (r.items && r.items[0]) || '' }));
const graded = rows.filter((r) => r.grade != null);
const worst = graded.slice().sort((a, z) => a.grade - z.grade).slice(0, 10).map((r) => ({ q: r.q, ds: r.dataset, mg: r.grade, sample: r.sample }));
const best = graded.slice().sort((a, z) => z.grade - a.grade).slice(0, 8).map((r) => ({ q: r.q }));

// Synonym equivalence groups (from compared_to / is_lead annotations)
const byLead = {};
board.rows.filter((r) => r.dataset === 'synonym' && r.compared_to).forEach((r) => { (byLead[r.compared_to] = byLead[r.compared_to] || []).push(r); });
const equiv = Object.keys(byLead).map((lead) => {
  const leadRow = byLead[lead].find((r) => r.is_lead) || byLead[lead][0];
  const lg = leadRow.mean_grade;
  const variants = byLead[lead].filter((r) => !r.is_lead).map((r) => ({ q: r.q, g: r.mean_grade, delta: +(r.mean_grade - lg).toFixed(2), sample: (r.items && r.items[0]) || '' }));
  return { lead, lg, variants };
}).filter((e) => e.variants.length).sort((a, z) => Math.min(...a.variants.map((v) => v.delta)) - Math.min(...z.variants.map((v) => v.delta)));

// Demand candidates: failing terms (grade < 1.5) from demand-mappable datasets, worst-first.
// These are the fix candidates to rank by Google search volume via the board's Keyword Planner import.
const demandDatasets = { synonym: 1, attribute: 1, job_function: 1, intent: 1 };
const dsLabel = { synonym: 'synonym', attribute: 'attribute', job_function: 'job-function', intent: 'intent' };
const demand_candidates = rows.filter((r) => demandDatasets[r.dataset] && r.grade != null && r.grade < 1.5)
  .sort((a, z) => a.grade - z.grade)
  .map((r) => ({ q: r.q, ds: dsLabel[r.dataset] || r.dataset, grade: r.grade, sample: r.sample }));

// Optional real demand volumes if an operator has imported them.
let demand_volume = null;
try { demand_volume = JSON.parse(readFileSync('demand-volume.json', 'utf8')); } catch { /* none yet */ }

const data = {
  overall: board.overall,
  datasets: board.datasets.map((d) => ({ name: d.name, terms: d.terms, mean_ndcg: d.mean_ndcg, mean_grade: d.mean_grade, pct_not_relevant: d.pct_not_relevant, shallow: d.shallow })),
  worst, best, all: rows, equiv,
  findings: board.findings || [],
  demand_candidates, demand_volume,
  revenue_loss: board.revenue_loss || null,
};
// Attach full per-term revenue calculation detail (for the report appendix) from revenue-loss.json.
try {
  const rlFull = JSON.parse(readFileSync('revenue-loss.json', 'utf8'));
  if (data.revenue_loss) {
    data.revenue_loss = { ...data.revenue_loss, assumptions: rlFull.assumptions, disclaimer: rlFull.disclaimer, detail: (rlFull.per_term || []).filter((r) => r.lost.base > 0) };
  }
} catch { /* no revenue-loss.json yet */ }
writeFileSync(out, JSON.stringify(data, null, 1));
console.log('report-data:', board.overall.terms, 'terms |', (board.findings || []).length, 'findings |', demand_candidates.length, 'demand candidates |', equiv.length, 'equiv groups |', demand_volume ? 'demand volumes present' : 'no demand volumes yet');
