# AQ V37.4 Discovery Beta1

本版基于现有 aq-extreme-worker.js + 前端 index 页面升级。

## 新增/固定方向
- 强势机会主动发现层（当前扫描约500只最活跃A股候选池）
- 冲高回落、高开低走、日内低位、主力净流出过滤
- S/A+/A/B/C 等级
- 阶段 stage
- 买入区 buyLow/buyHigh
- 撤销买点 cancelBuy
- 次日强度 nextDayStrength
- 3日强度 threeDayStrength
- 止损与两档目标位

## 重要说明
Beta1 目前是“活跃候选池发现版”，尚未声称覆盖全部5000+只A股逐只扫描；下一阶段再扩展为真正全A分批扫描，并加入板块主线与失败样本动态保护。

## Cloudflare Pages
前端：index.html
函数：functions/api/quote.js
API：/api/quote?mode=scan
