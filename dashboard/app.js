// Token Launch Radar dashboard: renders window.RADAR (written by main.ts as
// data.js) as a sortable, filterable board with a detail view per protocol.
// No network: every byte the page needs is in data.js beside it.
(function () {
  var R = window.RADAR;
  if (!R) { document.body.insertAdjacentHTML('beforeend', '<p>No radar data.</p>'); return; }

  var fmtUsd = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + Math.round(n).toLocaleString('en-US');
  };
  var fmtPct = function (v) { return v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
  var fmtAge = function (d) { return d === null || d === undefined ? '—' : d + 'd'; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // Each row carries its watchlist flag from the build, so the source filter
  // and the tag next to a protocol's name always agree with board.json.
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

  // ---- calibration table (top 12 categories by comps, then the rest by name)
  var cal = R.calibration.slice().sort(function (a, b) { return b.comps - a.comps || (a.category < b.category ? -1 : 1); }).slice(0, 12);
  document.querySelector('#calib-table tbody').innerHTML = cal.map(function (c) {
    return '<tr><td>' + esc(c.category) + (c.fallback ? ' *' : '') + '</td><td class="num">' + c.comps + '</td><td class="num">' + c.median_ratio.toFixed(3) + '</td><td class="num">' + c.base_multiple.toFixed(3) + '</td></tr>';
  }).join('') + '<tr><td colspan="4" class="note">* uses the global median ' + R.global_multiple.toFixed(3) + ' (fewer than 3 live comparables). Full table: ' + R.calibration.length + ' categories.</td></tr>';

  // ---- filter controls
  var cats = Array.from(new Set(R.rows.map(function (r) { return r.category || '(no category)'; }))).sort();
  var chains = Array.from(new Set(R.rows.flatMap(function (r) { return r.chains; }))).sort();
  var catSel = document.getElementById('category');
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
  var chainSel = document.getElementById('chain');
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o); });

  var state = { q: '', cat: '', chain: '', source: 'all', sort: 'rank', selected: null };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (state.cat && (r.category || '(no category)') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.source === 'watchlist' && !isWatch(r)) return false;
      if (state.source === 'early' && isWatch(r)) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
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
        '<td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b> <span class="tag' + (isWatch(r) ? '' : ' early') + '">' + (isWatch(r) ? 'watchlist' : 'early') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td></tr>';
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
    var base = r.tvl_usd * r.base_multiple;
    document.getElementById('detail-body').innerHTML =
      '<p>' + esc(r.category || 'No category') + ' &middot; ' + esc(r.chains.join(', ')) +
      ' &middot; TVL ' + fmtUsd(r.tvl_usd) + ' &middot; 7-day ' + fmtPct(r.change_7d) +
      ' &middot; listed ' + (r.listed_at || 'unknown') + ' (' + fmtAge(r.age_days) + ') &middot; records no token.</p>' +
      '<div class="model-line">' +
      '<span class="chip">TVL &times; base <b>' + fmtUsd(r.tvl_usd) + ' &times; ' + r.base_multiple.toFixed(3) + ' = ' + fmtUsd(base) + '</b></span>' +
      '<span class="chip">growth <b>&times; ' + r.growth_multiplier.toFixed(2) + '</b></span>' +
      '<span class="chip">maturity <b>&times; ' + r.maturity_multiplier.toFixed(2) + '</b></span>' +
      '<span class="chip">chains &times; ' + r.chains.length + ' <b>&times; ' + r.chain_multiplier.toFixed(2) + '</b></span>' +
      '<span class="chip">implied value <b>' + fmtUsd(r.implied_value_usd) + '</b></span>' +
      '</div>' +
      '<h3>Farm plan</h3><ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
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
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });

  render();
})();
