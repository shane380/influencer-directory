# Cash Forecast Contract — influencer-directory → nama-inventory cash planner

Version 1. This document is the seam between the two apps: influencer-directory
(Supabase) serves it, the nama-inventory cash planner (Neon/Prisma) consumes it.
Change the shape only by bumping `version` and updating this file in the same PR.

## Purpose

The inventory app's cash planner (13-week grid of `CashFlowLine`/`CashFlowCell`)
has a manual "Paid influencers" line in its `marketing` section. This endpoint
lets the planner auto-project that line from the directory's actual payment
obligations instead of a hand-typed guess.

## Ownership boundary (double-count guard)

- **influencer-directory owns:** deal/retainer installments, ad-spend
  commission, affiliate commission, one-off collab fees — everything in its
  `commission_events` / `creator_payouts` ledgers.
- **nama-calendar owns:** shoot-day fees (its `calendar_contractors` includes an
  `influencer` type feeding the planner's shoot lines).

This endpoint never includes shoot fees. If a creator is both shoot-booked and
on a deal, the two systems report different money and do not overlap.

## Endpoint

```
GET https://<influencer-directory-host>/api/integrations/cash-forecast
Authorization: Bearer <CASH_FORECAST_TOKEN>
```

Query params (both optional):

| param | default | max | meaning |
|---|---|---|---|
| `weeks` | 13 | 26 | forecast horizon in ISO weeks, starting from the current week |

Responses:

- `200` — JSON body below.
- `401` — missing/wrong bearer token.
- `503` — `CASH_FORECAST_TOKEN` is not configured on the server (endpoint
  disabled; fails closed).

Auth is a single shared secret. Set `CASH_FORECAST_TOKEN` in both apps' Vercel
env (same value); the planner's feeder sends it as the bearer token. All figures
are **USD** (the directory records a single currency).

## Response body

```jsonc
{
  "version": 1,
  "generated_at": "2026-08-29T17:00:00.000Z",
  "currency": "USD",
  "horizon_weeks": 13,
  "start_week": "2026-W35",          // current ISO week
  "weeks": [                          // exactly horizon_weeks entries, zero weeks included
    {
      "iso_week": "2026-W35",         // matches the planner's CashFlowCell.isoWeek format
      "total": 2450.00,
      "events": [
        {
          "source": "influencer",     // constant; extension point per the planner's CashEvent.source union
          "kind": "period_balance",   // or "deal_installment"
          "label": "Aug 2026 commissions balance",
          "creator": "Jane Example (@janeexample)",
          "amount": 800.00,
          "expected_date": "2026-09-30",
          "confidence": "confirmed",  // or "estimated" — planner's CashEvent union
          "reference": "period:2026-08:inf:<influencer_id>"
        }
      ]
    }
  ],
  "beyond_horizon": { "total": 1200.00, "count": 2 },   // dated obligations past the horizon
  "unscheduled":    { "total": 900.00,  "count": 1,      // committed money with no determinable date
                      "events": [ /* same event shape, expected_date: null */ ] }
}
```

`reference` is stable across calls (period+creator key, or deal+milestone id),
so the consumer can diff or dedupe between refreshes.

## Semantics — what counts as an obligation, and when

Two sources, mutually exclusive by construction:

1. **`period_balance` (confidence: confirmed).** Earned-but-unpaid balances from
   the ledgers, per creator per period: `commission_events` earnings minus
   payouts FIFO-allocated exactly as the payments-v2 page does
   (`allocatePayments` — pinned `covers_period` payments settle their month
   first, pooled payments fill oldest months first; deal-milestone payments
   recorded on the deal are included). Expected date = the period's contractual
   due date (`dueDateForPeriod`: end of the following month under the current
   Creator Terms). A balance already past its due date lands in the **current
   week** — overdue cash is assumed to leave ASAP.

2. **`deal_installment`.** Future installments of committed deals
   (`deal_status` active/closed) whose gate has **not yet been met** — these are
   not in the ledger yet (unearned money is never booked), so there is no
   overlap with source 1. Dating and confidence follow the milestone's gate:
   - `on_date` gate with a future `due_on` → that date, **confirmed** (the
     calendar will pass; e.g. whitelisting month fees).
   - `on_execution` gate with a future `starts_on` → that date, **confirmed**.
   - content-delivery / manual gates with a `due_on` → that date, **estimated**
     (the date is a plan, the gate is the content).
   - content-delivery / manual gates with no date → **`unscheduled`** bucket
     (amount reported, not placed in any week).

   Installments are expected to be paid the week their gate date falls in —
   deal money moves at the gate, not on the monthly commission cycle.

**Not included (possible v2):** projected *future* ad-spend / affiliate
commissions (months that have not accrued yet). Only booked balances and
committed deal terms are reported; the forecast never invents revenue-dependent
figures. If the planner wants a trailing-average estimate for those, that is a
new `kind` and a version bump.

## Consumer guidance (nama-inventory side)

- Tag the existing seeded `marketing` / "Paid influencers" `CashFlowLine` with
  `externalId: "influencer_payouts"` via the `ensureDefaultLines()` retrofit
  pattern.
- Add `influencer-payout-projection.ts` beside the other feeders; fetch this
  endpoint at planner load, map `weeks[].total` to the line's auto values and
  `weeks[].events` to `CashEvent[]` drill-ins (`source: "influencer"`).
- **Fail soft** like the shoot-obligations feed: on non-200, timeout (suggest
  ~5s), or fetch error, the line simply stays manual. Never block planner load.
- Auto values are computed at load and not persisted, matching planner design.
- Surface `unscheduled.total` as a note/tooltip rather than a cell — undated
  money placed in an arbitrary week is worse than a visible caveat.
