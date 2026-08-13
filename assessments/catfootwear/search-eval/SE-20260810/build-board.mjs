import { readFileSync, writeFileSync } from 'node:fs';
// Build catfootwear eval-board.json from terms + captures + ndcg. Emphasizes COVERAGE (zero-result rate)
// because SFCC/boutique engines fail on recall (return 0), unlike big-box engines that always answer.
const A = process.argv.slice(2);
const terms = JSON.parse(readFileSync(A[0] || 'catfootwear-terms.json', 'utf8'));
const caps = JSON.parse(readFileSync(A[1] || 'catfootwear-captures.json', 'utf8'));
const ndcg = JSON.parse(readFileSync(A[2] || 'catfootwear-ndcg.json', 'utf8'));
const OUT = A[3] || 'catfootwear-eval-board.json';
const capByQ = Object.fromEntries(caps.map((c) => [c.q.toLowerCase(), c]));
const ndByQ = Object.fromEntries((ndcg.rows || []).map((r) => [r.q.toLowerCase(), r]));
const DS = [['synonym', 'Synonym / category'], ['attribute', 'Attribute (feature+material)'], ['job_function', 'Job-function (use case)'], ['intent', 'Intent (natural language)'], ['literal', 'Literal (model/brand)']];
const dsName = Object.fromEntries(DS);
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

// synonym equivalence groups (lead canonical -> variants)
const groups = {
  'work boots': ['work boots', 'safety boots', 'work shoes', 'safety shoes', 'safety footwear', 'safety toe boots'],
  'sneakers': ['sneakers', 'trainers', 'athletic shoes', 'tennis shoes', 'running shoes'],
  'boots': ['boots', 'booties', 'ankle boots'],
  'slip ons': ['slip ons', 'moccasins', 'loafers', 'slides', 'mules', 'clogs'],
  'shoes': ['shoes', 'footwear'],
  'hiking boots': ['hiking boots', 'hikers', 'trail shoes'],
  'pull on boots': ['pull on boots', 'chelsea boots', 'lace up boots'],
  'casual shoes': ['casual shoes', 'slip on shoes', 'casual sneakers'],
  'rubber boots': ['rubber boots', 'wellington boots', 'rain boots'],
  'winter boots': ['winter boots', 'snow boots'],
  // NOTE: a synonym group's LEAD must be a real stocked category. Groups whose lead is an
  // assortment gap (high tops/low tops, boat shoes/deck shoes — Cat makes neither) are NOT
  // emitted; those terms stand alone as assortment gaps, never as a "canonical".
};
const leadOf = {}; Object.keys(groups).forEach((l) => groups[l].forEach((t) => leadOf[t] = l));

// Assortment gaps — footwear types Cat Footwear does not make. A zero on these is merchandising,
// NOT a search bug, so they are excluded from search revenue-at-risk (catalog guardrail).
const assortmentGaps = new Set(['sandals', 'flip flops', 'dress shoes', 'clogs', 'mules', 'slides',
  'boat shoes', 'deck shoes', 'moccasins', 'trainers', 'tennis shoes', 'running shoes', 'athletic shoes',
  'kids shoes', 'high tops', 'low tops', 'oxfords', 'loafers']);

const rows = terms.map(([q, dataset]) => {
  const c = capByQ[q.toLowerCase()] || { total: 0, items: [], zero: true };
  const nd = ndByQ[q.toLowerCase()];
  const grades = nd ? (nd.grades || []) : [];
  const row = {
    dataset, q,
    total: c.total || 0,
    search_call: 'https://www.catfootwear.com/US/en/search?q=' + encodeURIComponent(q),
    items: c.items || [],
    grades_pinned: grades,
    ndcg_pinned: nd ? nd.ndcg : null,
    mean_grade: grades.length ? +mean(grades).toFixed(2) : null,
    zero: !!c.zero || (c.total || 0) === 0,
    known_item: !!c.known_item,
    redirected: !!c.redirected,
    assortment_gap: assortmentGaps.has(q.toLowerCase()),
  };
  // A canonical (lead) must be a real stocked category. Never mark an assortment-gap term canonical,
  // and never point a variant at a gap-lead. (Variant→canonical links are still authored, not yet mined — L05/L06.)
  var lead = leadOf[q.toLowerCase()];
  if (dataset === 'synonym' && lead && !assortmentGaps.has(lead)) { row.compared_to = lead; row.is_lead = lead === q.toLowerCase() && !assortmentGaps.has(q.toLowerCase()); }
  return row;
});

const datasets = DS.map(([id, name]) => {
  const rs = rows.filter((r) => r.dataset === id);
  const graded = rs.filter((r) => r.grades_pinned.length);
  const allg = [].concat(...graded.map((r) => r.grades_pinned));
  const ndcgs = graded.map((r) => r.ndcg_pinned).filter((v) => v != null);
  return {
    id, name, terms: rs.length,
    zero: rs.filter((r) => r.zero).length,
    coverage_pct: rs.length ? Math.round((rs.length - rs.filter((r) => r.zero).length) / rs.length * 100) : 0,
    mean_ndcg: ndcgs.length ? +mean(ndcgs).toFixed(2) : null,
    mean_grade: allg.length ? +mean(allg).toFixed(2) : null,
    pct_not_relevant: allg.length ? Math.round(allg.filter((g) => g <= 1).length / allg.length * 100) : null,
    shallow: graded.filter((r) => r.mean_grade != null && r.mean_grade < 1.5).length,
  };
}).filter((d) => d.terms > 0);

const allg = [].concat(...rows.map((r) => r.grades_pinned));
const zeroTerms = rows.filter((r) => r.zero).length;
const overall = {
  terms: rows.length,
  graded_terms: rows.filter((r) => r.grades_pinned.length).length,
  zero_terms: zeroTerms,
  coverage_pct: Math.round((rows.length - zeroTerms) / rows.length * 100),
  mean_grade: allg.length ? +mean(allg).toFixed(2) : null,
  pct_not_relevant: allg.length ? Math.round(allg.filter((g) => g <= 1).length / allg.length * 100) : null,
  product_judgments: allg.length,
};

// Preserve narrative fields (headline, verdict, findings) across rebuilds (e.g. grade refresh).
let prev = {}; try { prev = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* first build */ }
const board = {
  eval_id: 'SE-20260810', retailer: 'catfootwear', sector: 'footwear',
  brand_color: '#FFCD11', brand_ink: '#231f20', captured: true,
  captured_via: 'Cat Footwear organic search (Salesforce Commerce Cloud / SFRA), server-side fetch of /US/en/search?q= — product names from tile image alt text; Einstein recommendations (JS-only) excluded, so results are organic. Category-matching queries redirect to the category page; known-item queries redirect to the product page (counted as a direct hit). ' + overall.product_judgments + ' product judgments across ' + overall.terms + ' terms.',
  rubric_hash: ndcg.rubric_hash, judge: 'llama3.2:3b',
  grading_partial: !!ndcg.partial, grading_graded: ndcg.graded || null,
  stores: { CF: { id: 'catfootwear', name: 'Cat Footwear', platform: 'Salesforce Commerce Cloud (SFRA)' } },
  headline: prev.headline || '', verdict: prev.verdict || '',
  datasets, rows, overall, findings: prev.findings || [],
  revenue_loss: prev.revenue_loss || null,
};
writeFileSync(OUT, JSON.stringify(board, null, 1));
console.log('BOARD:', overall.terms, 'terms |', overall.coverage_pct + '% coverage (' + zeroTerms + ' zero) | grade', overall.mean_grade, '| not-rel', overall.pct_not_relevant + '%');
datasets.forEach((d) => console.log('  ', d.id, d.terms + 't', 'cov ' + d.coverage_pct + '%', 'grade ' + d.mean_grade, 'nr ' + d.pct_not_relevant + '%'));
