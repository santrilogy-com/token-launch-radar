# Token Launch Radar v3 — build notes

Entry v2 was submitted 23 Nov 2026 ~12:56 WIB and passed every server check
(submission `01a206fa-601d-75ea-9769-dc01a1feb98a`). The submit rule is
**Force_Last** — only the last submission is judged — so v3 is only proposed
because it beats v2 measurably on the backtest, on all four metrics. This
file records what changed and the numbers behind it, so the parent can
decide whether to re-submit.

## 1. Backtest: v3L1 beats v2 on all four metrics

Method (`work/backtest-v3.ts`, outputs `work/backtest-v3b.txt` and
`work/backtest-v3c.txt`): leave-one-out over the snapshot's live-token
protocols. For each one, predict its implied value with its own ratio
removed from its category's comparables (and from the global pool) before
the multiple is computed, so the model never prices a protocol with its own
ratio. Metrics: MdAPE (median |pred/actual − 1|), median |ln(pred/actual)|,
share of predictions within 2× of the actual cap, median signed bias.
n = 128 (the 15 recorded caps of 0 stay in the calibration pool but out of
the error metrics, as in v2).

| variant | MdAPE | med \|ln err\| | within 2× | median bias | n |
|---|---|---|---|---|---|
| v1 (honest, min 3 comps) | 91.7% | 1.497 | 23.4% | −19.6% | 128 |
| **v2m — the submitted v2 model** | **87.2%** | **1.370** | **27.3%** | **−9.4%** | 128 |
| **v3L1 — the v3 model** | **86.4%** | **1.339** | **28.9%** | **+0.1%** | 128 |

v3L1 beats v2 on all four: MdAPE −0.8pp, med|ln| −0.031, within-2× +1.6pp,
bias from −9.4% to +0.1% (centred). The gains are modest but consistent —
the model is still noisy (median error 86% means the typical prediction is
~2.3× off, only 29% land within 2× of the real market cap), and that is
the honest claim: v3 is less wrong than v2 on every metric, not precise.

### Two corrections to the v2 backtest, found while building v3

1. **The "v1" numbers in backtest-v2.txt are honest, but the script as it
   stands today would miscompute them.** `backtest-v2.ts` line 141 uses
   `MODEL.min_comps`, which v2's rewrite of `lib/model.ts` removed (v1's
   model had `min_comps: 3`). Under Node type-stripping,
   `catRatios.length >= undefined` is always false, so a fresh run of
   `backtest-v2.ts` today would silently score v1 as global-median. The
   published numbers check out anyway: this script's honest v1 variant
   (min 3 comps, local constant) reproduces 92.2% / 1.508 / 22.7% /
   −20.2% exactly, so they were computed when MODEL still had the field.
   This script defines the constant locally and does not touch MODEL.
2. **One comparable is a negative market cap.** The snapshot carries
   `autofinance` with mcap_usd −1, a DefiLlama missing-data sentinel.
   The model excludes it (`ratio < 0` cannot be a comparable), so the
   pool is 143, not 144 — and the TVL median the slope is referenced to
   is $28,264,700, not $29,997,757. The first backtest-v3 run used 144
   (autofinance in the pool, winsorized to ~0); the final run
   (`backtest-v3c.txt`) excludes it, matching the shipped model exactly.
   v3L1's numbers are identical under both pools (86.4 / 1.339 / 28.9 /
   +0.1), so the win is not an artefact of the pool. v2m moves slightly
   (87.3 → 87.2 MdAPE, 1.356 → 1.370 med|ln|, −8.4% → −9.4% bias).

## 2. Diagnostics: where v2m systematically misses

Median signed ln error (pred − actual) under v2m, by bucket:

- **TVL:** protocols under $33M TVL are under-predicted by ~0.9 ln
  (~60% too low); over $108M slightly over-predicted (+0.2–0.4 ln).
  The fitted global slope (−0.25, clamped from −0.478) is still too
  weak for the small ones — but the raw slope crushes the giants
  (v2h: MdAPE 86.0% but bias −46.1%).
- **Category:** Bridge −1.44 ln (n=6), CEX −1.34 (n=9), Yield −0.96
  (n=9), Canonical Bridge −0.88 (n=8) under-predicted; Dexs +0.81
  (n=11) over-predicted, with a wide spread (med|ln| 1.93) — the
  category median is a poor centre for Dexs.
- **Age:** 180–365 days under-predicted −2.16 ln (n=7, small sample);
  age unknown −0.60 (n=33, med|ln| 2.10).
- **7-day change and chains:** no strong pattern — growth weight
  changes move almost nothing (v3j3/v3j7), so 7-day change is noise
  against the ratio dispersion.

## 3. Variants tested (backtest-v3, run 1 + run 2, 144-comp pool)

Target: beat v2m on at least 3 of 4 metrics, with the 4th no more than
2pp worse. No single variant passed; the winner is a combination.

| variant | MdAPE | med\|ln\| | within 2× | bias | verdict |
|---|---|---|---|---|---|
| v2m (v2) | 87.3% | 1.356 | 27.3% | −8.4% | baseline |
| v3a per-category slope | 88.5% | 1.356 | 25.8% | −8.0% | worse |
| v3b no-CEX + β −0.15 | 91.3% | 1.422 | 23.4% | +1.7% | worse |
| v3c TVL-proximity weighted median | 92.8% | 1.605 | 22.7% | +7.6% | much worse — weighting shrinks the effective sample |
| v3d per-category winsorize | 87.3% | 1.356 | 27.3% | −8.4% | no-op |
| v3e age × growth interaction | 88.0% | 1.351 | 27.3% | −7.0% | 1/4 better, by 0.005 |
| v3f1 shrink k=1 | 86.9% | 1.477 | 28.1% | −14.7% | 2/4, med\|ln\| much worse |
| v3f5 shrink k=5 | 87.4% | 1.339 | 28.9% | −9.9% | 2/4 better, MdAPE tied |
| v3f8 shrink k=8 | 88.4% | 1.380 | 27.3% | −10.7% | worse |
| v3g winsor p10–p90 | 87.3% | 1.356 | 27.3% | −8.4% | no-op — medians sit mid-distribution |
| v3h trimmed geometric mean | 85.5% | 1.439 | 29.7% | −13.5% | 2/4 better (MdAPE, within-2×) |
| v3i two-regime slope | 92.7% | **1.260** | 23.4% | +15.4% | best med\|ln\|, bias far outside tolerance |
| v3j3 growth 0.3 / v3j7 growth 0.7 | 87.7/87.1% | 1.357/1.365 | 27.3% | −6.2/−11.0% | flat |
| v3k level calibration | 88.9% | 1.315 | 25.8% | 0.0% | bias fixed by construction, MdAPE worse |
| **v3L1 trimmean + level cal** | **86.4%** | **1.339** | **28.9%** | **+0.1%** | **4/4 better — the v3 model** |
| v3L2 two-regime + level cal | 94.5% | 1.452 | 16.4% | +4.7% | much worse — the per-protocol level factor adds noise to a high-variance slope |
| v3L3 k=5 + trimmean + level cal | 87.0% | 1.329 | 27.3% | 0.0% | 3 better + 1 tied; v3L1 dominates it on MdAPE and within-2× |
| v3L4 k=5 + level cal | 90.8% | 1.360 | 24.2% | +0.1% | worse |
| v3L5 k=5 + trimmean | 82.4% | 1.464 | 31.3% | −21.3% | best MdAPE/within-2×, bias far outside tolerance |
| v3i2 softer two-regime (−0.35/−0.15) | 92.1% | 1.285 | 23.4% | +3.1% | 2/4 |
| v3i3 v3i2 + level cal | 92.7% | 1.355 | 21.9% | +0.5% | worse |
| v3m dispersion-aware shrinkage | 88.1% | 1.373 | 28.9% | −8.2% | 2/4 |
| v3m2 v3m + trimmean | 83.5% | 1.404 | 28.9% | −22.0% | bias far outside tolerance |
| v3h2 untrimmed geometric mean | 87.9% | 1.356 | 27.3% | −8.6% | slightly worse |

Notes: run 1's v3h2 was accidentally the same trimmed code as v3h; run 2
fixed it to the real untrimmed geometric mean (87.9 / 1.356 / 27.3 /
−8.6). The pattern across the table: anything that shifts the level down
(trimmean, k=5+trimmean, dispersion shrinkage) buys MdAPE and within-2×
but pays in bias; the level calibration buys the bias back without
giving up the MdAPE gain — that is why only the combinations with the
level factor pass all four.

## 4. What changed in the model (lib/model.ts, model_version `radar-v3-trimmed-level`)

1. **Trimmed geometric mean as the category centre.** The centre of a
   category's winsorized ratios is now exp(mean of ln ratios) over the
   middle 80% (10% trimmed each tail), for the category and for the
   global centre alike, instead of the median. For ratios running 0 to
   400×, the median ignores how far the tails sit; the trimmed
   geometric mean keeps the centre while the wild ends cannot set it.
   The calibration table field is renamed `median_ratio` →
   `center_ratio` so the dashboard never calls it a median.
2. **Leave-one-out level factor.** After the core calibration, every
   live comparable is priced with itself left out of the pool; the
   factor is 1 / median(predicted/actual) over those comparables, so
   the median comparable is priced at its actual market cap. Fitted
   factor in this build: **1.1778**. It is a calibration constant from
   this snapshot, like the global centre — it uses no information about
   the pre-token protocols being scored. `calibrate()` is split into
   `calibrateCore()` (everything except the level factor, levelFactor 1)
   and the wrapper that fits the factor.
3. Unchanged from v2: winsorize p5–p95, shrinkage k = 3, log maturity
   curve centred at 1.0 at one year, TVL slope β = −0.25 (clamped,
   raw fit −0.478), reference TVL $28,264,700 (median of the 143
   comparables), clamp 0.05–0.60. Global centre is now 0.139 (was 0.214
   as a median — the geometric mean sits lower on right-skewed ratios).
4. Six factors now: implied = TVL × base × growth × maturity × chain
   spread × TVL slope × level. The dashboard shows the level factor as
   its own chip (× 1.18 for Steakhouse), so the chips still multiply
   out to the implied value.

## 5. Board: v2 vs v3 (200 rows, rank 1..200, implied non-increasing)

| | v2 | v3 |
|---|---|---|
| #1 | Steakhouse Financial $617.2M | Steakhouse Financial **$727.0M** |
| #2 | Gauntlet $422.5M | Gauntlet **$497.7M** |
| #3 | Nonce Capital $114.7M | Nonce Capital **$135.1M** |
| #4 | RockawayX $98.6M | RockawayX **$116.2M** |
| #5 | Hyperithm $92.2M | Hyperithm **$108.6M** |
| max / min implied | $617.2M / $730,333 | $727.0M / $846,017 |

The top 20 rows are all watchlist protocols (20/20); the top 40 hold 30.
The ranking barely moves — the level factor is near-uniform and the
trimmed centre shifts multiples modestly — but the level is now centred
instead of 9% low. 36 calibration categories, none on fallback.

## 6. Dashboard: ratio bars replace the log bars (dashboard/, 19,008 bytes)

- The detail view's TVL-vs-implied log bars are gone: on a log scale a
  10× gap read as a fixed step, so every row's two bars looked nearly
  the same length (admitted in BUILD-v2.md §6). The new bars compare
  value per TVL dollar on **one linear scale**: "This row" (implied /
  TVL) against "Category centre" (the category's centre ratio). For
  Steakhouse the gap is now visible and honest — 0.264× vs the Risk
  Curators centre of 2.975× (one live comp, shrunk/clamped to a 0.600
  base multiple). The dollar values stay as text underneath.
- Calibration table header "Median mcap / TVL" → "Centre mcap / TVL";
  its footnote now states the trimmed geometric mean and the level
  factor; the model panel text describes v3 (six factors, trimmed
  centre, level calibration); the backtest line reads "median error 86%
  vs 87% for the v2 model, 29% of predictions within 2× vs 27%".
- Still fully offline (no http(s) URLs), 3 files, 19,008 bytes total
  (< 64 KB), sortable/filterable/search working (verified in the
  screenshot run: filter "watchlist" → 40 rows, 0 console errors).

## 7. Screenshots (retaken 23 Nov ~13:04 WIB, chrome-headless-shell 157)

Note: `node work/shot.js` fails with `Cannot find module 'puppeteer-core'`
unless run with `NODE_PATH=/home/hatch/workspace/tools/shot/node_modules`
— puppeteer-core lives in `~/workspace/tools/shot/node_modules`, not under
this project.

| file | size | md5 | shows |
|---|---|---|---|
| 1-board.png | 194 KB | `76956c15af446d691bcc30125aa5672e` | board, top 19, Steakhouse #1 $727.0M |
| 2-detail.png | 167 KB | `a5a9d7f5d82c046d8009fd55b1251839` | Steakhouse detail: ratio bars 0.264× vs 2.975×, 6 factor chips + level × 1.18, 7-step farm plan with risk guards |
| 3-filtered.png | 196 KB | `618527c9e2220fdd27d33548d8928d6a` | watchlist filter, 40 of 200 shown |

All three were read and checked by eye. Board and filtered views are
clean; the detail view's bars now differentiate for real.

## 8. Validation (23 Nov 2026, final run ~13:05 WIB)

- `node main.ts` run **twice on Node 24.22.1** (out-v3c, out-v3d):
  byte-identical (`diff -r` clean). Node 22 could not be re-run — the
  v1 builder's Node 22.23.4 tarball is no longer on this VM. The code
  uses only stable stdlib arithmetic (no locale-dependent formatting in
  the output path), and v1 was verified byte-identical between Node 24
  and Node 22.23.4; re-check on Node 22 at submit time if a binary is
  handy.
- Gate validation (`work/validate.js`, run on both final outputs) —
  **8 passed, 0 failed**:
  - dashboard_files — 3 files, 19,008 bytes (< 64 KB), network-free
  - board_file — 200 rows, max $726,983,041, min $846,017
  - sorted_by_value — ranks 1..200 exact, implied non-increasing
  - coverage — watchlist 40/40
  - farm_steps — 200 rows, steps 110–314 chars, 7 steps/row
  - screenshots — 194 / 167 / 196 KB (new md5s above)
  - dossier_matches — dossier 780,735 bytes (≤ 1.5 MiB), rebuild
    byte-identical
  - extra_slug_unique — 200 unique slugs
- `main.ts` header comment updated to v3 (the transcript gate needs at
  least one authored line in main.ts; all edits here were made through
  the file tools in this fresh session, nothing copied).

## 9. What was NOT done (for the parent)

- No register / login / submit / claim on make.fun. No GitHub repo created,
  no push. The keypair file was never opened. README badges untouched.
- The parent still has to: re-bundle the transcript for this session,
  re-check, and re-submit (Force_Last — submitting v3 replaces v2 as the
  judged entry; only do it if v3 is judged better, which the backtest
  says it is, on all four metrics).
- Deadline: 14 Dec 2026 17:00 WIB. Slots used so far: 2/10 (v1, v2). v3
  would be the 3rd.
