import { readFileSync } from 'node:fs';
/*
 * load-custom-dataset: validate a brought custom dataset and normalize it for the board/UI preview.
 * Enforces the type-specific record shape (counterpart for relational, expected for one_to_one),
 * derives the chip label (explicit label, else a default per type; built_from is the tooltip), and
 * surfaces warnings the operator should see BEFORE integrating (missing demand, dup terms, etc.).
 *
 * Usage: node load-custom-dataset.mjs <custom-dataset.json>  (prints a JSON preview to stdout)
 */
export const DEFAULT_LABEL = {
  synonym: 'synonym',
  hypernym: 'hypernym',
  hyponym: 'hyponym',
  one_to_one: '1-1',
};
export const SCORING_OF = {
  synonym: 'relational', hypernym: 'relational', hyponym: 'relational', one_to_one: 'retrieval',
};

export function loadCustomDataset(ds) {
  const errors = [], warnings = [];
  if (ds.custom_dataset_version !== '1') errors.push('custom_dataset_version must be "1"');
  if (!['synonym', 'hypernym', 'hyponym', 'one_to_one'].includes(ds.type)) errors.push('type must be one of synonym|hypernym|hyponym|one_to_one');
  if (!ds.built_from || ds.built_from.trim().length < 10) errors.push('built_from is required (>=10 chars) — it generates the label');
  if (!Array.isArray(ds.records) || !ds.records.length) errors.push('records must be a non-empty array');

  const relational = ['synonym', 'hypernym', 'hyponym'].includes(ds.type);
  const seen = new Set();
  let withDemand = 0;
  for (const [i, r] of (ds.records || []).entries()) {
    if (!r.term) { errors.push(`records[${i}] missing term`); continue; }
    const k = r.term.toLowerCase();
    if (seen.has(k)) warnings.push(`duplicate term: "${r.term}"`); else seen.add(k);
    if (relational && !r.counterpart) errors.push(`records[${i}] ("${r.term}") missing counterpart (required for ${ds.type})`);
    if (ds.type === 'one_to_one' && !(r.expected && r.expected.sku && r.expected.title)) errors.push(`records[${i}] ("${r.term}") missing expected.{sku,title} (required for one_to_one)`);
    if (r.monthly_volume != null && r.monthly_volume > 0) withDemand++;
  }
  if (withDemand === 0) warnings.push('no record carries monthly_volume — impact-dollars for this dataset will be 0 until demand is added');
  else if (withDemand < (ds.records || []).length) warnings.push(`${(ds.records || []).length - withDemand} of ${ds.records.length} records have no monthly_volume`);

  const label = ds.label || DEFAULT_LABEL[ds.type] || 'custom';
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    preview: {
      dataset_id: ds.dataset_id,
      name: ds.name || ds.dataset_id,
      type: ds.type,
      scoring: SCORING_OF[ds.type],
      label,
      built_from: ds.built_from,      // tooltip
      records: (ds.records || []).length,
      with_demand: withDemand,
      total_monthly_volume: (ds.records || []).reduce((a, r) => a + (r.monthly_volume || 0), 0),
      sample: (ds.records || []).slice(0, 5).map((r) => ({ term: r.term, counterpart: r.counterpart, expected: r.expected, monthly_volume: r.monthly_volume })),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ds = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const res = loadCustomDataset(ds);
  console.log(JSON.stringify(res, null, 1));
  process.exit(res.ok ? 0 : 1);
}
