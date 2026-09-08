# AQ V37.4 Discovery Beta1 - Cloudflare Fix

Cloudflare Pages directory layout:

- `index.html`
- `functions/api/quote.js`

The frontend calls `/api/quote`, so Pages Functions must be placed at
`functions/api/quote.js`.

Deployment:
1. Replace the repository files with this structure.
2. Commit to the `main` branch.
3. Cloudflare Pages should auto-deploy from GitHub.
4. Test:
   - `/`
   - `/api/quote?health=1`
   - `/api/quote?mode=scan`

Notes:
- No build command required.
- Framework preset: None.
- Build output directory: leave blank when using the repository root.
