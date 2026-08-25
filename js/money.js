// money.js —— 金额一律以「整数分」存储与运算，禁止浮点存储
// 展示与解析在此集中处理，避免精度误差扩散到业务层

/** 将用户输入的元字符串解析为整数分。非法返回 null。 */
export function parseYuanToCents(input) {
  if (input == null) return null;
  const s = String(input).trim().replace(/[¥HK$,\s]/gi, '');
  if (s === '' || !/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [intPart, decPart = ''] = s.replace('-', '').split('.');
  const cents = Number(intPart) * 100 + Number((decPart + '00').slice(0, 2));
  return neg ? -cents : cents;
}

/** 整数分格式化为「1,234.56」（不带符号）。 */
export function formatCents(cents) {
  const n = Math.abs(Math.round(cents));
  const yuan = Math.floor(n / 100);
  const dec = String(n % 100).padStart(2, '0');
  return yuan.toLocaleString('en-US') + '.' + dec;
}

/** 带 ¥ 前缀（基准币种人民币，统计/预算口径统一用它）。 */
export function yuan(cents) {
  return '¥' + formatCents(cents);
}

export const BASE_CURRENCY = 'CNY';
const SYMBOLS = { CNY: '¥', HKD: 'HK$' };

/** 按记录自身币种展示，如 ¥12.00 / HK$50.00。 */
export function fmt(cents, currency = BASE_CURRENCY) {
  return (SYMBOLS[currency] || SYMBOLS.CNY) + formatCents(cents);
}

/** 折算为基准币种（人民币）整数分。rate = 1 单位 HKD 兑多少 CNY。 */
export function toBaseCents(cents, currency, rate) {
  if (!currency || currency === BASE_CURRENCY) return cents;
  const r = Number(rate);
  if (!r || r <= 0) return cents; // 汇率未配置时按原值参与统计
  return Math.round(cents * r);
}
