# Token Launch Radar v2 — build notes

Entry v1 was submitted 23 Nov 2026 ~12:25 WIB and passed every server check
(submission `01a206de-0c3b-7272-b669-4e0f67fa5005`). The submit rule is
**Force_Last** — only the last submission is judged — so v2 has to be
measurably better than v1, not just different. This file records what changed
and the numbers behind it, so the parent can decide whether to re-submit.

## 1. Backtest: v1 did not beat a dumb baseline

Method (`work/backtest-v2.ts`, output `work/backtest-v2.txt`): leave-one-out
over the snapshot's own 144 live-token protocols. For each one, predict its
implied value with its own ratio removed from its category's comparables and
compare against its actual market cap. The 15 protocols with a recorded cap
of 0 are left out of the error metrics (n = 128), because a cap of 0 makes
any positive prediction infinitely wrong.

Ratios are extremely dispersed: p5 0.000, median 0.169, p95 5.130, max 400.20.
That dispersion is the whole problem — no calibration trick makes this
prediction precise; the aim is only to be less wrong than v1.

| variant | MdAPE | med |ln err| | within 2× | median bias | n |
|---|---|---|---|---|---|
| null (TVL × global median only) | 89.6% | 1.646 | 25.0% | −21.0% | 128 |
| **v1** (category median, min 3 comps, linear maturity 0.6–1.0) | 92.2% | 1.508 | 22.7% | −20.2% | 128 |
| **v2m — the v2 model** | **87.3%** | **1.356** | **27.3%** | **−8.4%** | 128 |

v1 does **not** beat the null on MdAPE or within-2×. v2m beats v1 on all
four metrics and beats the null on all four. The single biggest finding is
the TVL slope: OLS of ln(mcap/TVL) on ln(TVL) over live comparables gives
β = **−0.478** — the market pays less per TVL dollar to bigger protocols.
Median live TVL is $29,997,757.

Variants tested and rejected: raw β = −0.478 (v2h, best MdAPE 86.0% but
bias −46.1%, it over-penalises the big watchlist protocols); category-relative
TVL reference (v2k/v2l, no better); excluding CEX (v2d/v2e/v2n, mixed, v2n
has a slightly better med|ln| at 1.316 but worse MdAPE 88.4% and worse
within-2× 25.8%); dropping maturity or growth (v2f/v2g, no gain). Winsorize
alone (v2a) or shrinkage alone (v2b) each help a little; the combination plus
the clamped slope is what wins.

Honest caveat: the model is still noisy. A median error of 87% means the
typical prediction is ~2.4× off, and only 27% land within 2× of the real
market cap. mcap/TVL is intrinsically dispersed. v2 is measurably better
than v1 — that is the claim, and it is the only claim.

## 2. What changed in the model (lib/model.ts, model_version `radar-v2-calibrated`)

1. **Winsorized ratios.** Every live comparable's ratio is clipped to the
   global 5th–95th percentiles before any median is taken, so the 400×
   outlier and the 0-cap protocols cannot set a category's price.
2. **Shrinkage instead of a fallback cliff.** A category's base multiple is
   now (n·median + 3·global) / (n + 3). A category with many comps keeps its
   own median; one with few is pulled toward the global median (0.214).
   `CalibrationRow.fallback` is always false in v2 — there is no fallback
   any more. Example: Risk Curators has 1 live comp with a winsorized median
   of 2.975; it shrinks to 0.904 and is then clamped to the 0.60 cap.
3. **Log maturity curve, centred at 1.0.** Maturity is now
   (0.6 + 0.4·ln(1+age/365)/ln(1+1095/365)) normalised to 1.0 at 365 days:
   age 0 → 0.75, 365 days → 1.0, 1095 days → 1.25. v1's linear 0.6–1.0
   curve shrank every value; v2's curve ranks protocols against each other
   instead.
4. **TVL slope, fitted not hand-written.** β is fitted by OLS from the
   snapshot's own comparables, clamped to ±0.25 (raw fit −0.478, capped
   because the unclamped slope's −46% bias punishes the big watchlist
   protocols too hard). Reference TVL is the median live TVL, $29,997,757.
   Fitted β in this build: **−0.25** (clamped), reference TVL $29,997,757.
5. **Five factors, all shown.** implied = TVL × base × growth × maturity ×
   chain spread × TVL slope. `BoardRow.model` and the dashboard carry
   `tvl_multiplier`; `RadarData` carries `tvl_beta` and `tvl_ref_usd`.

## 3. Board: v1 vs v2 (200 rows, rank 1..200, implied non-increasing)

| | v1 | v2 |
|---|---|---|
| #1 | Steakhouse Financial $511.4M | Steakhouse Financial **$617.2M** |
| #2 | Gauntlet $305.5M | Gauntlet **$422.5M** |
| #3 | USDD $97.7M | Nonce Capital $114.7M |
| #4 | Upshift $95.2M | RockawayX $98.6M |
| #5 | RockawayX $92.8M | Hyperithm $92.2M |
| max / min implied | $511.4M / $323,621 | $617.2M / $730,333 |

The top 20 rows are all watchlist protocols (20/20); the top 40 hold 30.
The TVL slope moves the ranking most for the giants: USDD (TVL $1.06B) drops
from #3 to #8, Veda (TVL $1.56B) from #5 to #10, while younger mid-size
protocols with strong 7-day growth rise (Nonce Capital, 45 days old, enters
at #3). 36 calibration categories, none on fallback.

## 4. Farm plans: more specific, with a risk guard (lib/model.ts)

- New category branches: **liquid staking** (stake, hold the receipt, use it
  once in another app), **synthetic** (mint the synthetic asset, redeem and
  re-mint so both directions are on record), **money market** (same
  supply/borrow/repay shape as lending, worded for money markets).
- Risk guard on every row (200/200): step 4 — skip a weekly action when its
  gas would cost more than $5, and do it on the cheapest chain the protocol
  runs on; step 5 — if the position loses more than 10% in a week, unwind
  half of it and re-read the protocol's docs before putting anything back.
- Still 7 steps per row, 20–600 chars each (measured 110–314 chars), each
  with a cost and a time.

## 5. Dashboard: polish + per-protocol visualisation (dashboard/, 18,155 bytes)

- Typography/spacing/palette: tighter headings (32px, −0.8px tracking),
  deeper panel contrast, rank column in accent teal, detail panel with a
  left accent border.
- Detail view now shows a **TVL vs implied value bar chart** (log-scaled,
  with a note saying so — on a log scale a 10× gap reads as a fixed step),
  a **category comparison line** ("Category median mcap/TVL 2.975 (1 live
  comps) — this row's implied/TVL 0.224×"), and a **TVL slope chip**
  (× 0.32 for Steakhouse) alongside the existing factor chips.
- Model panel text now describes v2 (five factors, winsorize + shrinkage
  k = 3, 0.05–0.60 clamp, log maturity centred at 1 year, fitted TVL slope)
  and shows the fitted β, the reference TVL, and the backtest numbers
  (median error 87% vs 92% for v1, 27% within 2× vs 23%). The calibration
  footnote no longer mentions a fallback — there is none.
- Still fully offline (no http(s) URLs), 3 files, 18,155 bytes total
  (< 64 KB), sortable/filterable/search working (verified in the
  screenshot run: filter "watchlist" → 40 rows, 0 console errors).

## 6. Screenshots (retaken 23 Nov ~12:54 WIB, chrome-headless-shell 157)

| file | size | md5 | shows |
|---|---|---|---|
| 1-board.png | 193 KB | `1bf9ca88f4c35dafa4027479dc79ccc5` | board, top 19, Steakhouse #1 $617.2M |
| 2-detail.png | 165 KB | `b4f6c45a4627bea88052f849dbefcf6b` | Steakhouse detail: bars, category comparison, 5 factor chips, 7-step farm plan with risk guards |
| 3-filtered.png | 196 KB | `09a5f17a8de6fd85144e84d09658a3e7` | watchlist filter, 40 of 200 shown |

All three were read and checked by eye. The log bars for Steakhouse are
nearly the same length (TVL $2.75B vs implied $617M is only a 0.65 log step)
— that is correct for a log scale and the note says so, but the chips and the
category line carry the real comparison. All ≤ 512 KiB, 1440×900.

## 7. Validation (23 Nov 2026, final run ~12:55 WIB)

- `node main.ts` run **twice on Node 24.22.1** (out-v2e, out-v2f):
  byte-identical (`diff -r` clean). Node 22 could not be re-run — the
  v1 builder's Node 22.23.4 tarball is no longer on this VM. The code uses
  only stable stdlib arithmetic (no locale-dependent formatting in the
  output path), and v1 was verified byte-identical between Node 24 and
  Node 22.23.4; re-check on Node 22 at submit time if a binary is handy.
- Gate validation (`work/validate.js`, run on both final outputs) —
  **8 passed, 0 failed**:
  - dashboard_files — 3 files, 18,155 bytes (< 64 KB), network-free
  - board_file — 200 rows, max $617,215,205, min $730,333
  - sorted_by_value — ranks 1..200 exact, implied non-increasing
  - coverage — watchlist 40/40
  - farm_steps — 200 rows, steps 110–314 chars, 7 steps/row
  - screenshots — 193 / 165 / 196 KB
  - dossier_matches — dossier 773,535 bytes (≤ 1.5 MiB), rebuild
    byte-identical. (The dossier grew from v1's 760,741 bytes because it
    embeds the new screenshots and dashboard source — expected.)
  - extra_slug_unique — 200 unique slugs
- `main.ts` header comment updated to v2 (the transcript gate needs at
  least one authored line in main.ts; all edits here were made through the
  file tools in this fresh session, nothing copied).

## 8. What was NOT done (for the parent)

- No register / login / submit / claim on make.fun. No GitHub repo created,
  no push. The keypair file was never opened. README badges untouched.
- The parent still has to: re-bundle the transcript for this session,
  re-check, and re-submit (Force_Last — submitting v2 replaces v1 as the
  judged entry; only do it if v2 is judged better, which the backtest says
  it is, on all four metrics).
- Deadline: 14 Dec 2026 17:00 WIB. Slots used so far: 1/10 (v1). v2 would
  be the 2nd.
