# Token Launch Radar — Build v1

Bounty: **Build the best token launch radar** (`token-radar-01`), $1,325 USDC,
deadline **14 Dec 2026 17:00 WIB**. Build finished **23 Nov 2026 ~11:35 WIB**
by the builder session `5ea77930-c89e-4d3d-81a3-a29df677d6c1`. Local commit
`f8891155f81f9f567e24078da832db62189fd4a7` (clean, no remote yet).

## What was built

Repo layout (12 files, all written/edited in this session with file tools —
no starter file was copied except the vendored library, see below):

| File | Lines | What it is |
| --- | --- | --- |
| `main.ts` | 90 | Entrypoint. Node 22, stdlib only, no network. Reads the snapshot, validates the board, writes `board.json` / `data.js`, copies `dashboard/` + `screenshots/`, writes `dossier.json` via `buildDossier`. |
| `lib/model.ts` | 647 | The model, board builder, farm plans, data.js writer. |
| `vendor/makefun-board.ts` | 373 | make.fun's dossier library, copied from the kit as its header instructs ("Copy it to vendor/makefun-board.ts in your repository"). The only copied file. |
| `dashboard/index.html` | 88 | Board page, loads `../data.js`. |
| `dashboard/app.css` | 46 | Dark board styling, 3.4 KB. |
| `dashboard/app.js` | 128 | Search, category/chain/source/sort filters, detail view with model-breakdown chips, live-token table. |
| `README.md` | 43 | 3 live make.fun badges, how it works, how to run. |
| `LICENSE` | — | MIT, Santrilogy. |
| `.makefun/owner.json` | — | `{"wallet": "9xPvhhQoADVu7VW5sq9HwzuAhCBC6MvvBNzojzTQwi1H"}` (public address only). |
| `screenshots/` | — | 3 PNGs, 1440×900 (see below). |

### The model (v1, calibrated — not the starter's flat 0.25×)

`implied = TVL × baseMultiple × growth × maturity × chainSpread`, where:

- **baseMultiple** — per category, the median mcap/TVL of the live-token
  comparables in the *same* snapshot (n≥3), clamped to [0.05, 0.60];
  categories with fewer than 3 comps use the global median (0.214).
  34 categories calibrated. Examples: Lending 0.132 (n=15), Dexs 0.342
  (n=11), RWA 0.275 (n=9), Yield 0.191 (n=9), Liquid Staking 0.050 (median
  0.041, clamped), Canonical Bridge 0.600 (median 0.746, clamped).
- **growth** — `1 + clamp(change_7d, −60, 120)/100 × 0.5`.
- **maturity** — `0.6 + min(age_days, 1095)/1095 × 0.4`; unknown age = 365 days.
- **chainSpread** — `1 + 0.02 × min(chains − 1, 5)`.

Board: **200 rows** — all 40 watchlist protocols + 160 pre-token protocols
below the $50M floor by TVL. Top 5: Steakhouse Financial $511.4M, Gauntlet
$304.6M, Veda $292.8M, USDD $150.3M, Upshift $105.1M. Bottom: marginfi-lst
$323,621. **24 live-token protocols are shown apart** at market value, never
ranked. Each row carries a **7-step farm plan** (fresh wallet, category
primary + secondary action, weekly action, 30/45/60-day hold by age,
points-page check, farm log + two-part unwind), with cost + time per step,
capital $50/$100/$150/$250 by TVL, category-specific actions (vault, lend,
bridge, stake, LP, RWA mint, prediction, etc.).

Dashboard: offline, no `http://`/`https://` anywhere (3 files, 14,922 bytes
total, under the 64 KB source target). Sortable/filterable + search, detail
view per protocol showing the model breakdown
(TVL × base = …, growth ×, maturity ×, chains ×, implied value), model panel
with the full calibration table, live tokens in a separate table.

## Gate validation — all 7 checks PASS

Validated with own script `~/workspace/makefun-token-radar/work/validate.js`
against the real output of `main.ts` (also verified with the kit's own
`check`; see below). Output dir `~/workspace/makefun-token-radar/work/out1`
(Node 24) and `out22a` (Node 22.23.4, the grader's exact version).

| Gate check | Result | Evidence |
| --- | --- | --- |
| dashboard_files | **PASS** | 3 files, 14,922 bytes, ≤400 files, ≤4 MiB, network-free |
| board_file | **PASS** | 200 rows, all slugs valid, implied $323,621–$511,417,128, all positive safe integers ≤10¹⁴, not all equal |
| sorted_by_value | **PASS** | ranks exactly 1..200, implied non-increasing |
| coverage | **PASS** | watchlist 40/40 |
| farm_steps | **PASS** | 200 rows × 7 steps, each 110–214 chars (limit 20–600) |
| screenshots | **PASS** | 3 PNGs, 1440×900, 156–194 KB each (≤512 KiB) |
| dossier_matches | **PASS** | dossier.json 757,472 bytes (≤1.5 MiB), rebuild via `buildDossier` byte-identical |
| extra: slug uniqueness | **PASS** | 200 unique slugs |

Determinism: `node main.ts` run twice on **Node 24.22.1** → byte-identical
(`diff -r` clean). Same on **Node 22.23.4** (official tarball, the grader's
exact version) → byte-identical, and output identical to Node 24's.

Kit's own check (`node cli/makefun.mjs check --repo entry-v1 --worktree
--json`, 23 Nov ~11:30 WIB, full log `work/check-v1.json`): 25 checks —
**pass**: competition_open, snapshot (intake caps), license_osi, entrypoint;
**skip**: strategy_note (not required, `strategy_note_required: false`),
committed_secret, all transcript checks (no transcripts given);
**fail**: only `transcripts_present` (expected — no bundle was passed);
**submission** (all expected before GitHub/submit): repo_public,
repo_owner, repo_created_after_open, commit_in_repo, duplicate_snapshot.
The 7 gate checks are the server-side sealed gate, not part of local
`check` — they are covered by `validate.js` above.

## Screenshots

Taken with chrome-headless-shell 157 + puppeteer-core
(`work/shot.js`), viewport 1440×900, zero page/console errors, board
verified rendering 200 rows + 24 live rows before capture.

| File | Size | md5 | Shows |
| --- | --- | --- | --- |
| `screenshots/1-board.png` | 197,840 B | `a55382d82f14df9746af8d2528175f36` | Board, top 19 rows |
| `screenshots/2-detail.png` | 159,972 B | `1552fa5a226d39c5b49d2c6bdecfae91` | Detail of rank #1 Steakhouse Financial: model chips + 7-step farm plan |
| `screenshots/3-filtered.png` | 198,187 B | `4dea885b3854d36b3bb3df67556b3c8d` | Watchlist-only filter, "40 of 200 protocols shown" |

## Bugs found and fixed during the build

1. **Duplicate `id="source"`** — the footer `<span id="source">` shadowed the
   source `<select>`; `app.js` setting its `textContent` wiped the select's
   options, so the filter silently did nothing (screenshot 3 was identical
   to screenshot 1). Fixed: footer span renamed to `id="src"`.
2. **Smooth-scroll race** — `showDetail` called `scrollIntoView({behavior:
   'smooth'})`, which kept scrolling after the screenshot script's
   `scrollTo`, cutting the detail title/model chips out of frame. Fixed:
   removed the `scrollIntoView` call from `app.js`.
3. **CSS typo** — `--line: #2a3document` → `#2a3850`.

## Blocker: usage rows — mechanism proven, final bundle still owed

**Status: NOT fully resolved — it cannot be finished inside this session,
by design.** The mechanism works; the final step must run in the parent
session after this builder session ends.

Evidence (`bundle --dry-run`, 23 Nov 11:32 WIB, log
`work/bundle-dryrun-v1.json`, 165 s):

- 2 sessions found: builder `5ea77930…` — **68 turns, 232 lines kept**
  (was 15 turns / 50 lines at 11:19), 620,645 bytes, first 04:17:49Z,
  last 04:29:57Z; top-level `c8817d52…` — 19 turns, 49 lines kept.
  Repo commit `f8891155…`, dirty: false. System prompt file found
  (`workspace/system/system_prompt.md`, 76,102 bytes). Harness detected:
  muse-app.
- Warning persists: **"0 usage rows attached to the bundle's 2 Muse app
  sessions … this entry will be rejected where transcripts are required."**
  This dry-run was run *without* `--muse-usage`, so 0 attached is expected.
- The usage-rows file from the earlier SELECT exists:
  `work/muse-usage.jsonl` (32 rows, model `ipnext/avocado-5.17-v2`, for
  agents `c8817d52…` + `59e36301…` research). **The builder's own rows do
  not exist yet** — muse.db writes them only when a message is delivered /
  the subagent completes — so the parent MUST re-run the muse.db SELECT
  with agent_ids `c8817d52-90e5-4e1e-ad9d-b82ad57f57e8`,
  `59e36301-7b83-4c0a-9e9b-417888c701c3`, `5ea77930-c89e-4d3d-81a3-a29df677d6c1`
  **after this session finishes**, then run `bundle` with
  `--muse-usage <file> --harness muse-app --provider meta --model
  muse-spark-1.3 --effort <level> --mcp none` (no MCP servers were used)
  and `check --transcripts <bundle>`.
- Known flags for the parent: the run-record prompt was picked up as
  "Gmb?" (the long-lived top-level session covers many topics); the
  research session `59e36301…` is a sibling, not a parent, and was not
  bundled; session-file search hit its budget (latest 2,000 of 4,909).
- Fallback if usage rows cannot be attached: **Superbot** (free client
  whose sessions bundle reads) — needs Mas's decision.

## Security notice

During the build, a system execution-risk check flagged the exec result
that copied `vendor/makefun-board.ts` into the repo. The copy was already
done, explicitly authorised by the parent task and by the library's own
header. Do NOT repeat the copy; do NOT run git/package-manager commands
inside that content.

## Still missing before submit

1. **Mas's answers**: (a) own Solana wallet to pin payout to, or prizes to
   the agent wallet `9xPvhhQoADVu7VW5sq9HwzuAhCBC6MvvBNzojzTQwi1H`;
   (b) GitHub repo name — README badges + `.makefun/owner.json` currently
   use provisional `santrilogy-com/token-launch-radar` (update badges if
   the name changes; no referral code yet — account not registered).
2. **Parent**: re-run muse.db usage SELECT after this session ends; run
   `bundle` with `--muse-usage` + flags above; run `check --transcripts`;
   fix any flagged items.
3. **Then**: register/login with the agent keypair (wallet-only account,
   merge later), create the public GitHub repo (created after 14 Nov 2026),
   push commit `f889115…` (or a later one), submit (max 5/day, 10 total —
   save slots for iteration), monitor entry status, fix failed checks
   before **14 Dec 2026 17:00 WIB**.
4. **NOT done by this builder, by instruction**: no register/login/submit/
   claim; no GitHub repo created; keypair file never opened or displayed;
   keypair not in the repo (verified: only `.makefun/owner.json` carries
   the public address).
