import { CLUBS, DEFAULT_PLAYERS, KNOWN_EN, clubKey } from './clubs.js';

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

// ---- 日程（日付タブ＋試合カード） ----
let jpOnly = true;
try { jpOnly = localStorage.getItem('jpm.filter') !== 'all'; } catch { /* 無視 */ }
let selectedDay = null;
let scrolledDay = null;
const dayKey = (iso) => { const p = fmtParts(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}-${p.month}-${p.day}`; };
const fitName = (key, fallback) => { const c = CLUBS[key]; return c ? (c.ja.length <= 9 ? c.ja : c.short) : fallback; };

function renderSchedule() {
  const now = Date.now();
  const byClub = playersByClub();
  const isJp = (m) => byClub.has(m.home.key) || byClub.has(m.away.key);
  const groups = new Map();
  for (const m of data.matches) {
    if (m.status === 'CANCELLED' || (jpOnly && !isJp(m))) continue;
    const k = dayKey(m.utcDate);
    (groups.get(k) ?? groups.set(k, []).get(k)).push(m);
  }
  const days = [...groups.keys()];
  const today = dayKey(new Date(now).toISOString());
  if (!groups.has(selectedDay)) {
    const liveDay = days.find((d) => groups.get(d).some((m) => isLive(m, now)));
    selectedDay = liveDay ?? (groups.has(today) ? today : days.find((d) => d >= today) ?? days.at(-1) ?? null);
  }

  $('#filter-label').textContent = jpOnly ? '日本人選手の試合' : 'すべての試合';
  $('#filter').setAttribute('aria-pressed', String(jpOnly));

  $('#days').innerHTML = days.map((d) => {
    const ms = groups.get(d);
    const p = fmtParts(ms[0].utcDate, { month: 'numeric', day: 'numeric', weekday: 'short' });
    const live = ms.some((m) => isLive(m, now));
    const jp = !jpOnly && ms.some(isJp);
    return `<button class="day ${d === today ? 'today' : ''}" role="tab" data-day="${d}" aria-selected="${d === selectedDay}">
      ${live ? '<span class="live-mark">LIVE</span>' : ''}${jp ? '<span class="jp-mark" title="日本人選手の試合あり"></span>' : ''}
      <span class="dw">${p.weekday}</span><span class="dd">${p.month}/${p.day}</span></button>`;
  }).join('');
  if (selectedDay !== scrolledDay) {
    $(`.day[data-day="${selectedDay}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
    scrolledDay = selectedDay;
  }

  const teamRow = (side, m, other) => {
    const crest = data.crests?.[side.key];
    const hasScore = (m.status === 'FINISHED' || m.status === 'LIVE') && m.score.home != null;
    const mine = side === m.home ? m.score.home : m.score.away;
    const lose = m.status === 'FINISHED' && hasScore && mine < (other === m.home ? m.score.home : m.score.away);
    const names = byClub.get(side.key);
    return `<div class="team ${lose ? 'lose' : ''}">
      ${crest ? `<img class="crest" src="${esc(crest)}" alt="" loading="lazy" width="28" height="28" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'crest-ph'}))">` : '<span class="crest-ph"></span>'}
      <span class="tname">${esc(fitName(side.key, side.name))}</span>
      <span class="tscore">${hasScore ? mine : ''}</span>
      ${names ? `<div class="tchips">${names.map((n) => `<span>${esc(n)}</span>`).join('')}</div>` : ''}
    </div>`;
  };

  const ms = groups.get(selectedDay) ?? [];
  $('#mcards').innerHTML = ms.map((m) => {
    const live = isLive(m, now);
    const state = live
      ? `<span class="tlive">LIVE</span><span>${esc(m.status === 'LIVE' ? m.clock || '試合中' : '更新待ち')}</span>`
      : `<span>${m.status === 'FINISHED' ? '試合終了' : m.status === 'POSTPONED' ? '延期' : 'キックオフ'}</span>`;
    const tap = live || m.status === 'FINISHED' ? ` tappable" data-id="${esc(m.id)}" role="button" tabindex="0` : '';
    return `<article class="mcard ${live ? 'live' : isJp(m) ? '' : 'other'}${tap}">
      <div class="mcard-head">プレミアリーグ${m.matchday ? `｜第${m.matchday}節` : ''}</div>
      <div class="mcard-body">
        <div class="tbox"><b>${fmtTime(m.utcDate)}</b>${state}</div>
        <div class="teams">${teamRow(m.home, m, m.away)}${teamRow(m.away, m, m.home)}</div>
      </div></article>`;
  }).join('') || '<p class="sched-empty">表示できる試合がありません</p>';
}

$('#days').addEventListener('click', (e) => {
  const b = e.target.closest('.day');
  if (!b || !data) return;
  selectedDay = b.dataset.day;
  renderSchedule();
});
$('#filter').addEventListener('click', () => {
  jpOnly = !jpOnly;
  scrolledDay = null;
  try { localStorage.setItem('jpm.filter', jpOnly ? 'jp' : 'all'); } catch { /* 無視 */ }
  if (data) renderSchedule();
});

// ---- クラブ別 ----
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
    return `<li class="match prev tappable" data-id="${esc(m.id)}" role="button" tabindex="0"><span class="prev-label">前の試合</span>
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
  renderSchedule(); renderFixtures(); renderTable(); renderPlayers(); renderUpdated();
}

function renderUpdated() {
  const age = Date.now() - Date.parse(data.updatedAt);
  const mins = Math.round(age / 60000);
  const ago = mins < 1 ? 'たった今' : mins < 60 ? `${mins}分前` : `${Math.floor(mins / 60)}時間前`;
  const el = $('#updated');
  const live = Date.now() - liveAt < 3 * 60 * 1000 ? `・ライブ速報 ${fmtTime(new Date(liveAt).toISOString())}` : '';
  el.textContent = `最終更新 ${fmtDateTimeText(data.updatedAt)}（${ago}）${live}・日本時間`;
  el.classList.toggle('stale', age > STALE_MS && !live);
  $('#season').textContent = data.season ? `${data.season} シーズン` : '';
  $('#foot').textContent = `データ: ${data.source}`;
}

// ---- ライブ速報 ----
// data.json は GitHub の定期実行（実際は30分前後おき）でしか新しくならないため、
// 試合の時間帯だけはブラウザから ESPN のスコアボードを直接読みにいき、状態とスコアを上書きする。
const ESPN_BOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard';
const LIVE_BEFORE_MS = 10 * 60 * 1000;
const LIVE_AFTER_MS = 150 * 60 * 1000;
const liveOverrides = new Map();   // 試合ID → { status, clock, score }
let liveAt = 0;

const inLiveWindow = (m, now) => {
  const t = Date.parse(m.utcDate);
  return m.status !== 'FINISHED' && m.status !== 'CANCELLED' && now >= t - LIVE_BEFORE_MS && now <= t + LIVE_AFTER_MS;
};
const liveTargets = () => (data ? data.matches.filter((m) => inLiveWindow(m, Date.now())) : []);

function applyOverrides() {
  for (const m of data.matches) {
    const o = liveOverrides.get(m.id);
    if (o && m.status !== 'FINISHED') Object.assign(m, o);
  }
}

async function pollLive() {
  const targets = liveTargets();
  if (!targets.length) return;
  const dates = [...new Set(targets.map((m) => m.utcDate.slice(0, 10).replace(/-/g, '')))];
  try {
    const events = (await Promise.all(dates.map((d) => fetch(`${ESPN_BOARD}?dates=${d}`, { cache: 'no-store' }).then((r) => r.json()))))
      .flatMap((b) => b.events ?? []);
    const byPair = new Map(events.map((ev) => {
      const c = ev.competitions[0];
      const side = (h) => c.competitors.find((x) => x.homeAway === h);
      return [`${clubKey(side('home').team.displayName)}|${clubKey(side('away').team.displayName)}`, { c, side }];
    }));
    for (const m of targets) {
      const hit = byPair.get(`${m.home.key}|${m.away.key}`);
      if (!hit) continue;
      const type = hit.c.status.type;
      if (type.state === 'pre') continue;
      const num = (x) => (x.score === '' || x.score == null ? null : Number(x.score));
      const o = {
        status: type.state === 'in' ? 'LIVE' : 'FINISHED',
        clock: type.state === 'in' ? (type.name === 'STATUS_HALFTIME' ? 'HT' : hit.c.status.displayClock ?? '') : '',
        score: { home: num(hit.side('home')), away: num(hit.side('away')) },
      };
      liveOverrides.set(m.id, o);
      Object.assign(m, o);
    }
    liveAt = Date.now();
    renderAll();
  } catch { /* 取れなければ data.json の内容のまま */ }
}

// ---- 試合詳細（出場時間・スタッツ） ----
// ESPN の試合サマリー（キー不要・ブラウザから直接取得可）を、カードをタップしたときに読む。
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=';
const summaryCache = new Map();   // 試合ID → サマリー（終了した試合のみ保持）
const plain = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const minuteOf = (clock) => parseInt(String(clock ?? ''), 10) || 0;   // "45'+3'" → 45

async function espnEventId(m) {
  const d = new Date(Date.parse(m.utcDate));
  for (const off of [0, -1, 1]) {   // ESPN の日付区切りずれに備えて前後の日も見る
    const day = new Date(d.getTime() + off * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
    const board = await fetch(`${ESPN_BOARD}?dates=${day}`).then((r) => r.json());
    const ev = (board.events ?? []).find((e) => {
      const c = e.competitions[0].competitors;
      const k = (h) => clubKey(c.find((x) => x.homeAway === h).team.displayName);
      return k('home') === m.home.key && k('away') === m.away.key;
    });
    if (ev) return ev.id;
  }
  throw new Error('ESPN に該当する試合が見つかりません');
}

async function loadSummary(m) {
  if (summaryCache.has(m.id)) return summaryCache.get(m.id);
  const s = await fetch(`${ESPN_SUMMARY}${await espnEventId(m)}`, { cache: 'no-store' }).then((r) => r.json());
  if (m.status === 'FINISHED') summaryCache.set(m.id, s);
  return s;
}

// 英語名で出場メンバーから探す（姓名どちらの順でも、アクセント記号の有無も吸収）
function findAthlete(roster, en) {
  const parts = plain(en).split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const nameOf = (r) => plain(r.athlete.displayName);
  return roster.find((r) => parts.every((p) => nameOf(r).includes(p)))
    ?? (() => { const hits = roster.filter((r) => nameOf(r).split(/\s+/).includes(parts.at(-1))); return hits.length === 1 ? hits[0] : null; })();
}

function appearance(r, finished) {
  const subs = (r.plays ?? []).filter((p) => p.substitution).map((p) => minuteOf(p.clock?.displayValue));
  const red = (r.plays ?? []).find((p) => p.redCard);
  const end = red ? minuteOf(red.clock?.displayValue) : 90;
  if (r.starter) {
    if (r.subbedOut) return { cls: 'played', text: `先発出場 〜${subs[0]}分に交代（約${subs[0]}分）` };
    if (red) return { cls: 'played', text: `先発出場 ${end}分に退場（約${end}分）` };
    return { cls: 'played', text: finished ? 'フル出場（90分）' : '先発出場（出場中）' };
  }
  if (r.subbedIn) {
    const from = subs[0] ?? 0;
    if (r.subbedOut && subs[1] != null) return { cls: 'played', text: `途中出場 ${from}分〜${subs[1]}分（約${subs[1] - from}分）` };
    return { cls: 'played', text: `途中出場 ${from}分〜${finished ? `（約${Math.max(end - from, 1)}分）` : '（出場中）'}` };
  }
  return { cls: 'bench', text: finished ? 'ベンチ入り・出場なし' : 'ベンチ' };
}

function playerStats(r) {
  const st = Object.fromEntries((r.stats ?? []).map((s) => [s.name, Number(s.value ?? s.displayValue) || 0]));
  const gk = /G|GK|Goalkeeper/.test(r.position?.abbreviation ?? '') || (st.saves ?? 0) > 0 && !st.totalShots;
  // [表示名, 値, 0でも出すか]。GK はセーブ・失点を主に、フィールド選手はゴール・アシスト・シュートを主に出す
  const items = [
    ...(gk ? [['セーブ', st.saves, true], ['失点', st.goalsConceded, true]] : []),
    ['ゴール', st.totalGoals, !gk], ['アシスト', st.goalAssists, !gk],
    ['シュート', st.totalShots ? `${st.totalShots}（枠内${st.shotsOnTarget ?? 0}）` : 0, !gk],
    ['ファウル', st.foulsCommitted], ['被ファウル', st.foulsSuffered], ['オフサイド', st.offsides],
  ];
  const cards = `${st.yellowCards ? '<span><i class="card-y"></i><b>' + st.yellowCards + '</b></span>' : ''}${st.redCards ? '<span><i class="card-r"></i><b>' + st.redCards + '</b></span>' : ''}`;
  return items.filter(([, v, always]) => v != null && (always || v)).map(([k, v]) => `<span>${k}<b>${v}</b></span>`).join('') + cards;
}

function renderDetail(m, s) {
  const finished = m.status === 'FINISHED';
  const comp = s.header?.competitions?.[0];
  const side = (h) => comp?.competitors?.find((x) => x.homeAway === h);
  const score = (h) => side(h)?.score ?? (h === 'home' ? m.score.home : m.score.away) ?? '-';
  const crest = (k) => data.crests?.[k] ? `<img src="${esc(data.crests[k])}" alt="">` : '';
  const head = `<section class="dsec dscore">
    <div class="dteam">${crest(m.home.key)}${esc(fitName(m.home.key, m.home.name))}</div>
    <div class="dnum">${score('home')} - ${score('away')}</div>
    <div class="dteam">${crest(m.away.key)}${esc(fitName(m.away.key, m.away.name))}</div>
    <div class="dmeta">${fmtDateTimeText(m.utcDate)}・${m.matchday ? `第${m.matchday}節・` : ''}${finished ? '試合終了' : esc(comp?.status?.type?.shortDetail ?? '試合中')}</div>
  </section>`;

  // 日本人選手の出場状況とスタッツ
  const rosterOf = (key) => (s.rosters ?? []).find((r) => clubKey(r.team.displayName) === key)?.roster ?? [];
  const mine = players.filter((p) => p.club === m.home.key || p.club === m.away.key);
  const jpIds = new Set();
  const jpHtml = mine.map((p) => {
    const en = p.en || KNOWN_EN[p.name];
    const roster = rosterOf(p.club);
    let status; let stats = '';
    if (!en) status = { cls: 'out', text: '英語表記が未登録のため照合できません（選手タブで登録できます）' };
    else if (!roster.length) status = { cls: 'out', text: '出場メンバーのデータがまだありません' };
    else {
      const r = findAthlete(roster, en);
      if (!r) status = { cls: 'out', text: 'メンバー外' };
      else {
        jpIds.add(r.athlete.id);
        status = appearance(r, finished);
        if (status.cls === 'played') stats = `<div class="jp-stats">${playerStats(r)}</div>`;
      }
    }
    return `<div class="jpp"><div class="jp-top"><span class="jp-name">${esc(p.name)}</span><span class="jp-club">${esc(clubName(p.club))}</span></div>
      <div class="jp-status ${status.cls}">${esc(status.text)}</div>${stats}</div>`;
  }).join('');

  // 得点・交代・警告の流れ
  const homeName = side('home')?.team?.displayName;
  const evs = (s.keyEvents ?? []).filter((e) => /goal|card|substitution|penalty---scored/.test(e.type?.type ?? ''));
  const tl = evs.map((e) => {
    const t = e.type.type;
    const who = (e.participants ?? []).map((x) => x.athlete);
    const jp = who.some((a) => jpIds.has(a?.id));
    let ico; let txt;
    if (/goal|penalty---scored/.test(t)) {
      ico = '⚽';
      txt = `${esc(who[0]?.displayName ?? '')}${t === 'own-goal' ? '（オウンゴール）' : ''}${who[1] ? `<small>アシスト ${esc(who[1].displayName)}</small>` : ''}`;
    } else if (/card/.test(t)) {
      ico = `<i class="${/red/.test(t) ? 'card-r' : 'card-y'}"></i>`;
      txt = esc(who[0]?.displayName ?? '');
    } else {
      ico = '⇄';
      txt = `IN ${esc(who[0]?.displayName ?? '')}<small>OUT ${esc(who[1]?.displayName ?? '')}</small>`;
    }
    const away = e.team?.displayName && e.team.displayName !== homeName;
    return `<li class="${away ? 'away' : ''} ${jp ? 'jp-ev' : ''}"><span class="tl-min">${esc(e.clock?.displayValue ?? '')}</span><span class="tl-ico">${ico}</span><span class="tl-txt">${txt}</span></li>`;
  }).join('');

  // チームスタッツ（左：ホーム、右：アウェー）
  const teamStats = (h) => {
    const t = (s.boxscore?.teams ?? []).find((x) => x.homeAway === h) ?? (s.boxscore?.teams ?? [])[h === 'home' ? 0 : 1];
    return Object.fromEntries((t?.statistics ?? []).map((x) => [x.name, Number(x.displayValue)]));
  };
  const H = teamStats('home'); const A = teamStats('away');
  const pct = (v) => (v <= 1 ? Math.round(v * 100) : Math.round(v));
  const rows = [
    ['ボール支配率', H.possessionPct, A.possessionPct, (v) => `${Math.round(v)}%`],
    ['シュート', H.totalShots, A.totalShots], ['枠内シュート', H.shotsOnTarget, A.shotsOnTarget],
    ['パス成功率', H.passPct, A.passPct, (v) => `${pct(v)}%`], ['パス数', H.totalPasses, A.totalPasses],
    ['コーナー', H.wonCorners, A.wonCorners], ['ファウル', H.foulsCommitted, A.foulsCommitted],
    ['オフサイド', H.offsides, A.offsides], ['セーブ', H.saves, A.saves],
  ].filter(([, a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const stHtml = rows.map(([label, a, b, f = (v) => v]) => {
    const sum = a + b || 1;
    return `<div class="st-row"><span class="l">${f(a)}</span><div class="st-mid">${label}<div class="st-bar"><i style="width:${(a / sum) * 100}%"></i><i style="width:${(b / sum) * 100}%"></i></div></div><span class="r">${f(b)}</span></div>`;
  }).join('');

  return head
    + (mine.length ? `<section class="dsec"><h3>日本人選手</h3>${jpHtml}</section>` : '')
    + (tl ? `<section class="dsec"><h3>試合の流れ</h3><ul class="tl">${tl}</ul></section>` : '')
    + (stHtml ? `<section class="dsec"><h3>チームスタッツ</h3><div class="st">${stHtml}</div></section>` : '')
    + '<p class="dnote">データ: ESPN。出場時間は90分を基準にした目安です（アディショナルタイムは含みません）。</p>';
}

async function openDetail(id) {
  const m = data?.matches.find((x) => x.id === id);
  if (!m) return;
  const dlg = $('#detail');
  $('#detail-title').textContent = `${nameOf(m.home, true)} vs ${nameOf(m.away, true)}`;
  $('#detail-body').innerHTML = '<p class="dnote">読み込み中…</p>';
  if (!dlg.open) { dlg.showModal(); history.pushState({ detail: id }, ''); }
  try {
    $('#detail-body').innerHTML = renderDetail(m, await loadSummary(m));
  } catch (e) {
    $('#detail-body').innerHTML = `<p class="error">試合データを読み込めませんでした（${esc(e.message)}）</p>`;
  }
}
const closeDetail = () => { if ($('#detail').open) history.back(); };
window.addEventListener('popstate', () => { if ($('#detail').open) $('#detail').close(); });
$('#detail-close').addEventListener('click', closeDetail);
$('#detail').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDetail(); });   // 背景タップで閉じる
$('#detail').addEventListener('cancel', (e) => { e.preventDefault(); closeDetail(); });
document.addEventListener('click', (e) => { const t = e.target.closest('.tappable[data-id]'); if (t) openDetail(t.dataset.id); });
document.addEventListener('keydown', (e) => {
  const t = e.target.closest?.('.tappable[data-id]');
  if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(t.dataset.id); }
});

// ---- データ読み込みと自動更新 ----
let timer;
let loadedAt = 0;
async function load() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    loadedAt = Date.now();
    applyOverrides();
    renderAll();
  } catch (e) {
    if (!data) $('#mcards').innerHTML = `<p class="error">データを読み込めませんでした（${esc(e.message)}）。時間をおいて再読み込みしてください。</p>`;
  }
  await pollLive();
  schedule();
}

// 試合の時間帯は1分ごとにライブ速報、data.json は5分ごと。それ以外は10分ごとに data.json だけ読み直す。
function schedule() {
  clearTimeout(timer);
  const live = liveTargets().length > 0;
  timer = setTimeout(async () => {
    if (live && Date.now() - loadedAt < 5 * 60 * 1000) { await pollLive(); schedule(); } else load();
  }, (live ? 1 : 10) * 60 * 1000);
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
  const en = String(f.get('en') ?? '').trim();
  players.push({ name, club: String(f.get('club')), ...(en ? { en } : {}) });
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
