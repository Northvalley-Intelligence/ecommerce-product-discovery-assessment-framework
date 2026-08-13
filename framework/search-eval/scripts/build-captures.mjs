import { readFileSync, writeFileSync } from 'node:fs';
/*
 * build-captures (stage 4 assembler): wrap the raw per-term rows exported from the browser into a
 * contract captures.json (schemas/search-eval/captures.schema.json). The browser capture writes a
 * bare object { retailer, captured_via, rows:[{q,dataset,total,zero,items,item_skus,...}] } via the
 * capture-bridge; this attaches the contract envelope, dedupes, and carries chunk provenance.
 *
 * Usage: node build-captures.mjs <raw-rows.json> <query-pack.json> <engine-profile.json> <out captures.json>
 */
const [rawPath, packPath, profPath, outPath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const rows = Array.isArray(raw) ? raw : (raw.rows || Object.values(raw.rows_by_q || raw));
const dsOf = {}; for (const t of pack.terms) dsOf[t.term.toLowerCase()] = t.dataset;

const out = {
  capture_version: '1',
  retailer: raw.retailer || 'partscat',
  eval_id: raw.eval_id || pack.eval_id || 'SE-20260812',
  captured_at: raw.captured_at || new Date().toISOString(),
  engine_profile_ref: profPath.split('/').pop(),
  captured_via: raw.captured_via || 'browser_dom',
  query_pack_ref: packPath.split('/').pop(),
  rows: rows.map((r) => {
    const o = {
      q: r.q,
      dataset: r.dataset || dsOf[String(r.q).toLowerCase()] || 'synonym',
      total: r.total | 0,
      zero: !!r.zero,
      items: (r.items || []).slice(0, 10),
    };
    if (r.item_skus) o.item_skus = r.item_skus.slice(0, 10);
    if (r.organic_grid_found != null) o.organic_grid_found = r.organic_grid_found;
    if (r.redirected) { o.redirected = true; if (r.redirect_target) o.redirect_target = r.redirect_target; }
    if (r.no_results_msg != null) o.no_results_msg = r.no_results_msg;
    if (r.source_url) o.source_url = r.source_url;
    if (r.chunk_id) o.chunk_id = r.chunk_id;
    return o;
  }),
};
writeFileSync(outPath, JSON.stringify(out, null, 1));
const z = out.rows.filter((r) => r.zero).length;
console.log('captures.json:', out.rows.length, 'rows |', z, 'zero |', out.rows.length - z, 'answered');
