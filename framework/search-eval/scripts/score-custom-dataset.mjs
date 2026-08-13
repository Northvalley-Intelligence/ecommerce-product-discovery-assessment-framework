import { readFileSync, writeFileSync } from 'node:fs';
import { loadCustomDataset } from './load-custom-dataset.mjs';
/*
 * score-custom-dataset: type-aware scoring of a custom dataset against captured search responses.
 *
 *   one_to_one  -> RETRIEVAL: is the expected product in the results, at what rank, with what title
 *                  fidelity. found@1-exact is ideal; found-deeper / title-variation are partial;
 *                  not-found is the failure (full impact loss). 1-1 in the data never means 1-1 results.
 *   synonym     -> RELATIONAL: count(term) ~= count(counterpart) and result sets overlap (SAME).
 *   hyponym     -> RELATIONAL: count(term) <= count(counterpart), term results subset (DECREASING).
 *   hypernym    -> RELATIONAL: count(term) >= count(counterpart), superset (INCREASING).
 *
 * Emits per-record scores + a per-dataset roll-up + a loss_fraction per record so the revenue model
 * can price it from the inline monthly_volume. Title-variation is string-normalized here; a Cortex
 * same-product judgment is the intended upgrade (hook noted below).
 *
 * Usage: node score-custom-dataset.mjs <custom-dataset.json> <captures.json> <out scored.json> [--tol 0.7] [--eps 0.05]
 */
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? Number(args[i + 1]) : d; };
const [dsPath, capPath, outPath] = args.filter((a) => !a.startsWith('--') && !/^0|^[0-9.]+$/.test(a)).length ? args.filter((a) => !a.startsWith('--')) : args;
const TOL = flag('tol', 0.7);   // synonym: min/max count ratio to count as "same"
const EPS = flag('eps', 0.05);  // hyponym/hypernym: slack on the count inequality

const ds = JSON.parse(readFileSync(dsPath, 'utf8'));
const loaded = loadCustomDataset(ds);
if (!loaded.ok) { console.error('INVALID dataset:', loaded.errors.join('; ')); process.exit(1); }
const caps = JSON.parse(readFileSync(capPath, 'utf8'));
const capByQ = {}; for (const r of (caps.rows || [])) capByQ[r.q.toLowerCase()] = r;

const norm = (s) => String(s || '').toLowerCase().replace(/^[a-z0-9]+-?[a-z0-9]*\s*:\s*/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
const normSku = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');

function retrievalScore(rank, titleExact) {
  if (rank == null) return { outcome: 'not_found', score: 0, loss_fraction: 1.0 };
  if (rank === 1) return titleExact ? { outcome: 'first_exact', score: 3, loss_fraction: 0 } : { outcome: 'first_title_variation', score: 2.5, loss_fraction: 0.15 };
  if (rank <= 5) return titleExact ? { outcome: 'found_top5', score: 2, loss_fraction: 0.33 } : { outcome: 'found_top5_variation', score: 1.5, loss_fraction: 0.5 };
  return titleExact ? { outcome: 'found_deep', score: 1.5, loss_fraction: 0.5 } : { outcome: 'found_deep_variation', score: 1, loss_fraction: 0.66 };
}

const records = [];
if (ds.type === 'one_to_one') {
  for (const r of ds.records) {
    const cap = capByQ[r.term.toLowerCase()];
    if (!cap) { records.push({ term: r.term, expected: r.expected.sku, captured: false, outcome: 'not_captured', score: null, loss_fraction: null, monthly_volume: r.monthly_volume || 0 }); continue; }
    const skus = (cap.item_skus || []).map(normSku);
    const idx = skus.indexOf(normSku(r.expected.sku));
    let titleExact = false;
    if (idx >= 0) { const got = (cap.items || [])[idx]; titleExact = norm(got) === norm(r.expected.title); }
    const rs = retrievalScore(idx >= 0 ? idx + 1 : null, titleExact);
    records.push({ term: r.term, expected: r.expected.sku, captured: true, total: cap.total, rank: idx >= 0 ? idx + 1 : null, title_exact: idx >= 0 ? titleExact : null, ...rs, monthly_volume: r.monthly_volume || 0 });
  }
} else {
  const wantsSubset = ds.type === 'hyponym';   // term <= counterpart
  const wantsSuperset = ds.type === 'hypernym'; // term >= counterpart
  for (const r of ds.records) {
    const t = capByQ[r.term.toLowerCase()], c = capByQ[(r.counterpart || '').toLowerCase()];
    if (!t || !c) { records.push({ term: r.term, counterpart: r.counterpart, captured: false, outcome: 'not_captured', score: null, loss_fraction: null, monthly_volume: r.monthly_volume || 0 }); continue; }
    const ct = t.total | 0, cc = c.total | 0;
    let ok, direction;
    if (ds.type === 'synonym') { const ratio = Math.max(ct, cc) ? Math.min(ct, cc) / Math.max(ct, cc) : 1; ok = ratio >= TOL; direction = 'same'; }
    else if (wantsSubset) { ok = ct <= cc * (1 + EPS); direction = 'decreasing'; }
    else { ok = ct >= cc * (1 - EPS); direction = 'increasing'; }
    // overlap on captured skus (top-N only -> a floor)
    const A = new Set((t.item_skus || []).map(normSku)), B = new Set((c.item_skus || []).map(normSku));
    const inter = [...A].filter((x) => B.has(x)).length; const uni = new Set([...A, ...B]).size;
    const overlap = uni ? +(inter / uni).toFixed(2) : null;
    const score = ok ? (overlap != null && overlap >= 0.3 ? 3 : 2.5) : 1;
    const loss_fraction = ok ? 0 : 0.5;
    records.push({ term: r.term, counterpart: r.counterpart, captured: true, count_term: ct, count_counterpart: cc, direction, direction_ok: ok, overlap, outcome: ok ? 'direction_holds' : 'direction_violated', score, loss_fraction, monthly_volume: r.monthly_volume || 0 });
  }
}

const scored = records.filter((r) => r.score != null);
const rollup = { dataset_id: ds.dataset_id, type: ds.type, records: records.length, scored: scored.length, not_captured: records.filter((r) => r.outcome === 'not_captured' || r.outcome === 'not_captured').length };
if (ds.type === 'one_to_one') {
  rollup.not_found = records.filter((r) => r.outcome === 'not_found').length;
  rollup.found_first = records.filter((r) => r.outcome && r.outcome.startsWith('first')).length;
  rollup.found_any = scored.filter((r) => r.rank != null).length;
  rollup.pct_not_found = scored.length ? Math.round(rollup.not_found / scored.length * 100) : null;
} else {
  rollup.direction_holds = records.filter((r) => r.direction_ok === true).length;
  rollup.direction_violated = records.filter((r) => r.direction_ok === false).length;
  rollup.pct_holds = scored.length ? Math.round(rollup.direction_holds / scored.length * 100) : null;
}
rollup.mean_score = scored.length ? +(scored.reduce((a, r) => a + r.score, 0) / scored.length).toFixed(2) : null;

const out = { scored_version: '1', dataset_id: ds.dataset_id, type: ds.type, label: loaded.preview.label, built_from: ds.built_from, scoring: loaded.preview.scoring, tolerance: { tol: TOL, eps: EPS }, note_cortex: 'Title-variation is string-normalized; upgrade path is a Cortex same-product judgment per record.', rollup, records };
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(ds.type + ' | ' + ds.dataset_id + ' | ' + JSON.stringify(rollup));
