// ============================================================
// app.js — 画面の配線とローカル保存（データはこの端末のブラウザ内のみ）
// ロジック本体は core.js（純粋関数）、HTML生成は ui-core.js。
// Flask版の inline script と同じハンドラ構成を保つ。
// ============================================================

const LS_DATA = 'tc-data';
const LS_LOGS = 'tc-logs';

let discoveries = [];   // 表示形（parseItem済み）
let practiceLogs = [];
let currentIdx = -1;
let currentHeading = null;
let editing = false;

// ── 保存・読込 ───────────────────────────────────────────
function loadStore() {
  try { discoveries = (JSON.parse(localStorage.getItem(LS_DATA) || '[]')).map(parseItem); }
  catch { discoveries = []; }
  try { practiceLogs = JSON.parse(localStorage.getItem(LS_LOGS) || '[]'); }
  catch { practiceLogs = []; }
}

function persist() {
  localStorage.setItem(LS_DATA, JSON.stringify(discoveries.map(stripItem)));
  localStorage.setItem(LS_LOGS, JSON.stringify(practiceLogs));
}

// core.jsの操作結果を反映する共通処理
function apply(result) {
  if (result.error) return result;
  discoveries = result.list;
  persist();
  return result;
}

// ── 知識ベース（フラッシュカード） ───────────────────────
function refreshDiscoveries() {
  // 表示中のカードを最新データで描き直す（編集中は触らない）
  if (!editing && currentHeading) {
    const idx = pickIndexByHeading(discoveries, currentHeading);
    if (idx >= 0) { showDiscovery(idx); return; }
  }
  if (currentIdx >= discoveries.length) currentIdx = discoveries.length - 1;
  document.getElementById('position').textContent =
    discoveries.length > 0
      ? (currentIdx >= 0 ? `${currentIdx + 1} / ${discoveries.length}` : `全 ${discoveries.length} 件`)
      : '';
}

function showDiscovery(idx, dir = 'next') {
  if (idx < 0 || idx >= discoveries.length) return;
  editing = false;
  currentIdx = idx;
  currentHeading = discoveries[idx].heading;
  const card = document.getElementById('card');
  card.classList.remove('empty');
  card.innerHTML = buildCardHTML(discoveries[idx]);
  const cls = dir === 'prev' ? 'flip-prev' : 'flip-next';
  card.classList.remove('flip-next', 'flip-prev'); void card.offsetWidth; card.classList.add(cls);
  document.getElementById('card-feedback').textContent = '';
  document.getElementById('position').textContent = `${idx + 1} / ${discoveries.length}`;
}

function loadRandom() {
  if (discoveries.length === 0) return;
  showDiscovery(Math.floor(Math.random() * discoveries.length));
}
function loadNext() {
  if (discoveries.length === 0) return;
  showDiscovery((currentIdx + 1) % discoveries.length, 'next');
}
function loadPrev() {
  if (discoveries.length === 0) return;
  showDiscovery((currentIdx - 1 + discoveries.length) % discoveries.length, 'prev');
}

// ── 編集 ─────────────────────────────────────────────────
function startEdit() {
  if (currentIdx < 0) return;
  editing = true;
  document.getElementById('card').innerHTML = buildEditHTML(discoveries[currentIdx]);
}

function saveEdit() {
  const d = discoveries[currentIdx];
  const title = document.getElementById('edit-title').value.trim();
  const body = document.getElementById('edit-body').value.trim();
  const status_emoji = document.getElementById('edit-status').value;
  const fb = document.getElementById('card-feedback');

  const r = apply(updateDiscovery(discoveries, d.heading, title, body, status_emoji));
  if (r.error) { fb.textContent = '⚠️ ' + r.error; return; }
  editing = false;
  const newIdx = pickIndexByHeading(discoveries, r.heading);
  showDiscovery(newIdx >= 0 ? newIdx : Math.max(0, currentIdx));
  loadPending(); loadActive();
  document.getElementById('card-feedback').textContent = '✅ 更新しました';
}

function deleteCurrent() {
  if (currentIdx < 0) return;
  const d = discoveries[currentIdx];
  if (!confirm(`「${d.title}」を削除しますか？`)) return;
  const r = apply(removeDiscovery(discoveries, d.heading));
  if (r.error) { document.getElementById('card-feedback').textContent = '⚠️ ' + r.error; return; }
  loadPending(); loadActive();
  if (discoveries.length === 0) {
    const card = document.getElementById('card');
    card.className = 'empty'; card.style.maxWidth = '640px';
    card.innerHTML = '<span>発見がありません</span>';
    currentIdx = -1;
    currentHeading = null;
    document.getElementById('position').textContent = '';
  } else {
    showDiscovery(Math.min(currentIdx, discoveries.length - 1));
  }
  document.getElementById('card-feedback').textContent = '🗑 削除しました';
}

// ── 試したいリスト（📌） ─────────────────────────────────
function loadPending() {
  updateFirstRun();
  const list = document.getElementById('pending-list');
  const pending = discoveries.filter((d) => d.status_emoji === '📌');
  if (pending.length === 0) {
    list.innerHTML = '<div class="empty-note">まだありません。下の「新しい気づきを追加」から始めましょう</div>';
    return;
  }
  list.innerHTML = '';
  pending.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'pending-item';
    el.innerHTML = buildPendingHTML(item);
    list.appendChild(el);
  });
}

function activateItem(btn) {
  const r = apply(react(discoveries, btn.dataset.heading, 'today'));
  if (r.error) { alert(r.error); return; }
  document.getElementById('active-feedback').textContent = '🔄 今日試すに設定しました';
  loadPending(); loadActive(); refreshDiscoveries();
}

// ── 今日試す（🔄） ───────────────────────────────────────
function loadActive() {
  const list = document.getElementById('active-list');
  const active = discoveries.filter((d) => d.status_emoji === '🔄');
  updateTodayHero(active.length);
  if (active.length === 0) {
    list.innerHTML = '<div class="empty-note">「ためす」タブから今日試す仮説を選んでください</div>';
    return;
  }
  list.innerHTML = '';
  active.forEach((item) => {
    const id = 'memo-' + Math.random().toString(36).slice(2);
    const el = document.createElement('div');
    el.className = 'active-item';
    el.innerHTML = buildActiveHTML(item, id);
    list.appendChild(el);
  });
}

function resolveActive(btn, reaction, memoId) {
  const memo = document.getElementById(memoId)?.value.trim() || '';
  const labels = { valid: '✅ 定着', hold: '📌 継続検証', deny: '❌ 否定' };
  const fb = document.getElementById('active-feedback');
  const r = apply(react(discoveries, btn.dataset.heading, reaction, memo));
  if (r.error) { fb.textContent = '⚠️ ' + r.error; return; }
  if (reaction === 'valid') {
    celebrate();
    fb.textContent = `🎺 定着おめでとう！🎉${memo ? '（メモ付き）' : ''}`;
  } else {
    fb.textContent = `${labels[reaction] || ''}で記録しました${memo ? '（メモ付き）' : ''}`;
  }
  loadActive(); loadPending(); refreshDiscoveries();
}

// ── 気づきを追加 ─────────────────────────────────────────
function addDiscoveryUI() {
  const title = document.getElementById('add-title').value.trim();
  const body = document.getElementById('add-body').value.trim();
  const fb = document.getElementById('add-feedback');
  const r = apply(addDiscovery(discoveries, title, body));
  if (r.error) { fb.textContent = '⚠️ ' + r.error; return; }
  fb.textContent = `✅ 「${title}」を📌試したいに追加しました！`;
  document.getElementById('add-title').value = '';
  document.getElementById('add-body').value = '';
  loadPending(); refreshDiscoveries();
}

// ── 練習ログ ─────────────────────────────────────────────
function saveLog() {
  const condition = document.querySelector('input[name="condition"]:checked')?.value;
  const response = document.querySelector('input[name="response"]:checked')?.value;
  const went_well = document.getElementById('log-well').value.trim();
  const next_try = document.getElementById('log-next').value.trim();
  const fb = document.getElementById('log-feedback');

  const r = logPractice(discoveries, { condition, response, went_well, next_try });
  if (r.error) { fb.textContent = '⚠️ ' + r.error; return; }
  discoveries = r.list;
  practiceLogs.push({ ...r.entry, ts: new Date().toISOString() });
  persist();
  fb.textContent = r.linked
    ? '✅ 保存しました！「次回試したいこと」を📌試したいに追加しました'
    : '✅ 保存しました！';
  document.getElementById('log-well').value = '';
  document.getElementById('log-next').value = '';
  if (r.linked) { loadPending(); refreshDiscoveries(); }
  updateFirstRun();  // ログのみ保存（次回試したいこと未記入）でも導入を隠す
}

// ── バックアップ（エクスポート／インポート） ───────────────
function exportBackup() {
  const blob = new Blob([exportData(discoveries, practiceLogs)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `practice-companion-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('backup-feedback').textContent = '✅ バックアップを書き出しました';
}

function importBackup(input) {
  const file = input.files?.[0];
  if (!file) return;
  const fb = document.getElementById('backup-feedback');
  const reader = new FileReader();
  reader.onload = () => {
    const r = importData(reader.result);
    if (r.error) { fb.textContent = '⚠️ ' + r.error; input.value = ''; return; }
    if (!confirm(`バックアップには発見 ${r.list.length} 件・練習ログ ${r.logs.length} 件が入っています。\n今のデータを置き換えますか？`)) {
      input.value = ''; return;
    }
    discoveries = r.list;
    practiceLogs = r.logs;
    persist();
    currentIdx = -1; currentHeading = null; editing = false;
    loadPending(); loadActive(); refreshDiscoveries();
    fb.textContent = '✅ 読み込みました';
    input.value = '';
  };
  reader.readAsText(file);
}

// ── 「今日」ホームの主役表示 ──────────────────────────────
function updateTodayHero(count) {
  const hero = document.getElementById('today-hero');
  if (hero) hero.innerHTML = buildTodayHeroHTML(count);
  const sec = document.getElementById('today-active-section');
  if (sec) sec.style.display = count > 0 ? '' : 'none';
  updateFirstRun();
}

// ── 初回導入：発見・ログが1件もない かつ 未クローズ のときだけ表示 ──
function updateFirstRun() {
  const el = document.getElementById('firstrun');
  if (!el) return;
  const empty = discoveries.length === 0 && practiceLogs.length === 0;
  const dismissed = localStorage.getItem('tc-introdismissed') === '1';
  const show = empty && !dismissed;
  el.style.display = show ? '' : 'none';
  // 導入表示中は、下の重複ヒーロー（同じ「ためすへ」誘導）を隠してCTAの重複を避ける
  const hero = document.getElementById('today-hero');
  if (hero) hero.style.display = show ? 'none' : '';
}
function dismissIntro() {
  localStorage.setItem('tc-introdismissed', '1');
  updateFirstRun();
}

// ── テーマ切替（A:温かいダーク ⇄ B:クリーム・選択を記憶） ──
function applyTheme(name) {
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(name === 'light' ? 'theme-light' : 'theme-dark');
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = (name === 'light') ? '🌙 ダークにする' : '☀️ クリームにする';
}
function toggleTheme() {
  const next = document.body.classList.contains('theme-light') ? 'dark' : 'light';
  localStorage.setItem('tc-theme', next);
  applyTheme(next);
}

// ── お祝いの紙吹雪（✅定着時・依存ライブラリなし） ─────────
function celebrate() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#e2a63f', '#8fce86', '#bd9fe6', '#6cb3e8', '#e89a8a'];
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:11000;overflow:hidden;';
  document.body.appendChild(layer);
  const cx = window.innerWidth / 2, cy = window.innerHeight * 0.34;
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    const size = 6 + Math.random() * 8;
    p.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;`
      + `background:${colors[i % colors.length]};border-radius:${Math.random() < .5 ? '50%' : '2px'};`
      + `opacity:1;transform:translate(-50%,-50%);`
      + `transition:transform .9s cubic-bezier(.2,.7,.3,1),opacity .9s ease-out;`;
    layer.appendChild(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 170;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist + 70;
    requestAnimationFrame(() => {
      p.style.transform = `translate(${dx}px,${dy}px) rotate(${Math.random() * 540}deg)`;
      p.style.opacity = '0';
    });
  }
  setTimeout(() => layer.remove(), 1000);
}

// ── タブ（モード）切替 ────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach((p) =>
    p.classList.toggle('active', p.id === 'tab-' + name));
  document.querySelectorAll('[data-tabbtn]').forEach((b) =>
    b.classList.toggle('on', b.dataset.tabbtn === name));
  localStorage.setItem('tc-tab', name);
  window.scrollTo(0, 0);
}

// ── 初期化 ───────────────────────────────────────────────
loadStore();
applyTheme(localStorage.getItem('tc-theme') || 'light');
switchTab(localStorage.getItem('tc-tab') || 'today');
refreshDiscoveries();
loadPending();
loadActive();

// PWA: Service Worker登録（オフラインでも開けるように）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
