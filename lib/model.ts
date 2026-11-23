// Token radar model v3: the implied value of a protocol that records no token.
//
// The model is calibrated on the snapshot itself, not on a hand-written list of
// names. For every category, the live-token protocols in the same snapshot are
// the comparables: their market-cap-to-TVL ratio is what the market already
// pays for a token in that kind of business. Version 3 is fitted against a
// leave-one-out backtest over the snapshot's 144 live-token protocols (see
// work/backtest-v3.ts): it keeps v2's winsorized ratios, shrinkage toward
// the global centre (k = 3), log maturity curve centred at one year, and
// fitted TVL slope, and changes two things the backtest shows help — the
// category centre is now the trimmed geometric mean of the winsorized
// ratios (10% trimmed each tail) instead of the median, because the raw
// ratios run from 0 to 400x and the median ignores how far the tails sit;
// and a level factor, fitted leave-one-out from the same comparables, so
// the median comparable is priced at its actual market cap instead of 8%
// below it. Backtest (128 protocols, leave-one-out): median error 86% vs
// 87% for v2, 29% of predictions within 2x of the real market cap vs 27%,
// median bias +0% vs -8%. Every protocol is then scored by the same six
// factors, all read from its own snapshot record:
//
//   implied = TVL x baseMultiple(category)
//                 x growthMultiplier(change_7d)
//                 x maturityMultiplier(age in days)
//                 x chainSpreadMultiplier(number of chains)
//                 x tvlMultiplier(TVL vs the median live protocol)
//                 x levelFactor(fitted from the live comparables)
//
// A protocol that records a token already trades, so the board never ranks
// one: live-token protocols are shown apart, at the market's own value.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  maturity_ref_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_steps: number;
  multiple_floor: number;
  multiple_cap: number;
  shrink_k: number;
  winsor_lo: number;
  winsor_hi: number;
  tvl_beta_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  maturity_ref_days: 365,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_steps: 5,
  multiple_floor: 0.05,
  multiple_cap: 0.6,
  shrink_k: 3,
  winsor_lo: 0.05,
  winsor_hi: 0.95,
  tvl_beta_cap: 0.25,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-v3-trimmed-level';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    tvl_multiplier: number;
    age_days: number | null;
  };
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
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  tvl_multiplier: number;
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

/** One category's calibration: the comparables behind its base multiple. */
export interface CalibrationRow {
  category: string;
  comps: number;
  center_ratio: number;
  base_multiple: number;
  fallback: boolean;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: CalibrationRow[];
  global_multiple: number;
  tvl_beta: number;
  tvl_ref_usd: number;
  level_factor: number;
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

/**
 * The trimmed geometric mean: the geometric mean of the middle 80% (10%
 * trimmed each tail). For ratios that run from 0 to 400x, the median
 * ignores how far the tails sit; the trimmed geometric mean keeps the
 * centre while the wild ends cannot set it. Falls back to the median when
 * no positive ratio survives the trim.
 */
function trimmedGeomean(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.1);
  const kept = sorted.slice(trim, sorted.length - trim);
  const logs = kept.filter((r) => r > 0).map((r) => Math.log(r));
  if (logs.length === 0) return median(values);
  return Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
}

/** One category's calibration: the comparables behind its base multiple. */
export interface Calibration {
  byCategory: Map<string, number>;
  global: number;
  table: CalibrationRow[];
  tvlBeta: number;
  tvlRefUsd: number;
  winsorLo: number;
  winsorHi: number;
  levelFactor: number;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * Calibrate the base multiple per category from the snapshot's own live-token
 * protocols, and fit the TVL slope from the same comparables. Each live
 * protocol contributes its market-cap-to-TVL ratio, winsorized to the
 * global 5th–95th percentiles first: the raw ratios run from 0 to 400x, so
 * one wild ratio must not set a category's price. The category's centre is
 * the trimmed geometric mean of its winsorized ratios (10% trimmed each
 * tail), shrunk toward the global centre with k = 3 comparables — a
 * category with many comps keeps its own centre, one with few is pulled
 * toward the global, with no hard fallback cliff. The TVL slope is the OLS
 * slope of ln(ratio) on ln(TVL) over the comparables with a positive ratio
 * (a recorded cap of 0 cannot be logged), clamped to +/- tvl_beta_cap: the
 * market pays less per TVL dollar to bigger protocols, and the slope is
 * fitted here, from this snapshot, never hand-written. The table is returned
 * so the dashboard can show its work.
 *
 * `excludeSlug` leaves one comparable out of the pool: the level factor in
 * `calibrate` prices every live comparable with itself left out, so no
 * protocol ever sets its own price. The core calibration carries
 * levelFactor 1, a neutral factor the wrapper replaces with the fitted one.
 */
export function calibrateCore(snapshot: Snapshot, model: ModelConstants = MODEL, excludeSlug: string | null = null): Calibration {
  const comps: { ratio: number; tvl: number; category: string }[] = [];
  for (const p of snapshot.protocols) {
    if (p.slug === excludeSlug) continue;
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio < 0) continue;
    comps.push({ ratio, tvl: p.tvl_usd, category: p.category ?? '(no category)' });
  }
  const clamp = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  const allRatios = comps.map((c) => c.ratio);
  const winsorLo = allRatios.length > 0 ? quantile(allRatios, model.winsor_lo) : 0;
  const winsorHi = allRatios.length > 0 ? quantile(allRatios, model.winsor_hi) : 1;
  const win = (r: number): number => Math.min(winsorHi, Math.max(winsorLo, r));
  const global = clamp(allRatios.length > 0 ? trimmedGeomean(allRatios.map(win)) : 0.25);
  const byCat = new Map<string, number[]>();
  for (const c of comps) {
    const list = byCat.get(c.category) ?? [];
    list.push(win(c.ratio));
    byCat.set(c.category, list);
  }
  const byCategory = new Map<string, number>();
  const table: CalibrationRow[] = [];
  for (const [cat, ratios] of [...byCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const centre = trimmedGeomean(ratios);
    const shrunk = (ratios.length * centre + model.shrink_k * global) / (ratios.length + model.shrink_k);
    byCategory.set(cat, clamp(shrunk));
    table.push({ category: cat, comps: ratios.length, center_ratio: round4(centre), base_multiple: clamp(shrunk), fallback: false });
  }
  // TVL slope: ln(ratio) on ln(TVL), positive ratios only, clamped.
  const fitted = comps.filter((c) => c.ratio > 0);
  const xs = fitted.map((c) => Math.log(c.tvl));
  const ys = fitted.map((c) => Math.log(c.ratio));
  let beta = 0;
  if (xs.length >= 3) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i]! - mx) * (ys[i]! - my);
      den += (xs[i]! - mx) ** 2;
    }
    beta = den === 0 ? 0 : num / den;
  }
  beta = Math.min(model.tvl_beta_cap, Math.max(-model.tvl_beta_cap, beta));
  const tvlRefUsd = comps.length > 0 ? median(comps.map((c) => c.tvl)) : 1;
  return { byCategory, global, table, tvlBeta: beta, tvlRefUsd, winsorLo, winsorHi, levelFactor: 1 };
}

/**
 * The full calibration: the core calibration plus a level factor fitted
 * leave-one-out from the snapshot's own live comparables. Each comparable
 * is priced with itself left out of the pool; the factor is one over the
 * median predicted-to-actual ratio, so the median comparable is priced at
 * its actual market cap instead of below it. The factor is a calibration
 * constant from this snapshot, like the global centre — it uses no
 * information about the pre-token protocols being scored.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const core = calibrateCore(snapshot, model);
  const ratiosPA: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const calExcl = calibrateCore(snapshot, model, p.slug);
    const v = impliedValue(p, snapshot.as_of, calExcl, model);
    ratiosPA.push(v.implied / p.mcap_usd);
  }
  const level = ratiosPA.length > 0 ? median(ratiosPA) : 1;
  const levelFactor = Number.isFinite(level) && level > 0 ? 1 / level : 1;
  return { ...core, levelFactor };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The maturity curve: a log curve that reaches 1.0 at the reference age
 * (one year) and the full range at maturity_days (three years). It is
 * centred, not a drag: a protocol younger than a year scores below 1.0, an
 * older one above, so the curve ranks protocols against each other instead
 * of shrinking every value the way v1's 0.6–1.0 line did.
 */
export function maturityMultiplier(age: number | null, model: ModelConstants = MODEL): number {
  const a = age ?? model.unknown_age_days;
  const curve = (x: number): number =>
    model.maturity_floor +
    model.maturity_range * (Math.log(1 + Math.max(x, 0) / model.maturity_ref_days) / Math.log(1 + model.maturity_days / model.maturity_ref_days));
  return curve(a) / curve(model.maturity_ref_days);
}

/** The six multipliers and the implied value one protocol gets under the calibrated model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  cal: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; baseMultiple: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; tvlMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const baseMultiple = cal.byCategory.get(protocol.category ?? '(no category)') ?? cal.global;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = maturityMultiplier(age, model);
  const spread = Math.max(0, Math.min(protocol.chains.length - 1, model.chain_max_steps));
  const chainMult = 1 + spread * model.chain_step;
  const tvlMult = (protocol.tvl_usd / cal.tvlRefUsd) ** cal.tvlBeta;
  const base = protocol.tvl_usd * baseMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult * tvlMult * cal.levelFactor));
  return { implied, baseMultiple, growthPct, growthMult, maturityMult, chainMult, tvlMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; calibration: CalibrationRow[]; globalMultiple: number; tvlBeta: number; tvlRefUsd: number; levelFactor: number } {
  const cal = calibrate(snapshot, model);
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

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, cal, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
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
      base_multiple: round4(s.baseMultiple),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      tvl_multiplier: round4(s.tvlMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
  return { board, calibration: cal.table, globalMultiple: cal.global, tvlBeta: cal.tvlBeta, tvlRefUsd: cal.tvlRefUsd, levelFactor: cal.levelFactor };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The category's two actions, in the words a farmer can follow. The match is
 * on the category string the snapshot carries, never on a protocol's name, so
 * the same rule scores every row alike.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { primary: string; secondary: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('liquid staking')) {
    return {
      primary: `Stake $${capital} of the chain's staking asset through ${name} and hold the liquid receipt token in your wallet.`,
      secondary: `Use that receipt once in another app on ${chain}, such as lending it out, then bring it back to your wallet.`,
    };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('money market')) {
    return {
      primary: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the position open.`,
      secondary: `Borrow $20 against that collateral, hold it for a week, then repay it in full so the loan is on record.`,
    };
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return {
      primary: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      secondary: `Swap $25 through ${name} on ${chain} once a week, in a different pair each time.`,
    };
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return {
      primary: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds inside its app.`,
      secondary: `Bridge $25 back the other way a week later, so both directions are on record.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      primary: `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
      secondary: `Restake the receipt once, if ${name} offers it, and leave both positions open.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      primary: `Deposit $${capital} of USDC as margin on ${name} and open one small hedge, no more than $25 of size.`,
      secondary: `Close that hedge after a week and open a second one in the opposite direction.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      primary: `Fund $${capital} on ${name} and place one market position of $25 on an outcome you can follow.`,
      secondary: `Place a second $25 position on a different market the following week.`,
    };
  }
  if (c.includes('yield') || c.includes('farm') || c.includes('curator') || c.includes('allocator')) {
    return {
      primary: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares until the hold ends.`,
      secondary: `Claim the vault's yield once, then redeposit it the same day so the claim is on record.`,
    };
  }
  if (c.includes('stable')) {
    return {
      primary: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`,
      secondary: `Swap $25 of that stable asset for USDC and back once, to show the mint is used.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      primary: `Mint $${capital} of the yield asset ${name} issues on ${chain} and hold it in your wallet.`,
      secondary: `Hold it through one yield payout, then check the payout landed before you do anything else.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      primary: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy until it expires.`,
      secondary: `Open a second, smaller cover of $25 on a different pool the next week.`,
    };
  }
  if (c.includes('payment')) {
    return {
      primary: `Route $${capital} through ${name} on ${chain} as a payment, then keep the receipt.`,
      secondary: `Receive $25 back through ${name} the following week, so both sides of the flow are on record.`,
    };
  }
  if (c.includes('launchpad')) {
    return {
      primary: `Stake $${capital} through ${name} to qualify for its next sale allocation on ${chain}.`,
      secondary: `Vote or complete the sale's qualifying task once, and keep the stake through the sale.`,
    };
  }
  if (c.includes('index')) {
    return {
      primary: `Buy $${capital} of the ${name} index token on ${chain} and hold it.`,
      secondary: `Rebalance once by swapping $25 of the index for its largest holding, then back.`,
    };
  }
  if (c.includes('privacy')) {
    return {
      primary: `Make one shielded deposit of $${capital} through ${name} on ${chain} and keep the note.`,
      secondary: `Withdraw $25 from that shielded position a week later, to a fresh address.`,
    };
  }
  if (c.includes('ai agent') || c.includes('decentralized ai')) {
    return {
      primary: `Stake $${capital} through ${name} to run one agent task on ${chain} and keep the task receipt.`,
      secondary: `Run a second, different agent task the following week and save both receipts.`,
    };
  }
  if (c.includes('synthetic') || c.includes('synth')) {
    return {
      primary: `Mint $${capital} of the synthetic asset ${name} issues on ${chain} and hold it in your wallet.`,
      secondary: `Redeem $25 of that synthetic asset a week later, then mint it back, so both directions are on record.`,
    };
  }
  if (c.includes('governance')) {
    return {
      primary: `Stake $${capital} through ${name} and vote on one live proposal on ${chain}.`,
      secondary: `Vote on a second proposal the following week and keep both votes on record.`,
    };
  }
  return {
    primary: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    secondary: `Use ${name} once more the following week, a swap, a deposit or a vote, so the position is active twice.`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. Version 2 adds a risk guard
 * to the two steps where money can quietly leak: skip a weekly action when
 * its gas costs more than $5, and unwind half the position when it loses
 * more than 10% in a week.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const act = actionsFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Open a fresh wallet for ${chain} only, fund it with $${capital} of USDC plus $5 for gas, and store its seed phrase offline.`,
      cost: `$${capital} of capital plus $5 of gas`,
      time: '10 minutes to set up',
    },
    { text: act.primary, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: act.secondary, cost: 'about $3 of gas', time: '10 minutes' },
    {
      text: `Do one qualifying action each week on ${p.name}, such as a deposit, a swap or a vote, and save the transaction receipt. If one week's action would cost more than $5 of gas, skip that week and do it on the cheapest chain the protocol runs on.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. If the position loses more than 10% in a week, unwind half of it and re-read the protocol's docs before you put anything back.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from its official site and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, then unwind in two parts so one position stays live until the last snapshot.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, then the unwind',
    },
  ];
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
    base_multiple: row.model.base_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    tvl_multiplier: row.model.tvl_multiplier,
    farm_steps: row.farm_steps,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, calibration, globalMultiple, tvlBeta, tvlRefUsd, levelFactor } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    calibration,
    global_multiple: globalMultiple,
    tvl_beta: tvlBeta,
    tvl_ref_usd: tvlRefUsd,
    level_factor: levelFactor,
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
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
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
