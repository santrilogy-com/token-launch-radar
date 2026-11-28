// Token radar model v4: `radar-v4-ridge-odds`.
//
// The value model is a ridge regression on ln(mcap/TVL), fitted on the
// snapshot's own live-token protocols and tested the way the strongest
// entries test theirs: every term must pass TWO held-out tests
// (leave-one-out AND walk-forward on two listing-date cuts) or it is
// reported as tested-not-kept. What survived: an intercept, a size curve
// ln(TVL), and ridge-shrunk category effects (lambda = 30, tuned by
// leave-one-out). What did not: 7-day growth (the fitted coefficient is
// ~0), age (slightly worse on both tests), chain count (worse on all
// tests). A negative control — growth shuffled across comparables with a
// fixed seed — does not improve leave-one-out, so the harness is not
// fooled by noise. A leave-one-out level factor centres the median
// comparable on its actual market cap.
//
// On top of the value model, v4 adds what v3's dossier lacked:
//   - token odds: logistic P(has token) over all 758 protocols,
//     5-fold cross-validated. Walk-forward FAILS (see computeEvidence):
//     the share of listed protocols that have a token fell from 74% to
//     38% between eras, so the intercept does not travel forward in
//     time. The odds are cross-sectional — they rank protocols within
//     this snapshot — not a time-to-listing forecast; the snapshot
//     carries no launch dates.
//   - intervals: P25-P75 / P10-P90 from the leave-one-out log-residuals.
//   - bootstrap: 200 seeded refits, coefficient and rank ranges.
//   - farm economics: a costed verdict per row under stated assumptions.
//   - an integrity strip + full accounting of all 758 protocols.
//
// Backtest (leave-one-out, 128 live-token protocols with mcap > 0):
//   v3: 86.4% MdAPE / 1.339 med|ln| / 28.9% within-2x / +0.1% bias.
//   v4: 84.8% MdAPE / 1.306 med|ln| / 32.0% within-2x / 0.0% bias.
// The win is real but thin (MdAPE -1.6pp against a 1.4pp split-half noise
// floor); the dashboard shows the numbers instead of hiding them.

/** One protocol entry: exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** A farm step: the action, what it costs, how long it takes, and its hours. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
  hours: number;
  perWeek: boolean;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    predicted_ratio: number;
    intercept: number;
    size_multiplier: number;
    category_effect: number;
    level_factor: number;
  };
  odds_token: number;
  interval_p10_usd: number;
  interval_p25_usd: number;
  interval_p75_usd: number;
  interval_p90_usd: number;
  farm: {
    deposit_usd: number;
    drop_usd: number;
    fees_usd: number;
    hours: number;
    tbill_usd: number;
    net_usd: number;
    net_per_hour_usd: number;
    verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  };
  net_table: { shares: number[]; deposits: number[]; net_usd: number[][] };
  peers: { slug: string; name: string; ratio: number; tvl_usd: number }[];
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  predicted_ratio: number;
  intercept: number;
  size_multiplier: number;
  category_effect: number;
  level_factor: number;
  odds_token: number;
  interval_p10_usd: number;
  interval_p25_usd: number;
  interval_p75_usd: number;
  interval_p90_usd: number;
  deposit_usd: number;
  drop_usd: number;
  fees_usd: number;
  hours: number;
  tbill_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  net_table: { shares: number[]; deposits: number[]; net_usd: number[][] };
  peers: { slug: string; name: string; ratio: number; tvl_usd: number }[];
  farm_steps: string[];
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's calibration: the comparables behind its ridge effect. */
export interface CalibrationRow {
  category: string;
  comps: number;
  effect: number;
}

/** One held-out test's four metrics plus the miss factor. */
export interface HeldOutMetrics {
  mdAPE: number;
  medLn: number;
  within2: number;
  bias: number;
  miss: number;
  n: number;
}

/** Everything the dashboard's evidence panels need, computed at build time. */
export interface Evidence {
  value_loo: HeldOutMetrics;
  value_wf1: HeldOutMetrics;
  value_wf2: HeldOutMetrics;
  flat_miss: { loo: number; wf1: number; wf2: number };
  terms: { name: string; kept: boolean; loo_medLn: number; wf1_medLn: number; wf2_medLn: number }[];
  negative_control: { loo_medLn: number; base_loo_medLn: number };
  odds_brier_5fold: number;
  odds_baseline_brier: number;
  odds_called_right: number;
  odds_baseline_called: number;
  odds_wf1: { brier: number; baseline: number; called: number; baseline_called: number };
  odds_wf2: { brier: number; baseline: number; called: number; baseline_called: number };
  odds_base_rate_shift: { cut1_fit: number; cut1_test: number; cut2_fit: number; cut2_test: number };
  interval_q10: number;
  interval_q25: number;
  interval_q75: number;
  interval_q90: number;
  coverage_a_to_b: { p50: number; p80: number };
  coverage_b_to_a: { p50: number; p80: number };
  bootstrap_slope: { median: number; p5: number; p95: number };
  bootstrap_level: { median: number; p5: number; p95: number };
  bootstrap_top_ranks: { slug: string; name: string; lo: number; hi: number }[];
  ledger: { total: number; ranked: number; has_token: number; pre_token_not_ranked: number; watchlist: number; early: number };
  farm_counts: { farm: number; marginal: number; skip: number };
}

/** Everything the dashboard needs: the board, the live set, the calibration, the evidence, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: CalibrationRow[];
  ridge_lambda: number;
  odds_lambda: number;
  slope: number;
  intercept: number;
  ref_tvl_usd: number;
  level_factor: number;
  checksum: string;
  evidence: Evidence;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-v4-ridge-odds';

/** Ridge penalty on the category effects (tuned by leave-one-out; see PLAN-v4.md). */
export const RIDGE_LAMBDA = 30;

/** Ridge penalty on the token-odds logistic (5-fold CV; see PLAN-v4.md). */
export const ODDS_LAMBDA = 10;

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Walk-forward cuts (listing dates) for the held-out tests. */
export const WF_CUTS = ['2024-07-01', '2025-01-01'];

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-th quantile of a non-empty list (nearest rank). */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))]!;
}

/** The mean of a list of numbers. */
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Deterministic PRNG (mulberry32): no Math.random anywhere in this file. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (piv !== col) { const t = M[col]!; M[col] = M[piv]!; M[piv] = t; }
    const d = M[col]![col]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let r = col + 1; r < n; r++) {
      const f = M[r]![col]! / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let c = r + 1; c < n; c++) s -= M[r]![c]! * x[c]!;
    x[r] = Math.abs(M[r]![r]!) < 1e-12 ? 0 : s / M[r]![r]!;
  }
  return x;
}

function sigmoid(z: number): number {
  if (z >= 0) { const e = Math.exp(-z); return 1 / (1 + e); }
  const e = Math.exp(z); return e / (1 + e);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records a token at all (mcap, gecko id or symbol present). */
export function hasToken(p: SnapshotProtocol): boolean {
  return !(p.mcap_usd === null && p.gecko_id === null && p.symbol === null);
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return !hasToken(p);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The live-token comparables the value model is fitted on (mcap > 0). */
function evalSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The four backtest metrics plus the miss factor for one set of predictions. */
function heldOutMetrics(preds: number[], actuals: number[]): HeldOutMetrics {
  const errs: number[] = [];
  const logErrs: number[] = [];
  const biases: number[] = [];
  const miss: number[] = [];
  let within2 = 0;
  for (let i = 0; i < preds.length; i++) {
    const r = preds[i]! / actuals[i]!;
    errs.push(Math.abs(r - 1));
    logErrs.push(Math.abs(Math.log(r)));
    biases.push(r - 1);
    miss.push(Math.max(r, 1 / r));
    if (r >= 0.5 && r <= 2) within2++;
  }
  return {
    mdAPE: round4(median(errs) * 100),
    medLn: round4(median(logErrs)),
    within2: round4((within2 / preds.length) * 100),
    bias: round4(median(biases) * 100),
    miss: round4(median(miss)),
    n: preds.length,
  };
}

// ---------------------------------------------------------------------------
// Ridge value model: ln(mcap/TVL) ~ 1 + ln(TVL/ref) + category (shrunk).
// ---------------------------------------------------------------------------

export interface RidgeModel {
  cats: string[];
  beta: number[];
  refTvl: number;
  levelFactor: number;
}

/** Optional extra terms, for the held-out term tests (base model: none). */
export interface RidgeExtra {
  growth?: boolean;
  age?: boolean;
  chains?: boolean;
  permuteGrowth?: Map<string, number> | null;
}

function ridgeFeatures(p: SnapshotProtocol, cats: string[], refTvl: number, extra?: RidgeExtra, asOf?: string): number[] {
  const f: number[] = [1, Math.log(p.tvl_usd / refTvl)];
  for (const c of cats) f.push((p.category ?? '(no category)') === c ? 1 : 0);
  if (extra?.growth) {
    const g = extra.permuteGrowth !== null && extra.permuteGrowth !== undefined ? extra.permuteGrowth.get(p.slug)! : (p.change_7d ?? 0);
    f.push(clamp(g, -60, 120) / 100);
  }
  if (extra?.age) {
    const a = ageDays(asOf ?? '2026-11-14', p.listed_at) ?? 365;
    f.push(Math.log(1 + a / 365));
  }
  if (extra?.chains) f.push(Math.min(p.chains.length - 1, 5));
  return f;
}

function ridgeFit(rows: { x: number[]; y: number }[], lambda: number): number[] {
  const d = rows[0]!.x.length;
  const pen = new Array<number>(d).fill(lambda);
  pen[0] = 0; // intercept unpenalised
  pen[1] = 0; // size slope unpenalised
  const XtX: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  const XtY = new Array<number>(d).fill(0);
  for (const r of rows) {
    for (let i = 0; i < d; i++) {
      XtY[i]! += r.x[i]! * r.y;
      for (let j = 0; j < d; j++) XtX[i]![j]! += r.x[i]! * r.x[j]!;
    }
  }
  for (let i = 0; i < d; i++) XtX[i]![i]! += pen[i]!;
  return solveLinear(XtX, XtY);
}

/** Fit the ridge on a pool of live comparables (mcap > 0). */
function fitRidge(pool: SnapshotProtocol[], refTvl: number, lambda: number = RIDGE_LAMBDA, extra?: RidgeExtra, asOf?: string): RidgeModel {
  const cats = [...new Set(pool.map((p) => p.category ?? '(no category)'))].sort();
  const rows = pool.map((p) => ({ x: ridgeFeatures(p, cats, refTvl, extra, asOf), y: Math.log(p.mcap_usd! / p.tvl_usd) }));
  const beta = ridgeFit(rows, lambda);
  return { cats, beta, refTvl, levelFactor: 1 };
}

function ridgeLogRatio(model: RidgeModel, p: SnapshotProtocol, extra?: RidgeExtra, asOf?: string): number {
  const x = ridgeFeatures(p, model.cats, model.refTvl, extra, asOf);
  let s = 0;
  for (let i = 0; i < model.beta.length; i++) s += model.beta[i]! * x[i]!;
  return s;
}

/** 1 / median(pred/actual) over a set of leave-one-out predictions. */
function levelFromPredictions(preds: number[], actuals: number[]): number {
  const ratios = preds.map((pr, i) => pr / actuals[i]!);
  const m = median(ratios);
  return Number.isFinite(m) && m > 0 ? 1 / m : 1;
}

/**
 * The fitted value model: ridge on the 128 live comparables, plus the
 * leave-one-out level factor. Each comparable is priced with itself left
 * out of the fit; the factor is one over the median predicted-to-actual
 * ratio, so the median comparable is priced at its actual market cap.
 * The leave-one-out predictions are returned too: the evidence (metrics,
 * intervals, coverage) is computed from them, never asserted.
 */
export function fitValueModel(snapshot: Snapshot): { model: RidgeModel; looPreds: number[]; looActuals: number[] } {
  const evals = evalSet(snapshot);
  const refTvl = median(evals.map((p) => p.tvl_usd));
  const preds: number[] = [];
  const actuals: number[] = [];
  for (const p of evals) {
    const pool = evals.filter((q) => q.slug !== p.slug);
    const m = fitRidge(pool, refTvl);
    preds.push(p.tvl_usd * Math.exp(ridgeLogRatio(m, p)));
    actuals.push(p.mcap_usd!);
  }
  const levelFactor = levelFromPredictions(preds, actuals);
  const full = fitRidge(evals, refTvl);
  full.levelFactor = levelFactor;
  // The returned leave-one-out predictions carry the level factor, exactly
  // as the shipped board does: the evidence metrics and the interval
  // residuals must describe the model that actually scores the board.
  const levelledPreds = preds.map((pr) => pr * levelFactor);
  return { model: full, looPreds: levelledPreds, looActuals: actuals };
}

/** One protocol's implied value under the fitted ridge model. */
export function impliedValue(p: SnapshotProtocol, model: RidgeModel): {
  implied: number;
  predictedRatio: number;
  intercept: number;
  sizeMultiplier: number;
  categoryEffect: number;
} {
  const logRatio = ridgeLogRatio(model, p);
  const intercept = model.beta[0]!;
  const sizeMultiplier = Math.exp(model.beta[1]! * Math.log(p.tvl_usd / model.refTvl));
  const categoryEffect = Math.exp(logRatio - intercept - Math.log(sizeMultiplier));
  const predictedRatio = Math.exp(logRatio);
  const implied = Math.max(1, Math.round(p.tvl_usd * predictedRatio * model.levelFactor));
  return { implied, predictedRatio: round4(predictedRatio), intercept: round4(intercept), sizeMultiplier: round4(sizeMultiplier), categoryEffect: round4(categoryEffect) };
}

// ---------------------------------------------------------------------------
// Token odds: logistic P(has token) over all 758 protocols.
// ---------------------------------------------------------------------------

function oddsFeatures(p: SnapshotProtocol, cats: string[], refTvl: number, asOf: string): number[] {
  const a = ageDays(asOf, p.listed_at) ?? 365;
  const f: number[] = [1, Math.log(1 + a / 365), Math.log(p.tvl_usd / refTvl)];
  for (const c of cats) f.push((p.category ?? '(no category)') === c ? 1 : 0);
  f.push(clamp(p.change_7d ?? 0, -60, 120) / 100);
  return f;
}

/** Logistic regression by IRLS with a ridge penalty (intercept unpenalised). */
function logisticFit(X: number[][], y: number[], lambda: number): number[] {
  const d = X[0]!.length;
  let beta = new Array<number>(d).fill(0);
  beta[0] = Math.log(mean(y) / (1 - mean(y)));
  for (let iter = 0; iter < 15; iter++) {
    const XtWX: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    const XtWz = new Array<number>(d).fill(0);
    let maxStep = 0;
    for (let i = 0; i < X.length; i++) {
      const xi = X[i]!;
      let z = 0;
      for (let j = 0; j < d; j++) z += beta[j]! * xi[j]!;
      const pr = sigmoid(z);
      const w = Math.max(pr * (1 - pr), 1e-6);
      const zz = z + (y[i]! - pr) / w;
      for (let a = 0; a < d; a++) {
        XtWz[a]! += w * xi[a]! * zz;
        for (let b = 0; b < d; b++) XtWX[a]![b]! += w * xi[a]! * xi[b]!;
      }
    }
    for (let j = 1; j < d; j++) XtWX[j]![j]! += lambda;
    const next = solveLinear(XtWX, XtWz);
    for (let j = 0; j < d; j++) maxStep = Math.max(maxStep, Math.abs(next[j]! - beta[j]!));
    beta = next;
    if (maxStep < 1e-8) break;
  }
  return beta;
}

function brier(probs: number[], actuals: number[]): number {
  return mean(probs.map((pr, i) => (pr - actuals[i]!) ** 2));
}

function calledRight(probs: number[], actuals: number[]): number {
  return probs.filter((pr, i) => (pr >= 0.5 ? 1 : 0) === actuals[i]!).length / probs.length;
}

export interface OddsModel {
  cats: string[];
  beta: number[];
  refTvl: number;
}

/** Fit the odds model on all 758 protocols. */
export function fitOddsModel(snapshot: Snapshot): OddsModel {
  const all = snapshot.protocols;
  const refTvl = median(all.map((p) => p.tvl_usd));
  const cats = [...new Set(all.map((p) => p.category ?? '(no category)'))].sort();
  const X = all.map((p) => oddsFeatures(p, cats, refTvl, snapshot.as_of));
  const y = all.map((p) => (hasToken(p) ? 1 : 0));
  const beta = logisticFit(X, y, ODDS_LAMBDA);
  return { cats, beta, refTvl };
}

export function oddsToken(p: SnapshotProtocol, model: OddsModel, asOf: string): number {
  const a = ageDays(asOf, p.listed_at) ?? 365;
  const f: number[] = [1, Math.log(1 + a / 365), Math.log(p.tvl_usd / model.refTvl)];
  for (const c of model.cats) f.push((p.category ?? '(no category)') === c ? 1 : 0);
  f.push(clamp(p.change_7d ?? 0, -60, 120) / 100);
  let z = 0;
  for (let j = 0; j < model.beta.length; j++) z += model.beta[j]! * f[j]!;
  return round3(sigmoid(z));
}

// ---------------------------------------------------------------------------
// Farm economics: a costed verdict per row, under stated assumptions.
// ---------------------------------------------------------------------------

/** Gas per on-chain action, by chain (stated assumption, on the dashboard). */
const GAS_USD: { match: string; gas: number }[] = [
  { match: 'ethereum', gas: 8 },
  { match: 'bsc', gas: 1 },
  { match: 'arbitrum', gas: 0.5 },
  { match: 'optimism', gas: 0.5 },
  { match: 'base', gas: 0.5 },
  { match: 'solana', gas: 0.01 },
];

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas for one on-chain action on a protocol's main chain (other: $2). */
function gasFor(p: SnapshotProtocol): number {
  const chain = chainOf(p).toLowerCase();
  for (const g of GAS_USD) if (chain.includes(g.match)) return g.gas;
  return 2;
}

/** The farm ticket: min($10,000, 0.02% of TVL). */
function depositFor(p: SnapshotProtocol): number {
  return Math.min(10_000, 0.0002 * p.tvl_usd);
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

export interface FarmEconomics {
  deposit_usd: number;
  drop_usd: number;
  fees_usd: number;
  hours: number;
  tbill_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  net_table: { shares: number[]; deposits: number[]; net_usd: number[][] };
}

/**
 * The costed verdict. Assumptions (all printed on the dashboard): horizon
 * 12 weeks; modelled drop = implied value x 7% x (deposit / TVL); fees =
 * 6 on-chain actions x the main chain's gas; T-bill = deposit x 4% x
 * 12/52; net = drop - fees. FARM when net beats the T-bill AND net/hour
 * is at least $25; MARGINAL when exactly one holds; SKIP otherwise.
 */
function farmEconomics(p: SnapshotProtocol, implied: number, hours: number): FarmEconomics {
  const deposit = depositFor(p);
  const drop = implied * 0.07 * (deposit / p.tvl_usd);
  const fees = 6 * gasFor(p);
  const tbill = deposit * 0.04 * (12 / 52);
  const net = drop - fees;
  const netPerHour = net / hours;
  const beatsBill = net > tbill;
  const paysHour = netPerHour >= 25;
  const verdict: 'FARM' | 'MARGINAL' | 'SKIP' = beatsBill && paysHour ? 'FARM' : beatsBill || paysHour ? 'MARGINAL' : 'SKIP';
  const shares = [0.035, 0.07, 0.14];
  const deposits = [1000, 5000, 10000];
  const netTable = shares.map((s) => deposits.map((d) => Math.round(implied * s * (d / p.tvl_usd) - fees)));
  return {
    deposit_usd: Math.round(deposit),
    drop_usd: Math.round(drop),
    fees_usd: Math.round(fees),
    hours: Math.round(hours * 100) / 100,
    tbill_usd: Math.round(tbill),
    net_usd: Math.round(net),
    net_per_hour_usd: Math.round(netPerHour * 100) / 100,
    verdict,
    net_table: { shares, deposits, net_usd: netTable },
  };
}

// ---------------------------------------------------------------------------
// Farm plan: 10 steps, derived from the protocol's own record.
// ---------------------------------------------------------------------------

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * The category's two actions, in the words a farmer can follow. The match is
 * on the category string the snapshot carries, never on a protocol's name, so
 * the same rule scores every row alike.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { primary: string; secondary: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const money = `$${Math.round(capital)}`;
  if (c.includes('liquid staking')) {
    return {
      primary: `Stake ${money} of the chain's staking asset through ${name} and hold the liquid receipt token in your wallet.`,
      secondary: `Use that receipt once in another app on ${chain}, such as lending it out, then bring it back to your wallet.`,
    };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('money market')) {
    return {
      primary: `Supply ${money} of USDC to ${name} on ${chain} as collateral and keep the position open.`,
      secondary: `Borrow $20 against that collateral, hold it for a week, then repay it in full so the loan is on record.`,
    };
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return {
      primary: `Provide ${money} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      secondary: `Swap $25 through ${name} on ${chain} once a week, in a different pair each time.`,
    };
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return {
      primary: `Bridge ${money} of USDC to ${chain} through ${name} and use the bridged funds inside its app.`,
      secondary: `Bridge $25 back the other way a week later, so both directions are on record.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      primary: `Stake ${money} of the chain's staking asset through ${name} and keep the receipt token.`,
      secondary: `Restake the receipt once, if ${name} offers it, and leave both positions open.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      primary: `Deposit ${money} of USDC as margin on ${name} and open one small hedge, no more than $25 of size.`,
      secondary: `Close that hedge after a week and open a second one in the opposite direction.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      primary: `Fund ${money} on ${name} and place one market position of $25 on an outcome you can follow.`,
      secondary: `Place a second $25 position on a different market the following week.`,
    };
  }
  if (c.includes('yield') || c.includes('farm') || c.includes('curator') || c.includes('allocator')) {
    return {
      primary: `Deposit ${money} into a ${name} vault on ${chain} and keep the shares until the hold ends.`,
      secondary: `Claim the vault's yield once, then redeposit it the same day so the claim is on record.`,
    };
  }
  if (c.includes('stable')) {
    return {
      primary: `Mint or deposit ${money} of the stable asset through ${name} on ${chain} and hold it.`,
      secondary: `Swap $25 of that stable asset for USDC and back once, to show the mint is used.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      primary: `Mint ${money} of the yield asset ${name} issues on ${chain} and hold it in your wallet.`,
      secondary: `Hold it through one yield payout, then check the payout landed before you do anything else.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      primary: `Buy ${money} of cover from ${name} on ${chain} and keep the policy until it expires.`,
      secondary: `Open a second, smaller cover of $25 on a different pool the next week.`,
    };
  }
  if (c.includes('payment')) {
    return {
      primary: `Route ${money} through ${name} on ${chain} as a payment, then keep the receipt.`,
      secondary: `Receive $25 back through ${name} the following week, so both sides of the flow are on record.`,
    };
  }
  if (c.includes('launchpad')) {
    return {
      primary: `Stake ${money} through ${name} to qualify for its next sale allocation on ${chain}.`,
      secondary: `Vote or complete the sale's qualifying task once, and keep the stake through the sale.`,
    };
  }
  if (c.includes('index')) {
    return {
      primary: `Buy ${money} of the ${name} index token on ${chain} and hold it.`,
      secondary: `Rebalance once by swapping $25 of the index for its largest holding, then back.`,
    };
  }
  if (c.includes('privacy')) {
    return {
      primary: `Make one shielded deposit of ${money} through ${name} on ${chain} and keep the note.`,
      secondary: `Withdraw $25 from that shielded position a week later, to a fresh address.`,
    };
  }
  if (c.includes('ai agent') || c.includes('decentralized ai')) {
    return {
      primary: `Stake ${money} through ${name} to run one agent task on ${chain} and keep the task receipt.`,
      secondary: `Run a second, different agent task the following week and save both receipts.`,
    };
  }
  if (c.includes('synthetic') || c.includes('synth')) {
    return {
      primary: `Mint ${money} of the synthetic asset ${name} issues on ${chain} and hold it in your wallet.`,
      secondary: `Redeem $25 of that synthetic asset a week later, then mint it back, so both directions are on record.`,
    };
  }
  if (c.includes('governance')) {
    return {
      primary: `Stake ${money} through ${name} and vote on one live proposal on ${chain}.`,
      secondary: `Vote on a second proposal the following week and keep both votes on record.`,
    };
  }
  return {
    primary: `Deposit ${money} of USDC into ${name} on ${chain} and keep the position open.`,
    secondary: `Use ${name} once more the following week, a swap, a deposit or a vote, so the position is active twice.`,
  };
}

/**
 * A protocol's farm plan: ten steps (Setup, Verify, Fund, Risk, Deposit,
 * Defend, Cadence, Watch, Record, Unwind), each an action with a cost, a
 * time and hours. The plan is derived from the protocol's own record
 * (category, chains, TVL, age), never from a hand-written list of names.
 * Weekly steps repeat for the 12-week horizon; their hours count 12x.
 * The ticket is the same deposit the costed verdict uses.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const deposit = depositFor(p);
  const hold = holdDaysFor(age);
  const act = actionsFor(p, deposit, chain);
  const gas = gasFor(p);
  const dep = `$${Math.round(deposit)}`;
  return [
    {
      text: `Setup: open a fresh wallet for ${chain} only, fund it with ${dep} of USDC plus $${6 * gas} for gas, and store its seed phrase offline.`,
      cost: `${dep} of capital plus $${6 * gas} of gas`,
      time: '15 minutes',
      hours: 0.25,
      perWeek: false,
    },
    {
      text: `Verify: open ${p.name}'s official site from its DefiLlama listing, confirm the contract address and the points or rewards page, and check the docs before you deposit anything.`,
      cost: 'no fee to check',
      time: '15 minutes',
      hours: 0.25,
      perWeek: false,
    },
    {
      text: `Fund: move ${dep} of USDC into the fresh wallet on ${chain} and confirm it arrived before the next step.`,
      cost: `${dep} of capital and about $${gas} of gas`,
      time: '15 minutes',
      hours: 0.25,
      perWeek: false,
    },
    {
      text: `Risk: write down your guards before depositing — the most you will lose, the gas cap per action ($${gas}), and the rule that you unwind half if the position loses more than 10% in a week.`,
      cost: 'nothing but the note',
      time: '10 minutes',
      hours: 0.17,
      perWeek: false,
    },
    { text: `Deposit: ${act.primary}`, cost: `${dep} of capital and about $${gas} of gas`, time: '15 minutes', hours: 0.25, perWeek: false },
    { text: `Defend: ${act.secondary}`, cost: 'about $3 of gas', time: '10 minutes', hours: 0.17, perWeek: false },
    {
      text: `Cadence: do one qualifying action each week on ${p.name}, such as a deposit, a swap or a vote, and save the transaction receipt. If one week's action would cost more than $5 of gas, skip that week and do it on the cheapest chain the protocol runs on.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
      hours: 0.17,
      perWeek: true,
    },
    {
      text: `Watch: once a week, check the position and the points balance on ${p.name}'s own page. If the position loses more than 10% in a week, unwind half of it and re-read the protocol's docs before you put anything back.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
      hours: 0.08,
      perWeek: true,
    },
    {
      text: `Record: write the wallet, the dates and every transaction hash in a farm log, so the whole position can be audited later.`,
      cost: 'nothing but the log',
      time: '5 minutes',
      hours: 0.08,
      perWeek: false,
    },
    {
      text: `Unwind: hold the position for at least ${hold} days so the activity is counted in more than one snapshot, then withdraw in two parts so one position stays live until the last snapshot. Claim only from the link the protocol's own site publishes, and never pay to claim.`,
      cost: `the ${dep} comes back, minus gas`,
      time: '10 minutes',
      hours: 0.17,
      perWeek: false,
    },
  ];
}

/** Total hours of a 10-step plan over the 12-week horizon (weekly steps x12). */
function planHours(steps: FarmStep[]): number {
  let h = 0;
  for (const s of steps) h += s.perWeek ? s.hours * 12 : s.hours;
  return h;
}

/** The nearest priced peers: live comparables in the same category, by TVL closeness. */
function nearestPricedPeers(p: SnapshotProtocol, snapshot: Snapshot): { slug: string; name: string; ratio: number; tvl_usd: number }[] {
  const cat = p.category ?? '(no category)';
  const peers = snapshot.protocols
    .filter((q) => q.slug !== p.slug && q.mcap_usd !== null && q.mcap_usd > 0 && q.tvl_usd > 0 && (q.category ?? '(no category)') === cat)
    .map((q) => ({ q, d: Math.abs(Math.log(q.tvl_usd) - Math.log(p.tvl_usd)) }))
    .sort((a, b) => a.d - b.d || (a.q.slug < b.q.slug ? -1 : 1))
    .slice(0, 3)
    .map(({ q }) => ({ slug: q.slug, name: q.name, ratio: round4(q.mcap_usd! / q.tvl_usd), tvl_usd: q.tvl_usd }));
  return peers;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

// ---------------------------------------------------------------------------
// Held-out tests: leave-one-out + walk-forward, for the shipped model and
// for every candidate term. The term tests run WITHOUT the level factor,
// exactly as the research did, so a term must earn its place on raw error.
// ---------------------------------------------------------------------------

/** Leave-one-out predictions for a pool (no level factor). */
function looPredictions(pool: SnapshotProtocol[], refTvl: number, extra?: RidgeExtra, asOf?: string): { preds: number[]; actuals: number[] } {
  const preds: number[] = [];
  const actuals: number[] = [];
  for (const p of pool) {
    const sub = pool.filter((q) => q.slug !== p.slug);
    const m = fitRidge(sub, refTvl, RIDGE_LAMBDA, extra, asOf);
    preds.push(p.tvl_usd * Math.exp(ridgeLogRatio(m, p, extra, asOf)));
    actuals.push(p.mcap_usd!);
  }
  return { preds, actuals };
}

/** Walk-forward predictions: fit before the cut, test from the cut on. No level factor. */
function wfPredictions(pool: SnapshotProtocol[], refTvl: number, cut: string, extra?: RidgeExtra, asOf?: string): { preds: number[]; actuals: number[] } {
  const fitPool = pool.filter((p) => p.listed_at !== null && p.listed_at < cut);
  const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cut);
  const m = fitRidge(fitPool, refTvl, RIDGE_LAMBDA, extra, asOf);
  return { preds: test.map((p) => p.tvl_usd * Math.exp(ridgeLogRatio(m, p, extra, asOf))), actuals: test.map((p) => p.mcap_usd!) };
}

/** Walk-forward with the level factor fitted on the FIT pool only (fully out-of-sample). */
function wfPredictionsFitLevel(pool: SnapshotProtocol[], refTvl: number, cut: string): { preds: number[]; actuals: number[] } {
  const fitPool = pool.filter((p) => p.listed_at !== null && p.listed_at < cut);
  const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cut);
  const fitLoo = looPredictions(fitPool, refTvl);
  const level = levelFromPredictions(fitLoo.preds, fitLoo.actuals);
  const m = fitRidge(fitPool, refTvl);
  return { preds: test.map((p) => p.tvl_usd * Math.exp(ridgeLogRatio(m, p)) * level), actuals: test.map((p) => p.mcap_usd!) };
}

/** Flat baseline predictions (global mean ln ratio only), leave-one-out. */
function flatLooPredictions(pool: SnapshotProtocol[]): { preds: number[]; actuals: number[] } {
  const preds: number[] = [];
  const actuals: number[] = [];
  for (const p of pool) {
    const sub = pool.filter((q) => q.slug !== p.slug);
    const g = Math.exp(mean(sub.map((q) => Math.log(q.mcap_usd! / q.tvl_usd))));
    preds.push(p.tvl_usd * g);
    actuals.push(p.mcap_usd!);
  }
  return { preds, actuals };
}

/** Flat baseline predictions, walk-forward (fit before the cut). */
function flatWfPredictions(pool: SnapshotProtocol[], cut: string): { preds: number[]; actuals: number[] } {
  const fitPool = pool.filter((p) => p.listed_at !== null && p.listed_at < cut);
  const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cut);
  const g = Math.exp(mean(fitPool.map((q) => Math.log(q.mcap_usd! / q.tvl_usd))));
  return { preds: test.map((p) => p.tvl_usd * g), actuals: test.map((p) => p.mcap_usd!) };
}

function medLnOf(preds: number[], actuals: number[]): number {
  return median(preds.map((pr, i) => Math.abs(Math.log(pr / actuals[i]!))));
}

/**
 * The term tests: each candidate term must improve median |ln err| in
 * leave-one-out AND in both walk-forwards, or it is reported as
 * tested-not-kept. The negative control (growth shuffled across
 * comparables with a fixed seed) must NOT improve leave-one-out.
 */
function termTests(snapshot: Snapshot): { terms: Evidence['terms']; negativeControl: Evidence['negative_control'] } {
  const evals = evalSet(snapshot);
  const refTvl = median(evals.map((p) => p.tvl_usd));
  const asOf = snapshot.as_of;
  const run = (extra?: RidgeExtra): { loo: number; wf1: number; wf2: number } => {
    const loo = looPredictions(evals, refTvl, extra, asOf);
    const wf1 = wfPredictions(evals, refTvl, WF_CUTS[0]!, extra, asOf);
    const wf2 = wfPredictions(evals, refTvl, WF_CUTS[1]!, extra, asOf);
    return { loo: medLnOf(loo.preds, loo.actuals), wf1: medLnOf(wf1.preds, wf1.actuals), wf2: medLnOf(wf2.preds, wf2.actuals) };
  };
  const base = run();
  const growth = run({ growth: true });
  const age = run({ age: true });
  const chains = run({ chains: true });
  const all = run({ growth: true, age: true, chains: true });
  const kept = (t: { loo: number; wf1: number; wf2: number }): boolean => t.loo < base.loo && t.wf1 < base.wf1 && t.wf2 < base.wf2;
  // Negative control: permuted growth, seeded shuffle.
  const rng = mulberry32(20261128);
  const growths = evals.map((p) => p.change_7d ?? 0);
  for (let i = growths.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = growths[i]!; growths[i] = growths[j]!; growths[j] = t;
  }
  const perm = new Map(evals.map((p, i) => [p.slug, growths[i]!] as [string, number]));
  const control = run({ growth: true, permuteGrowth: perm });
  const r4 = (n: number): number => Math.round(n * 1e3) / 1e3;
  return {
    terms: [
      { name: 'size + category (kept)', kept: true, loo_medLn: r4(base.loo), wf1_medLn: r4(base.wf1), wf2_medLn: r4(base.wf2) },
      { name: '+ 7-day growth', kept: kept(growth), loo_medLn: r4(growth.loo), wf1_medLn: r4(growth.wf1), wf2_medLn: r4(growth.wf2) },
      { name: '+ age', kept: kept(age), loo_medLn: r4(age.loo), wf1_medLn: r4(age.wf1), wf2_medLn: r4(age.wf2) },
      { name: '+ chain count', kept: kept(chains), loo_medLn: r4(chains.loo), wf1_medLn: r4(chains.wf1), wf2_medLn: r4(chains.wf2) },
      { name: '+ growth + age + chains', kept: kept(all), loo_medLn: r4(all.loo), wf1_medLn: r4(all.wf1), wf2_medLn: r4(all.wf2) },
    ],
    negativeControl: { loo_medLn: r4(control.loo), base_loo_medLn: r4(base.loo) },
  };
}

/** Fit the odds model on a pool of protocols (any subset of the snapshot). */
function fitOddsOn(pool: SnapshotProtocol[], asOf: string): OddsModel {
  const refTvl = median(pool.map((p) => p.tvl_usd));
  const cats = [...new Set(pool.map((p) => p.category ?? '(no category)'))].sort();
  const X = pool.map((p) => oddsFeatures(p, cats, refTvl, asOf));
  const y = pool.map((p) => (hasToken(p) ? 1 : 0));
  return { cats, beta: logisticFit(X, y, ODDS_LAMBDA), refTvl };
}

/** Split-half coverage of the interval factors on the LOO residuals. */
function splitHalfCoverage(resid: number[]): { aToB: { p50: number; p80: number }; bToA: { p50: number; p80: number } } {
  const rng = mulberry32(777);
  const idx = resid.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i]!; idx[i] = idx[j]!; idx[j] = t;
  }
  const halfA = idx.slice(0, 64);
  const halfB = idx.slice(64);
  const cover = (train: number[], test: number[]): { p50: number; p80: number } => {
    const r = train.map((i) => resid[i]!);
    const lo25 = quantile(r, 0.25);
    const hi75 = quantile(r, 0.75);
    const lo10 = quantile(r, 0.1);
    const hi90 = quantile(r, 0.9);
    let in50 = 0;
    let in80 = 0;
    for (const i of test) {
      const e = resid[i]!;
      if (e >= lo25 && e <= hi75) in50++;
      if (e >= lo10 && e <= hi90) in80++;
    }
    return { p50: round4((in50 / test.length) * 100), p80: round4((in80 / test.length) * 100) };
  };
  return { aToB: cover(halfA, halfB), bToA: cover(halfB, halfA) };
}

/**
 * All the evidence, computed from the snapshot at build time — nothing is
 * asserted that the program did not measure itself. The odds walk-forward
 * is expected to FAIL (base-rate shift; see the dashboard's caveat) and is
 * reported anyway.
 */
function computeEvidence(
  snapshot: Snapshot,
  looPreds: number[],
  looActuals: number[],
  boardRows: BoardRow[],
  pool: SnapshotProtocol[],
  valueModel: RidgeModel,
): Evidence {
  const evals = evalSet(snapshot);
  const refTvl = median(evals.map((p) => p.tvl_usd));
  const asOf = snapshot.as_of;

  // Value model: LOO (with level, as shipped) + walk-forwards (fit-pool level).
  const valueLoo = heldOutMetrics(looPreds, looActuals);
  const wf1 = wfPredictionsFitLevel(evals, refTvl, WF_CUTS[0]!);
  const wf2 = wfPredictionsFitLevel(evals, refTvl, WF_CUTS[1]!);
  const valueWf1 = heldOutMetrics(wf1.preds, wf1.actuals);
  const valueWf2 = heldOutMetrics(wf2.preds, wf2.actuals);
  const flatLoo = flatLooPredictions(evals);
  const flatWf1 = flatWfPredictions(evals, WF_CUTS[0]!);
  const flatWf2 = flatWfPredictions(evals, WF_CUTS[1]!);
  const flatMiss = {
    loo: round4(median(flatLoo.preds.map((pr, i) => Math.max(pr / flatLoo.actuals[i]!, flatLoo.actuals[i]! / pr)))),
    wf1: round4(median(flatWf1.preds.map((pr, i) => Math.max(pr / flatWf1.actuals[i]!, flatWf1.actuals[i]! / pr)))),
    wf2: round4(median(flatWf2.preds.map((pr, i) => Math.max(pr / flatWf2.actuals[i]!, flatWf2.actuals[i]! / pr)))),
  };

  // Term tests + negative control.
  const { terms, negativeControl } = termTests(snapshot);

  // Token odds: 5-fold CV (seeded, stratified) + walk-forward.
  const all = snapshot.protocols;
  const y = all.map((p) => (hasToken(p) ? 1 : 0));
  const baseRate = mean(y);
  const baselineBrier = round4(baseRate * (1 - baseRate));
  const baselineCalled = round4(Math.max(baseRate, 1 - baseRate) * 100);
  const rng = mulberry32(20261128);
  const idx = all.map((_, i) => i);
  const pos = idx.filter((i) => y[i] === 1);
  const neg = idx.filter((i) => y[i] === 0);
  for (let i = pos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = pos[i]!; pos[i] = pos[j]!; pos[j] = t;
  }
  for (let i = neg.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = neg[i]!; neg[i] = neg[j]!; neg[j] = t;
  }
  const folds: number[][] = [[], [], [], [], []];
  pos.forEach((v, i) => folds[i % 5]!.push(v));
  neg.forEach((v, i) => folds[i % 5]!.push(v));
  const probs = new Array<number>(all.length).fill(0);
  for (let k = 0; k < 5; k++) {
    const testIdx = folds[k]!;
    const trainIdx = folds.flatMap((f, j) => (j === k ? [] : f));
    const m = fitOddsOn(trainIdx.map((i) => all[i]!), asOf);
    for (const i of testIdx) probs[i] = oddsToken(all[i]!, m, asOf);
  }
  const oddsBrier5 = round4(brier(probs, y));
  const oddsCalled = round4(calledRight(probs, y) * 100);
  const oddsWf = (cut: string): { brier: number; baseline: number; called: number; baseline_called: number } => {
    const fitIdx = all.map((p, i) => (p.listed_at !== null && p.listed_at < cut ? i : -1)).filter((i) => i >= 0);
    const testIdx = all.map((p, i) => (p.listed_at !== null && p.listed_at >= cut ? i : -1)).filter((i) => i >= 0);
    const m = fitOddsOn(fitIdx.map((i) => all[i]!), asOf);
    const pr = testIdx.map((i) => oddsToken(all[i]!, m, asOf));
    const actual = testIdx.map((i) => y[i]!);
    const base = mean(actual);
    return {
      brier: round4(brier(pr, actual)),
      baseline: round4(base * (1 - base)),
      called: round4(calledRight(pr, actual) * 100),
      baseline_called: round4(Math.max(base, 1 - base) * 100),
    };
  };
  const oddsWf1 = oddsWf(WF_CUTS[0]!);
  const oddsWf2 = oddsWf(WF_CUTS[1]!);
  const rateOf = (list: SnapshotProtocol[]): number => (list.length > 0 ? round4((list.filter(hasToken).length / list.length) * 100) : 0);
  const oddsBaseRateShift = {
    cut1_fit: rateOf(all.filter((p) => p.listed_at !== null && p.listed_at < WF_CUTS[0]!)),
    cut1_test: rateOf(all.filter((p) => p.listed_at !== null && p.listed_at >= WF_CUTS[0]!)),
    cut2_fit: rateOf(all.filter((p) => p.listed_at !== null && p.listed_at < WF_CUTS[1]!)),
    cut2_test: rateOf(all.filter((p) => p.listed_at !== null && p.listed_at >= WF_CUTS[1]!)),
  };

  // Intervals: quantiles of the LOO log-residuals + split-half coverage.
  const resid = looPreds.map((pr, i) => Math.log(looActuals[i]! / pr));
  const q10 = round4(quantile(resid, 0.1));
  const q25 = round4(quantile(resid, 0.25));
  const q75 = round4(quantile(resid, 0.75));
  const q90 = round4(quantile(resid, 0.9));
  const coverage = splitHalfCoverage(resid);

  // Bootstrap: 200 seeded refits — slope + level ranges, top-10 rank ranges.
  const bootRng = mulberry32(424242);
  const slopes: number[] = [];
  const levels: number[] = [];
  const rankRange = new Map<string, { lo: number; hi: number }>();
  const topSlugs = boardRows.slice(0, 10).map((r) => r.slug);
  for (let b = 0; b < 200; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < evals.length; i++) sample.push(evals[Math.floor(bootRng() * evals.length)]!);
    const m = fitRidge(sample, refTvl);
    slopes.push(m.beta[1]!);
    const sp = sample.map((p) => p.tvl_usd * Math.exp(ridgeLogRatio(m, p)));
    const sa = sample.map((p) => p.mcap_usd!);
    levels.push(levelFromPredictions(sp, sa));
    const scored = pool.map((p) => ({ slug: p.slug, v: p.tvl_usd * Math.exp(ridgeLogRatio(m, p)) })).sort((a, b2) => b2.v - a.v || (a.slug < b2.slug ? -1 : 1));
    scored.slice(0, 10).forEach((s, i) => {
      if (!topSlugs.includes(s.slug)) return;
      const cur = rankRange.get(s.slug) ?? { lo: Infinity, hi: -Infinity };
      cur.lo = Math.min(cur.lo, i + 1);
      cur.hi = Math.max(cur.hi, i + 1);
      rankRange.set(s.slug, cur);
    });
  }
  slopes.sort((a, b) => a - b);
  levels.sort((a, b) => a - b);
  const bootstrapTopRanks = topSlugs.map((slug) => {
    const row = boardRows.find((r) => r.slug === slug)!;
    const r = rankRange.get(slug) ?? { lo: row.rank, hi: row.rank };
    return { slug, name: row.name, lo: r.lo, hi: r.hi };
  });

  // Ledger + farm counts.
  const hasTokenCount = all.filter(hasToken).length;
  const farmCounts = { farm: 0, marginal: 0, skip: 0 };
  for (const r of boardRows) {
    if (r.farm.verdict === 'FARM') farmCounts.farm++;
    else if (r.farm.verdict === 'MARGINAL') farmCounts.marginal++;
    else farmCounts.skip++;
  }

  return {
    value_loo: valueLoo,
    value_wf1: valueWf1,
    value_wf2: valueWf2,
    flat_miss: flatMiss,
    terms,
    negative_control: negativeControl,
    odds_brier_5fold: oddsBrier5,
    odds_baseline_brier: baselineBrier,
    odds_called_right: oddsCalled,
    odds_baseline_called: baselineCalled,
    odds_wf1: oddsWf1,
    odds_wf2: oddsWf2,
    odds_base_rate_shift: oddsBaseRateShift,
    interval_q10: q10,
    interval_q25: q25,
    interval_q75: q75,
    interval_q90: q90,
    coverage_a_to_b: coverage.aToB,
    coverage_b_to_a: coverage.bToA,
    bootstrap_slope: { median: round4(median(slopes)), p5: round4(quantile(slopes, 0.05)), p95: round4(quantile(slopes, 0.95)) },
    bootstrap_level: { median: round4(median(levels)), p5: round4(quantile(levels, 0.05)), p95: round4(quantile(levels, 0.95)) },
    bootstrap_top_ranks: bootstrapTopRanks,
    ledger: {
      total: all.length,
      ranked: boardRows.length,
      has_token: hasTokenCount,
      pre_token_not_ranked: all.length - boardRows.length - hasTokenCount,
      watchlist: snapshot.watchlist.length,
      early: boardRows.length - snapshot.watchlist.length,
    },
    farm_counts: farmCounts,
  };
}

// ---------------------------------------------------------------------------
// Board building.
// ---------------------------------------------------------------------------

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  valueModel: RidgeModel,
  oddsModel: OddsModel,
  interval: { q10: number; q25: number; q75: number; q90: number },
): { board: BoardRow[]; pool: SnapshotProtocol[]; calibration: CalibrationRow[] } {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);
  const pool = [...chosen.values()];

  const scored = pool.map((p) => {
    const v = impliedValue(p, valueModel);
    return { p, ...v, age: ageDays(snapshot.as_of, p.listed_at) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => {
    const steps = farmSteps(s.p, s.age);
    const hours = planHours(steps);
    const farm = farmEconomics(s.p, s.implied, hours);
    const mult = (q: number): number => Math.max(1, Math.round(s.implied * Math.exp(q)));
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        predicted_ratio: s.predictedRatio,
        intercept: s.intercept,
        size_multiplier: s.sizeMultiplier,
        category_effect: s.categoryEffect,
        level_factor: round4(valueModel.levelFactor),
      },
      odds_token: oddsToken(s.p, oddsModel, snapshot.as_of),
      interval_p10_usd: mult(interval.q10),
      interval_p25_usd: mult(interval.q25),
      interval_p75_usd: mult(interval.q75),
      interval_p90_usd: mult(interval.q90),
      farm,
      net_table: farm.net_table,
      peers: nearestPricedPeers(s.p, snapshot),
      farm_steps: steps.map(stepText),
    };
  });
  // Calibration table: each fitted category's effect and comparable count.
  const evals = evalSet(snapshot);
  const compsByCat = new Map<string, number>();
  for (const p of evals) {
    const c = p.category ?? '(no category)';
    compsByCat.set(c, (compsByCat.get(c) ?? 0) + 1);
  }
  const calibration: CalibrationRow[] = valueModel.cats.map((c, i) => ({
    category: c,
    comps: compsByCat.get(c) ?? 0,
    effect: round4(Math.exp(valueModel.beta[2 + i]!)),
  }));
  return { board, pool, calibration };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    predicted_ratio: row.model.predicted_ratio,
    intercept: row.model.intercept,
    size_multiplier: row.model.size_multiplier,
    category_effect: row.model.category_effect,
    level_factor: row.model.level_factor,
    odds_token: row.odds_token,
    interval_p10_usd: row.interval_p10_usd,
    interval_p25_usd: row.interval_p25_usd,
    interval_p75_usd: row.interval_p75_usd,
    interval_p90_usd: row.interval_p90_usd,
    deposit_usd: row.farm.deposit_usd,
    drop_usd: row.farm.drop_usd,
    fees_usd: row.farm.fees_usd,
    hours: row.farm.hours,
    tbill_usd: row.farm.tbill_usd,
    net_usd: row.farm.net_usd,
    net_per_hour_usd: row.farm.net_per_hour_usd,
    verdict: row.farm.verdict,
    net_table: row.net_table,
    peers: row.peers,
    farm_steps: row.farm_steps,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { model: valueModel, looPreds, looActuals } = fitValueModel(snapshot);
  const oddsModel = fitOddsModel(snapshot);
  const resid = looPreds.map((pr, i) => Math.log(looActuals[i]! / pr));
  const interval = {
    q10: quantile(resid, 0.1),
    q25: quantile(resid, 0.25),
    q75: quantile(resid, 0.75),
    q90: quantile(resid, 0.9),
  };
  const { board, pool, calibration } = buildBoard(snapshot, valueModel, oddsModel, interval);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const evidence = computeEvidence(snapshot, looPreds, looActuals, board, pool, valueModel);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    calibration,
    ridge_lambda: RIDGE_LAMBDA,
    odds_lambda: ODDS_LAMBDA,
    slope: round4(valueModel.beta[1]!),
    intercept: round4(valueModel.beta[0]!),
    ref_tvl_usd: valueModel.refTvl,
    level_factor: round4(valueModel.levelFactor),
    checksum: '',
    evidence,
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, farm steps, verdicts, odds and intervals. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!(r.odds_token >= 0 && r.odds_token <= 1)) return `${r.slug} has odds ${r.odds_token}`;
    if (!(r.interval_p10_usd <= r.interval_p25_usd && r.interval_p25_usd <= r.interval_p75_usd && r.interval_p75_usd <= r.interval_p90_usd)) {
      return `${r.slug} has unordered intervals`;
    }
    if (r.farm.verdict !== 'FARM' && r.farm.verdict !== 'MARGINAL' && r.farm.verdict !== 'SKIP') return `${r.slug} has verdict ${r.farm.verdict}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
