<title>GEN-013 Clarification Decisions — Ecommerce Evaluation</title>

# GEN-013 Open Clarification Decisions

**Project:** Ecommerce Evaluation Reports (`ecommmerce-eval`)
**Phase:** Generation 13 — Inspection Report Framework
**Status:** Awaiting operator decision · Validation Gate at 1 of 2 passes
**Source:** `.mde/state.json` → `open_clarifications` (updated 2026-07-11)

> **Charter update (2026-07-11):** Ferosh clarified the expected deliverable for this stream — a **local application** that runs inspections on different ecommerce websites, helps fix the issues it finds, and generates an executive-ready report showing platform issues, suitable for sending to executive leadership and potentially monetizable. Each decision below has been re-framed against that deliverable. The recommendations were re-checked and all three still hold — the charter strengthens rather than changes them.

These three decisions are the only open clarifications blocking a clean path to GEN-013 phase exit. None block the second Validation Gate pass directly, but all three shape how the next 10–20 real inspections are run and recorded — and, under the charter, what the application can promise its users.

---

## Decision 1 — Raw artifact retention defaults

**Question:** What should the inspection platform keep by default for each evidence type — raw HTTP responses, HTML page sources, API payloads (Shopify product/search/suggest JSON), screenshots, and cached evidence — versus keeping only parsed observations?

**Current state:** Inspection runs write evidence into per-run output directories (`assessments/<target>/inspection-report/GEN-013/<inspection-id>/`), but there is no declared retention policy. What is kept today is whatever each plugin happens to write.

**Why it matters:**

- **Reproducibility** — the mission requires downstream executive and competitor reports to consume the Inspection Report instead of re-inspecting sites. That only holds if the backing evidence is retained.
- **Disk growth** — once 10–20+ real inspections run, unbounded raw retention has a real footprint.
- **Dataset integrity** — DS1–DS4 datasets can only claim evidence that is actually preserved.
- **Charter alignment** — the local application must re-render executive reports and verify fixes without re-inspecting sites; both depend on retained raw evidence per inspection.

**Options:**

| Option | Trade-off |
|---|---|
| **A. Retain everything (recommended)** | Raw API payloads and HTML compressed per run, screenshots as-is. Trivial volume at current scale; maximum reproducibility. Revisit with a pruning policy only when size becomes a real problem. |
| B. Retain structured summaries + samples | Smaller footprint, but downstream reports lose the ability to re-derive claims without re-inspection — which contradicts the mission's core premise. |
| C. Per-type policy now | Most precise, but designing a retention matrix before real usage data exists is speculative architecture — exactly what the GEN-14 planning gate warns against. |

**Recommendation:** **Option A.** Keep everything by default at this stage.

---

## Decision 2 — Inspection ID scheme: timestamp-based vs sequential

**Question:** Should Inspection IDs be timestamp-based or sequential within workspace history?

**Current state:** The implementation already uses timestamp-based IDs — inspection history records IDs like `GEN-013-20260708T151624Z` (generation prefix + UTC timestamp). Five runs exist in this format (four Ridge, one Dress Up).

**Why it matters:** IDs appear in output paths, checkpoint/resume records, the artifact index, and the dashboard. Changing the scheme later means a migration. Under the charter, IDs also become user-visible in the application's inspection history and report headers — timestamp IDs sort naturally there without any counter coordination.

**Options:**

| Option | Trade-off |
|---|---|
| **A. Keep timestamp-based (recommended)** | Already in use across five runs; collision-free without a counter file; sorts chronologically; self-describing. |
| B. Sequential (`INSP-001` style) | Reads nicer, but requires coordinated counter state and would force a migration of existing runs for no functional gain. |

**Recommendation:** **Option A.** Ratify the existing scheme — this is effectively a rubber stamp of what is already built.

---

## Decision 3 — Platform Capability maturity threshold for broad retailer inspections

**Question:** What minimum capability maturity is required before running inspections across many retailers, versus the current bounded single-target pilots?

**Current state:** The registry defines 14 capabilities across three maturity levels:

| Level | Name | Capabilities | Status |
|---|---|---|---|
| 1 | Network and access basics | P001–P004, P009, P010 | Implemented |
| 2 | Shopify discovery surfaces | P005–P007, P011–P014 | Implemented |
| 3 | Rendered storefront surfaces | P008 (rendered capture) | Planned |

Ridge inspections currently complete as `partial` with Low confidence and 33% evidence coverage.

**Why it matters:** This is the gate between "bounded pilot" and "broad sweeps." Too low, and the platform generates many low-confidence Inspection Reports. Too high, and it blocks the 10–20 real inspections the validation strategy explicitly wants before any new architecture. Under the charter this threshold is also a product boundary: it defines which ecommerce websites the local application can credibly accept as inspection targets per platform type.

**Options:**

| Option | Trade-off |
|---|---|
| **A. Level 2 for Shopify targets, Level 3 for non-Shopify (recommended)** | Start accumulating real inspections soon on Shopify targets — where all existing evidence tooling lives — without waiting on rendered capture. |
| B. Level 3 for everything | Safest evidence quality, but blocks all broad inspection work behind P008, which is still only planned. |
| C. Level 1 sufficient | Unblocks everything immediately, but produces low-confidence reports that undermine the Inspection Report as a canonical artifact. |

**Recommendation:** **Option A.** Require Level 2 (Shopify discovery surfaces validated) for broad Shopify retailer inspections; require Level 3 (rendered capture) before non-Shopify or heavily rendered storefronts.

---

## How to respond

Reply with your call on each decision (e.g. "1A, 2A, 3A" or any variation). Decisions will be recorded in `.mde/state.json`, `MISSION_UPDATES.md`, and the validation strategy before the second Validation Gate pass toward GEN-013 phase exit.
