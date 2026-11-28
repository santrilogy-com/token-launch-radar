# Token Launch Radar v4 — final build notes (Raka, 28 Nov 2026)

Entry `radar-v4-ridge-odds`, in `entry-v4/` (do NOT touch `entry-v1/`).
No submit, no register/login, no keypair opened, no commit/push in this
round — build + measure only. The submit decision is Xam/Mas's.

## 1. What was built

A new model and a new dashboard, from the frozen snapshot (758
protocols, 2026-11-14), in a separate directory:

- **Value model — ridge on ln(mcap/TVL)**, λ=30, level factor fitted
  leave-one-out: intercept + size curve ln(TVL) + ridge-shrunk category
  effects. Slope −0.485, intercept −1.279, reference TVL $32,575,274,
  level 1.0431.
- **Term tests run BY the entry program at build time** (not asserted):
  growth, age, chain count each tested on leave-one-out AND both
  walk-forwards; all three failed and are reported as tested-not-kept.
  Negative control (permuted growth, fixed seed) gives the same LOO
  median |ln| as the base model (1.270 = 1.270): the harness is not
  fooled by noise.
- **Token odds**: logistic P(has token), λ=10, over all 758 protocols.
- **Intervals** from the LOO log-residuals; **bootstrap** 200 seeded
  refits; **accounting** 758 = 200 + 416 + 142; **integrity strip**
  recomputed live in the browser with checksum `caaa09b3` (first 8 hex
  of sha256 of `entry-v4/main.ts`).
- **Costed farm verdicts** per row (deposit, modelled drop, fees, hours,
  T-bill, net, net/hour) + 10-step plans + net table (drop share ×
  deposit) + nearest priced peers + "how the figure is made" in every
  detail view. Verdict filter + net/hour and odds sorts.
- Dashboard source **34,078 bytes** (cap 65,536), network-free.

## 2. Backtest: v4 vs v3 (leave-one-out, n = 128)

| | MdAPE | med\|ln\| | within-2× | bias | miss |
|---|---|---|---|---|---|
| v3 (submitted) | 86.4% | 1.339 | 28.9% | +0.1% | ×3.74 |
| **v4** | **84.8%** | **1.306** | **32.0%** | **0.0%** | **×3.69** |

All four (five) better: MdAPE −1.6pp, med|ln| −0.033, within-2× +3.1pp,
bias −0.1pp, miss −0.05. **But the margin is thin**: MdAPE −1.6pp sits
just above the split-half noise floor (1.4pp) and med|ln| −0.033 is
small. The win is real, not decisive.

Walk-forward (level fitted on the fit pool only — fully out-of-sample):

| | MdAPE | med\|ln\| | within-2× | bias | miss vs flat |
|---|---|---|---|---|---|
| WF1 (cut 2024-07-01, fit 52 / test 43) | 91.5% | 1.080 | 32.6% | +4.2% | ×2.95 vs ×4.17 |
| WF2 (cut 2025-01-01, fit 64 / test 31) | 88.6% | 1.056 | 32.3% | −36.4% | ×2.87 vs ×5.25 |

WF2's −36.4% bias is real drift (pre-2025 fits under-predict 2025
listings by a third) and is shown on the dashboard, not hidden.

## 3. Token odds, intervals, bootstrap

- **Odds, 5-fold CV**: Brier **0.213 vs 0.248 baseline; 66.2% called
  right vs 54.9%** (n=758). Comparable to rank 1's 0.215 / 65%.
- **Odds, walk-forward: FAILS on both cuts.** Brier 0.332 vs 0.235
  (called 37.7% vs 62.3%) and 0.249 vs 0.229 (55.4% vs 64.4%).
  Cause, verified: a base-rate shift — the share of listed protocols
  with a token fell from 74.0% to 37.7% (Jul 2024 cut) and from 65.8%
  to 35.6% (Jan 2025 cut). Every variant fails identically, including
  TVL-only, so no predictor is the culprit; the intercept fitted on the
  old mix over-calls tokens in the new mix. The dashboard states this
  plainly: odds are cross-sectional, not a time-to-listing forecast.
- **Intervals**: P25–P75 ×0.298–×4.088, P10–P90 ×0.056–×9.071 (wide:
  the typical prediction is ~3.7× off). Split-half coverage 45.3% /
  57.8% (target 50%) and 73.4% / 81.3% (target 80%).
- **Bootstrap (200 refits)**: slope −0.478 [−0.623, −0.333]; level
  1.052 [0.875, 1.283]. Top-10 rank ranges: Steakhouse 1–1, Gauntlet
  2–2, Veda 3–4, USDD 3–6, Nonce Capital 4–6, Upshift 6–10, Bittensor
  dTAO 4–10, OnRe 5–10, RockawayX 5–10, OpenTrade 8–10.

## 4. The board itself

- #1 Steakhouse Financial, implied **$98.7M** (v3 had it at $727.0M).
  The fitted size slope (−0.49) is much steeper than v3's hand-clamped
  −0.25, so the giants price far lower. The held-out tests say the
  steeper slope predicts the median protocol better, but the top of the
  board is the most affected — stated here, not hidden.
- Board total implied **$2.15B** (rank 1's was $1.52B over 198 rows).
- Farm verdicts: **31 FARM / 136 MARGINAL / 33 SKIP**. No FARM row sits
  in the top 10 (all top-10 are SKIP): a $10,000 ticket is a negligible
  share of a multi-billion TVL, so the modelled drop cannot beat the
  fees. The FARM rows sit at ranks 24–82; best net/hour is Re7 Labs at
  $34.36/h.

## 5. Verification (all measured, not claimed)

- **Gate: 11/11 PASS** (`work/validate-v4.js` on `work/out-v4b`):
  dashboard files (3 files, 34,078 bytes, network-free), board file
  (200 rows), sorted by value (ranks 1..200), coverage (watchlist
  40/40), farm steps (118–323 chars, 10 steps/row), screenshots
  (186/159/182 KB, all ≤512 KiB), dossier matches (755,154 bytes,
  rebuild byte-identical), plus slug uniqueness, verdicts, odds in
  [0,1], intervals ordered.
- **Determinism**: two full runs (`work/out-v4b` vs `work/out-v4c`)
  are **byte-identical** (`diff -r`, no differences).
- **Build time ~2s**; runtime evidence printed by main.ts matches the
  research (`work/research-v4.ts`, runs 1–4) on every headline number.
  Two bugs were found and fixed during verification: (1) the first
  build's LOO metrics were computed before the level factor was applied
  (85.2 / 1.270 / −4.1% — the unlevelled numbers); fixed in
  `fitValueModel`, re-verified 84.8 / 1.306 / 0.0%. (2) `age_days` was
  undefined on every row (v4's `impliedValue` dropped the age v3
  returned); fixed in `buildBoard`, re-verified (543d, 632d, …).
- **Screenshots verified by eye** (1440×900): 1-board shows the 6-KPI
  evidence strip + integrity strip (6 PASS) + board with all 11
  columns; 2-detail shows rank 1 with the factor arithmetic, odds,
  intervals, peers, costed verdict, net table and the 10-step plan;
  3-filtered shows FARM only, sorted by net/hour (31 rows, Re7 Labs
  first at $34.36/h). Zero console/page errors.
- **Static literals vs build**: the dashboard's static evidence tables
  were cross-checked against the build's computed evidence
  (`work/inspect-v4.mjs`); three literals were corrected to the
  shipped-spec (λ=30) numbers after the build recomputed the term
  tests and bootstrap at λ=30 instead of the research-stage λ=300
  (see PLAN-v4.md correction note).

## 6. Recommendation: SUBMIT

**SUBMIT v4** — with the thin margin stated plainly, not as a caveat
to hide.

Why submit:
1. **The submit rule as defined is met**: v4 beats v3 on 4/4 LOO
   metrics (not just ≥3/4) with no metric worse, AND the rank-1
   recipe is fully implemented (held-out 2× per term + negative
   control, odds + Brier, interval calibration, bootstrap 200,
   accounting, integrity strip + checksum, costed farm verdicts +
   10-step plans + detail pages).
2. **The judge compares dossiers, not backtests.** v4's dossier
   dominates v3's on every judge criterion: v3's dossier shows a plain
   board plus one backtest line; v4's shows the evidence strip,
   out-of-sample tables, odds, calibration, bootstrap, integrity strip
   and costed verdicts — the same recipe that put rank 1 at 96.68%.
   On the judge's criteria, v4 is strictly stronger than v3.
3. **The cost of finding out is low and recoverable.** This would be
   submission 4 of 10 (7 slots remain; entries close 14 Dec 17:00
   WIB). The dev rate is only observable after a submit — and if it
   disappoints, an earlier finished entry can be picked as final
   (`makefun final`), so v3 is not lost.
4. **The honest gaps are already on the dashboard**: the thin
   value-model margin, the failed odds walk-forward with its measured
   cause, the WF2 drift, the wide intervals. The entry does not
   oversell.

What could still go wrong (so the decision is informed, not blind):
- Rank 1's value accuracy is still well ahead (their miss ×2.53 vs
  our ×3.69). v4 closes the evidence gap, not the accuracy gap.
- The top-10-all-SKIP look and the crushed giant values ($98.7M vs
  v3's $727.0M for #1) are the entry's visible quirks; a judge that
  weighs absolute implied levels could mark v4 down.
- The dev rate after submit is unknown; v3's provisional 61.2340% is
  the known baseline. If v4's dev rate comes back below v3's, use the
  final-entry fallback to restore v3.

## 7. Files

- `entry-v4/main.ts`, `entry-v4/lib/model.ts`, `entry-v4/dashboard/`
  (index.html, app.js, app.css), `entry-v4/screenshots/` (3 PNGs),
  `entry-v4/vendor/makefun-board.ts` (kit copy, sha256-verified
  identical to v1's), `entry-v4/LICENSE` (MIT), `entry-v4/README.md`,
  `entry-v4/.makefun/owner.json` (wallet agent only).
- `work/PLAN-v4.md` (plan + research results + correction note),
  `work/research-v4.ts` (+ `research-v4-run1..4.txt`),
  `work/BUILD-v4-final.md` (this file), `work/validate-v4.js`,
  `work/shot-v4.js`, `work/inspect-v4.mjs`,
  `work/out-v4b/` + `work/out-v4c/` (final byte-identical outputs),
  `work/preview-v4/` (screenshot source).

## 8. Not done (explicitly out of this round)

No submit, no register/login, no keypair file opened
(`kit/makefun-keypair.json` never read), no commit/push. The transcript
gate (≥30% of counted lines, ≥2 assistant file-revising messages) is a
submit-time check for the submit flow, not part of this build round.
