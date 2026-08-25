// store.js —— 内存状态 + CRUD + 预算继承 + 持久化 + 防抖同步。
import { loadLedger, saveLedger } from './db.js';
import { mergeLedger } from './merge.js';
import * as sync from './sync.js';
import { monthKey, todayISO } from './stats.js';
import { setLang } from './i18n.js';
import { BASE_CURRENCY } from './money.js';

const now = () => new Date().toISOString();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));

function getDeviceId() {
  let id = localStorage.getItem('ledger.deviceId');
  if (!id) { id = 'dev_' + Math.random().toString(16).slice(2, 8); localStorage.setItem('ledger.deviceId', id); }
  return id;
}

const DEFAULT_EXPENSE = [
  ['🍜', '饮食', 'Food'], ['🧻', '日用品', 'Daily'], ['👕', '服饰', 'Clothing'], ['🏠', '房租水电', 'Rent & Utilities'],
  ['🚇', '交通', 'Transport'], ['📚', '知识付费', 'Learning'], ['💊', '医疗健康', 'Health'], ['🎉', '娱乐社交', 'Fun & Social'],
  ['🎁', '人情礼物', 'Gifts'], ['📦', '其他', 'Other'],
];
const DEFAULT_INCOME = [['💰', '工资', 'Salary'], ['🧾', '副业', 'Side income'], ['📈', '理财收益', 'Investment'], ['🎈', '其他收入', 'Other income']];

function newCategory(emoji, name, nameEn, type, order) {
  return { id: uuid(), name, nameEn, emoji, type, order, archived: false, builtin: true, deleted: false, createdAt: now(), updatedAt: now(), deviceId: getDeviceId() };
}

function freshLedger() {
  const cats = [];
  DEFAULT_EXPENSE.forEach((c, i) => cats.push(newCategory(c[0], c[1], c[2], 'expense', i)));
  DEFAULT_INCOME.forEach((c, i) => cats.push(newCategory(c[0], c[1], c[2], 'income', i)));
  return {
    schemaVersion: 1,
    meta: { createdAt: now(), lastWriteAt: now(), lastWriteDeviceId: getDeviceId() },
    categories: cats,
    records: [],
    budgets: [],
    settings: { id: 'settings', warnThreshold: 0.8, excludeFromBudgetCategoryIds: [], theme: 'system', lockEnabled: false, repoOwner: '', repoName: '', filePath: 'ledger.json', currency: BASE_CURRENCY, hkdRate: 0.92, lang: '', updatedAt: now(), deviceId: getDeviceId() },
  };
}

class Store extends EventTarget {
  constructor() { super(); this.ledger = null; this.sha = null; this.syncState = 'idle'; this._pushTimer = null; }

  get deviceId() { return getDeviceId(); }

  async init() {
    this.ledger = (await loadLedger()) || freshLedger();
    this.normalize();
    setLang(this.ledger.settings.lang || undefined);
    this.ensureMonthBudgets(monthKey(todayISO()));
    await this.persist(false);
    this.emit();
    if (this.hasSyncConfig()) this.fullSync().catch(() => {});
  }

  /** 兼容旧版本账本：补齐新增字段默认值。 */
  normalize() {
    const s = this.ledger.settings;
    if (!s.currency) s.currency = BASE_CURRENCY;
    if (s.hkdRate == null) s.hkdRate = 0.92;
    if (s.lang == null) s.lang = '';
    for (const c of this.ledger.categories) if (c.nameEn === undefined) c.nameEn = '';
    for (const r of this.ledger.records) if (!r.currency) r.currency = BASE_CURRENCY;
  }

  emit() { this.dispatchEvent(new Event('change')); }
  setSyncState(s) { this.syncState = s; this.dispatchEvent(new Event('syncstate')); }

  touchMeta() { this.ledger.meta.lastWriteAt = now(); this.ledger.meta.lastWriteDeviceId = getDeviceId(); }

  async persist(triggerSync = true) {
    await saveLedger(this.ledger);
    this.emit();
    if (triggerSync && this.hasSyncConfig()) this.schedulePush();
  }

  // —— 查询 ——
  categories(type) { return this.ledger.categories.filter((c) => !c.deleted && (!type || c.type === type)); }
  activeCategories(type) { return this.categories(type).filter((c) => !c.archived).sort((a, b) => a.order - b.order); }
  categoryById(id) { return this.ledger.categories.find((c) => c.id === id); }
  recordCountByCategory(catId) { return this.ledger.records.filter((r) => !r.deleted && r.categoryId === catId).length; }

  /** 按近 30 天使用频率排序的活跃分类（用于记账选择器）。 */
  categoriesByFrequency(type) {
    const since = new Date(); since.setDate(since.getDate() - 30);
    const sinceISO = since.toISOString().slice(0, 10);
    const freq = {};
    for (const r of this.ledger.records) {
      if (!r.deleted && r.type === type && r.date >= sinceISO) freq[r.categoryId] = (freq[r.categoryId] || 0) + 1;
    }
    return this.activeCategories(type).sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0) || a.order - b.order);
  }

  // —— 记录 CRUD ——
  addRecord({ type, amountCents, categoryId, date, note, tags, currency }) {
    const r = { id: uuid(), type, amountCents, currency: currency || BASE_CURRENCY, categoryId, date, note: note || '', tags: tags || [], deleted: false, createdAt: now(), updatedAt: now(), deviceId: getDeviceId() };
    this.ledger.records.push(r); this.touchMeta(); this.persist(); return r;
  }
  updateRecord(id, patch) {
    const r = this.ledger.records.find((x) => x.id === id); if (!r) return;
    Object.assign(r, patch, { updatedAt: now(), deviceId: getDeviceId() }); this.touchMeta(); this.persist();
  }
  deleteRecord(id) { this.updateRecord(id, { deleted: true }); }

  // —— 分类管理 ——
  addCategory(emoji, name, type, nameEn = '') {
    const order = Math.max(-1, ...this.categories(type).map((c) => c.order)) + 1;
    const c = { id: uuid(), name, nameEn, emoji: emoji || '📦', type, order, archived: false, builtin: false, deleted: false, createdAt: now(), updatedAt: now(), deviceId: getDeviceId() };
    this.ledger.categories.push(c); this.touchMeta(); this.persist(); return c;
  }
  updateCategory(id, patch) {
    const c = this.categoryById(id); if (!c) return;
    Object.assign(c, patch, { updatedAt: now(), deviceId: getDeviceId() }); this.touchMeta(); this.persist();
  }
  archiveCategory(id) { this.updateCategory(id, { archived: true }); }
  unarchiveCategory(id) { this.updateCategory(id, { archived: false }); }
  /** 迁移并删除：把该分类下记录改到 targetId，再软删除本分类。 */
  migrateAndDelete(id, targetId) {
    for (const r of this.ledger.records) {
      if (!r.deleted && r.categoryId === id) { r.categoryId = targetId; r.updatedAt = now(); r.deviceId = getDeviceId(); }
    }
    this.updateCategory(id, { deleted: true });
  }
  deleteEmptyCategory(id) { this.updateCategory(id, { deleted: true }); }
  moveCategory(id, dir) {
    const c = this.categoryById(id); if (!c) return;
    const list = this.activeCategories(c.type);
    const i = list.findIndex((x) => x.id === id); const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j]; const ao = a.order; a.order = b.order; b.order = ao;
    a.updatedAt = b.updatedAt = now(); a.deviceId = b.deviceId = getDeviceId();
    this.touchMeta(); this.persist();
  }

  // —— 预算 ——
  totalBudget(mKey) { return this.ledger.budgets.find((b) => !b.deleted && b.month === mKey && b.scope === 'total'); }
  categoryBudget(mKey, catId) { return this.ledger.budgets.find((b) => !b.deleted && b.month === mKey && b.scope === 'category' && b.categoryId === catId); }
  setBudget(mKey, scope, categoryId, amountCents) {
    let b = scope === 'total' ? this.totalBudget(mKey) : this.categoryBudget(mKey, categoryId);
    if (b) { b.amountCents = amountCents; b.updatedAt = now(); b.deviceId = getDeviceId(); }
    else this.ledger.budgets.push({ id: uuid(), month: mKey, scope, categoryId: scope === 'total' ? null : categoryId, amountCents, deleted: false, createdAt: now(), updatedAt: now(), deviceId: getDeviceId() });
    this.touchMeta(); this.persist();
  }
  /** 进入无预算的月份时，自动继承上月预算数值。 */
  ensureMonthBudgets(mKey) {
    const has = this.ledger.budgets.some((b) => !b.deleted && b.month === mKey);
    if (has) return false;
    const [y, m] = mKey.split('-').map(Number);
    const prevD = new Date(y, m - 2, 1);
    const prevKey = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
    const prev = this.ledger.budgets.filter((b) => !b.deleted && b.month === prevKey);
    if (!prev.length) return false;
    for (const b of prev) {
      this.ledger.budgets.push({ id: uuid(), month: mKey, scope: b.scope, categoryId: b.categoryId, amountCents: b.amountCents, deleted: false, createdAt: now(), updatedAt: now(), deviceId: getDeviceId() });
    }
    return true;
  }

  updateSettings(patch) { Object.assign(this.ledger.settings, patch, { updatedAt: now(), deviceId: getDeviceId() }); this.touchMeta(); this.persist(); }

  // —— 同步 ——
  hasSyncConfig() { const s = this.ledger?.settings; return !!(s && s.repoOwner && s.repoName && localStorage.getItem('ledger.gh.token')); }
  syncCfg() { const s = this.ledger.settings; return { repoOwner: s.repoOwner, repoName: s.repoName, filePath: s.filePath, token: localStorage.getItem('ledger.gh.token') }; }

  schedulePush() { clearTimeout(this._pushTimer); this._pushTimer = setTimeout(() => this.fullSync().catch(() => {}), 3000); }

  async fullSync() {
    if (!this.hasSyncConfig()) return;
    this.setSyncState('syncing');
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const cfg = this.syncCfg();
        const { ledger: remote, sha } = await sync.pull(cfg);
        const remoteLive = remote ? remote.records.filter((r) => !r.deleted).length : Infinity;
        this.ledger = mergeLedger(this.ledger, remote);
        const mergedLive = this.ledger.records.filter((r) => !r.deleted).length;
        // 安全阀：合并后活跃记录较远端骤减 >20% 时暂停并交由 UI 确认
        if (remote && remoteLive !== Infinity && mergedLive < remoteLive * 0.8 && !this._safetyOverride) {
          await saveLedger(this.ledger); this.emit();
          this.setSyncState('paused');
          this.dispatchEvent(new CustomEvent('safety', { detail: { from: remoteLive, to: mergedLive } }));
          return;
        }
        await saveLedger(this.ledger); this.emit();
        try {
          this.sha = await sync.push(cfg, this.ledger, sha, this.deviceId);
          this.setSyncState('synced');
          return;
        } catch (e) {
          if (e.code === 'CONFLICT') continue; // 重新 pull-merge-push
          throw e;
        }
      }
      this.setSyncState('pending');
    } catch (e) {
      this.setSyncState(e.code === 'AUTH' ? 'auth' : 'pending');
      this.dispatchEvent(new CustomEvent('syncerror', { detail: { code: e.code || 'ERR' } }));
    }
  }

  async confirmSafetyAndPush() { this._safetyOverride = true; try { await this.fullSync(); } finally { this._safetyOverride = false; } }

  // —— 导入/导出 ——
  exportJSON() { return JSON.stringify(this.ledger, null, 2); }
  async importJSON(text) { const incoming = JSON.parse(text); this.ledger = mergeLedger(this.ledger, incoming); this.touchMeta(); await this.persist(); }
}

export const store = new Store();
