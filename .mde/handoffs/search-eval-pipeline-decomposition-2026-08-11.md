# Handoff — Search-eval pipeline decomposition

Date: 2026-08-11
Operator: Ferosh
Decision record: `DEC-012`
Findings added: `FND-GEN040-001` … `FND-GEN040-007`

**Read this first if you are picking up the search-eval work.** It replaces the
`retail-search-eval` monolith, which no longer exists as a skill.

---

## 1. How this started

A grading screen showed:

```
loafers ↔ vs "slip ons"    grade 1    32 results    1 1 1 1 1 1 1 1
oxfords                    grade 1     1 results    1
```

The question was why `oxfords` had no partner. Working through it exposed something
larger than one missing pair.

**The cause:** `assessments/catfootwear/.../build-terms.mjs` holds the whole synonym
pack as hand-typed literals — `'moccasins', 'slip ons', 'loafers', … 'oxfords'`.
`compared_to` was assigned afterwards, so `oxfords` was orphaned because nobody typed
`lace ups`. Not a data problem, an authoring problem, and it will recur on every store.

**The bigger gap Ferosh named:** those packs have **no denominator**. A grade scores
whether what came back is relevant. Nothing in the pipeline knew what *should* have
come back. A term can score 3.0 on eight results while the catalog holds forty.

## 2. The method this is built on

Ferosh's framing, which is the foundation of the whole rebuild:

> Go to category node `Chairs`, apply filter `material=plastic`, get 24 results. Then
> search "plastic chair" — you should get 24.

The node plus a facet filter **is** a query with a known answer key. The merchandiser
already graded it when they filed the SKU, so recall is computable with no human
grading at all:

```
recall = |search results ∩ filtered PLP set| / |filtered PLP set|
```

And the synonyms fall out of the **misses**: take key members search failed to return,
diff their title vocabulary against the ones it found, and the high-lift terms are
candidates — each with the SKU that proves it, and direction already fixed by which
side the node name sits on.

> Loafers node, 47 SKUs, query returns 32. Of the 15 missing, 12 say *moccasin*,
> *driving shoe* or *penny* and never *loafer* → `moccasin → loafers`.

Three constraints came out of the same discussion and are now enforced in schema:

- **Hollow keys invert the reading.** If the facet is null on a third of the node, the key is too small, search's correct extras look like over-expansion, and acting on it deletes correct synonyms. Keys above 0.30 null rate are not emitted.
- **Circular keys measure nothing.** If the facet was assigned by a text classifier over titles and search indexes those titles, recall measures the classifier agreeing with itself. `facet_provenance` is required on the catalog.
- **Siblings are never synonyms.** `loafers`/`oxfords` share a parent and sit at opposite ends of the closure axis. Embeddings merge them; the taxonomy separates them. The blocklist is emitted from the tree.

**Only two datasets can have keys.** `synonym` and `attribute` come from node × facet.
`job_function` ("boots for standing all day") and `intent` have no node and no filter,
so they stay grade-only. Recall must never be averaged across them.

## 3. What was decided

Decompose the monolith into eight stage skills plus a thin orchestrator. Big-bang, not
incremental — Industry West shipped and that chapter is closed.

**Stages stay skills, not scripts.** Discovery is the actual work: finding the real
search endpoint on Shopify has nothing in common with WooCommerce, and Cat Footwear
turned out to be Salesforce Commerce Cloud, matching no existing recipe. A script would
need rewriting per store. What must not change is the **shape of the output** — so the
artifact contract is the interface, and it is checked rather than remembered.

**The strongest argument for the split was enforcement, not modularity.** The 11
READ FIRST lessons were prose in one long skill, holding only if the reading agent
noticed them. Every one is a regression that already happened on a real engagement.
Split by stage, each is owned by exactly one stage and checked at its gate.

**Ferosh added the verification stage**, which is now the most important gate in the
pipeline: the bad findings in a report must be independently confirmed bad, through a
**different capture path** than the one that produced them. Re-grading the same capture
ratifies an artifact instead of testing it.

## 4. What was built

### Contracts — `schemas/search-eval/`
`catalog` · `query-pack` · `engine-profile` · `captures` · `grades` ·
`verified-findings` · `eval-board`

These are the interface. A stage that did genuine per-store discovery still lands the
same shaped file.

### Lessons — `framework/search-eval/LESSONS.md`
L01–L14, each with the stage that owns it. The orchestrator checks every ID is claimed
by some skill; an unclaimed lesson is a gate failure, not a note.

### Skills — `.claude/skills/`

| # | Skill | Output | Key gate |
|---|---|---|---|
| 1 | `catalog-capture` | `catalog.json` | facet provenance + null rates |
| 2 | `category-recall-dataset` | `query-pack.json` | keys carry confidence; orphans listed |
| 3 | `search-engine-profile` | `engine-profile.json` | **verified against live UI (L01)** |
| 4 | `search-capture` | `captures.json` | organic only; paced chunks |
| 5 | `search-grade` | `grades.json` | rubric pinned + judge gold-validated |
| 6 | `finding-verify` | `verified-findings.json` | **verification path ≠ original path** |
| 7 | `search-board` | `eval-board.json` | verification carried onto the board |
| 8 | `search-report` | PDF | **refuses on unverified findings** |

Orchestrator: `ecommerce-search-assessment`. Thin — it sequences and checks contracts,
and deliberately carries no lessons of its own.

### Visualizer — `framework/search-eval/scripts/pipeline-status.mjs`

```sh
node framework/search-eval/scripts/pipeline-status.mjs <eval-dir>
node framework/search-eval/scripts/pipeline-status.mjs <eval-dir> --json
node framework/search-eval/scripts/pipeline-status.mjs <eval-dir> --html out.html
```

Answers "are the skills actually being used" the only way that is observable: it checks
whether each stage produced an artifact meeting its contract, recognises legacy
filenames so old evals can be diagnosed rather than merely reported absent, and shows
lesson coverage. No dependencies — the schema checker is built in.

### Retired
`retail-search-eval` and `furniture-search-eval` deleted as skills. Their five scripts
were **byte-identical duplicates** (verified by diff) and now live once in
`framework/search-eval/scripts/`. Both SKILL.md files preserved in
`framework/search-eval/retired/` as provenance for the lessons.

## 5. Current state — run this first

```sh
cd ~/code/ecommmerce-eval
node framework/search-eval/scripts/pipeline-status.mjs assessments/catfootwear/search-eval/SE-20260810
```

Today that prints **0/8 stages meeting contract**, 14/14 lessons claimed. That is
correct and expected. The catfootwear *data* is fine; its **provenance was never
captured** — no catalog, no engine profile, no gold validation, no verification.

This is the honest measure of what the old pipeline did not record.

## 6. Not done — the actual next work

1. **No scripts exist** for stages 1, 2, 4, 6, 7. The skills specify the method; the runnable pieces are unwritten. Highest value first: `build-category-keys.mjs`, `measure-recall.mjs`, `mine-synonyms.mjs`.
2. **Re-run catfootwear through the pipeline** so there is one complete reference build. Until that exists, the contracts are unproven against a real end-to-end run.
3. **Timberlandpro is barely started** — only `timberlandpro-terms.json`. Good candidate for the first clean run *born* in the new pipeline rather than migrated.
4. **`search-revenue-loss` (global skill) is not contract-aligned.** It slots between stages 6 and 7 and still assumes the old board shape.
5. **Dashboard renders need recall and verification panels** — `loadEvalBoard` / `loadRetailBoard`.
6. **FND-GEN040-001 is recorded but not fixed.** `catfootwear/…/revenue-loss.json` still contains *"a production figure needs Target's own query logs"* — Target boilerplate in a Cat Footwear client artifact.
7. **GEN-040 is not opened.** Deliberately left alone: GEN-039 is mid-flight and phase exit needs two clean validation passes. Ferosh's call.

## 7. Open questions for Ferosh

- **Catfootwear's report shipped without independent verification of its worst findings.** Does it need reissuing, or is it accepted as-is with the gap noted? This is a client-facing judgement, not a technical one.
- Should GEN-039 close before GEN-040 opens, or do these run in parallel?
- Timberlandpro or a fresh store for the first pipeline-native run?

## 8. Session hygiene note

This work was done from a session whose working directory was
`/Users/feroshjacob/code/canon` (Steven's insurance repo) — the conversation started
there and pivoted topic. All writes used absolute paths into `ecommmerce-eval`; canon
was verified untouched (`find … -mmin -180` returned nothing).

**Start the next session from `~/code/ecommmerce-eval`** so its CLAUDE.md, MDE state and
these nine skills load natively.
