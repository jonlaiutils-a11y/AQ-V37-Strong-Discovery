# AQ V37.5 Beta3 P0.5.3 Route Fix

- Cloudflare Pages Function restored to `functions/quote.js`, matching route `/quote`.
- Frontend uses literal relative path `/quote` (no Safari URL constructor).
- Health check: `/quote?health=1`.
- Market-cap pool limit remains <= 800亿元.
- AQ/MQ/HR/RR/IM/TradeScore logic unchanged.

Deploy the complete project, not index.html alone. After deployment, open `/quote?health=1`; it must return JSON before scanning.


## P0.5.3 行情稳定补丁
- 东方财富 clist 请求加入公共 ut 参数。
- 全市场由 2000/页改为 500/页串行，降低 Cloudflare 出口请求被上游 502 的概率。
- 单页失败可降级；总覆盖不足 1200 只时禁止生成 Top，优先使用 KV 最近成功快照。
- 总市值 > 800 亿元继续排除选股池；市场情绪仍按完整有效市场计算。
- `/quote?health=upstream` 可测试上游行情是否能返回数据。
