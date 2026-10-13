# cogvana-kpi

Read-only KPI pipeline for the SAMUHIA / Cogvana platforms. Phase 1: PAY money KPIs
(per platform, per charge type, per revenue stream) and company-level rollups.

```
SOURCES (read-only)        COLLECTOR              STORE (this project)        CONSUMERS
PAY-written records  ───►  adapter per       ───►  kpi_definitions       ───►  kpiGetValues (callable)
in 3 Firestore DBs         charge type              kpi_values                 dashboard (Phase 4)
platform_stats/totals ───► snapshot job             kpi_runs                   alerts (Phase 5)
```

## Layout

| Path | Purpose |
|------|---------|
| `functions/src/core/` | Types, Nairobi-time periods, timestamp normaliser, money, registry helpers, store, shared Firestore reader (queries, counts, sums) |
| `functions/src/registry/` | KPI definitions as data (`pay.ts`, `register.ts`, `chama.ts`, `pms.ts`, `cyber.ts`, `company.ts`) |
| `functions/src/collectors/pay/` | Facts model, Firestore reader, one adapter per charge type, aggregation, stats snapshot |
| `functions/src/collectors/register/` | Register collector: registers, messages, SMS log, token sales, growth, stock snapshot |
| `functions/src/collectors/chama/` | Chama collector: money ledger, SMS, growth, plans, loans, overdue, MGR stock snapshot |
| `functions/src/collectors/pms/` | Plot Yangu collector: accounts, plans, trials, sync health, billing, receivables, portfolio (as of last sync) |
| `functions/src/collectors/cyber/` | Cyber collector: WhatsApp usage only (exact via the meter, approximate from sessions) |
| `cyber-whatsapp-meter/` | 3 files to copy into the CYBER repo so exact WhatsApp usage is recorded |
| `functions/src/rollups/company.ts` | Company totals summed from platform values |
| `functions/src/jobs/run.ts` | Idempotent run orchestration, freshness, run logging |
| `functions/src/index.ts` | `kpiDaily`, `kpiStatsSnapshot`, `kpiBackfill`, `kpiGetValues` |
| `functions/src/scripts/dryRun.ts` | Read-only check against real data (writes nothing): `npm run dry-run -- DATE [pay\|register\|chama\|pms\|cyber]` |
| `functions/src/scripts/backfill.ts` | Local backfill for a date range (writes to the KPI project) |
| `docs/` | Glossary and source-of-truth map |
| `source-indexes/` | Indexes to merge into the Chama repo (optional, speeds up reads) |

## Setup

Full step-by-step, including IAM commands: **`docs/SETUP.md`**.

## Schedules (Africa/Nairobi)

- `kpiDaily` 02:00: recomputes the last 3 complete days (late payments correct earlier figures), then publishes data freshness.
- `kpiPmsRefresh` Mondays 03:30: recomputes the last 21 days of Plot Yangu values (devices sync late).
- `kpiStatsSnapshot` 23:55: snapshots PAY's `platform_stats/totals` counters plus Register and Chama stock counts (schools, members, plans, loan book, overdue, MGR, unspent credits), none of which keep history.

## Adding a charge type

1. Write an adapter in `collectors/pay/adapters/` (one file: database, collection, status mapping, revenue formula).
2. Register it in `adapters/index.ts` and add it to the two maps in `facts.ts`.
3. Add a test with real-shaped documents.

## Rules this code follows

- Collectors only read, and always list the fields they need (never whole documents; a password hash or phone number is never fetched).
- Money is integer cents. Days are Nairobi days. Every value has a deterministic id, so re-runs overwrite.
- A failed adapter fails the run loudly; the company rollup for that day is not published rather than understating revenue.
- Any figure that rests on a rate or a missing fee is counted in `pay.net_revenue_unverified`.

## Catalogue

`npm run catalogue` (in `functions`) regenerates `docs/kpi-catalogue.json` and `.md` from the registry. Hand these to anyone building on the KPIs.
