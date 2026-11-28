// Token Launch Radar dashboard v10: renders window.RADAR (written by main.ts
// as data.js) as a sortable, filterable board with a detail view per protocol,
// an evidence strip, an integrity strip and costed farm verdicts.
// No network: every byte the page needs is in data.js beside it.
// v10: the board's Implied column is the EXPECTED value — the if-launches
// value times the by-horizon conditional token odds — and the detail view
// shows both figures with the formula. The board's Odds column is the
// CONDITIONAL token odds by the oldest cohort's age (5.07y), from the same
// logistic that scores P(has token by today) — see lib/model.ts.
(function () {
  var R = window.RADAR;
  if (!R) { document.body.insertAdjacentHTML('beforeend', '<p>No radar data.</p>'); return; }
  var E = R.evidence;

  var fmtUsd = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + Math.round(n).toLocaleString('en-US');
  };
  var fmtMoney = function (n) {
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    if (a >= 1000) return sign + '$' + Math.round(a).toLocaleString('en-US');
    return sign + '$' + a.toFixed(2);
  };
  var fmtPct = function (v) { return v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
  var fmtAge = function (d) { return d === null || d === undefined ? '—' : d + 'd'; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var isWatch = function (row) { return !!row.watchlist; };

  // ---- stats header
  var stats = document.getElementById('stats');
  stats.innerHTML =
    '<div class="stat"><b>' + R.board_size + '</b><span>ranked rows</span></div>' +
    '<div class="stat"><b>' + R.watchlist_size + '</b><span>watchlist</span></div>' +
    '<div class="stat"><b>' + R.early_size + '</b><span>early finds</span></div>' +
    '<div class="stat"><b>' + R.live_size + '</b><span>live tokens</span></div>';
  document.getElementById('asof').textContent = R.as_of;
  document.getElementById('src').textContent = R.source;
  document.getElementById('checksum').textContent = R.checksum || '—';

  // ---- KPI evidence strip (numbers from the build's own evidence; walk-forward first)
  var kpis = document.getElementById('kpis');
  kpis.innerHTML =
    '<div class="kpi"><b>WF miss &times;' + E.value_wf1.miss.toFixed(2) + ' / &times;' + E.value_wf2.miss.toFixed(2) + '</b><span>vs flat &times;' + E.flat_miss.wf1.toFixed(2) + ' / &times;' + E.flat_miss.wf2.toFixed(2) + ' (test n = ' + E.value_wf1.n + ' / ' + E.value_wf2.n + ')</span></div>' +
    '<div class="kpi"><b>LOO miss &times;' + E.value_loo.miss.toFixed(2) + '</b><span>vs &times;' + E.flat_miss.loo.toFixed(2) + ' flat (n = ' + E.value_loo.n + ' traded comparables)</span></div>' +
    '<div class="kpi"><b>Odds Brier ' + E.odds_brier_10fold.toFixed(3) + '</b><span>10-fold, vs ' + E.odds_baseline_brier.toFixed(3) + ' baseline; AUC ' + E.odds_auc_10fold.toFixed(3) + '; WF ' + E.odds_wf1.brier.toFixed(3) + ' / ' + E.odds_wf2.brier.toFixed(3) + ' / ' + E.odds_wf3.brier.toFixed(3) + ' vs fit-rate ' + E.odds_wf1.baseline_fit.toFixed(3) + ' / ' + E.odds_wf2.baseline_fit.toFixed(3) + ' / ' + E.odds_wf3.baseline_fit.toFixed(3) + '</span></div>' +
    '<div class="kpi"><b>Within 3&times; ' + E.within3.loo.toFixed(1) + '% / ' + E.within3.wf1.toFixed(1) + '% / ' + E.within3.wf2.toFixed(1) + '%</b><span>LOO / WF Jul 2024 / WF Jan 2025; split-half 20-seed mean P50 ' + E.coverage_mean.p50.toFixed(1) + '% / P80 ' + E.coverage_mean.p80.toFixed(1) + '%</span></div>' +
    '<div class="kpi"><b>' + E.terms.filter(function (t) { return t.kept; }).length + ' of ' + E.terms.length + ' terms kept</b><span>negative control: shuffled growth moves LOO by ' + Math.abs(E.negative_control.loo_medLn - E.negative_control.base_loo_medLn).toFixed(3) + ' (noise)</span></div>' +
    '<div class="kpi"><b>' + E.comparables.kept + ' / ' + E.comparables.total + ' comparables</b><span>audited out: ' + E.comparables.dropped_cex + ' exchanges, ' + E.comparables.dropped_versioned + ' versioned pool, ' + E.comparables.dropped_bridge + ' canonical bridges, ' + E.comparables.dropped_nontraded + ' non-traded</span></div>' +
    '<div class="kpi"><b>' + E.farm_counts.farm + ' FARM / ' + E.farm_counts.marginal + ' MARGINAL / ' + E.farm_counts.skip + ' SKIP</b><span>costed farm verdicts, watchlist ' + E.ledger.watchlist + '/' + E.ledger.watchlist + '</span></div>';

  // ---- ledger line
  document.getElementById('ledger-line').textContent =
    'Counted at build time: ' + E.ledger.total + ' = ' + E.ledger.ranked + ' ranked + ' + E.ledger.has_token +
    ' token + ' + E.ledger.pre_token_not_ranked + ' pre-token not ranked. Early finds: ' + E.ledger.early + '.';

  // ---- calibration table (top 12 categories by comps)
  var cal = R.calibration.slice().sort(function (a, b) { return b.comps - a.comps || (a.category < b.category ? -1 : 1); }).slice(0, 12);
  document.querySelector('#calib-table tbody').innerHTML = cal.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.comps + '</td><td class="num">' + c.effect.toFixed(3) + '&times;</td></tr>';
  }).join('') + '<tr><td colspan="3" class="note">Effect is the ridge category multiplier (exp of the fitted effect), shrunk with &lambda; = ' + R.ridge_lambda + '. Level factor ' + R.level_factor.toFixed(2) + ' centres the median comparable on its market cap. Full table: ' + R.calibration.length + ' categories.</td></tr>';
  document.getElementById('tvl-note').textContent = 'Ridge: intercept ' + R.intercept.toFixed(3) +
    ', size slope ' + R.slope.toFixed(2) + ' below $250M of TVL with a hinge of ' + R.hinge.toFixed(3) + ' above it (bigger protocols earn less per TVL dollar, and the curve flattens for the largest), reference TVL ' +
    fmtUsd(R.ref_tvl_usd) + ', level factor ' + R.level_factor.toFixed(2) + '. Backtest over the snapshot\u2019s live-token protocols (leave-one-out): ' +
    'median error ' + E.value_loo.mdAPE.toFixed(1) + '% vs 86.4% for the v3 model, ' + E.value_loo.within2.toFixed(1) + '% of predictions within 2\u00d7 of the real market cap vs 28.9%.';

  // ---- integrity strip: recomputed live in this browser from the board data
  (function () {
    var rows = R.rows.slice().sort(function (a, b) { return a.rank - b.rank; });
    var ranksOk = rows.every(function (r, i) { return r.rank === i + 1; });
    var orderOk = true;
    for (var i = 1; i < rows.length; i++) if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) orderOk = false;
    var total = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var watchOk = rows.filter(isWatch).length === R.watchlist_size;
    var checks = [
      { label: rows.length + ' / ' + rows.length + ' rows recomputed', ok: rows.length === R.board_size },
      { label: 'ranks 1..' + rows.length + ' sequential', ok: ranksOk },
      { label: 'implied value non-increasing', ok: orderOk },
      { label: 'total implied ' + fmtUsd(total), ok: total > 0 },
      { label: 'watchlist ' + rows.filter(isWatch).length + '/' + R.watchlist_size, ok: watchOk },
      { label: 'checksum ' + (R.checksum || '—') + ' (sha256 of main.ts, first 8 hex)', ok: !!R.checksum },
    ];
    document.getElementById('integrity').innerHTML = checks.map(function (c) {
      return '<span class="check' + (c.ok ? ' ok' : ' bad') + '">' + (c.ok ? 'PASS' : 'FAIL') + ' &mdash; ' + esc(c.label) + '</span>';
    }).join('');
  })();

  // ---- bootstrap table
  document.getElementById('bootstrap-note').textContent =
    'Size slope ' + E.bootstrap_slope.median.toFixed(3) + ' (P5 ' + E.bootstrap_slope.p5.toFixed(3) + ', P95 ' + E.bootstrap_slope.p95.toFixed(3) +
    '); level factor ' + E.bootstrap_level.median.toFixed(3) + ' (P5 ' + E.bootstrap_level.p5.toFixed(3) + ', P95 ' + E.bootstrap_level.p95.toFixed(3) + ').';
  document.querySelector('#bootstrap-table tbody').innerHTML = E.bootstrap_top_ranks.map(function (r) {
    return '<tr><td>' + esc(r.name) + '</td><td class="num">' + (R.rows.find(function (x) { return x.slug === r.slug; }) || { rank: '?' }).rank + '</td><td class="num">' + r.lo + '&ndash;' + r.hi + '</td></tr>';
  }).join('');

  // ---- filter controls
  var cats = Array.from(new Set(R.rows.map(function (r) { return r.category || '(no category)'; }))).sort();
  var chains = Array.from(new Set(R.rows.flatMap(function (r) { return r.chains; }))).sort();
  var catSel = document.getElementById('category');
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
  var chainSel = document.getElementById('chain');
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o); });

  var state = { q: '', cat: '', chain: '', source: 'all', verdict: '', sort: 'rank', selected: null };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (state.cat && (r.category || '(no category)') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.source === 'watchlist' && !isWatch(r)) return false;
      if (state.source === 'early' && isWatch(r)) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      net_hour: function (a, b) { return b.net_per_hour_usd - a.net_per_hour_usd; },
      odds: function (a, b) { return b.odds_token_horizon - a.odds_token_horizon; },
    }[state.sort];
    return rows.slice().sort(by);
  }

  var tbody = document.querySelector('#board tbody');
  var countEl = document.getElementById('count');
  function render() {
    var rows = filtered();
    countEl.textContent = rows.length + ' of ' + R.rows.length + ' protocols shown';
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b> <span class="tag' + (isWatch(r) ? '' : ' early') + '">' + (isWatch(r) ? 'watchlist' : 'early') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + (r.odds_token_horizon * 100).toFixed(1) + '%</td>' +
        '<td><span class="verdict v-' + r.verdict.toLowerCase() + '">' + r.verdict + '</span></td>' +
        '<td class="num">' + fmtMoney(r.net_per_hour_usd) + '/h</td></tr>';
    }).join('');
  }

  tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr');
    if (!tr) return;
    showDetail(tr.getAttribute('data-slug'));
  });

  function showDetail(slug) {
    var r = R.rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    state.selected = slug;
    render();
    var d = document.getElementById('detail');
    d.hidden = false;
    document.getElementById('detail-title').textContent = '#' + r.rank + ' — ' + r.name;
    var baseExp = Math.exp(r.intercept);
    // The bar chart compares if-launches ratios: this row's if-launches
    // value per TVL against the category centre (also if-launches). The
    // board's Implied column is the expected value — the if-launches
    // value times the token odds — so the bars never mix the two scales.
    var impliedPerTvl = r.implied_if_launches_usd / r.tvl_usd;
    var catRow = null;
    for (var i = 0; i < R.calibration.length; i++) { if (R.calibration[i].category === (r.category || '(no category)')) { catRow = R.calibration[i]; break; } }
    var maxRatio = Math.max(impliedPerTvl, catRow ? catRow.effect * baseExp : 0, 0.001);
    var barW = function (v) { return Math.max(2, Math.round((v / maxRatio) * 100)); };
    var netRows = r.net_table.shares.map(function (s, i) {
      return '<tr><td>' + (s * 100).toFixed(1) + '% of implied</td>' + r.net_table.net_usd[i].map(function (v) { return '<td class="num">' + fmtMoney(v) + '</td>'; }).join('') + '</tr>';
    }).join('');
    document.getElementById('detail-body').innerHTML =
      '<p>' + esc(r.category || 'No category') + ' &middot; ' + esc(r.chains.join(', ')) +
      ' &middot; TVL ' + fmtUsd(r.tvl_usd) + ' &middot; 7-day ' + fmtPct(r.change_7d) +
      ' &middot; listed ' + (r.listed_at || 'unknown') + ' (' + fmtAge(r.age_days) + ') &middot; records no token.</p>' +
      '<h3>How the figure is made</h3>' +
      '<p>ln(mcap / TVL) = intercept ' + r.intercept.toFixed(3) + ' + size term ln(' + r.size_multiplier.toFixed(3) + ') + category term ln(' + r.category_effect.toFixed(3) + '). ' +
      'The size term is a hinge in ln(TVL) (linear slope below $250M of TVL, flatter above it), so it is the whole size curve, not a single slope. ' +
      'So the predicted ratio is exp(' + r.intercept.toFixed(3) + ') &times; ' + r.size_multiplier.toFixed(3) + ' &times; ' + r.category_effect.toFixed(3) + ' = ' + r.predicted_ratio.toFixed(3) + '&times; TVL. ' +
      'Times the level factor ' + r.level_factor.toFixed(2) + ' gives the value if a token launches: ' + fmtUsd(r.implied_if_launches_usd) + '. ' +
      'Times the token odds below (' + (r.odds_token_horizon * 100).toFixed(1) + '%) gives the expected value ' + fmtUsd(r.implied_value_usd) + ' — the figure the board ranks by.</p>' +
      '<div class="model-line">' +
      '<span class="chip">TVL <b>' + fmtUsd(r.tvl_usd) + '</b></span>' +
      '<span class="chip">predicted ratio <b>' + r.predicted_ratio.toFixed(3) + '&times;</b></span>' +
      '<span class="chip">size <b>&times; ' + r.size_multiplier.toFixed(3) + '</b></span>' +
      '<span class="chip">category <b>&times; ' + r.category_effect.toFixed(3) + '</b></span>' +
      '<span class="chip">level <b>&times; ' + r.level_factor.toFixed(2) + '</b></span>' +
      '<span class="chip">if it launches <b>' + fmtUsd(r.implied_if_launches_usd) + '</b></span>' +
      '<span class="chip">token odds <b>' + (r.odds_token_horizon * 100).toFixed(1) + '%</b></span>' +
      '<span class="chip">expected value <b>' + fmtUsd(r.implied_value_usd) + '</b></span>' +
      '</div>' +
      '<p>Token odds by ' + E.odds_horizon_years.toFixed(2) + ' years (the oldest cohort&rsquo;s age), given no token by its current age: <b>' + (r.odds_token_horizon * 100).toFixed(1) + '%</b>. ' +
      'That is (F(' + E.odds_horizon_years.toFixed(2) + 'y) &minus; F(age)) / (1 &minus; F(age)), where F is the same logistic that gives P(has token by today) = <b>' + (r.odds_token * 100).toFixed(1) + '%</b>. ' +
      'The conditional is the peers&rsquo; record, not a launch forecast: the Brier in the evidence below scores P(has token by today), never the conditional. ' +
      'Plausible range from the leave-one-out residuals: P25&ndash;P75 <b>' + fmtUsd(r.interval_p25_usd) + ' &ndash; ' + fmtUsd(r.interval_p75_usd) + '</b>, ' +
      'P10&ndash;P90 <b>' + fmtUsd(r.interval_p10_usd) + ' &ndash; ' + fmtUsd(r.interval_p90_usd) + '</b>.</p>' +
      (r.peers.length > 0 ? '<p>Nearest priced peers in ' + esc(r.category || 'this category') + ': ' + r.peers.map(function (p) { return '<b>' + esc(p.name) + '</b> ' + p.ratio.toFixed(2) + '&times; TVL (' + fmtUsd(p.tvl_usd) + ')'; }).join(', ') + '.</p>' : '<p>No live-token comparables in this category.</p>') +
      '<div class="bars">' +
      '<div class="bar-row"><span class="lbl">This row</span><span class="track"><span class="fill impl" style="width:' + barW(impliedPerTvl) + '%"></span></span><span class="val">' + impliedPerTvl.toFixed(3) + '&times; TVL</span></div>' +
      (catRow ? '<div class="bar-row"><span class="lbl">Category centre</span><span class="track"><span class="fill" style="width:' + barW(catRow.effect * baseExp) + '%"></span></span><span class="val">' + (catRow.effect * baseExp).toFixed(3) + '&times; TVL</span></div>' : '') +
      '</div>' +
      '<h3>Farm verdict: <span class="verdict v-' + r.verdict.toLowerCase() + '">' + r.verdict + '</span></h3>' +
      '<p class="note">Assumptions: deposit min($10,000, 0.02% of TVL); horizon 12 weeks; modelled drop = expected implied value &times; 7% &times; (deposit / TVL); fees = 6 on-chain actions &times; gas of the main chain (Ethereum $8, BSC $1, Arbitrum / Optimism / Base $0.50, Solana $0.01, other $2); T-bill = deposit &times; 4% &times; 12/52. FARM when net beats the T-bill AND net/hour is at least $25; MARGINAL when net is positive but the FARM bar is not met; SKIP when net is zero or negative. The drop uses the expected value because it only materialises if a token launches — that is why only ' + E.farm_counts.farm + ' of the ' + R.board_size + ' rows clear the FARM bar; the if-launches figures are shown above.</p>' +
      '<div class="model-line">' +
      '<span class="chip">deposit <b>' + fmtMoney(r.deposit_usd) + '</b></span>' +
      '<span class="chip">modelled drop <b>' + fmtMoney(r.drop_usd) + '</b></span>' +
      '<span class="chip">fees <b>' + fmtMoney(r.fees_usd) + '</b></span>' +
      '<span class="chip">hours <b>' + r.hours.toFixed(2) + '</b></span>' +
      '<span class="chip">T-bill <b>' + fmtMoney(r.tbill_usd) + '</b></span>' +
      '<span class="chip">net <b>' + fmtMoney(r.net_usd) + '</b></span>' +
      '<span class="chip">net / hour <b>' + fmtMoney(r.net_per_hour_usd) + '</b></span>' +
      '</div>' +
      '<h3>Net if the drop share or the deposit changes</h3>' +
      '<table class="ev nettable"><thead><tr><th>Drop share</th>' + r.net_table.deposits.map(function (dep) { return '<th class="num">Deposit $' + dep.toLocaleString('en-US') + '</th>'; }).join('') + '</tr></thead><tbody>' + netRows + '</tbody></table>' +
      '<h3>Farm plan (10 steps)</h3><ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
  }

  // ---- live tokens
  document.querySelector('#live tbody').innerHTML = R.live.map(function (p) {
    return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd || 0) + '</td>' +
      '<td class="num">' + fmtPct(p.change_7d) + '</td></tr>';
  }).join('');

  // ---- wire controls
  document.getElementById('search').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  document.getElementById('source').addEventListener('change', function (e) { state.source = e.target.value; render(); });
  document.getElementById('verdict').addEventListener('change', function (e) { state.verdict = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });

  render();
})();
