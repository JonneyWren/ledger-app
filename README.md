# 轻记账 · Ledger PWA

轻量、离线优先、支持单用户多端同步的支出记账 PWA。纯静态、无构建、无后端服务器。

Lightweight, offline-first expense-tracking PWA with multi-device sync. Pure static, no build step, no backend server.

## 功能 Features

- 📝 快速记账：支出/收入、自绘数字键盘、分类按使用频率排序、长按保存并继续
- 🏷️ 分类管理：预置 14 个分类，可增删改排序；删除支持归档或迁移，历史记录永不丢失
- 💱 多币种：人民币 / 港币，固定汇率折算后统一参与统计与预算
- 📊 统计：日/周/月总结、分类排行、周柱状图、月度热力图、环比
- 🎯 预算：月度总预算 + 分类预算，自动继承上月，核心数字"今天还能花 X 元"
- 🌐 中英文界面一键切换（Language switch: 中文 / English）
- 🔄 多端同步：以私有 GitHub 仓库中的单个 `ledger.json` 为中枢，按实体 id 合并，冲突自动重试，含数据安全阀
- 📴 离线可用：IndexedDB 本地存储 + Service Worker 应用壳缓存，可安装到手机桌面

## 技术栈 Tech Stack

原生 ES Modules + IndexedDB + GitHub Contents API + Service Worker。无任何框架与构建工具，GitHub Pages 直接托管。

## 部署 Deploy（GitHub Pages）

1. Fork 或推送本仓库到你的 GitHub 账号
2. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main`，目录 `/ (root)`
3. 访问 `https://<你的用户名>.github.io/<仓库名>/`
4. 另建一个**私有**空仓库存放账本数据，生成带 `repo` 权限的 PAT
5. 在应用「设置 → 多端同步」填入用户名、私有仓库名、文件路径与令牌，点「测试连接」

## 目录结构 Structure

```
index.html            应用壳
app.css               Apple 风黑白单色样式
manifest.webmanifest  PWA 清单
sw.js                 Service Worker（应用壳缓存）
icon.svg              应用图标
js/
  main.js             入口：路由 / Tab / FAB / 同步状态
  pages.js            今日 / 明细 / 统计
  manage.js           预算 / 分类管理 / 设置
  entry.js            记账弹层
  dom.js              DOM 辅助与弹层组件
  store.js            状态 + CRUD + 预算继承 + 防抖同步
  stats.js            聚合统计
  sync.js             GitHub Contents API
  merge.js            按实体 id 的合并算法
  db.js               IndexedDB 封装
  money.js            整数分金额与币种折算
  i18n.js             中英文文案
```
