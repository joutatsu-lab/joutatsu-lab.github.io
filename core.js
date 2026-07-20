// ============================================================
// core.js — 状態遷移とデータ整形の純粋関数群（DOM・storageに触れない）
// Flask版 app.py のデータ層を1:1で移植。ブラウザとNodeテストの両方から使う。
// すべての操作は (list, ...) を受けて { ok|error, list } を返す。listは破壊しない。
// ============================================================

const STATUS_FULL = {
  '📌': '📌 試したい',
  '🔄': '🔄 今日試す',
  '✅': '✅ 検証済み・定着中',
  '❌': '❌ 否定された仮説',
  '🔲': '🔲 未検証・仮説段階', // 旧データ表示用（新規作成はしない）
};

const STATUS_LABEL = {
  '✅': '検証済み・定着中',
  '🔄': '今日試す',
  '📌': '試したい',
  '🔲': '未検証・仮説段階',
  '❌': '否定された仮説',
};

const REACTION_STATUS = {
  hold:  '📌 試したい',
  today: '🔄 今日試す',
  valid: '✅ 検証済み・定着中',
  deny:  '❌ 否定された仮説',
};

const MAX_TODAY = 2;

// ── 整形 ────────────────────────────────────────────────

// 複数行入力を1行に畳む。heading・ステータス行は1行構造のため改行を許せない。
function flattenLine(text) {
  return String(text || '').trim().replace(/\s*\n+\s*/g, ' ／ ');
}

// 本文の見出し・擬似ステータス行を無害化（Flask版 sanitize_body と同一の意図）
function sanitizeBody(text) {
  return String(text || '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replaceAll('**ステータス**：', 'ステータス: ')
    .replace(/^\s*---\s*$/gm, '—')
    .trim();
}

// 保存形 {heading, body, status_raw} → 表示形（date/title/emoji/label を導出）
function parseItem(item) {
  const heading = String(item.heading || '');
  const statusRaw = item.status_raw || '📌 試したい';
  const emoji = statusRaw.split(' ')[0] || '📌';
  let d = '', title = heading;
  if (heading.includes('｜')) {
    const i = heading.indexOf('｜');
    d = heading.slice(0, i).trim();
    title = heading.slice(i + 1).trim();
  }
  return {
    heading,                    // 全文＝安定キー
    date: d,
    title,
    body: item.body || '',
    status_raw: statusRaw,
    status_emoji: emoji,
    status_label: STATUS_LABEL[emoji] || statusRaw,
  };
}

// 表示形 → 保存形（localStorageにはこの3フィールドだけを置く）
function stripItem(d) {
  return { heading: d.heading, body: d.body, status_raw: d.status_raw };
}

// ── 補助 ────────────────────────────────────────────────

function findIndex(list, heading) {
  return list.findIndex((d) => d.heading === heading);
}

// 同日・同タイトルの重複でステータス変更や削除が誤爆しないよう一意化する
function uniqueHeading(list, heading) {
  const existing = new Set(list.map((d) => d.heading));
  if (!existing.has(heading)) return heading;
  let n = 2;
  while (existing.has(`${heading}（${n}）`)) n += 1;
  return `${heading}（${n}）`;
}

function countToday(list, exclude = null) {
  return list.filter((d) => d.status_emoji === '🔄' && d.heading !== exclude).length;
}

function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// ── 操作（すべて新しい配列を返す） ───────────────────────

function addDiscovery(list, title, body, dateStr) {
  title = flattenLine(title);
  body = sanitizeBody(body);
  if (!title || !body) return { error: 'タイトルと内容は必須です' };
  const heading = uniqueHeading(list, `${dateStr || todayISO()}｜${title}`);
  const item = parseItem({ heading, body, status_raw: '📌 試したい' });
  return { ok: true, list: [item, ...list], heading };
}

function react(list, heading, reaction, memo = '') {
  if (!heading || !(reaction in REACTION_STATUS)) return { error: 'invalid request' };
  const idx = findIndex(list, heading);
  if (idx === -1) return { error: '発見が見つかりませんでした' };
  if (reaction === 'today' && countToday(list, heading) >= MAX_TODAY) {
    return { error: `今日試す仮説は最大${MAX_TODAY}個までです` };
  }
  memo = flattenLine(memo); // メモはステータス行（1行）に入るため改行を畳む
  let statusRaw = REACTION_STATUS[reaction];
  if (memo) {
    statusRaw += `（${memo}）`;
  } else if (reaction === 'today') {
    // 今日試すに昇格するときは、前回のメモ（文脈）を引き継ぐ
    const prev = list[idx].status_raw.match(/（(.+)）\s*$/);
    if (prev) statusRaw += `（${prev[1]}）`;
  }
  const next = list.slice();
  next[idx] = parseItem({ ...stripItem(next[idx]), status_raw: statusRaw });
  return { ok: true, list: next, new_status: REACTION_STATUS[reaction] };
}

function updateDiscovery(list, heading, newTitle, newBody, newEmoji) {
  newTitle = flattenLine(newTitle);
  newBody = sanitizeBody(newBody);
  if (!heading || !newTitle || !newBody) return { error: 'タイトルと内容は必須です' };
  if (!(newEmoji in STATUS_FULL)) return { error: 'invalid status' };
  const idx = findIndex(list, heading);
  if (idx === -1) return { error: '発見が見つかりませんでした' };
  if (newEmoji === '🔄' && list[idx].status_emoji !== '🔄' && countToday(list, heading) >= MAX_TODAY) {
    return { error: `今日試す仮説は最大${MAX_TODAY}個までです` };
  }
  // 日付プレフィックスは保持し、タイトル部分だけ差し替える
  const d = list[idx].date;
  let newHeading = d ? `${d}｜${newTitle}` : newTitle;
  if (newHeading !== list[idx].heading) {
    const others = list.filter((_, i) => i !== idx);
    newHeading = uniqueHeading(others, newHeading);
  }
  const next = list.slice();
  next[idx] = parseItem({ heading: newHeading, body: newBody, status_raw: STATUS_FULL[newEmoji] });
  return { ok: true, list: next, heading: newHeading };
}

function removeDiscovery(list, heading) {
  const idx = findIndex(list, heading);
  if (idx === -1) return { error: '発見が見つかりませんでした' };
  const next = list.slice();
  next.splice(idx, 1);
  return { ok: true, list: next };
}

// 練習後ログ。「次回試したいこと」があれば📌に自動連携（PDCAを閉じる）
function logPractice(list, { condition, response = '普通', went_well = '', next_try = '' }, dateStr) {
  if (!['良い', '普通', '悪い'].includes(condition)) return { error: 'invalid condition' };
  if (!['良い', '普通', '悪い'].includes(response)) return { error: 'invalid response' };
  const today = dateStr || todayISO();
  const entry = {
    date: today,
    condition,
    response,
    went_well: String(went_well || '').trim(),
    next_try: flattenLine(next_try),
  };
  let linked = false;
  let nextList = list;
  if (entry.next_try) {
    const r = addDiscovery(list, entry.next_try, `（${today} の練習ログより）`, today);
    if (r.ok) { nextList = r.list; linked = true; }
  }
  return { ok: true, list: nextList, entry, linked };
}

// ── エクスポート／インポート ─────────────────────────────

function exportData(list, logs) {
  return JSON.stringify(
    { app: 'trumpet-companion', version: 1, exported_at: new Date().toISOString(),
      discoveries: list.map(stripItem), logs: logs || [] },
    null, 2,
  );
}

function importData(json) {
  let data;
  try { data = JSON.parse(json); } catch { return { error: 'JSONとして読み込めませんでした' }; }
  if (!data || !Array.isArray(data.discoveries)) return { error: 'バックアップ形式が違います' };
  const list = data.discoveries
    .filter((d) => d && d.heading)
    .map((d) => parseItem({ heading: String(d.heading), body: String(d.body || ''), status_raw: String(d.status_raw || '📌 試したい') }));
  const logs = Array.isArray(data.logs) ? data.logs : [];
  return { ok: true, list, logs };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STATUS_FULL, STATUS_LABEL, REACTION_STATUS, MAX_TODAY,
    flattenLine, sanitizeBody, parseItem, stripItem, uniqueHeading, countToday, todayISO,
    addDiscovery, react, updateDiscovery, removeDiscovery, logPractice,
    exportData, importData,
  };
}
