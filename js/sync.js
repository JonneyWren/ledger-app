// sync.js —— GitHub Contents API 单文件读写。中文经 TextEncoder/Decoder 处理 base64。

const API = 'https://api.github.com';

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function url(cfg) {
  return `${API}/repos/${cfg.repoOwner}/${cfg.repoName}/contents/${cfg.filePath || 'ledger.json'}`;
}

/** 只读测试连接。返回 {ok, status, message}。 */
export async function testConnection(cfg) {
  try {
    const res = await fetch(url(cfg), { headers: headers(cfg.token) });
    if (res.status === 404) return { ok: true, status: 404, message: '连接成功（文件尚不存在，将在首次同步时创建）' };
    if (res.ok) return { ok: true, status: res.status, message: '连接成功' };
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, message: '凭据无效或权限不足' };
    return { ok: false, status: res.status, message: `失败（HTTP ${res.status}）` };
  } catch (e) {
    return { ok: false, status: 0, message: '网络错误：' + e.message };
  }
}

/** 拉取远端账本。返回 {ledger|null, sha|null}。404 视为空。 */
export async function pull(cfg) {
  const res = await fetch(url(cfg), { headers: headers(cfg.token) });
  if (res.status === 404) return { ledger: null, sha: null };
  if (res.status === 401 || res.status === 403) { const e = new Error('AUTH'); e.code = 'AUTH'; throw e; }
  if (!res.ok) throw new Error('PULL_' + res.status);
  const data = await res.json();
  const text = b64decodeUtf8(data.content);
  return { ledger: JSON.parse(text), sha: data.sha };
}

/** 推送账本。带 sha 做乐观锁；返回新 sha。 */
export async function push(cfg, ledger, sha, deviceId) {
  const body = {
    message: `sync: ${deviceId} ${new Date().toISOString()}`,
    content: b64encodeUtf8(JSON.stringify(ledger)),
  };
  if (sha) body.sha = sha;
  const res = await fetch(url(cfg), { method: 'PUT', headers: headers(cfg.token), body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) { const e = new Error('CONFLICT'); e.code = 'CONFLICT'; throw e; }
  if (res.status === 401 || res.status === 403) { const e = new Error('AUTH'); e.code = 'AUTH'; throw e; }
  if (!res.ok) throw new Error('PUSH_' + res.status);
  const data = await res.json();
  return data.content.sha;
}
