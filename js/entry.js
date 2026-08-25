// entry.js —— 记一笔弹层：类型切换 / 金额键盘 / 分类网格 / 币种·日期·备注·标签 / 保存(并继续)。
import { h, sheet, vibrate } from './dom.js';
import { store } from './store.js';
import { parseYuanToCents, formatCents, BASE_CURRENCY } from './money.js';
import { todayISO } from './stats.js';
import { t } from './i18n.js';

const LAST_TYPE_KEY = 'ledger.lastType';
const LAST_CUR_KEY = 'ledger.lastCurrency';

/** 打开记账弹层。record 为已有记录时进入编辑态。 */
export function openEntry(record = null) {
  let type = record ? record.type : (localStorage.getItem(LAST_TYPE_KEY) || 'expense');
  let currency = record ? record.currency : (localStorage.getItem(LAST_CUR_KEY) || store.ledger.settings.currency || BASE_CURRENCY);
  let amount = record ? formatCents(record.amountCents) : ''; // 元字符串
  let categoryId = record ? record.categoryId : null;
  let date = record ? record.date : todayISO();
  let note = record ? record.note : '';
  let tags = record ? [...(record.tags || [])] : [];

  const content = h('div.entry');
  const ref = sheet(record ? t('entry.edit') : t('entry.new'), content);
  render();

  function render() {
    content.replaceChildren();
    // 类型切换
    const seg = h('div.segment', {}, ['expense', 'income'].map((tp) =>
      h('button' + (type === tp ? '.seg-on' : ''), { onclick: () => { type = tp; categoryId = null; render(); } }, t(tp === 'expense' ? 'entry.expense' : 'entry.income'))
    ));
    // 金额显示（带币种符号）
    const symbol = currency === 'HKD' ? 'HK$' : '¥';
    const amountView = h('div.amount-view', {}, [
      h('span.amt-symbol', {}, symbol),
      amount === '' ? '0.00' : amount,
    ]);
    // 分类网格
    const cats = store.categoriesByFrequency(type);
    const grid = h('div.cat-grid', {}, cats.map((c) =>
      h('button.cat-cell' + (categoryId === c.id ? '.cat-on' : ''), { onclick: () => { categoryId = c.id; render(); } }, [
        h('div.cat-emoji', {}, c.emoji), h('div.cat-name', {}, c.name),
      ])
    ));
    // 辅助行：币种 / 日期 / 备注 / 标签
    const aux = h('div.aux-row', {}, [
      chip(currency === 'HKD' ? t('entry.cur.hkd') : t('entry.cur.cny'), toggleCurrency),
      chip(date === todayISO() ? t('entry.today') : date, pickDate),
      chip(note ? note : t('entry.note'), pickNote),
      chip(tags.length ? '#' + tags.join(' #') : t('entry.tags'), pickTags),
    ]);
    // 数字键盘
    const pad = buildNumpad();
    content.append(seg, amountView, grid, aux, pad);
  }

  function chip(label, onclick) { return h('button.chip', { onclick }, label); }

  function toggleCurrency() {
    currency = currency === 'HKD' ? BASE_CURRENCY : 'HKD';
    localStorage.setItem(LAST_CUR_KEY, currency);
    render();
  }

  function buildNumpad() {
    const wrap = h('div.numpad');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
    const grid = h('div.pad-grid', {}, keys.map((k) => h('button.pad-key', { onclick: () => press(k) }, k)));
    const save = h('button.pad-save' + (canSave() ? '' : '.disabled'), {
      onclick: () => doSave(false),
      oncontextmenu: (e) => { e.preventDefault(); if (!record) doSave(true); },
    }, t('entry.save'));
    // 长按保存并继续
    let timer = null;
    save.addEventListener('pointerdown', () => { if (record) return; timer = setTimeout(() => { doSave(true); timer = 'done'; }, 550); });
    save.addEventListener('pointerup', () => { if (timer === 'done') { timer = null; return; } clearTimeout(timer); });
    wrap.append(grid, save);
    return wrap;
  }

  function press(k) {
    if (k === '⌫') { amount = amount.slice(0, -1); }
    else if (k === '.') { if (!amount.includes('.') && amount !== '') amount += '.'; else if (amount === '') amount = '0.'; }
    else { // 数字
      if (amount.includes('.')) { const dec = amount.split('.')[1]; if (dec.length >= 2) return; }
      amount = (amount === '0' ? '' : amount) + k;
    }
    updateAmountView();
  }
  function updateAmountView() { const v = content.querySelector('.amount-view'); if (v) v.lastChild.textContent = amount === '' ? '0.00' : amount; refreshSave(); }
  function refreshSave() { const s = content.querySelector('.pad-save'); if (s) s.classList.toggle('disabled', !canSave()); }
  function canSave() { const c = parseYuanToCents(amount); return c != null && c > 0 && !!categoryId; }

  function doSave(keepOpen) {
    const cents = parseYuanToCents(amount);
    if (cents == null || cents <= 0 || !categoryId) return;
    if (record) { store.updateRecord(record.id, { type, amountCents: cents, currency, categoryId, date, note, tags }); ref.close(); vibrate(); return; }
    store.addRecord({ type, amountCents: cents, currency, categoryId, date, note, tags });
    localStorage.setItem(LAST_TYPE_KEY, type);
    localStorage.setItem(LAST_CUR_KEY, currency);
    vibrate();
    if (keepOpen) { amount = ''; note = ''; tags = []; render(); }
    else ref.close();
  }

  function pickDate() {
    const input = h('input.date-input', { type: 'date', value: date });
    const quick = h('div.quick-dates', {}, [[t('entry.today'), 0], [t('entry.yesterday'), -1], [t('entry.dayBefore'), -2]].map(([lbl, off]) =>
      h('button.chip', { onclick: () => { const d = new Date(); d.setDate(d.getDate() + off); date = d.toISOString().slice(0, 10); render(); mini.close(); } }, lbl)
    ));
    input.addEventListener('change', () => { if (input.value) { date = input.value; render(); mini.close(); } });
    const mini = sheet(t('entry.pickDate'), h('div.pad-col', {}, [quick, input]));
  }
  function pickNote() {
    const input = h('input.text-input', { type: 'text', value: note, maxlength: '100', placeholder: t('entry.notePh') });
    const ok = h('button.btn', { onclick: () => { note = input.value.trim(); render(); mini.close(); } }, t('entry.ok'));
    const mini = sheet(t('entry.note'), h('div.pad-col', {}, [input, ok]));
    setTimeout(() => input.focus(), 50);
  }
  function pickTags() {
    const input = h('input.text-input', { type: 'text', value: tags.join(' '), placeholder: t('entry.tagsPh') });
    const ok = h('button.btn', { onclick: () => { tags = input.value.split(/\s+/).filter(Boolean).slice(0, 5).map((tg) => tg.slice(0, 12)); render(); mini.close(); } }, t('entry.ok'));
    const mini = sheet(t('entry.tags'), h('div.pad-col', {}, [input, ok]));
    setTimeout(() => input.focus(), 50);
  }
}
