# Stocks viewer

A read-only website for following US, European and Baltic stock prices.

![Market overview](docs/screenshot.png)

## Start

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173.

## Deploy

```bash
npx wrangler login
```

```bash
npm run deploy
```

Pushing to `main` deploys automatically once the repository has the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets.

To rename the site, edit `src/config/brand.ts`.
