# AQ V37.5 Beta3 P0.5.5 — Multi-Source Market Data

- 全市场扫描：新浪 Market Center 主源；东方财富备用。
- 自选/持仓实时：腾讯财经主源；新浪备用；东方财富第三备用。
- KV 最近成功快照兜底，实时源全失败时明确标记 stale/cache。
- 保留总市值 > 800 亿元排除规则。
- 不修改 AQ/MQ/HR/RR/IM/TradeScore 主体逻辑。
- 健康检查：`/quote?health=upstream` 可分别查看 Tencent/Sina/Eastmoney 状态。
- 免费公开行情接口可能变更或限流，仅用于研究与相对比较。


P0.5.5 盘中救援：扫描改为轻量强势发现池，避免大分页持续 HTTP 502；仍严格执行总市值≤800亿元。
