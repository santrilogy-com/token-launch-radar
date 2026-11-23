# Token Launch Radar

[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/santrilogy-com/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/santrilogy-com/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot, ranks the
protocols that record no token by an implied value calibrated on the live-token
protocols in the same snapshot, and shows each protocol's farm plan on a
static, offline dashboard.

## How it works

The model is calibrated on the snapshot itself. For each category, the
live-token protocols are the comparables: the median of their
market-cap-to-TVL ratios is the category's base multiple (clamped to
0.05–0.60; categories with fewer than three comparables use the global
median). Each protocol is then scored as
`TVL x baseMultiple x growth x maturity x chainSpread`, where growth follows
its 7-day TVL change, maturity follows how long it has run with no token,
and chain spread follows how many chains it runs on. Live-token protocols
are shown apart, at the market's own value, never mixed into the ranking.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22 or later, standard library only, no network. Run it twice: the two
outputs are byte-identical.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes `board.json`, `data.js`,
  copies `dashboard/` and `screenshots/`, writes `dossier.json`.
- `lib/model.ts` — the calibrated model, the board builder and the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library (vendored).
- `dashboard/` — the offline page: board, detail view, filters, model panel.
- `screenshots/` — board, detail and filtered views of the dashboard.

Built for the [make.fun](https://make.fun) bounty
[Build the best token launch radar](https://make.fun/bounty/token-radar-01).
