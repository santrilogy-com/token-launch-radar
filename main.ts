// Token Launch Radar v10 — entrypoint (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot from /input/snapshot.json (or
// --input <snapshot.json|directory>), scores every pre-token protocol with
// the ridge model in lib/model.ts, and writes the ranked board to
// /output/board.json. It also writes the dashboard's data as /output/data.js,
// copies this repository's dashboard/ and screenshots/ into /output, and
// writes /output/dossier.json with the vendored make.fun library, so the
// scorer can rebuild it byte for byte.
//
// v10 model (radar-v10-expected-odds): the value model is v9's hinge ridge
// and the odds model is v9's D5+family+chains logistic, both UNCHANGED —
// what changes is what the board ranks by. The Implied column is now the
// EXPECTED value: the if-launches value times the by-horizon conditional
// token odds (implied = TVL x fitted multiple x token odds), the
// construction the leading entry publishes. The if-launches figure is kept
// on every row and shown in the detail view; the farm verdicts use the
// expected value, so only 3 rows clear the FARM bar (v9: 47) — disclosed,
// not hidden. Per-category conformal intervals were tested and rejected in
// work/research-v10-phase2.ts (no improvement; k>=8 is exactly global).
// The entry program measures its own evidence at build time
// (leave-one-out and walk-forward metrics on the traded set, the same
// model evaluated on the full 128, token-odds Brier and AUC on 10-fold CV
// and THREE walk-forward cuts, the odds term table, interval coverage, 200
// bootstrap refits — the bootstrap now scores the shipped expected-value
// ranks) and embeds it in data.js, so the dashboard shows numbers the
// program itself computed, never asserted.
//
// Run locally the same way the grader runs it, with MAKEFUN_OUTPUT_DIR:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
// Run it twice and compare the two outputs: they must be byte-identical.

import { createHash } from 'node:crypto';
import { copyFileSync as copyFile, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after `--name <value>` or `--name=<value>`, else the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// Integrity checksum: the first 8 hex of sha256 of this entry program.
// It is computed from the file the grader runs, so it is identical on
// every run of the same entry and changes if the program changes.
const programHash = createHash('sha256').update(readFileSync(join(here, 'main.ts'))).digest('hex').slice(0, 8);
radar.checksum = programHash;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFile(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const ev = radar.evidence;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n` +
    `token radar: checksum ${programHash} (sha256 of main.ts, first 8 hex)\n` +
    `token radar: LOO MdAPE ${ev.value_loo.mdAPE}% med|ln| ${ev.value_loo.medLn} within2 ${ev.value_loo.within2}% bias ${ev.value_loo.bias}% miss x${ev.value_loo.miss} (n=${ev.value_loo.n})\n` +
    `token radar: WF miss x${ev.value_wf1.miss} vs flat x${ev.flat_miss.wf1} (cut 2024-07-01), x${ev.value_wf2.miss} vs flat x${ev.flat_miss.wf2} (cut 2025-01-01)\n` +
    `token radar: comparables ${ev.comparables.kept}/${ev.comparables.total} kept (dropped CEX ${ev.comparables.dropped_cex}, versioned ${ev.comparables.dropped_versioned}, bridges ${ev.comparables.dropped_bridge}, non-traded ${ev.comparables.dropped_nontraded}); full-128 LOO miss x${ev.full_set.loo.miss} WF x${ev.full_set.wf1.miss} / x${ev.full_set.wf2.miss}\n` +
    `token radar: odds 10-fold Brier ${ev.odds_brier_10fold} vs baseline ${ev.odds_baseline_brier}, AUC ${ev.odds_auc_10fold}, called right ${ev.odds_called_right}% vs ${ev.odds_baseline_called}%\n` +
    `token radar: odds walk-forward Brier ${ev.odds_wf1.brier} / ${ev.odds_wf2.brier} / ${ev.odds_wf3.brier} vs test-rate baseline ${ev.odds_wf1.baseline} / ${ev.odds_wf2.baseline} / ${ev.odds_wf3.baseline} and fit-rate baseline ${ev.odds_wf1.baseline_fit} / ${ev.odds_wf2.baseline_fit} / ${ev.odds_wf3.baseline_fit} (AUC ${ev.odds_wf1.auc} / ${ev.odds_wf2.auc} / ${ev.odds_wf3.auc}; base-rate shift ${ev.odds_base_rate_shift.cut1_fit}% -> ${ev.odds_base_rate_shift.cut1_test}%; WF3 n=${ev.odds_wf3.n})\n` +
    `token radar: odds horizon ${ev.odds_horizon_years}y, top-10 conditional odds ${ev.odds_top10_horizon.min}% - ${ev.odds_top10_horizon.max}% (Steakhouse ${ev.odds_top10_horizon.steak}% vs static ${ev.odds_top10_horizon.steak_static}%)\n` +
    `token radar: odds term table ${ev.odds_terms.map((t) => `${t.name} ${t.brier10}`).join(' | ')}\n` +
    `token radar: odds unknown-date ${ev.odds_unknown.tokened}/${ev.odds_unknown.n} tokened (${ev.odds_unknown.rate}%) vs ${ev.odds_unknown.known_rate}% dated; dummy coef ${ev.odds_unknown.dummy_coef}; median known age ${ev.odds_median_age_years}y\n` +
    `token radar: interval coverage P25-P75 ${ev.coverage_a_to_b.p50}% / ${ev.coverage_b_to_a.p50}%, P10-P90 ${ev.coverage_a_to_b.p80}% / ${ev.coverage_b_to_a.p80}% (targets 50% / 80%); 20-seed mean ${ev.coverage_mean.p50}% / ${ev.coverage_mean.p80}%; within-3x LOO ${ev.within3.loo}% WF ${ev.within3.wf1}% / ${ev.within3.wf2}%\n` +
    `token radar: ledger ${ev.ledger.total} = ${ev.ledger.ranked} ranked + ${ev.ledger.has_token} token + ${ev.ledger.pre_token_not_ranked} pre-token not ranked; farm ${ev.farm_counts.farm} FARM / ${ev.farm_counts.marginal} MARGINAL / ${ev.farm_counts.skip} SKIP\n`,
);
