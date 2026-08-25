// manage.js —— 预算 / 分类管理 / 设置 页面渲染。
import { h, confirmDialog, sheet } from './dom.js';
import { store } from './store.js';
import { yuan, parseYuanToCents, formatCents } from './money.js';
import * as sync from './sync.js';
import * as S from './stats.js';
import { t, catName, setLang, lang } from './i18n.js';

function rerenderCurrent() { window.dispatchEvent(new Event('ledger:rerender')); }

// ———————————————————————— 预算 ————————————————————————
export function renderBudget(root) {
  const mKey = S.monthKey(S.todayISO());
  const inherited = store.ensureMonthBudgets(mKey);
  const total = store.totalBudget(mKey);

  const totalCard = h('div.card', {}, [
    h('div.card-title', {}, t('budget.total', { month: mKey })),
    amountInput(total ? total.amountCents : 0, (cents) => { store.setBudget(mKey, 'total', null, cents); rerenderCurrent(); }),
    excludeLine(),
  ]);

  // 分类预算之和对比
  const catSum = store.ledger.budgets.filter((b) => !b.deleted && b.month === mKey && b.scope === 'category').reduce((s, b) => s + b.amountCents, 0);
  if (total && catSum > total.amountCents) {
    totalCard.append(h('div.muted.small', {}, t('budget.catOver', { catSum: yuan(catSum), total: yuan(total.amountCents) })));
  }

  const catRows = store.activeCategories('expense').map((c) => {
    const b = store.categoryBudget(mKey, c.id);
    const s = S.aggregateRange(store.ledger, `${mKey}-01`, `${mKey}-31`).byCategory[c.id] || 0;
    const ratio = b && b.amountCents ? Math.min(1, s / b.amountCents) : 0;
    const over = b && b.amountCents && s > b.amountCents;
    return h('div.budget-row', {}, [
      h('div.br-head', {}, [h('span', {}, `${c.emoji} ${catName(c)}`), amountInput(b ? b.amountCents : 0, (cents) => { store.setBudget(mKey, 'category', c.id, cents); rerenderCurrent(); }, true)]),
      b && b.amountCents ? h('div.progress' + (ratio >= (store.ledger.settings.warnThreshold || 0.8) ? '.warn' : ''), {}, [h('div.progress-fill', { style: `width:${ratio * 100}%` })]) : null,
      b && b.amountCents ? h('div.muted.small' + (over ? '.over' : ''), {}, `${yuan(s)} / ${yuan(b.amountCents)}`) : h('div.muted.small', {}, t('budget.notSet')),
    ]);
  });

  const blocks = [totalCard];
  if (inherited) blocks.push(h('div.hint', {}, t('budget.inherited')));
  blocks.push(h('div.section-title', {}, t('budget.cats')), ...catRows);
  root.append(h('div.page', {}, blocks));
}

function amountInput(cents, onSet, compact = false) {
  const input = h('input' + (compact ? '.amt-input.compact' : '.amt-input'), { type: 'text', inputmode: 'decimal', value: cents ? formatCents(cents) : '', placeholder: '¥0.00' });
  input.addEventListener('change', () => { const c = parseYuanToCents(input.value); if (c != null && c >= 0) onSet(c); else input.value = cents ? formatCents(cents) : ''; });
  return input;
}

function excludeLine() {
  const ex = store.ledger.settings.excludeFromBudgetCategoryIds || [];
  const names = ex.map((id) => store.categoryById(id)).filter(Boolean).map((c) => catName(c));
  const line = h('button.link-btn.block', { onclick: () => openExcludePicker() }, t('budget.exclude') + (names.length ? names.join('、') : t('budget.none')));
  return line;
}

function openExcludePicker() {
  const ex = new Set(store.ledger.settings.excludeFromBudgetCategoryIds || []);
  const list = h('div.check-list', {}, store.activeCategories('expense').map((c) => {
    const row = h('label.check-row', {}, [h('span', {}, `${c.emoji} ${catName(c)}`), h('input', { type: 'checkbox' })]);
    const box = row.querySelector('input'); box.checked = ex.has(c.id);
    box.addEventListener('change', () => { box.checked ? ex.add(c.id) : ex.delete(c.id); });
    return row;
  }));
  const ok = h('button.btn.block', { onclick: () => { store.updateSettings({ excludeFromBudgetCategoryIds: [...ex] }); rerenderCurrent(); mini.close(); } }, t('budget.done'));
  const mini = sheet(t('budget.excludeTitle'), h('div.pad-col', {}, [list, ok]));
}

// ———————————————————————— 分类管理 ————————————————————————
export function renderCategories(root) {
  const section = (type, title) => {
    const rows = store.categories(type).sort((a, b) => a.order - b.order).map((c) => h('div.cat-manage-row' + (c.archived ? '.archived' : ''), {}, [
      h('div.cat-manage-name', {}, `${c.emoji} ${c.name}` + (lang.current === 'en' && c.nameEn && c.nameEn !== c.name ? ` · ${c.nameEn}` : '') + (c.archived ? t('cats.archived') : '')),
      h('div.cat-manage-ops', {}, [
        c.archived ? h('button.mini-btn', { onclick: () => { store.unarchiveCategory(c.id); rerenderCurrent(); } }, t('cats.restore'))
          : h('button.mini-btn', { onclick: () => { store.moveCategory(c.id, -1); rerenderCurrent(); } }, '↑'),
        !c.archived ? h('button.mini-btn', { onclick: () => { store.moveCategory(c.id, 1); rerenderCurrent(); } }, '↓') : null,
        h('button.mini-btn', { onclick: () => editCategory(c) }, t('cats.edit')),
        h('button.mini-btn', { onclick: () => deleteCategoryFlow(c) }, t('cats.delete')),
      ]),
    ]));
    return h('div', {}, [
      h('div.section-title.row-between', {}, [h('span', {}, title), h('button.mini-btn', { onclick: () => editCategory(null, type) }, t('cats.add'))]),
      ...rows,
    ]);
  };
  root.append(h('div.page', {}, [section('expense', t('cats.expense')), section('income', t('cats.income'))]));
}

function editCategory(cat, type) {
  const emojiInput = h('input.text-input.emoji', { type: 'text', value: cat ? cat.emoji : '', maxlength: '2', placeholder: '📦' });
  const nameInput = h('input.text-input', { type: 'text', value: cat ? cat.name : '', maxlength: '8', placeholder: t('cats.namePh') });
  const nameEnInput = h('input.text-input', { type: 'text', value: cat && cat.nameEn ? cat.nameEn : '', maxlength: '16', placeholder: 'English name (optional)' });
  const ok = h('button.btn.block', { onclick: () => {
    const name = nameInput.value.trim(); if (!name) return;
    if (cat) store.updateCategory(cat.id, { name, nameEn: nameEnInput.value.trim(), emoji: emojiInput.value.trim() || cat.emoji });
    else store.addCategory(emojiInput.value.trim(), name, type, nameEnInput.value.trim());
    rerenderCurrent(); mini.close();
  } }, t('cats.save'));
  const mini = sheet(cat ? t('cats.editTitle') : t('cats.newTitle'), h('div.pad-col', {}, [h('div.row', {}, [emojiInput, nameInput]), nameEnInput, ok]));
}

async function deleteCategoryFlow(c) {
  const n = store.recordCountByCategory(c.id);
  if (n === 0 && !c.builtin) { store.deleteEmptyCategory(c.id); rerenderCurrent(); return; }
  // 有记录或为预置：归档（默认）或 迁移并删除
  const others = store.activeCategories(c.type).filter((x) => x.id !== c.id);
  const sel = h('select.select', {}, others.map((x) => h('option', { value: x.id }, `${x.emoji} ${catName(x)}`)));
  const box = h('div.pad-col', {}, [
    h('div', {}, t('cats.delBody', { count: n })),
    h('button.btn.block', { onclick: () => { store.archiveCategory(c.id); rerenderCurrent(); mini.close(); } }, t('cats.archive')),
    h('div.section-title', {}, t('cats.migrateTitle')),
    sel,
    h('button.btn-danger.block', { onclick: () => { store.migrateAndDelete(c.id, sel.value); rerenderCurrent(); mini.close(); } }, t('cats.migrateBtn')),
  ]);
  const mini = sheet(t('cats.delTitle'), box);
}

// ———————————————————————— 设置 ————————————————————————
export function renderSettings(root) {
  const s = store.ledger.settings;
  const token = localStorage.getItem('ledger.gh.token') || '';

  const owner = textField(t('set.owner'), s.repoOwner);
  const repo = textField(t('set.repo'), s.repoName);
  const path = textField(t('set.path'), s.filePath || 'ledger.json');
  const tok = textField(t('set.token'), token, 'password');

  const testResult = h('div.muted.small', {}, '');
  const syncCard = h('div.card', {}, [
    h('div.card-title', {}, t('set.sync')),
    owner.wrap, repo.wrap, path.wrap, tok.wrap,
    h('div.hint.small', {}, t('set.tokenHint')),
    h('div.row', {}, [
      h('button.btn', { onclick: async () => {
        saveSync(); testResult.textContent = t('set.testing');
        const r = await sync.testConnection(store.syncCfg()); testResult.textContent = r.message;
      } }, t('set.test')),
      h('button.btn-ghost', { onclick: () => { saveSync(); store.fullSync(); } }, t('set.syncNow')),
      h('button.btn-ghost', { onclick: () => { localStorage.removeItem('ledger.gh.token'); tok.input.value = ''; testResult.textContent = t('set.tokenCleared'); } }, t('set.clearToken')),
    ]),
    testResult,
  ]);

  function saveSync() {
    store.updateSettings({ repoOwner: owner.input.value.trim(), repoName: repo.input.value.trim(), filePath: path.input.value.trim() || 'ledger.json' });
    const tk = tok.input.value.trim(); if (tk) localStorage.setItem('ledger.gh.token', tk);
  }

  // 语言切换
  const langCard = h('div.card', {}, [
    h('div.card-title', {}, t('set.lang')),
    h('div.seg-mini', {}, [['zh', '中文'], ['en', 'English']].map(([v, l]) =>
      h('button' + (lang.current === v ? '.seg-on' : ''), { onclick: () => {
        setLang(v); store.updateSettings({ lang: v });
      } }, l))),
  ]);

  // 币种与汇率（港币折算人民币参与统计与预算）
  const rateInput = h('input.amt-input', { type: 'text', inputmode: 'decimal', value: String(s.hkdRate ?? 0.92) });
  rateInput.addEventListener('change', () => {
    const r = Number(rateInput.value);
    if (r > 0 && r < 10) store.updateSettings({ hkdRate: r });
    else rateInput.value = String(s.hkdRate ?? 0.92);
  });
  const curCard = h('div.card', {}, [
    h('div.card-title', {}, t('set.currency')),
    h('label.field', {}, [h('span.field-label', {}, t('set.rate')), rateInput]),
    h('div.hint.small', {}, t('set.rateHint')),
  ]);

  const dataCard = h('div.card', {}, [
    h('div.card-title', {}, t('set.data')),
    h('div.row', {}, [
      h('button.btn-ghost', { onclick: () => exportData() }, t('set.export')),
      h('button.btn-ghost', { onclick: () => importData() }, t('set.import')),
    ]),
    h('div.hint.small', {}, t('set.importHint')),
  ]);

  const about = h('div.card', {}, [
    h('div.card-title', {}, t('set.about')),
    h('div.muted.small', {}, t('set.records', { count: S.liveRecords(store.ledger).length, cats: store.categories().length })),
    h('div.muted.small', {}, t('set.device', { device: store.deviceId })),
    h('button.link-btn.block', { onclick: () => location.hash = '#categories' }, t('set.manageCats')),
  ]);

  root.append(h('div.page', {}, [syncCard, langCard, curCard, dataCard, about]));
}

function textField(label, value, type = 'text') {
  const input = h('input.text-input', { type, value: value || '' });
  return { wrap: h('label.field', {}, [h('span.field-label', {}, label), input]), input };
}

function exportData() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `ledger-${S.todayISO().replace(/-/g, '')}.json` });
  document.body.append(a); a.click(); a.remove();
}

function importData() {
  const file = h('input', { type: 'file', accept: 'application/json' });
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    const text = await f.text();
    let incoming; try { incoming = JSON.parse(text); } catch { alert(t('set.badJson')); return; }
    const n = (incoming.records || []).filter((r) => !r.deleted).length;
    const ok = await confirmDialog(t('set.importConfirm', { count: n }));
    if (ok) { await store.importJSON(text); rerenderCurrent(); }
  });
  file.click();
}
