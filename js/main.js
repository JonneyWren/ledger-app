// main.js —— 应用入口：hash 路由、底部 Tab、记一笔 FAB、同步状态条、Service Worker 注册。
import { confirmDialog, undoBar } from './dom.js';
import { store } from './store.js';
import { openEntry } from './entry.js';
import { renderToday, renderRecords, renderStats } from './pages.js';
import { renderBudget, renderCategories, renderSettings } from './manage.js';
import { t } from './i18n.js';

const ROUTES = {
  today: { key: 'app.today', render: renderToday },
  records: { key: 'app.records', render: renderRecords },
  stats: { key: 'app.stats', render: renderStats },
  budget: { key: 'app.budget', render: renderBudget },
  categories: { key: 'app.categories', render: renderCategories },
  settings: { key: 'app.settings', render: renderSettings },
};

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('pageTitle');
const dotEl = document.getElementById('syncDot');

function current() {
  const key = location.hash.slice(1);
  return ROUTES[key] ? key : 'today';
}

function route() {
  if (!store.ledger) return;
  const key = current();
  viewEl.dataset.view = key;
  viewEl.replaceChildren();
  ROUTES[key].render(viewEl);
  titleEl.textContent = t(ROUTES[key].key);
  document.querySelectorAll('.tab').forEach((tb) => {
    tb.classList.toggle('tab-on', tb.dataset.view === key);
    tb.textContent = t('app.' + tb.dataset.view);
  });
  document.getElementById('fab').setAttribute('aria-label', t('app.add'));
  document.getElementById('settingsBtn').setAttribute('aria-label', t('app.settings'));
  window.scrollTo(0, 0);
}

// ———— 同步状态 ————
function paintSync() {
  const s = store.syncState;
  dotEl.dataset.state = s;
  dotEl.title = t('sync.' + s);
}
store.addEventListener('syncstate', paintSync);

store.addEventListener('safety', async (e) => {
  const { from, to } = e.detail || {};
  const ok = await confirmDialog(t('safety.body', { from, to }), {
    okText: t('safety.continue'), cancelText: t('safety.keep'), danger: true,
  });
  if (ok) store.confirmSafetyAndPush();
});

store.addEventListener('syncerror', (e) => {
  const code = (e.detail && e.detail.code) || 'ERR';
  const msg = code === 'AUTH' ? t('sync.authFail') : t('sync.error', { code });
  undoBar(msg, () => store.fullSync());
});

// ———— 数据变更 / 页面事件 → 重渲染 ————
store.addEventListener('change', route);
window.addEventListener('ledger:rerender', route);
window.addEventListener('hashchange', route);

// ———— 底部 Tab / FAB / 设置入口 ————
document.querySelectorAll('.tab').forEach((tb) => {
  tb.addEventListener('click', () => { location.hash = tb.dataset.view; });
});
document.getElementById('fab').addEventListener('click', () => openEntry());
document.getElementById('settingsBtn').addEventListener('click', () => {
  location.hash = current() === 'settings' ? 'today' : 'settings';
});

// ———— Service Worker（离线支持）。注册 URL 带版本号，绕过 HTTP 缓存确保拿到最新 sw.js ————
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js?v=3').catch(() => {}); });
}

// ———— 启动 ————
(async function boot() {
  await store.init();
  route();
  paintSync();
})();
