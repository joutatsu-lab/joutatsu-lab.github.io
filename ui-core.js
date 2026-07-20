// ============================================================
// ui-core.js — DOMに触れない純粋関数群
// ブラウザ（<script src>）とNodeテスト（require）の両方から使う。
// ここを変えたら tests/test_frontend.mjs が自動で検証する。
// ============================================================

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

// ステータス行 "📌 試したい（メモ）" → "メモ"
function statusMemo(raw) {
  const m = String(raw || '').match(/（(.+)）\s*$/);
  return m ? m[1] : '';
}

// 表示中カードを最新データで描き直すための索引（見つからなければ -1）
function pickIndexByHeading(discoveries, heading) {
  if (!Array.isArray(discoveries) || !heading) return -1;
  return discoveries.findIndex(d => d.heading === heading);
}

// 知識ベースのカード
function buildCardHTML(d) {
  return `
    ${d.date ? `<div class="card-date">${escHtml(d.date)}</div>` : ''}
    <div class="card-title">${escHtml(d.title)}</div>
    <span class="card-status">${escHtml(d.status_raw)}</span>
    <div class="card-body">${escHtml(d.body)}</div>
    <div class="actions" style="margin-top:0.4rem;">
      <button class="btn-edit" onclick="startEdit()">✏️ 編集</button>
      <button class="btn-delete" onclick="deleteCurrent()">🗑 削除</button>
    </div>
  `;
}

// 編集フォーム
function buildEditHTML(d) {
  const statuses = [
    ['📌', '📌 試したい'],
    ['🔄', '🔄 今日試す'],
    ['✅', '✅ 検証済み・定着中'],
    ['❌', '❌ 否定された仮説'],
  ];
  const opts = statuses.map(([e, l]) =>
    `<option value="${e}" ${d.status_emoji === e ? 'selected' : ''}>${l}</option>`
  ).join('');
  return `
    ${d.date ? `<div class="card-date">${escHtml(d.date)}</div>` : ''}
    <div class="field">
      <label class="field-label">タイトル</label>
      <input id="edit-title" type="text" value="${escAttr(d.title)}">
    </div>
    <div class="field">
      <label class="field-label">内容・根拠・試し方</label>
      <textarea id="edit-body" rows="5">${escHtml(d.body)}</textarea>
    </div>
    <div class="field">
      <label class="field-label">ステータス</label>
      <select id="edit-status">${opts}</select>
    </div>
    <div class="actions" style="margin-top:0.4rem;">
      <button class="btn-save" style="flex:1;" onclick="saveEdit()">保存する</button>
      <button class="btn-cancel" onclick="showDiscovery(currentIdx)">キャンセル</button>
    </div>
  `;
}

// 📌 試したいリストの1項目
function buildPendingHTML(item) {
  const memo = statusMemo(item.status_raw);
  return `
    ${item.date ? `<div class="item-date">${escHtml(item.date)}</div>` : ''}
    <div class="item-title">${escHtml(item.title)}</div>
    ${item.body ? `<div class="item-body">${escHtml(item.body)}</div>` : ''}
    ${memo ? `<div class="item-body" style="color:#9a7acd;">📝 ${escHtml(memo)}</div>` : ''}
    <button class="btn-today" data-heading="${escAttr(item.heading)}" onclick="activateItem(this)">🔄 今日試す</button>
  `;
}

// 🔄 今日試すリストの1項目（メモ欄は既存メモを最初から表示＝見たまま保存）
function buildActiveHTML(item, memoId) {
  const memo = statusMemo(item.status_raw);
  return `
    <div class="item-title">🔄 ${escHtml(item.title)}</div>
    ${item.body ? `<div class="item-body">${escHtml(item.body)}</div>` : ''}
    <textarea class="memo-input" id="${memoId}" rows="2" placeholder="検証結果・気づき（任意・この欄の内容がそのまま保存されます）">${escHtml(memo)}</textarea>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn-valid" style="flex:1;" data-heading="${escAttr(item.heading)}" onclick="resolveActive(this,'valid','${memoId}')">✅ 定着</button>
      <button class="btn-hold" style="flex:1;" data-heading="${escAttr(item.heading)}" onclick="resolveActive(this,'hold','${memoId}')">📌 継続検証</button>
      <button class="btn-deny" style="flex:1;" data-heading="${escAttr(item.heading)}" onclick="resolveActive(this,'deny','${memoId}')">❌ 否定</button>
    </div>
  `;
}

// 「今日」ホームの主役ヒーロー（仮説の選択状況で出し分け）
function buildTodayHeroHTML(count) {
  if (!count) {
    return `
      <div class="hero-title">🎯 今日試す仮説を選ぼう</div>
      <div class="hero-sub">「ためす」から1〜2個えらんでスタート</div>
      <button class="btn-cta" onclick="switchTab('try')">📌 ためすへ移動して選ぶ</button>
    `;
  }
  return `
    <div class="hero-title">🎺 今日のテーマ（${count}）</div>
    <div class="hero-sub">練習後に、それぞれ結果を記録しよう</div>
  `;
}

// AI提案カード
function buildSuggestHTML(s) {
  return `
    <div class="suggest-card-title">${escHtml(s.title)}</div>
    <div class="suggest-card-body">${escHtml(s.body)}</div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn-hold" style="flex:1;" data-title="${escAttr(s.title)}" data-body="${escAttr(s.body)}" onclick="holdSuggestion(this)">📌 試したいに追加</button>
      <button class="btn-dismiss" onclick="dismissSuggestion(this)">🗑 破棄</button>
    </div>
  `;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escHtml, escAttr, statusMemo, pickIndexByHeading,
    buildCardHTML, buildEditHTML, buildPendingHTML, buildActiveHTML, buildSuggestHTML,
    buildTodayHeroHTML,
  };
}
