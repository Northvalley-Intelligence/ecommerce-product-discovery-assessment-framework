# Handoff: GEN-013 Dashboard Dataset Viewer

**Stream:** `stream_mra8o4fq_47ae08ab`
**Project:** Ecommerce Evaluation Reports (`ecommmerce-eval`)
**Date:** 2026-07-14
**Status:** Complete and validated locally (VAL-052). Kept local per Ferosh's 2026-07-13 directive — no push, no deploy.

## What was added

An intelligent in-app dataset viewer inside the existing inspection dashboard (`src/evaluator/dashboard-server.mjs`, served at `http://localhost:4173`). No new dependencies, no build step — same single-file, no-build approach as the rest of the dashboard.

### Server (new API routes)

- `GET /api/datasets` — catalog of browsable data artifacts, grouped as: Evaluations, Targets, Query Packs, Site Profiles, Platform Registries, Inspection History, and Generated Run Datasets (DS1–DS4 discovered per inspection-history run under `<run>/evidence/datasets/`, tagged with their inspection id).
- `GET /api/dataset?path=<repo-relative>` — parses a `.json`/`.jsonl` file into table-ready records with a scanned field list. JSON manifests that carry their records in an array field (e.g. `capabilities`, `queries`) are unwrapped, with the remaining manifest fields shown separately. Guards: repo-root path confinement (traversal → 400), `.json`/`.jsonl` only, 8 MB size cap, 1000-record response cap with explicit truncation flags.

### UI

- **Datasets tab** in the sidebar (next to Inspections) with a grouped file navigator.
- **Viewer pane**: file header (path, format, size, modified, raw-file link), manifest panel when applicable, and a records table with live search, per-field filtering, prioritized columns (id/name/query/status-like fields first), and click-to-expand full record detail.
- **Deep links**: `#dataset=<path>&q=<query>` hash routes, so any view is linkable and survives reload.
- **Links from findings**: the DS1–DS4 panel and plugin evidence files now offer "View" links into the viewer; platform capability gaps in Report Readiness link to the capability registry with the capability id pre-searched.

## How to reach it

Run `npm run dashboard`, open `http://localhost:4173`, click the **Datasets** tab — or follow any View link from an inspection's Datasets/Plugin State/Report Readiness panels.

## Validation

- `npm run validate:dashboard` — extended with dataset viewer assertions (catalog groups, JSON/JSONL/manifest parsing, run-dataset linkage, traversal and extension rejection). Pass.
- `npm run validate:gen13` — pass (known warn: pre-cache-metadata Ridge run).
- `npm run validate` — pass (known BDD-012 deferred warning).
- Live Chrome check against port 4173: tab switching, navigator, deep link with prefilled search filtering 4 of 8 history records, record detail rendering, and the DS1 View link from a Dress Up inspection. No console errors.
- Recorded as `.mde/validation-runs/VAL-052.json`. This was an implementation change after VAL-051, so the Validation Gate clean-pass count restarts at one.

## Explicitly out of scope (per delegation)

Rendered page capture and browse-graph extraction — untouched, reserved for the separate upcoming step.

## Files touched

- `src/evaluator/dashboard-server.mjs` — dataset API routes + Datasets tab UI.
- `src/evaluator/validate-dashboard.mjs` — dataset viewer validation coverage.
- `.mde/validation-runs/VAL-052.json`, `.mde/state.json`, `MISSION_UPDATES.md` — bookkeeping.
