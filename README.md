# AQ V37.5 Beta3 P0.5.1

Hotfix for iPad/Safari scan failure.

- Frontend API route fixed to literal `/api/quote` (no browser URL constructor).
- Backend no longer uses URL constructor for static Eastmoney host labels.
- Added explicit health check and clearer HTTP/JSON diagnostics.
- Keeps P0.5 stable-data fallback and total market-cap filter: only stocks with total cap <= 800亿元 enter the selection pool.
- Market breadth/risk still uses the full valid A-share scan.
- AQ/MQ/HR/RR/IM/TradeScore logic unchanged.

Deploy the whole folder to Cloudflare Pages so `index.html` and `functions/api/quote.js` update together.
