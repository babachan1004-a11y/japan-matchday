import { CLUBS, DEFAULT_PLAYERS } from './clubs.js';

const TZ = 'Asia/Tokyo';
const STORE_KEY = 'jpm.players.v1';
const LIVE_GUESS_MS = 2 * 60 * 60 * 1000;   // キックオフ後この時間内でデータ未反映なら「試合中」とみなす
const STALE_MS = 6 * 60 * 60 * 1000;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let data = null;
let players = loadPlayers();

// ---- 表示用ヘルパー ----
const fmtParts = (iso, opts) => Object.fromEntries(
  new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, ...opts }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
function fmtDate(iso) {
  const p = fmtParts(iso, { month: 'numeric', day: 'numeric', weekday: 'short' });
  const cls = p.weekday === '土' ? 'dow-sat' : p.weekday === '日' ? 'dow-sun' : '';
  return `${p.month}/${p.day}<span class="${cls}">(${p.weekday})</span>`;
}
const fmtTime = (iso) => { const p = fmtParts(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return `${p.hour}:${p.minute}`; };
const fmtDateTimeText = (iso) => { const p = fmtParts(iso, { month: 'numeric', day: 'numeric', weekday: 'short' }); return `${p.month}/${p.day}(${p.weekday}) ${fmtTime(iso)}`; };

function clubName(key, short = false, fallback = key) {
  const c = CLUBS[key];
  return c ? (short ? c.short : c.ja) : fallback;
}
const nameOf = (side, short) => clubName(side.key, short, side.name);

function isLive(m, now) {
  if (m.status === 'LIVE') return true;
  const t = Date.parse(m.utcDate);
  return m.status === 'SCHEDULED' && now >= t && now - t < LIVE_GUESS_MS;
}

// ---- 選手設定（localStorage） ----
function loadPlayers() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(v)) return v.filter((p) => p && p.name && p.club);
  } catch { /* 保存不可・未保存 */ }
  return DEFAULT_PLAYERS.map((p) => ({ ...p }));
}
function savePlayers() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(players)); } catch { /* プライベートモード等 */ }
}
const playersByClub = () => players.reduce((m, p) => (m.get(p.club)?.push(p.name) ?? m.set(p.club, [p.name]), m), new Map());

// ---- 日程 ----
function renderFixtures() {
  const now = Date.now();
  const byClub = playersByClub();
  const rows = new Map(data.standings.map((s) => [s.key, s]));

  const cards = [...byClub].map(([key, names]) => {
    const ms = data.matches.filter((m) => m.home.key === key || m.away.key === key);
    const live = ms.filter((m) => isLive(m, now));
    const upcoming = ms.filter((m) => !live.includes(m) && m.status !== 'FINISHED' && m.status !== 'CANCELLED' && Date.parse(m.utcDate) > now).slice(0, 5);
    const prev = ms.filter((m) => m.status === 'FINISHED' && !live.includes(m)).at(-1);
    const next = live[0] ?? upcoming[0];
    return { key, names, row: rows.get(key), live, upcoming, prev, sortKey: live.length ? -1 : next ? Date.parse(next.utcDate) : Infinity };
  }).sort((a, b) => a.sortKey - b.sortKey);

  if (!cards.length) {
    $('#fixtures').innerHTML = '<p class="empty card">追いかける選手がいません。「選手」タブから追加してください。</p>';
    return;
  }

  const matchRow = (key, m, cls = '') => {
    const home = m.home.key === key;
    const opp = home ? m.away : m.home;
    const jp = byClub.has(opp.key) ? '<span class="jp-dot" title="日本人選手のいるクラブ"></span>' : '';
    let right;
    if (cls === 'live') {
      right = m.status === 'LIVE' && m.score.home != null
        ? `<span class="score">${home ? m.score.home : m.score.away} - ${home ? m.score.away : m.score.home}</span>`
        : '<span class="tag">更新待ち</span>';
    } else if (m.status === 'POSTPONED') right = '<span class="tag">延期</span>';
    else right = '';
    const first = cls === 'live'
      ? `<span class="live-badge">LIVE</span><span class="clock">${esc(m.clock || '')}</span>`
      : `<span class="date">${fmtDate(m.utcDate)}</span><span class="time">${fmtTime(m.utcDate)}</span>`;
    return `<li class="match ${cls}">${first}<span class="ha ${home ? 'H' : 'A'}">${home ? 'H' : 'A'}</span>
      <span class="opp">${esc(nameOf(opp, true))}${jp}</span>${right}</li>`;
  };

  const prevRow = (key, m) => {
    const home = m.home.key === key;
    const [gf, ga] = home ? [m.score.home, m.score.away] : [m.score.away, m.score.home];
    const r = gf > ga ? ['W', '勝'] : gf < ga ? ['L', '敗'] : ['D', '分'];
    const opp = home ? m.away : m.home;
    return `<li class="match prev"><span class="prev-label">前の試合</span>
      <span class="date">${fmtDate(m.utcDate)}</span><span class="res ${r[0]}">${r[1]}</span>
      <span class="ha ${home ? 'H' : 'A'}">${home ? 'H' : 'A'}</span>
      <span class="opp">${esc(nameOf(opp, true))}</span><span class="score">${gf} - ${ga}</span></li>`;
  };

  $('#fixtures').innerHTML = cards.map((c) => `
    <article class="card ${c.live.length ? 'is-live' : ''}">
      <div class="card-head">
        <div class="card-title">
          <h2>${esc(clubName(c.key))}</h2>
          ${c.row ? `<span class="rank"><b>${c.row.pos}</b>位 · 勝点 <b>${c.row.points}</b></span>` : '<span class="rank">順位データなし</span>'}
        </div>
        <div class="chips">${c.names.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div>
      </div>
      <ul class="matches">
        ${c.live.map((m) => matchRow(c.key, m, 'live')).join('')}
        ${c.upcoming.map((m) => matchRow(c.key, m)).join('')}
        ${!c.live.length && !c.upcoming.length ? '<li class="empty">予定されている試合はありません</li>' : ''}
        ${c.prev ? prevRow(c.key, c.prev) : ''}
      </ul>
    </article>`).join('');
}

// ---- 順位表 ----
function renderTable() {
  const byClub = playersByClub();
  const n = data.standings.length;
  const body = data.standings.map((s) => {
    const names = byClub.get(s.key);
    const zone = s.pos <= 4 ? 'zone-ucl' : s.pos > n - 3 ? 'zone-rel' : '';
    return `<tr class="${zone} ${names ? 'jp' : ''}">
      <td class="pos">${s.pos}</td>
      <td class="club"><span class="club-name">${esc(clubName(s.key, true, s.name))}</span>
        ${names ? `<span class="club-players">${names.map(esc).join('・')}</span>` : ''}</td>
      <td>${s.played}</td><td>${s.won}</td><td>${s.draw}</td><td>${s.lost}</td>
      <td>${s.gd > 0 ? '+' : ''}${s.gd}</td><td class="pts">${s.points}</td></tr>`;
  }).join('');
  $('#table').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th class="club">クラブ</th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>差</th><th>点</th></tr></thead>
      <tbody>${body}</tbody></table></div>
    <div class="legend"><span><i style="background:var(--ucl)"></i>上位4（CL圏）</span>
      <span><i style="background:var(--rel)"></i>降格圏</span>
      <span><i style="background:var(--accent-soft);outline:1px solid var(--accent)"></i>日本人選手所属</span></div>`;
}

// ---- 選手管理 ----
function renderPlayers() {
  const inLeague = new Set(data?.standings.map((s) => s.key) ?? []);
  const keys = data ? [...inLeague] : Object.keys(CLUBS);
  const sel = $('#add-player select');
  const cur = sel.value;
  sel.innerHTML = keys.map((k) => [k, clubName(k)]).sort((a, b) => a[1].localeCompare(b[1], 'ja'))
    .map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
  if (cur) sel.value = cur;

  $('#player-list').innerHTML = players.map((p, i) => `
    <li><span class="pname">${esc(p.name)}</span>
      <span class="pclub">${esc(clubName(p.club))}${data && !inLeague.has(p.club) ? ' <span class="warn">今季PLにいません</span>' : ''}</span>
      <button class="del" data-i="${i}" type="button" aria-label="${esc(p.name)}を削除">削除</button></li>`).join('')
    || '<li class="empty">まだ選手がいません</li>';
}

function renderAll() {
  if (!data) return;
  renderFixtures(); renderTable(); renderPlayers(); renderUpdated();
}

function renderUpdated() {
  const age = Date.now() - Date.parse(data.updatedAt);
  const mins = Math.round(age / 60000);
  const ago = mins < 1 ? 'たった今' : mins < 60 ? `${mins}分前` : `${Math.floor(mins / 60)}時間前`;
  const el = $('#updated');
  el.textContent = `最終更新 ${fmtDateTimeText(data.updatedAt)}（${ago}）・日本時間`;
  el.classList.toggle('stale', age > STALE_MS);
  $('#season').textContent = data.season ? `${data.season} シーズン` : '';
  $('#foot').textContent = `データ: ${data.source}`;
}

// ---- データ読み込みと自動更新 ----
let timer;
async function load() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    renderAll();
  } catch (e) {
    if (!data) $('#fixtures').innerHTML = `<p class="error">データを読み込めませんでした（${esc(e.message)}）。時間をおいて再読み込みしてください。</p>`;
  }
  clearTimeout(timer);
  const anyLive = data?.matches.some((m) => isLive(m, Date.now()));
  timer = setTimeout(load, (anyLive ? 2 : 10) * 60 * 1000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(() => data && renderUpdated(), 60 * 1000);

// ---- タブ ----
function showTab(id) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== id; });
  try { localStorage.setItem('jpm.tab', id); } catch { /* 無視 */ }
}
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
try { const t = localStorage.getItem('jpm.tab'); if (t && document.getElementById(t)) showTab(t); } catch { /* 無視 */ }

// ---- 選手の追加・削除 ----
$('#add-player').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const name = String(f.get('name')).trim();
  if (!name) return;
  players.push({ name, club: String(f.get('club')) });
  savePlayers(); e.target.reset(); renderAll(); if (!data) renderPlayers();
});
$('#player-list').addEventListener('click', (e) => {
  const b = e.target.closest('.del');
  if (!b) return;
  players.splice(Number(b.dataset.i), 1);
  savePlayers(); renderAll(); if (!data) renderPlayers();
});
$('#reset-players').addEventListener('click', () => {
  if (!confirm('追いかける選手を初期設定に戻しますか？')) return;
  players = DEFAULT_PLAYERS.map((p) => ({ ...p }));
  savePlayers(); renderAll(); if (!data) renderPlayers();
});

renderPlayers();
load();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* 非対応環境では通常のページとして動く */ });
