/* Show a search-eval pipeline in motion.
 *
 *   node framework/search-eval/scripts/pipeline-status.mjs <eval-dir>
 *   node framework/search-eval/scripts/pipeline-status.mjs <eval-dir> --json
 *   node framework/search-eval/scripts/pipeline-status.mjs <eval-dir> --html out.html
 *
 * The stages are SKILLS, not scripts: how you find a Shopify predictive endpoint has
 * nothing in common with how you find a Woo storefront query, and the next platform
 * will be different again. Discovery is the work, and it cannot be scripted.
 *
 * So this does not check that a skill "ran" — there is no such observable. It checks
 * the only thing that is enforceable: whether each stage produced an artifact that
 * MEETS ITS CONTRACT. A skill that did genuine per-store discovery still lands the
 * same shaped file. One that skipped the hard part leaves a hole this prints.
 *
 * That is also how the high-level design survives a new platform — the contract is
 * the design, and it is checked rather than remembered.
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SCHEMAS = join(ROOT, 'schemas/search-eval');
const SKILLS = join(ROOT, '.claude/skills');

/* ---------------------------------------------------------------- stages ---- */
/* legacy: filenames the per-store builders used before the contracts existed.
 * Matching them lets an old eval be diagnosed rather than merely reported absent. */
const STAGES = [
  { n: 1, skill: 'catalog-capture',          artifact: 'catalog.json',            schema: 'catalog.schema.json',
    legacy: [], gate: g('facet_provenance recorded', d => !!d.facet_provenance) },

  { n: 2, skill: 'category-recall-dataset',  artifact: 'query-pack.json',         schema: 'query-pack.schema.json',
    legacy: [/-terms(-\d+)?\.json$/], gate: g('answer keys present', d => (d.terms || []).some(t => t.has_key)) },

  { n: 3, skill: 'search-engine-profile',    artifact: 'engine-profile.json',     schema: 'engine-profile.schema.json',
    legacy: [], gate: g('verified against live UI (L01)', d => d.verified_against_live_ui?.matches === true) },

  { n: 4, skill: 'search-capture',           artifact: 'captures.json',           schema: 'captures.schema.json',
    legacy: [/-captures(-\d+)?\.json$/], gate: g('capture path recorded', d => !!d.captured_via && !!d.engine_profile_ref) },

  { n: 5, skill: 'search-grade',             artifact: 'grades.json',             schema: 'grades.schema.json',
    legacy: [/-ndcg(-\d+)?\.json$/], gate: g('rubric pinned + judge gold-validated (L02, L03)',
      d => !!d.rubric_hash && !!d.gold_validation) },

  { n: 6, skill: 'finding-verify',           artifact: 'verified-findings.json',  schema: 'verified-findings.schema.json',
    legacy: [], gate: g('verified through a DIFFERENT path (L08)',
      d => !!d.verification_path && d.verification_path !== d.original_path) },

  { n: 7, skill: 'search-board',             artifact: 'eval-board.json',         schema: 'eval-board.schema.json',
    legacy: [/-eval-board\.json$/], gate: g('verification carried onto the board', d => d.verification?.ran === true) },

  { n: 8, skill: 'search-report',            artifact: 'report-data.json',        schema: null,
    legacy: [/report-data\.json$/], gate: g('every finding confirmed',
      d => !(d.findings || []).some(f => f.verified && f.verified !== 'confirmed')) },
];

function g(label, fn) { return { label, fn }; }

/* ------------------------------------------------------- tiny validator ---- */
/* Enough of draft 2020-12 to gate on: type, required, const, enum, properties,
 * items, additionalProperties:false, numeric bounds, minItems. Not a general
 * implementation — deliberately small so it has no dependency and no install step. */
function validate(data, schema, path = '', out = []) {
  if (!schema || typeof schema !== 'object') return out;
  const t = schema.type;
  const kind = Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data;

  if (t) {
    const want = Array.isArray(t) ? t : [t];
    if (!want.includes(kind) && !(want.includes('integer') && Number.isInteger(data)))
      { out.push(`${path || '/'}: expected ${want.join('|')}, got ${kind}`); return out; }
  }
  if ('const' in schema && data !== schema.const)
    out.push(`${path}: must be ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`);
  if (schema.enum && !schema.enum.includes(data))
    out.push(`${path}: ${JSON.stringify(data)} not one of ${JSON.stringify(schema.enum)}`);
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) out.push(`${path}: ${data} < ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) out.push(`${path}: ${data} > ${schema.maximum}`);
  }
  if (kind === 'array') {
    if (schema.minItems && data.length < schema.minItems) out.push(`${path}: needs ${schema.minItems}+ items`);
    if (schema.items) data.forEach((v, i) => validate(v, schema.items, `${path}[${i}]`, out));
  }
  if (kind === 'object') {
    for (const r of schema.required || [])
      if (!(r in data)) out.push(`${path}/${r}: required`);
    for (const [k, v] of Object.entries(data)) {
      const sub = schema.properties?.[k];
      if (sub) validate(v, sub, `${path}/${k}`, out);
      else if (schema.additionalProperties === false && schema.properties)
        out.push(`${path}/${k}: not allowed`);
      else if (typeof schema.additionalProperties === 'object')
        validate(v, schema.additionalProperties, `${path}/${k}`, out);
    }
  }
  return out;
}

/* ------------------------------------------------------------- inspect ---- */
const args = process.argv.slice(2);
const dir = resolve(args.find(a => !a.startsWith('--')) || '.');
if (!existsSync(dir)) { console.error(`No such directory: ${dir}`); process.exit(1); }

const files = readdirSync(dir);
const readJson = f => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } };

const results = STAGES.map(s => {
  let file = files.includes(s.artifact) ? s.artifact : null;
  let legacy = false;
  if (!file) {
    file = files.find(f => s.legacy.some(rx => rx.test(f))) || null;
    legacy = !!file;
  }
  if (!file) return { ...s, state: 'missing', file: null, errors: [], gateOk: false, legacy: false };

  const data = readJson(file);
  if (data === null) return { ...s, state: 'unreadable', file, errors: ['not valid JSON'], gateOk: false, legacy };

  let errors = [];
  if (s.schema && existsSync(join(SCHEMAS, s.schema)))
    errors = validate(data, JSON.parse(readFileSync(join(SCHEMAS, s.schema), 'utf8'))).slice(0, 6);

  let gateOk = false;
  try { gateOk = !!s.gate.fn(Array.isArray(data) ? { rows: data } : data); } catch { gateOk = false; }

  const state = legacy ? 'legacy' : errors.length ? 'invalid' : gateOk ? 'ok' : 'gate-failed';
  return { ...s, state, file, errors, gateOk, legacy, data };
});

/* blocked: a stage whose upstream gate failed cannot be trusted even if present */
const verifyIdx = results.findIndex(r => r.n === 6);
if (!results[verifyIdx].gateOk) {
  const rep = results.find(r => r.n === 8);
  if (rep.state !== 'ok') rep.state = 'blocked';
  rep.blockedBy = 6;
}

/* ------------------------------------------------- machine-readable (--json) */
if (args.includes('--json')) {
  const WORDS = { ok: 'ok', legacy: 'legacy shape', invalid: 'contract violated', 'gate-failed': 'gate failed', missing: 'not run', blocked: 'blocked', unreadable: 'unreadable' };
  console.log(JSON.stringify({
    dir,
    done: results.filter((r) => r.state === 'ok').length,
    total: results.length,
    stages: results.map((r) => ({ n: r.n, skill: r.skill, artifact: r.artifact, file: r.file, state: r.state, label: WORDS[r.state] || r.state, blockedBy: r.blockedBy || null })),
  }));
  process.exit(0);
}

/* --------------------------------------------------- lesson enforcement ---- */
const lessonsFile = join(ROOT, 'framework/search-eval/LESSONS.md');
const declared = existsSync(lessonsFile)
  ? [...new Set(readFileSync(lessonsFile, 'utf8').match(/\bL\d{2}\b/g) || [])].sort()
  : [];
const claimed = new Map();
if (existsSync(SKILLS)) {
  for (const d of readdirSync(SKILLS)) {
    const p = join(SKILLS, d, 'SKILL.md');
    if (!existsSync(p)) continue;
    for (const id of new Set(readFileSync(p, 'utf8').match(/\bL\d{2}\b/g) || []))
      claimed.set(id, [...(claimed.get(id) || []), d]);
  }
}
const orphanLessons = declared.filter(id => !claimed.has(id));

/* ------------------------------------------------------------- discovery -- */
/* What this store turned out to be. Same contract, different findings — this is the
 * part that proves a skill did per-store work rather than replaying a script. */
const profile = results.find(r => r.n === 3)?.data;
const board = results.find(r => r.n === 7)?.data;
const discovery = {
  retailer: board?.retailer || profile?.retailer || basename(dir),
  platform: profile?.platform || (board?.stores && Object.values(board.stores)[0]?.platform) || null,
  engine_kind: profile?.engine?.kind || null,
  captured_via: board?.captured_via || results.find(r => r.n === 4)?.data?.captured_via || null,
  terms: board?.overall?.terms ?? null,
  redirects: (profile?.known_redirects || []).length || null,
};

/* ---------------------------------------------------------------- render --- */
const ICON = { ok: '●', legacy: '◐', invalid: '✗', 'gate-failed': '✗', missing: '○', blocked: '⊘', unreadable: '✗' };
const COL = { ok: 32, legacy: 33, invalid: 31, 'gate-failed': 31, missing: 90, blocked: 35, unreadable: 31 };
const c = (s, t) => `\x1b[${COL[s] || 0}m${t}\x1b[0m`;
const WORD = { ok: 'ok', legacy: 'legacy shape', invalid: 'contract violated', 'gate-failed': 'gate failed',
               missing: 'not run', blocked: 'blocked', unreadable: 'unreadable' };

if (args.includes('--json')) {
  console.log(JSON.stringify({ dir, discovery, stages: results.map(({ data, gate, legacy: _l, ...r }) => r),
    lessons: { declared, claimed: Object.fromEntries(claimed), orphans: orphanLessons } }, null, 2));
} else if (args.includes('--html')) {
  const out = args[args.indexOf('--html') + 1] || 'pipeline.html';
  writeFileSync(out, html({ dir, discovery, results, declared, claimed, orphanLessons }));
  console.log(`wrote ${out}`);
} else {
  console.log(`\n  ${discovery.retailer}  ·  ${basename(dir)}`);
  const bits = [discovery.platform, discovery.engine_kind && `engine: ${discovery.engine_kind}`,
                discovery.terms && `${discovery.terms} terms`].filter(Boolean);
  if (bits.length) console.log(`  ${bits.join('  ·  ')}`);
  console.log('');
  for (const r of results) {
    const head = `  ${c(r.state, ICON[r.state])}  ${String(r.n)}. ${r.skill.padEnd(26)}`;
    console.log(`${head}${c(r.state, WORD[r.state].padEnd(19))}${r.file || r.artifact}`);
    if (r.state === 'blocked') console.log(`        └─ blocked by stage ${r.blockedBy} — cannot report unverified findings`);
    if (r.state === 'legacy') console.log(`        └─ pre-contract file; re-run the stage to produce ${r.artifact}`);
    if (!r.gateOk && ['ok', 'gate-failed', 'invalid', 'legacy'].includes(r.state))
      console.log(`        └─ gate: ${r.gate.label}`);
    for (const e of r.errors) console.log(`        └─ ${e}`);
  }
  const done = results.filter(r => r.state === 'ok').length;
  console.log(`\n  ${done}/8 stages meeting contract`);
  console.log(`  lessons: ${declared.length - orphanLessons.length}/${declared.length} claimed by a skill` +
    (orphanLessons.length ? c('invalid', `  — unclaimed: ${orphanLessons.join(' ')}`) : ''));
  console.log('');
}

/* ------------------------------------------------------------------ html --- */
function html({ dir, discovery, results, declared, claimed, orphanLessons }) {
  const done = results.filter(r => r.state === 'ok').length;
  const row = r => `
    <li class="stage ${r.state}">
      <span class="dot"></span>
      <span class="num">${r.n}</span>
      <div class="body">
        <div class="name">${r.skill}</div>
        <div class="meta">${WORD[r.state]} · <code>${r.file || r.artifact}</code></div>
        ${r.state === 'blocked' ? `<div class="note">blocked by stage ${r.blockedBy} — cannot report unverified findings</div>` : ''}
        ${r.state === 'legacy' ? `<div class="note">pre-contract file; re-run to produce <code>${r.artifact}</code></div>` : ''}
        ${!r.gateOk && r.state !== 'missing' ? `<div class="note">gate: ${r.gate.label}</div>` : ''}
        ${r.errors.map(e => `<div class="note err">${e.replace(/</g, '&lt;')}</div>`).join('')}
      </div>
    </li>`;
  return `<h1>${discovery.retailer}</h1>
<p class="sub">${[basename(dir), discovery.platform, discovery.engine_kind].filter(Boolean).join(' · ')}</p>
<p class="score">${done}<span>/8 stages meeting contract</span></p>
<ol class="pipeline">${results.map(row).join('')}</ol>
<h2>Lesson enforcement</h2>
<p>${declared.length - orphanLessons.length} of ${declared.length} lessons claimed by a skill.
${orphanLessons.length ? `<strong>Unclaimed: ${orphanLessons.join(', ')}</strong>` : 'None orphaned.'}</p>
<ul class="lessons">${declared.map(id =>
  `<li><code>${id}</code> ${(claimed.get(id) || ['<em>unclaimed</em>']).join(', ')}</li>`).join('')}</ul>
<style>
 body{font:15px/1.55 ui-sans-serif,system-ui;margin:0 auto;padding:2.5rem 1.5rem;max-width:56rem}
 h1{margin:0;font-size:1.7rem} .sub{color:#71717a;margin:.25rem 0 1.5rem}
 .score{font-size:2.4rem;font-weight:600;margin:0 0 1.5rem} .score span{font-size:1rem;font-weight:400;color:#71717a}
 .pipeline{list-style:none;padding:0;margin:0;border-left:2px solid #e4e4e7}
 .stage{display:flex;gap:.85rem;padding:.7rem 0 .7rem 1.1rem;margin-left:-1px;position:relative}
 .dot{width:.6rem;height:.6rem;border-radius:50%;margin-top:.42rem;flex:none;background:#d4d4d8}
 .ok .dot{background:#16a34a}.legacy .dot{background:#ca8a04}.invalid .dot,.gate-failed .dot{background:#dc2626}
 .blocked .dot{background:#9333ea}.missing .dot{background:#d4d4d8}
 .num{color:#a1a1aa;font-variant-numeric:tabular-nums;flex:none}
 .name{font-weight:600}.meta{color:#71717a;font-size:.87rem}
 .note{font-size:.83rem;color:#52525b;margin-top:.2rem}.note.err{color:#b91c1c;font-family:ui-monospace,monospace}
 code{background:#f4f4f5;padding:.05rem .3rem;border-radius:3px;font-size:.85em}
 .lessons{columns:2;font-size:.9rem;color:#52525b} .lessons li{margin:.15rem 0;break-inside:avoid}
 @media(prefers-color-scheme:dark){body{background:#0a0a0a;color:#e4e4e7}.sub,.meta,.num{color:#a1a1aa}
  .pipeline{border-color:#27272a}code{background:#18181b}.note{color:#a1a1aa}.lessons{color:#a1a1aa}}
</style>`;
}
