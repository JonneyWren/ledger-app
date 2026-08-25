// stats.js —— 本地全量聚合。所有时间维度都基于「给定起止日期返回聚合」这一底层函数。
// 金额口径：所有汇总均按基准币种（人民币）计，HKD 按 settings.hkdRate 折算。
import { toBaseCents } from './money.js';

/** 记录折算后的基准币种金额。 */
function baseAmt(ledger, r) { return toBaseCents(r.amountCents, r.currency, ledger.settings.hkdRate); }

/** YYYY-MM-DD -> Date（本地 0 点） */
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function todayISO() { return toISODate(new Date()); }
export function monthKey(iso) { return iso.slice(0, 7); }
export function daysInMonth(year, month0) { return new Date(year, month0 + 1, 0).getDate(); }

/** 活跃记录（未删除）。 */
export function liveRecords(ledger) { return ledger.records.filter((r) => !r.deleted); }

/** 区间 [from, to]（含）内的记录聚合。 */
export function aggregateRange(ledger, from, to) {
  const recs = liveRecords(ledger).filter((r) => r.date >= from && r.date <= to);
  let expense = 0, income = 0;
  const byCategory = {};
  for (const r of recs) {
    const amt = baseAmt(ledger, r);
    if (r.type === 'income') income += amt;
    else {
      expense += amt;
      byCategory[r.categoryId] = (byCategory[r.categoryId] || 0) + amt;
    }
  }
  return { records: recs, expense, income, balance: income - expense, byCategory };
}

export function dayAgg(ledger, iso) { return aggregateRange(ledger, iso, iso); }

export function monthAgg(ledger, mKey) {
  const [y, m] = mKey.split('-').map(Number);
  const last = daysInMonth(y, m - 1);
  return aggregateRange(ledger, `${mKey}-01`, `${mKey}-${String(last).padStart(2, '0')}`);
}

/** 自然周（周一起）聚合，anchor 为区间内任意日期 iso。 */
export function weekAgg(ledger, iso) {
  const d = parseDate(iso);
  const dow = (d.getDay() + 6) % 7; // 周一=0
  const mon = new Date(d); mon.setDate(d.getDate() - dow);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { ...aggregateRange(ledger, toISODate(mon), toISODate(sun)), from: toISODate(mon), to: toISODate(sun) };
}

/** 本月计入预算的已花（排除 excludeFromBudgetCategoryIds）。 */
export function monthSpentInBudget(ledger, mKey) {
  const exclude = new Set(ledger.settings.excludeFromBudgetCategoryIds || []);
  return liveRecords(ledger)
    .filter((r) => r.type === 'expense' && monthKey(r.date) === mKey && !exclude.has(r.categoryId))
    .reduce((s, r) => s + baseAmt(ledger, r), 0);
}

/** 首页核心数字：今天还能花多少（整数分，可为负）。无总预算返回 null。 */
export function canSpendToday(ledger) {
  const iso = todayISO();
  const mKey = monthKey(iso);
  const total = ledger.budgets.find((b) => !b.deleted && b.month === mKey && b.scope === 'total');
  if (!total || total.amountCents <= 0) return null;
  const spent = monthSpentInBudget(ledger, mKey);
  const now = new Date();
  const remainDays = daysInMonth(now.getFullYear(), now.getMonth()) - now.getDate() + 1;
  return Math.round((total.amountCents - spent) / Math.max(1, remainDays));
}
