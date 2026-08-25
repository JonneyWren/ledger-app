// pages.js —— 今日 / 明细 / 统计 三个主页面的渲染。
// 汇总口径统一为基准币种（人民币），单条记录按自身币种（¥ / HK$）展示。
import { h, confirmDialog, undoBar } from './dom.js';
import { store } from './store.js';
import { yuan, fmt, toBaseCents } from './money.js';
import { openEntry } from './entry.js';
import * as S from './stats.js';
import { t, catName, lang } from './i18n.js';

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wd = (d) => (lang.current === 'en' ? WEEKDAY_EN : WEEKDAY_ZH)[d.getDay()];

function recordRow(r) {
  const c = store.categoryById(r.categoryId);
  const row = h('div.rec-row', {}, [
    h('div.rec-emoji', {}, c ? c.emoji : '❓'),
    h('div.rec-main', {}, [
      h('div.rec-cat', {}, catName(c) + (r.note ? ' · ' + r.note : '')),
      r.tags && r.tags.length ? h('div.rec-tags', {}, r.tags.map((tg) => '#' + tg).join(' ')) : null,
    ]),
    h('div.rec-amt' + (r.type === 'income' ? '.income' : ''), {}, (r.type === 'income' ? '+' : '') + fmt(r.amountCents, r.currency)),
  ]);
  row.addEventListener('click', () => openRowActions(r));
  return row;
}

async function openRowActions(r) {
  const ok = await confirmDialog(t('record.actions'), { okText: t('record.edit'), cancelText: t('record.delete') });
  if (ok) openEntry(r);
  else { const snapshot = { ...r }; store.deleteRecord(r.id); undoBar(t('record.deleted'), () => store.updateRecord(snapshot.id, { deleted: false })); }
}

/** 一组记录按当前汇率折算成基准币种的支出合计。 */
function baseExpense(recs) {
  const rate = store.ledger.settings.hkdRate;
  return recs.filter((r) => r.type === 'expense').reduce((s, r) => s + toBaseCents(r.amountCents, r.currency, rate), 0);
}

function monthTitle(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return lang.current === 'en' ? `${MONTH_EN[m - 1]} ${y}` : `${y} 年 ${m} 月`;
}

// ———————————————————————— 今日 ————————————————————————
export function renderToday(root) {
  const iso = S.todayISO();
  const mKey = S.monthKey(iso);
  const can = S.canSpendToday(store.ledger);
  const total = store.totalBudget(mKey);
  const spent = S.monthSpentInBudget(store.ledger, mKey);
  const day = S.dayAgg(store.ledger, iso);

  const hero = h('div.hero', {}, can == null
    ? [h('div.hero-label', {}, t('hero.spent')), h('div.hero-num', {}, yuan(spent)),
       h('button.link-btn', { onclick: () => location.hash = '#budget' }, t('hero.setBudget'))]
    : (can >= 0
        ? [h('div.hero-label', {}, t('hero.can')), h('div.hero-num', {}, yuan(can))]
        : [h('div.hero-label', {}, t('hero.over')), h('div.hero-num.over', {}, yuan(can))]));

  const blocks = [hero];
  if (total && total.amountCents > 0) {
    const ratio = Math.min(1, spent / total.amountCents);
    const warn = ratio >= (store.ledger.settings.warnThreshold || 0.8);
    blocks.push(h('div.card', {}, [
      h('div.progress' + (warn ? '.warn' : ''), {}, [h('div.progress-fill', { style: `width:${ratio * 100}%` })]),
      h('div.row-between', {}, [h('span.muted', {}, `${yuan(spent)} / ${yuan(total.amountCents)}`), h('span.muted', {}, Math.round(ratio * 100) + '%')]),
    ]));
  }
  const expCount = day.records.filter((r) => r.type === 'expense').length;
  blocks.push(h('div.today-sum', {}, [
    h('span', {}, t('today.spent', { amount: yuan(day.expense), count: expCount })),
    day.income ? h('span.income', {}, t('today.income', { amount: yuan(day.income) })) : null,
  ]));

  const list = h('div.list');
  const todays = day.records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (!todays.length) list.append(h('div.empty', {}, t('today.empty')));
  else todays.forEach((r) => list.append(recordRow(r)));
  blocks.push(list);

  root.append(h('div.page', {}, blocks));
}

// ———————————————————————— 明细 ————————————————————————
let recMonth = null; let recFilterType = 'all';
export function renderRecords(root) {
  if (!recMonth) recMonth = S.monthKey(S.todayISO());
  const agg = S.monthAgg(store.ledger, recMonth);

  const nav = h('div.month-nav', {}, [
    h('button.icon-btn', { onclick: () => { recMonth = shiftMonth(recMonth, -1); rerender(root); } }, '‹'),
    h('div.month-title', {}, monthTitle(recMonth)),
    h('button.icon-btn', { onclick: () => { recMonth = shiftMonth(recMonth, 1); rerender(root); } }, '›'),
  ]);
  const sum = h('div.month-sum', {}, t('records.sum', { exp: yuan(agg.expense), inc: yuan(agg.income), bal: yuan(agg.balance) }));
  const filter = h('div.seg-mini', {}, [['all', t('records.all')], ['expense', t('entry.expense')], ['income', t('entry.income')]].map(([v, l]) =>
    h('button' + (recFilterType === v ? '.seg-on' : ''), { onclick: () => { recFilterType = v; rerender(root); } }, l)));

  let recs = agg.records;
  if (recFilterType !== 'all') recs = recs.filter((r) => r.type === recFilterType);
  recs = recs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));

  const list = h('div.list');
  let curDate = null;
  if (!recs.length) list.append(h('div.empty', {}, t('list.empty')));
  for (const r of recs) {
    if (r.date !== curDate) {
      curDate = r.date;
      const dayExp = baseExpense(recs.filter((x) => x.date === r.date));
      list.append(h('div.date-head', {}, t('list.dayHead', { date: r.date.slice(5), wd: wd(S.parseDate(r.date)), amount: yuan(dayExp) })));
    }
    list.append(recordRow(r));
  }
  root.append(h('div.page', {}, [nav, sum, filter, list]));
}

// ———————————————————————— 统计 ————————————————————————
let statsTab = 'month';
export function renderStats(root) {
  const tabs = h('div.seg-mini', {}, [['day', t('stats.day')], ['week', t('stats.week')], ['month', t('stats.month')]].map(([v, l]) =>
    h('button' + (statsTab === v ? '.seg-on' : ''), { onclick: () => { statsTab = v; rerender(root); } }, l)));
  const body = h('div');
  if (statsTab === 'day') renderStatDay(body);
  else if (statsTab === 'week') renderStatWeek(body);
  else renderStatMonth(body);
  root.append(h('div.page', {}, [tabs, body]));
}

function catRanking(byCategory) {
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  return h('div.rank', {}, entries.map(([cid, amt]) => {
    const c = store.categoryById(cid);
    return h('div.rank-row', {}, [
      h('div.rank-label', {}, c ? `${c.emoji} ${catName(c)}` : t('record.untitled')),
      h('div.rank-bar', {}, [h('div.rank-fill', { style: `width:${(amt / max) * 100}%` })]),
      h('div.rank-amt', {}, yuan(amt)),
    ]);
  }));
}

function renderStatDay(root) {
  const iso = S.todayISO();
  const day = S.dayAgg(store.ledger, iso);
  const mKey = S.monthKey(iso);
  const total = store.totalBudget(mKey);
  const daily = total ? Math.round(total.amountCents / S.daysInMonth(new Date().getFullYear(), new Date().getMonth())) : null;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yAgg = S.dayAgg(store.ledger, S.toISODate(y));
  root.append(h('div.stat-cards', {}, [
    statCard(t('stats.todayExp'), yuan(day.expense)),
    daily != null ? statCard(t('stats.dailyQuota'), yuan(daily)) : null,
    statCard(t('stats.vsYesterday'), pct(day.expense, yAgg.expense)),
  ]));
  root.append(catRanking(day.byCategory));
}

function renderStatWeek(root) {
  const w = S.weekAgg(store.ledger, S.todayISO());
  const days = [];
  for (let i = 0; i < 7; i++) { const d = S.parseDate(w.from); d.setDate(d.getDate() + i); days.push(S.toISODate(d)); }
  const dayExp = days.map((iso) => S.dayAgg(store.ledger, iso).expense);
  const max = Math.max(1, ...dayExp);
  const bars = h('div.bars', {}, days.map((iso, i) => h('div.bar-col', {}, [
    h('div.bar-val', {}, dayExp[i] ? (dayExp[i] / 100).toFixed(0) : ''),
    h('div.bar', { style: `height:${(dayExp[i] / max) * 90 + 2}px` + (iso === S.todayISO() ? ';background:#1d1d1f' : '') }),
    h('div.bar-lbl', {}, wd(S.parseDate(iso))),
  ])));
  const lw = S.weekAgg(store.ledger, S.toISODate((() => { const d = S.parseDate(w.from); d.setDate(d.getDate() - 3); return d; })()));
  root.append(h('div.stat-cards', {}, [statCard(t('stats.weekExp'), yuan(w.expense)), statCard(t('stats.wow'), pct(w.expense, lw.expense))]));
  root.append(h('div.card', {}, [bars]));
  root.append(catRanking(w.byCategory));
}

function renderStatMonth(root) {
  const mKey = S.monthKey(S.todayISO());
  const agg = S.monthAgg(store.ledger, mKey);
  const total = store.totalBudget(mKey);
  const spent = S.monthSpentInBudget(store.ledger, mKey);
  const lm = S.monthAgg(store.ledger, shiftMonth(mKey, -1));
  root.append(h('div.stat-cards', {}, [
    statCard(t('stats.monthExp'), yuan(agg.expense)),
    agg.income ? statCard(t('stats.balance'), yuan(agg.balance)) : null,
    statCard(t('stats.mom'), pct(agg.expense, lm.expense)),
  ]));
  if (total && total.amountCents > 0) {
    const ratio = Math.min(1, spent / total.amountCents);
    root.append(h('div.card', {}, [
      h('div.muted', {}, t('stats.budgetDone', { pct: Math.round(ratio * 100) + '%', spent: yuan(spent), total: yuan(total.amountCents) })),
      h('div.progress', {}, [h('div.progress-fill', { style: `width:${ratio * 100}%` })]),
    ]));
  }
  root.append(heatmap(mKey));
  root.append(catRanking(agg.byCategory));
}

function heatmap(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  const days = S.daysInMonth(y, m - 1);
  const vals = [];
  for (let d = 1; d <= days; d++) { const iso = `${mKey}-${String(d).padStart(2, '0')}`; vals.push([iso, S.dayAgg(store.ledger, iso).expense]); }
  const max = Math.max(1, ...vals.map((v) => v[1]));
  const shades = ['#f5f5f7', '#d2d2d7', '#a1a1a6', '#6e6e73', '#1d1d1f'];
  return h('div.card', {}, [h('div.muted', {}, t('stats.heat')), h('div.heat', {}, vals.map(([iso, v]) => {
    const lvl = v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4));
    return h('div.heat-cell', { style: `background:${shades[lvl]}`, title: `${iso.slice(5)} ${yuan(v)}` });
  }))]);
}

function statCard(label, value) { return h('div.stat-card', {}, [h('div.stat-label', {}, label), h('div.stat-value', {}, value)]); }
function pct(cur, prev) { if (!prev) return cur ? '—' : '0%'; const p = Math.round(((cur - prev) / prev) * 100); return (p >= 0 ? '+' : '') + p + '%'; }
function shiftMonth(mKey, delta) { const [y, m] = mKey.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function rerender(root) { root.replaceChildren(); const view = root.dataset.view; if (view === 'records') renderRecords(root); else if (view === 'stats') renderStats(root); else renderToday(root); }
