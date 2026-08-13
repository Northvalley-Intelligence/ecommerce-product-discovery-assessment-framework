import { readFileSync, writeFileSync } from 'node:fs';
// Assemble contract grades.json from the Cortex rows + a hand-labeled gold set (L03).
const partial = JSON.parse(readFileSync('grades-partial.json', 'utf8'));
const byQ = {}; for (const r of partial.rows) byQ[r.q] = r.grades;
// gold: [query, rank_index (0-based), human_binary_relevant] — strict shopper-intent judgment on captured titles.
const gold = [
  ['battery for cold weather starting', 0, 0], // Battery Cable — accessory, not a battery
  ['battery for cold weather starting', 1, 0], // Battery Wiring Cable
  ['battery for cold weather starting', 6, 0], // Cold Weather Battery Cover — a cover
  ['battery for cold weather starting', 4, 0], // Cold Weather Battery Cover
  ['battery for cold weather starting', 8, 0], // Battery Wiring Cable
  ['heavy duty battery', 0, 1], // Heavy Duty Battery
  ['heavy duty battery', 1, 1], // 12V Heavy Duty Low Maintenance Battery
  ['heavy duty battery', 2, 1], // 12V Heavy Duty Maintenance-Free Battery
  ['heavy duty battery', 7, 1], // 12V Heavy Duty Maintenance-Free Battery
  ['heavy duty battery', 8, 0], // Cable Assembly-Battery — accessory
  ['oil filter for C15 engine', 0, 1], // Engine Oil Filter
  ['oil filter for C15 engine', 2, 1], // 1R-1808 Engine Oil Filter
  ['oil filter for C15 engine', 1, 1], // Engine Lube Oil Filter
  ['oil filter for C15 engine', 4, 0], // Engine Oil Filter Cover — a cover
  ['oil filter for C15 engine', 7, 0], // Oil Filter Shield — accessory
  ['oil filter for C15 engine', 8, 0], // Engine Oil Filter Base — accessory
  ['bucket teeth', 0, 1], // Bucket Tip
  ['bucket teeth', 2, 1], // Bucket Tip
  ['bucket teeth', 1, 0], // K Series Tip Retainer — retainer, not a tooth
  ['bucket teeth', 3, 1], // Bucket Tip
  ['bucket teeth', 4, 1], // Uni-Tooth Bucket Tip
  ['bucket teeth', 8, 1], // Bucket Tooth Short Tip
  ['bucket teeth', 9, 1], // Bucket Tip
  ['bucket teeth', 5, 1], // Bucket Tip
];
let agree = 0;
for (const [q, i, human] of gold) {
  const g = (byQ[q] || [])[i];
  const judgeRel = g != null && g >= 2 ? 1 : 0;
  if (judgeRel === human) agree++;
}
const binary_agreement = +(agree / gold.length).toFixed(3);

const out = {
  grade_version: '1',
  retailer: 'partscat',
  eval_id: 'SE-20260812',
  captures_ref: 'captures.json',
  graded_at: new Date().toISOString(),
  rubric_hash: partial.rubric_hash,
  judge: partial.judge,
  gold_validation: {
    pairs: gold.length,
    binary_agreement,
    validated_at: new Date().toISOString(),
    known_bias: 'Judge over-credits adjacent accessories as relevant to the base-product query: battery covers/cables and oil-filter covers/shields/bases were graded 2-3 when a shopper seeking the base product would reject them (grade 0). All disagreements are the judge being too lenient in this direction, so category-level scores are an OPTIMISTIC bound; the shallow-answer and use-case findings are conservative.',
  },
  partial: true,
  graded_count: partial.rows.length,
  rows: partial.rows.map((r) => ({ query_id: r.query_id, q: r.q, ndcg: r.ndcg, grades: r.grades, mean_grade: r.mean_grade, job_id: r.job_id })),
};
writeFileSync('grades.json', JSON.stringify(out, null, 1));
console.log('grades.json | gold pairs', gold.length, '| binary agreement', binary_agreement, '| graded', out.rows.length);
