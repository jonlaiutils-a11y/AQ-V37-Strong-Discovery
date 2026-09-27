# AQ V37.5 Beta3 P0.5.2 Route Fix

- Cloudflare Pages Function restored to `functions/quote.js`, matching route `/quote`.
- Frontend uses literal relative path `/quote` (no Safari URL constructor).
- Health check: `/quote?health=1`.
- Market-cap pool limit remains <= 800亿元.
- AQ/MQ/HR/RR/IM/TradeScore logic unchanged.

Deploy the complete project, not index.html alone. After deployment, open `/quote?health=1`; it must return JSON before scanning.
