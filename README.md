# AQ V38 P0.2｜第三方真实行情接入·部署测试版

## 文件
- `index.html`：iPad 适配界面
- `functions/quote.js`：Cloudflare Pages Function，公开第三方行情源（新浪/腾讯/东方财富）

## 部署
Cloudflare → Workers 和 Pages → 创建 Pages 项目 → 直接上传此 ZIP（如界面不接受 ZIP，则解压后上传整个目录）。**务必确认根目录含 index.html 和 functions/quote.js**。

## 验证（必做）
1. 打开 `https://你的项目.pages.dev/quote?health=1`，应返回 JSON，`ok:true`。
2. 打开 `/quote?health=upstream`，检查 `checks` 中腾讯/新浪/东方财富的返回数量或错误。
3. 打开 `/quote?mode=scan`，应返回 `ok:true`、`source`、`scanned`、`strongContra`；如出现 502/缓存警告，不可当实时使用。
4. 页面打开后手动扫描，对照独立行情软件核对价格和交易日期。

## 重要限制
- 本版本接入的是**真实第三方行情接口代码**，但未在 Cloudflare 线上验证接口是否可用、是否被拦截、是否延迟；**不保证逐笔实时**。
- 目前扫描约 1200 只成交活跃股票（视源返回情况），**不是全A股覆盖**；页面会明确显示覆盖数量。
- 页面时间表示服务器获取快照的时间，**不是交易所最后成交时间**；盘后不能将该时间误认为行情持续更新。
- 未接入历史20–60日K线、分钟级回测，高位末端风险仅为当日启发式判断。强势分数不是涨停概率，勿独立用于实盘下单。
- 可选 KV 绑定名称为 `AQ_KV`，用于保存成功扫描快照；不绑定也可扫描，但故障时没有历史缓存。
