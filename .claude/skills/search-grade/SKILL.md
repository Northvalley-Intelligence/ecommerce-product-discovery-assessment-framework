---
name: search-grade
description: Grade captured search results for relevance with the pinned local Cortex judge — per-product 0–3 grades and NDCG — after validating the judge against a hand-labeled gold set. Produces grades.json. Use as stage 5 of an ecommerce search assessment, or when asked to score search relevance, run NDCG, or judge result quality.
---

# Search grade

**Stage 5 of 8.** Enforces **L02**, **L03**. See `framework/search-eval/LESSONS.md`.

| | |
|---|---|
| **Input** | `captures.json` |
| **Output** | `grades.json` — `schemas/search-eval/grades.schema.json` |
| **Gate** | one `rubric_hash` across every job; `gold_validation` present with ≥20 pairs |
| **Scripts** | `framework/search-eval/scripts/cortex-submit.mjs`, `cortex-poll.mjs` |

Cortex at `127.0.0.1:7077`, `llama3.2:3b`, temperature 0.

## 1. Validate the judge before trusting it

**L03.** Hand-label ~30 (query, product) pairs from this store's own captures — not a
generic set, because relevance is vertical-specific. Score the judge on **binary**
relevant-vs-not agreement. Industry West reached 94%.

Record `pairs`, `binary_agreement`, `validated_at` and the gold set path. A grade
without this is a number nobody can defend when a client pushes back.

**Known bias, state it every time:** the judge under-penalizes cross-category junk,
grading 1 where a human says 0. That direction is conservative for a noisy-search
finding — it understates the problem rather than inventing one — which is exactly why
it's safe to report and dishonest to omit.

## 2. Pin the rubric

**L02.** Cortex's default rubric can change, so results are reproducible only at a fixed
one. `cortex-poll.mjs` records `rubric_hash`. Every job in an eval carries the same
hash; if one differs, re-run everything under a single hash rather than mixing.

## 3. Pipeline against capture — don't wait

Both stages are slow, so overlap them. Grade chunk N while chunk N+1 captures:

```
capture chunk 1 → flush → submit job(chunk 1) ┐
                                              ├ enterprise cooldown IS the slack
capture chunk 2 → flush → submit job(chunk 2) ┘
...
poll all job_ids at the end
```

Wall-clock becomes `max(capture, grade)` rather than their sum. One Cortex job holds
many queries, so batch several terms per job. Keep every `job_id`.

## 4. Grade what came back, not what didn't

A term returning zero results has **no grades** — an empty array, not `[0]`. Zero
results is a coverage failure, measured by the board; feeding it into a grade average
double-counts it and drags the precision number toward a problem that is already
counted elsewhere.

Set `partial: true` and `graded_count` if any captured term went ungraded, so the board
can show which.

## Do / Don't

- **Do** validate on a store-specific gold set, pin one rubric hash, pipeline against capture, state the judge's known bias, leave zero-result terms ungraded.
- **Don't** mix rubric hashes in one eval, claim reproducibility without a hash, grade a zero-result as 0, or reuse another store's gold set.
