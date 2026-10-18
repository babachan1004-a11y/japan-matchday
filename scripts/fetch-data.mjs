// プレミアリーグの順位表と全試合を取得し、public/data.json に共通形式で書き出す。
//   FOOTBALL_DATA_TOKEN があれば football-data.org v4 を使い、無い・失敗したときは ESPN の公開エンドポイントに切り替える。
//   使い方: node scripts/fetch-data.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clubKey } from '../public/clubs.js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data.json');
const TOKEN = process.env.FOOTBALL_DATA_TOKEN?.trim();

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ← ${url}\n${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const team = (name) => ({ key: clubKey(name), name });

// ---- football-data.org v4（10 リクエスト/分の無料枠。1 回の実行で 2 リクエスト） ----
async function fromFootballData() {
  const h = { 'X-Auth-Token': TOKEN };
  const base = 'https://api.football-data.org/v4/competitions/PL';
  const st = await getJson(`${base}/standings`, h);
  const mt = await getJson(`${base}/matches`, h);
  const table = st.standings.find((s) => s.type === 'TOTAL').table;
  const STATUS = { IN_PLAY: 'LIVE', PAUSED: 'LIVE', FINISHED: 'FINISHED', AWARDED: 'FINISHED',
    POSTPONED: 'POSTPONED', SUSPENDED: 'POSTPONED', CANCELLED: 'CANCELLED' };
  return {
    source: 'football-data.org',
    season: `${st.season.startDate.slice(0, 4)}-${st.season.endDate.slice(2, 4)}`,
    crests: Object.fromEntries(table.map((r) => [clubKey(r.team.name), r.team.crest])),
    standings: table.map((r) => ({
      pos: r.position, ...team(r.team.name), played: r.playedGames, won: r.won, draw: r.draw,
      lost: r.lost, gd: r.goalDifference, points: r.points,
    })),
    matches: mt.matches.map((m) => ({
      id: String(m.id), utcDate: m.utcDate, matchday: m.matchday, status: STATUS[m.status] ?? 'SCHEDULED',
      clock: m.status === 'PAUSED' ? 'HT' : (m.minute ? `${m.minute}'` : ''),
      home: team(m.homeTeam.name), away: team(m.awayTeam.name),
      score: { home: m.score.fullTime.home, away: m.score.fullTime.away },
    })),
  };
}

// ---- ESPN 公開エンドポイント（キー不要・非公式）。順位表 1 + クラブごとに結果/予定 2 ----
async function fromEspn() {
  const site = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1';
  const st = await getJson('https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings');
  const league = st.children[0];
  const stat = (e, n) => e.stats.find((s) => s.name === n)?.value ?? 0;
  const standings = league.standings.entries
    .map((e, i) => ({
      pos: stat(e, 'rank') || i + 1, ...team(e.team.displayName), played: stat(e, 'gamesPlayed'),
      won: stat(e, 'wins'), draw: stat(e, 'ties'), lost: stat(e, 'losses'),
      gd: stat(e, 'pointDifferential'), points: stat(e, 'points'), espnId: e.team.id,
    }))
    .sort((a, b) => a.pos - b.pos);
  const crests = Object.fromEntries(league.standings.entries.map((e) => [clubKey(e.team.displayName), e.team.logos?.[0]?.href]));

  const urls = standings.flatMap((s) => [`${site}/teams/${s.espnId}/schedule`, `${site}/teams/${s.espnId}/schedule?fixture=true`]);
  const pages = [];
  for (let i = 0; i < urls.length; i += 8) pages.push(...await Promise.all(urls.slice(i, i + 8).map((u) => getJson(u))));

  const byId = new Map();
  for (const ev of pages.flatMap((p) => p.events ?? [])) {
    const c = ev.competitions[0];
    const side = (h) => c.competitors.find((x) => x.homeAway === h);
    const score = (x) => { const v = typeof x.score === 'object' ? x.score?.value : x.score; return v == null || v === '' ? null : Number(v); };
    const type = c.status.type;
    const status = type.state === 'in' ? 'LIVE'
      : type.state === 'post' ? (/POSTPONED|CANCELED|ABANDONED/.test(type.name) ? 'POSTPONED' : 'FINISHED')
      : (/POSTPONED/.test(type.name) ? 'POSTPONED' : 'SCHEDULED');
    const live = status === 'LIVE' || status === 'FINISHED';
    byId.set(ev.id, {
      id: ev.id, utcDate: new Date(ev.date).toISOString(), status,
      clock: status === 'LIVE' ? (type.name === 'STATUS_HALFTIME' ? 'HT' : c.status.displayClock ?? '') : '',
      home: team(side('home').team.displayName), away: team(side('away').team.displayName),
      score: { home: live ? score(side('home')) : null, away: live ? score(side('away')) : null },
    });
  }
  standings.forEach((s) => delete s.espnId);
  // ESPN には節番号がないので、各クラブの何試合目かから求める（両チームの大きい方）
  const matches = [...byId.values()].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const count = new Map();
  for (const m of matches) {
    const n = Math.max(...[m.home.key, m.away.key].map((k) => count.set(k, (count.get(k) ?? 0) + 1).get(k)));
    if (m.status !== 'POSTPONED') m.matchday = n;
  }
  return { source: 'ESPN', season: league.name.match(/\d{4}-\d{2}/)?.[0] ?? '', crests, standings, matches };
}

let data;
if (TOKEN) {
  try { data = await fromFootballData(); } catch (e) { console.warn(`football-data.org 失敗、ESPN に切り替え: ${e.message}`); }
} else {
  console.warn('FOOTBALL_DATA_TOKEN 未設定のため ESPN から取得します');
}
data ??= await fromEspn();
if (data.standings.length < 20 || data.matches.length === 0) throw new Error(`データが不完全です（順位 ${data.standings.length} 件 / 試合 ${data.matches.length} 件）`);

data.matches.sort((a, b) => a.utcDate.localeCompare(b.utcDate));
const out = { updatedAt: new Date().toISOString(), ...data };
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`OK ${out.source} ${out.season}: 順位 ${out.standings.length} 件 / 試合 ${out.matches.length} 件 → ${OUT}`);
