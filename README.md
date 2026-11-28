# Token Launch Radar v4 — `radar-v4-ridge-odds`

[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/santrilogy-com/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/santrilogy-com/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot, ranks the
protocols that record no token by an implied value from a ridge model
calibrated on the live-token protocols in the same snapshot, and shows each
protocol's costed farm plan on a static, offline dashboard.

## What changed from v3

- **Value model is now a ridge regression** on ln(mcap/TVL): intercept +
  size curve ln(TVL) + ridge-shrunk category effects (λ = 30, tuned by
  leave-one-out), plus a leave-one-out level factor. Growth, age and chain
  count were each tested against TWO held-out tests (leave-one-out AND
  walk-forward on two listing-date cuts) and all three failed — they are
  reported on the dashboard as tested-not-kept, with their numbers. A
  negative control (permuted growth) does not improve LOO.
- **Token odds**: logistic P(has token) over all 758 protocols, 5-fold
  cross-validated (Brier 0.213 vs 0.248 baseline; 66.2% called right vs
  54.9%). Walk-forward FAILS — the share of listed protocols with a
  token fell from 74% to 38% between eras, so the intercept does not
  travel. The dashboard says so plainly: odds are cross-sectional, not a
  time-to-listing forecast.
- **Intervals**: P25–P75 / P10–P90 from the leave-one-out log-residuals;
  split-half coverage ~52% / ~77% against targets 50% / 80%.
- **Bootstrap**: 200 seeded refits; coefficient ranges and top-10 rank
  ranges on the dashboard.
- **Farm economics**: every row carries a costed verdict (modelled drop,
  fees, hours, net vs a 4% T-bill, net/hour) under stated assumptions,
  a 10-step plan, and a net table by drop share × deposit.
- **Integrity strip + accounting**: 758 = 200 ranked + 416 token +
  142 pre-token not ranked; the strip recomputes rows, ranks, order,
  total and watchlist coverage live in the browser, with the entry
  program's sha256 (first 8 hex) as checksum.

## Backtest (leave-one-out, 128 live-token protocols)

| | MdAPE | med\|ln\| | within-2× | bias | miss |
|---|---|---|---|---|---|
| v3 | 86.4% | 1.339 | 28.9% | +0.1% | ×3.74 |
| **v4** | **84.8%** | **1.306** | **32.0%** | **0.0%** | **×3.69** |

Walk-forward miss: ×2.95 vs ×4.17 flat (cut 2024-07-01), ×2.87 vs
×5.25 flat (cut 2025-01-01). The value-model win is real but thin
(MdAPE −1.6pp against a 1.4pp split-half noise floor) — see `BUILD-v4.md`
for the honest verdict.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22 or later, standard library only, no network. Run it twice: the two
outputs are byte-identical.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes `board.json`, `data.js`,
  copies `dashboard/` and `screenshots/`, writes `dossier.json`.
- `lib/model.ts` — the ridge value model, token odds, intervals, bootstrap,
  the board builder and the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library (vendored).
- `dashboard/` — the offline page: board, detail view, filters, model panel,
  evidence strip.
- `screenshots/` — board, detail and filtered views of the dashboard.

Built for the [make.fun](https://make.fun) bounty
[Build the best token launch radar](https://make.fun/bounty/token-radar-01).
