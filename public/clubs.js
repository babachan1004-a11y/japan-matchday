// クラブの日本語表記と、API ごとに異なる英語名を共通キーへ寄せるための辞書。
// ブラウザ（app.js）と Node（scripts/fetch-data.mjs）の両方から読み込む。

export const CLUBS = {
  arsenal:        { ja: 'アーセナル',                     short: 'アーセナル' },
  astonvilla:     { ja: 'アストン・ヴィラ',               short: 'Aヴィラ' },
  bournemouth:    { ja: 'ボーンマス',                     short: 'ボーンマス' },
  brentford:      { ja: 'ブレントフォード',               short: 'ブレントフォード' },
  brighton:       { ja: 'ブライトン',                     short: 'ブライトン' },
  burnley:        { ja: 'バーンリー',                     short: 'バーンリー' },
  chelsea:        { ja: 'チェルシー',                     short: 'チェルシー' },
  coventry:       { ja: 'コヴェントリー',                 short: 'コヴェントリー' },
  crystalpalace:  { ja: 'クリスタル・パレス',             short: 'パレス' },
  everton:        { ja: 'エヴァートン',                   short: 'エヴァートン' },
  fulham:         { ja: 'フラム',                         short: 'フラム' },
  hull:           { ja: 'ハル・シティ',                   short: 'ハル' },
  ipswich:        { ja: 'イプスウィッチ',                 short: 'イプスウィッチ' },
  leeds:          { ja: 'リーズ',                         short: 'リーズ' },
  leicester:      { ja: 'レスター',                       short: 'レスター' },
  liverpool:      { ja: 'リヴァプール',                   short: 'リヴァプール' },
  luton:          { ja: 'ルートン',                       short: 'ルートン' },
  mancity:        { ja: 'マンチェスター・シティ',         short: 'マンC' },
  manutd:         { ja: 'マンチェスター・ユナイテッド',   short: 'マンU' },
  middlesbrough:  { ja: 'ミドルズブラ',                   short: 'ボロ' },
  newcastle:      { ja: 'ニューカッスル',                 short: 'ニューカッスル' },
  norwich:        { ja: 'ノリッジ',                       short: 'ノリッジ' },
  forest:         { ja: 'ノッティンガム・フォレスト',     short: 'フォレスト' },
  sheffieldutd:   { ja: 'シェフィールド・ユナイテッド',   short: 'シェフィールドU' },
  southampton:    { ja: 'サウサンプトン',                 short: 'サウサンプトン' },
  sunderland:     { ja: 'サンダーランド',                 short: 'サンダーランド' },
  tottenham:      { ja: 'トッテナム',                     short: 'スパーズ' },
  watford:        { ja: 'ワトフォード',                   short: 'ワトフォード' },
  westbrom:       { ja: 'ウェスト・ブロムウィッチ',       short: 'WBA' },
  westham:        { ja: 'ウェストハム',                   short: 'ウェストハム' },
  wolves:         { ja: 'ウォルヴァーハンプトン',         short: 'ウルヴズ' },
};

// 正規化した英語名に含まれる語 → キー。上から順に判定する（マンチェスター2クラブなど紛らわしいものを先に）。
const NAME_RULES = [
  ['manchester city', 'mancity'], ['man city', 'mancity'],
  ['manchester united', 'manutd'], ['man united', 'manutd'], ['man utd', 'manutd'],
  ['sheffield united', 'sheffieldutd'], ['sheffield utd', 'sheffieldutd'],
  ['west ham', 'westham'], ['west bromwich', 'westbrom'], ['west brom', 'westbrom'],
  ['aston villa', 'astonvilla'], ['crystal palace', 'crystalpalace'],
  ['nottingham', 'forest'], ['tottenham', 'tottenham'], ['spurs', 'tottenham'],
  ['wolverhampton', 'wolves'], ['wolves', 'wolves'],
  ['arsenal', 'arsenal'], ['bournemouth', 'bournemouth'], ['brentford', 'brentford'],
  ['brighton', 'brighton'], ['burnley', 'burnley'], ['chelsea', 'chelsea'],
  ['coventry', 'coventry'], ['everton', 'everton'], ['fulham', 'fulham'],
  ['hull', 'hull'], ['ipswich', 'ipswich'], ['leeds', 'leeds'], ['leicester', 'leicester'],
  ['liverpool', 'liverpool'], ['luton', 'luton'], ['middlesbrough', 'middlesbrough'],
  ['newcastle', 'newcastle'], ['norwich', 'norwich'], ['southampton', 'southampton'],
  ['sunderland', 'sunderland'], ['watford', 'watford'],
];

export function normalizeName(name) {
  return ` ${String(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')} `.replace(/\s+/g, ' ');
}

// 英語名からキーを求める。辞書にないクラブは名前由来のキーを返す（表示は英語名のまま）。
export function clubKey(name) {
  const n = normalizeName(name);
  for (const [word, key] of NAME_RULES) if (n.includes(` ${word} `) || n.includes(` ${word}`)) return key;
  return n.trim().replace(/\b(fc|afc)\b/g, '').replace(/\s+/g, '');
}

// 初期の追いかけ選手（2026-27 シーズン、2026-10-18 時点で確認）
export const DEFAULT_PLAYERS = [
  { name: '三笘薫', club: 'brighton' },
  { name: '遠藤航', club: 'liverpool' },
  { name: '鎌田大地', club: 'crystalpalace' },
  { name: '冨安健洋', club: 'crystalpalace' },
  { name: '田中碧', club: 'leeds' },
  { name: '鈴木彩艶', club: 'astonvilla' },
  { name: '守田英正', club: 'hull' },
  { name: '前田大然', club: 'ipswich' },
  { name: '坂元達裕', club: 'coventry' },
];
