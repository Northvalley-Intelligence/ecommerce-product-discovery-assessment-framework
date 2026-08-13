import { readFileSync, writeFileSync } from 'node:fs';
/*
 * Stage 7: assemble the contract eval-board.json (schemas/search-eval/eval-board.schema.json) from the
 * legacy board + recall + verified-findings + query-pack. Carries recall onto datasets/rows, the
 * verification summary, and a per-row classification. Assortment gaps are classified from the catalog
 * (node absence) regardless of whether search returned poor matches — a non-zero result for a type the
 * store does not stock is still an assortment gap, not a search loss.
 */
const B = JSON.parse(readFileSync('catfootwear-eval-board.json', 'utf8'));
const R = JSON.parse(readFileSync('recall.json', 'utf8'));
const VF = JSON.parse(readFileSync('verified-findings.json', 'utf8'));
const P = JSON.parse(readFileSync('query-pack.json', 'utf8'));
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const recByQ = {}; for (const r of R.rows) recByQ[norm(r.term)] = r;
const keyByQ = {}; for (const t of P.terms) if (t.has_key && t.key) keyByQ[norm(t.term)] = { size: t.key.size, confidence: t.key.confidence };
const vfByQ = {}; for (const r of VF.rows) vfByQ[norm(r.q)] = r;
const gapSet = new Set(B.rows.filter((r) => r.assortment_gap).map((r) => norm(r.q)));
// Provenance of each synonym compared_to link: catalog (term maps to a real node, or shares its
// canonical's node), mined (in synonym-candidates.json), or authored (my hand-typed overlay).
const CAT = JSON.parse(readFileSync('catalog.json', 'utf8'));
const nodeInfo = {}; for (const n of CAT.nodes) nodeInfo[n.node_id] = { name: n.node_name, size: n.sku_count };
const nodeByTerm = {}; for (const t of P.terms) if (t.node_id) nodeByTerm[norm(t.term)] = t.node_id;
const packByTerm = {}; for (const t of P.terms) packByTerm[norm(t.term)] = t;
let minedTo = {}; const minedSet = new Set(); try { const sc = JSON.parse(readFileSync('synonym-candidates.json', 'utf8')); for (const c of (sc.candidates || [])) { const mt = norm(c.maps_to_term); (minedTo[mt] = minedTo[mt] || new Set()).add(norm(c.candidate)); minedSet.add(norm(c.candidate)); } } catch { /* no mining yet */ }
const sourceOf = (r) => { if (!r.compared_to) return null; const tn = nodeByTerm[norm(r.q)]; const cn = nodeByTerm[norm(r.compared_to)]; if (tn && (r.is_lead || tn === cn)) return 'catalog'; if ((minedTo[norm(r.compared_to)] || new Set()).has(norm(r.q))) return 'mined'; return 'authored'; };
// per-term selection source, carried from the query pack (category-recall skill §6); mined overrides.
const selectionOf = (r) => { if (minedSet.has(norm(r.q))) return 'mined'; const t = packByTerm[norm(r.q)]; return t && t.source ? t.source : 'authored'; };

const datasets = B.datasets.map((d) => {
  const hasKeys = ['synonym', 'attribute'].includes(d.id);
  const rk = B.rows.filter((r) => r.dataset === d.id).map((r) => recByQ[norm(r.q)]).filter((x) => x && x.recall != null);
  const keyed = B.rows.filter((r) => r.dataset === d.id && keyByQ[norm(r.q)]).length;
  return { id: d.id, name: d.name, terms: d.terms, zero: d.zero, coverage_pct: d.coverage_pct, mean_ndcg: d.mean_ndcg, mean_grade: d.mean_grade, pct_not_relevant: d.pct_not_relevant, shallow: d.shallow, has_keys: hasKeys, mean_recall: rk.length ? +(rk.reduce((a, b) => a + b.recall, 0) / rk.length).toFixed(3) : null, key_coverage_pct: d.terms ? Math.round(keyed / d.terms * 100) : 0 };
});
// classification: assortment gap FIRST (catalog says the store doesn't stock the type), regardless of zero.
const classify = (r) => { if (gapSet.has(norm(r.q))) return 'assortment_gap'; if (r.zero) return 'search_bug'; if (r.mean_grade != null && r.mean_grade < 1.5) return 'shallow_answer'; return null; };
const rows = B.rows.map((r) => { const rec = recByQ[norm(r.q)]; const k = keyByQ[norm(r.q)]; const vf = vfByQ[norm(r.q)];
  return { dataset: r.dataset, q: r.q, total: r.total, search_call: r.search_call, items: r.items || [], grades: r.grades_pinned || [], ndcg: r.ndcg_pinned, mean_grade: r.mean_grade, recall: rec ? rec.recall : null, key_size: k ? k.size : null, key_confidence: k ? k.confidence : null, missing_skus: rec ? (rec.miss_skus || []) : [], compared_to: r.compared_to || null, is_lead: r.is_lead || null, compared_to_source: sourceOf(r), source: selectionOf(r), node_id: nodeByTerm[norm(r.q)] || null, node_name: nodeByTerm[norm(r.q)] ? (nodeInfo[nodeByTerm[norm(r.q)]] || {}).name : null, node_size: nodeByTerm[norm(r.q)] ? (nodeInfo[nodeByTerm[norm(r.q)]] || {}).size : null, verified: vf ? vf.verdict : null, classification: classify(r) }; });
const allg = [].concat(...rows.map((r) => r.grades));
const shallow = rows.filter((r) => !r.zero && r.mean_grade != null && r.mean_grade < 1.5).length;
const recAll = rows.map((r) => r.recall).filter((x) => x != null);
const overall = { terms: rows.length, graded_terms: rows.filter((r) => r.grades.length).length, zero_terms: rows.filter((r) => r.zero).length, coverage_pct: B.overall.coverage_pct, mean_grade: B.overall.mean_grade, pct_not_relevant: B.overall.pct_not_relevant, product_judgments: allg.length, mean_recall: recAll.length ? +(recAll.reduce((a, b) => a + b, 0) / recAll.length).toFixed(3) : null, shallow_answer_rate: Math.round(shallow / rows.length * 100) };
const findings = (B.findings || []).map((f) => { const o = { severity: f.severity, area: f.area, title: f.title, detail: f.detail, verified: /intent|use-case|category-token/i.test(f.area) ? 'confirmed' : null }; const fc = (f.detail.match(/Fix candidate:[^.]*/) || [])[0]; if (fc) o.fix_candidate = fc; return o; });
const verification = { ran: true, verified_findings_ref: 'verified-findings.json', original_path: VF.original_path, verification_path: VF.verification_path, confirmed: VF.rows.filter((r) => r.verdict === 'confirmed').length, refuted: VF.rows.filter((r) => r.verdict === 'refuted').length, inconclusive: VF.rows.filter((r) => r.verdict === 'inconclusive').length, selection_rule: VF.selection.rule };
const board = { eval_id: 'SE-20260810', retailer: 'catfootwear', sector: 'footwear', captured_via: B.captured_via, rubric_hash: B.rubric_hash, judge: B.judge, brand_color: B.brand_color, brand_ink: B.brand_ink, headline: B.headline, verdict: B.verdict, stores: B.stores, datasets, rows, overall, findings, verification, revenue_loss: B.revenue_loss || null };
writeFileSync('eval-board.json', JSON.stringify(board, null, 1));
const cls = {}; rows.forEach((r) => { if (r.classification) cls[r.classification] = (cls[r.classification] || 0) + 1; });
console.log('eval-board.json: recall', Math.round((overall.mean_recall || 0) * 100) + '% | classifications:', JSON.stringify(cls));
