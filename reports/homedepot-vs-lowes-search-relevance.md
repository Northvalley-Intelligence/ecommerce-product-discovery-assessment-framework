# Home Depot vs Lowe's — Search Relevance Evaluation

**Scope:** three query datasets scored on `homedepot.com` and `lowes.com`
**Method:** bounded same-origin browser reads of live search (no crawling, API, or token replay); result counts read deterministically from the page's embedded total; **relevance graded by a local LLM judge (Cortex / llama3.2:3b), NDCG@10.**
**Judge caveat:** the Cortex judge initially mis-read measurement notation (`1/2-in` ≠ `1/2 inch`) and produced spurious 0s; a validated prompt fix was applied and confirmed before scoring (notation cases went from grade 0 → correct, stable across re-runs). Counts are deterministic and independent of the judge.
**Status:** Synonym + Dimensions complete on both retailers; Pro/job-function preliminary (retailer throttling paused capture).

---

## Headline

| Dataset | What it measures | Home Depot | Lowe's | Winner |
|---|---|---|---|---|
| **Synonym / category** | Do equivalent terms return equivalent results? | **30%** consistent (7/23) | **48%** (11/23) | Lowe's |
| **Dimensions — relevance** | Are top-N results relevant? (NDCG) | **0.90** | **0.88** | ~tie (HD edge) |
| **Dimensions — notation** | Count stable across notation variants? | fails on **hyphenation** | fails on **unit-words** | different failure modes |
| **Dimensions — hash/spec** | Does `#N` spec change results correctly? | **ignores** the `#` | **over-reacts** to the `#` | neither reliable |
| **Pro / job-function** | Project/trade queries return the right kit? | **0.83** (16/20 return products) | **0.78** (17/20) | ~tie (HD edge) |

**One-line takeaway:** On plain notation both engines are decent and near-identical (~0.85 NDCG). They diverge sharply on **industry specs** (`#57 stone`, `#7 drill bit`): **Home Depot collapses the spec** and returns generic in-category products; **Lowe's fragments on the `#`** and often derails to the wrong category entirely — though Lowe's *plain* form frequently recovers the true product where HD never does.

---

## Dataset 1 — Synonym / category mapping (23 pairs)

Equivalent-term pairs (e.g. `drywall`/`sheetrock`, `circular saw`/`skil saw`, `weed killer`/`roundup`). Score = share of pairs whose result sets are consistent.

- **Home Depot 30% (7/23)** — fails more synonym equivalences (e.g. `drywall` 2,411 vs `sheetrock` 33 — a 99% divergence; `concrete mix` 20 vs `quikrete` 643).
- **Lowe's 48% (11/23)** — better synonym handling, but still misses about half.

**Read:** Lowe's has the stronger synonym/brand-equivalence layer.

---

## Dataset 2 — Dimensions: notation & hash (the deep dataset)

32 coverage-complete queries per retailer spanning all 12 transformation types across fasteners, plumbing, electrical, rebar, aggregate, chain, roofing, drill bits, felt. Three metrics: **NDCG@10** (relevance), **count-band ratio** (notation), **SKU-overlap Jaccard** (hash).

### 2a. Relevance (NDCG@10): a near-tie — HD 0.85, Lowe's 0.85
Both return *relevant* products for most dimensional queries. The interesting differences are in the other two metrics and in *which* queries drag each down.

### 2b. Notation (count-band): they break on different transforms
Notation variants *should* return ~the same count as the reference.

- **Home Depot** — robust to spacing/decimal/AWG, **breaks on hyphenation**: `1/2-in screw` returns ~30% of `1/2 in screw` (a real recall cliff from the hyphen). Relevance of what it *keeps* stays high (NDCG 0.99), so this is a **recall** failure, not a ranking failure.
- **Lowe's** — robust to hyphen/decimal, **breaks on unit-words**: `10 foot cable` returns 5% of `10 ft cable`; `15 lb felt` returns 6.6× `#15 felt`. Lowe's treats `foot`/`lb` word-forms as different queries.

### 2c. Hash / spec (`#N`): the defining difference
`#57`, `#4`, `#7` etc. are hard industry gradations. Jaccard = overlap between the `#`-form and the plain form (low overlap = engine treats them as distinct).

- **Home Depot IGNORES the `#`** (high overlap): `#57 stone` ≈ `57 stone` (J=0.67), `#4 rebar` ≈ `4 rebar` (J=0.43). It returns the **same generic in-category set** either way — so it never surfaces the true `#57` gradation (returns generic landscape rock for both).
- **Lowe's OVER-REACTS to the `#`** (near-zero overlap, J≈0): the `#`-form and plain form are **completely different result sets**. This cuts both ways:
  - `#57 stone` → **window blinds, quartz sinks, a "Restricted Area" sign** (catastrophic), but `57 stone` → **real #57 aggregate** (4 precise results).
  - `#7 drill bit` → **mag drill presses & diamond core bits**, but `7 mm drill bit` → **real twist bits**.
  - `#15 felt` → **felt bag-shapers**, but `15 in felt` → **real roofing felt** (GAF, Warrior).

**Spec comprehension scorecard (does the retailer find the actual spec'd product?):**

| Query | Home Depot | Lowe's |
|---|---|---|
| `#4 rebar` | ✅ real #4 rebar (mixes in benders) | ✅ real #4 rebar |
| `#7 drill bit` | ✅ real #7 bits | ❌ drill presses / core bits |
| `#57 stone` | ❌ generic gravel (ignores #57) | ❌ blinds/sinks (`#`) → ✅ via `57 stone` |
| `#40 roller chain` | ❌ mixed chains/chainsaw | ✅ real #40 roller chain |
| `#15 felt` | ✅ real roofing felt | ❌ bag shapers (`#`) → ✅ via `15 in felt` |

**Read:** Home Depot is *stable but spec-blind* (collapses `#`, returns generic). Lowe's is *spec-aware but `#`-brittle* — it can find the exact gradation, but the `#` character frequently derails it to an unrelated category; dropping the `#` is often the better query on Lowe's.

---

## Dataset 3 — Pro / job-function (20 project & trade queries)

Natural-language project (`build a deck`, `tile a shower`) and trade (`electrician`, `welder`) queries with graded ground-truth category tiers (core=3, related=2, peripheral=1), judged for relevance to the project intent. **Both retailers: all 20 captured.**

**Mean NDCG: Home Depot 0.83 (16/20 return products) vs Lowe's 0.78 (17/20).** Closer than it first looked — **both retailers handle most project queries well**; they differ on a handful of specific queries and on how they treat install-intent and bare trade names.

**Where they agree:**
- **Both nail material/tool projects:** `build a deck`, `build a raised garden bed`, `insulate an attic`, `hang an interior door`, `pour a concrete slab`, `unclog a drain`, `fix a leaky pipe`, `welder`, `plumber tools`, `painter tools` all return the right core products on both.
- **Both fail bare trade names:** `electrician` and `landscaper` return **0 products** on *both* HD and Lowe's — the `<trade>` noun alone matches nothing; only the `<trade> tools` form works.
- **Both return accessories over core for some trades:** `carpenter tools` → tool belts/pencils (not saws/hammers) on both.

**Where they differ:**
- **Install-intent:** Home Depot **redirects `install a toilet` / `install a ceiling fan` to its paid installation service** (0 products). Lowe's returns products (or nothing) instead of a service.
- **Lowe's genuine weak spots:** `replace a kitchen faucet` → **5 results (a stray wire listing)**, `install a toilet` → **0**, `paint a room` → **4 off-target** — Home Depot returns real faucets / paint for these.
- **HVAC:** HD `hvac technician` → manifold gauges/clamp meters (core); Lowe's → fans/heaters (weaker).

**Data-quality note:** an initial Lowe's pass under-counted because Lowe's renders results slowly (≈9–10 s); several queries first read as empty and were **render-timing artifacts, not real failures** — corrected here with a longer capture wait. A couple of Lowe's "NDCG 1.0" scores are **uniformly-marginal** sets (every item graded 1, making NDCG trivially 1.0) — read them with the grades, not the score alone.

**Read:** For project/trade shopping the two are **close**, with a slight Home Depot edge. Both understand most project phrasings; the real differentiators are HD monetizing installs as services and a few specific Lowe's queries (faucet/toilet/paint) that return little.

---

## How to read this in the app

The dashboard's Home-Improvement search view now shows a **dataset × retailer scoreboard with all three datasets**. Each dataset drills to **per-query NDCG**, and each query expands to **per-product grades** (3 perfect → 0 irrelevant) with the judge's one-line reason, plus count-ratio and SKU-overlap chips (dimensions).

## Caveats
- **Title-truncation fix (applied to both retailers' fasteners):** the coverage run first sent titles truncated to 48 chars, clipping the product noun (e.g. "…Wood Screw"). Re-judging the 10 fastener queries per retailer on **full titles** corrected both under-scores (HD fasteners 0.785 → 0.895; Lowe's `1/2" screw` 0.43 → 0.84) and a few over-scores (negation/metric cases the judge could only read once full). Both retailers' dimensions are now **0.87**. The 22 non-fastener queries per retailer stay on the original 48-char capture (nouns like Pipe/Rebar/Socket fit within 48 chars — minimal impact). Count-band, Jaccard, synonym scores, and qualitative findings were never affected (counts/ids/full-title reads).
- **Judge defect found & fixed (deployed):** `no 8 wood screw` first scored low because the judge mis-read the "No." abbreviation (graded a `#8 … Wood Screw` as 0, "No 'no' or 'number' in screw size" — demanding the literal token or reading "no" as negation). `no 8` = `No. 8` = `#8`, so it should be 3. The fix is now **live in Cortex's default rubric**; re-judged, `no 8 wood screw` grades correctly (HD 0.91, Lowe's 1.00), which lifted dimensions to HD 0.90 / Lowe's 0.88. Determinism is restored per the Cortex deployment note.
- 32-query coverage-complete slice of the dimensions dataset (all 12 transformation types; not all 41 case pairs). Pro is preliminary.
- Result counts fluctuate modestly between reads on both sites; ratios use same-session reads where possible.
- NDCG depth varies (HD @10, Lowe's @6–10 where its primary grid is shallower); Cortex reports true `k` per query.
- The 3B judge has a small ±1 boundary wobble on corner cases; the systematic notation defect it originally had was fixed and re-validated before scoring.
