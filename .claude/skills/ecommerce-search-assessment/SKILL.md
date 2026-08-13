---
name: ecommerce-search-assessment
description: Run a complete on-site search relevance assessment for an ecommerce retailer end to end — catalog, query pack with recall, engine profile, capture, grading, independent verification, board and branded PDF report. Use when asked to evaluate or benchmark a store's search, find broken searches, quantify what bad search costs, compare two storefronts, or produce a search findings board or client report.
---

# Ecommerce search assessment

The orchestrator. It sequences eight stage skills and checks the artifact contract
between each one. **It carries no lessons of its own** — those live in
`framework/search-eval/LESSONS.md`, owned by the stage that enforces them. Two copies
of a lesson is one copy that will drift.

## Why stages are skills, not scripts

Discovery is the work. Finding the real search endpoint on Shopify has nothing in
common with finding it on WooCommerce, and the next platform will be different again —
Cat Footwear turned out to be Salesforce Commerce Cloud, which matched no existing
recipe. A script would have to be rewritten per store; the *design* must not be.

So each stage is a skill that adapts its method, and the **contract is what stays
fixed**. You cannot observe that a skill "ran". You can observe whether it produced an
artifact meeting its schema, and that is what gets checked.

## Set up

```sh
EVAL=assessments/<retailer>/search-eval/SE-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$EVAL"
```

Every artifact lands in that one directory. Nothing is written back to a previous eval.

## The stages

| # | Skill | Produces |
|---|---|---|
| 1 | `catalog-capture` | `catalog.json` |
| 2 | `category-recall-dataset` | `query-pack.json` |
| 3 | `search-engine-profile` | `engine-profile.json` |
| 4 | `search-capture` | `captures.json` |
| 5 | `search-grade` | `grades.json` |
| 6 | `finding-verify` | `verified-findings.json` |
| 7 | `search-board` | `eval-board.json` |
| 8 | `search-report` | `report-data.json` + PDF |

Demand and revenue slot between 6 and 7 via the existing `search-revenue-loss` skill,
once Keyword Planner volumes are imported.

## Check between every stage

```sh
node framework/search-eval/scripts/pipeline-status.mjs "$EVAL"
```

It prints each stage as ok / legacy / contract violated / gate failed / not run /
blocked, plus which lessons are claimed by a skill. Run it after each stage. A stage
that reports anything but `ok` does not get built on.

## Ordering, and what may overlap

Stages 1→2 and 3→4 are hard dependencies. **1–2 and 3 are independent** — profile the
engine while the catalog captures.

**4 and 5 must be pipelined, not sequenced.** Capture chunk N+1 while Cortex grades
chunk N; on enterprise stores the rate-limit cooldown between chunks is exactly the
slack grading fills. Sequencing them doubles the wall clock for no benefit.

**6 is a hard barrier.** Nothing may be reported before verification, and stage 8
refuses to run without it.

## The three refusals

These are the reason the pipeline exists. Do not work around them.

1. **Capture will not start on an unverified engine profile.** A convenience API returns plausible numbers and every downstream figure is then measuring the wrong engine.
2. **The report will not generate on unverified findings.** A capture artifact reaching a client as a statement about their engineering is the worst outcome this process can produce.
3. **Recall is not computed for keyless datasets.** `intent` and `job_function` have no answer key; averaging them into a recall figure invents a denominator.

## Resuming, and partial runs

Each stage reads files, not memory, so a run can stop anywhere and resume. Re-running a
stage overwrites its own artifact and nothing else.

A partial run is a legitimate outcome — a rate block that will not clear, a catalog with
no accessible API. Record it in the relevant artifact's `limitations` and let the board
show reduced coverage. **A partial assessment that says so is worth more than a
complete one obtained by evasion**, and far more than one whose gaps are invisible.

## Migrating an older eval

Point the visualizer at any pre-contract eval directory. Legacy filenames
(`*-terms.json`, `*-captures.json`, `*-ndcg.json`, `*-eval-board.json`) are recognised
and reported as `legacy shape`, so you can see exactly which stages need re-running
rather than starting from nothing.

Catfootwear's shipped eval reports 0/8 — it has no catalog, no engine profile, no gold
validation and no verification. The data is fine; the provenance was never captured.

## MDE

This repo runs Mission-Driven Engineering. Record findings, update
`.mde/validation-strategy.json` scenarios when a gate changes, and classify findings
Critical/High/Medium/Low before ending a session.
