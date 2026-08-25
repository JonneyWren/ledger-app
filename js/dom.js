// dom.js —— 极简 DOM 辅助与通用 UI 组件（弹层、toast、确认框）。

/** 创建元素：h('div.card', {onclick}, [children|string]) */
export function h(sel, props = {}, children = []) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (k === 'onclick' || k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v != null) el.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/** 底部弹层。返回 {close}。 */
export function sheet(title, contentNode, { onClose } = {}) {
  const backdrop = h('div.backdrop');
  const panel = h('div.sheet');
  const head = h('div.sheet-head', {}, [
    h('div.sheet-title', {}, title),
    h('button.icon-btn', { onclick: () => close() }, '✕'),
  ]);
  panel.append(head, contentNode);
  backdrop.append(panel);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  function close() { backdrop.classList.remove('show'); setTimeout(() => backdrop.remove(), 220); onClose && onClose(); }
  return { close, panel };
}

/** 确认框。返回 Promise<boolean>。可传自定义按钮文案。 */
export function confirmDialog(message, { okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = h('div.backdrop.center');
    const box = h('div.dialog', {}, [
      h('div.dialog-body', {}, message),
      h('div.dialog-actions', {}, [
        h('button.btn-ghost', { onclick: () => done(false) }, cancelText),
        h('button' + (danger ? '.btn-danger' : '.btn'), { onclick: () => done(true) }, okText),
      ]),
    ]);
    backdrop.append(box); document.body.append(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('show'));
    function done(v) { backdrop.classList.remove('show'); setTimeout(() => backdrop.remove(), 180); resolve(v); }
  });
}

/** 轻量撤销条（用于删除记录）。 */
export function undoBar(message, onUndo) {
  const bar = h('div.undobar', {}, [
    h('span', {}, message),
    h('button.undo-btn', { onclick: () => { onUndo(); bar.remove(); } }, '撤销'),
  ]);
  document.body.append(bar);
  requestAnimationFrame(() => bar.classList.add('show'));
  setTimeout(() => { bar.classList.remove('show'); setTimeout(() => bar.remove(), 300); }, 5000);
}

export function vibrate(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
