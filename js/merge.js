// merge.js —— 按实体 id 合并两本账本。可交换、可结合、幂等。
// 胜者规则：updatedAt 较晚者胜；相等则 deviceId 字典序大者胜；完全相同则任取。
// 软删除同样参与比较，因此「删除」与「编辑」竞争时较晚者胜出，不会复活。

function pickWinner(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if ((a.deviceId || '') !== (b.deviceId || '')) {
    return (a.deviceId || '') > (b.deviceId || '') ? a : b;
  }
  return a;
}

function mergeList(localList = [], remoteList = []) {
  const byId = new Map();
  for (const e of [...localList, ...remoteList]) {
    byId.set(e.id, pickWinner(byId.get(e.id), e));
  }
  return [...byId.values()];
}

/** 合并两本账本，返回新账本对象（不改动入参）。 */
export function mergeLedger(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  return {
    schemaVersion: Math.max(local.schemaVersion || 1, remote.schemaVersion || 1),
    meta: pickWinner(
      { ...local.meta, updatedAt: local.meta?.lastWriteAt, deviceId: local.meta?.lastWriteDeviceId },
      { ...remote.meta, updatedAt: remote.meta?.lastWriteAt, deviceId: remote.meta?.lastWriteDeviceId }
    ),
    categories: mergeList(local.categories, remote.categories),
    records: mergeList(local.records, remote.records),
    budgets: mergeList(local.budgets, remote.budgets),
    settings: pickWinner(local.settings, remote.settings),
  };
}
