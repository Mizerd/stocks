# Stocks viewer

A public, read-only website for following stock prices: a market overview, a page per stock with a
full chart, an example portfolio, and a screener with side-by-side comparison. Lithuanian and
English, light and dark. There are no accounts, no trading and nothing to manage.

The public name ("Varpas") is a placeholder, see [Renaming the site](#renaming-the-site).

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` starts the Worker (API) on port 8787 and Vite on port 5173; open http://localhost:5173.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks and builds the frontend into `dist/` |
| `npm run preview` | Builds, then serves the production build and API with `wrangler dev` on port 8787 |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run deploy` | Builds and runs `wrangler deploy` |

## Deploy with Wrangler

The site is one Cloudflare Worker: static assets from `dist/` plus a small read-only API under
`/api/*` (`wrangler.jsonc`). Unknown paths fall back to `index.html`, so links such as
`/stock/ASML.AS` work when opened directly. No database, KV, secrets or paid features are needed.

```bash
npx wrangler login
```

```bash
npm run deploy
```

The site is then available on your `workers.dev` subdomain as `stocks-viewer`.

## Renaming the site

Edit `src/config/brand.ts` and nothing else:

1. Change `name`, `shortName`, the two `tagline` texts and the two `description` texts.
2. Optionally set `siteUrl` and `shareImage` for social sharing tags, and replace the `logo` paths.
3. Replace `public/favicon.svg` if the logo changed.
4. Run `npm run deploy`.

The header, footer, page titles, HTML metadata and translated texts (through the `{brand}`
placeholder) all read from that file. The Worker name in `wrangler.jsonc` is deliberately generic.

## Markets and symbols

The site tracks a fixed list of 35 stocks and 4 indices, defined in `shared/catalog.ts`. It is a
covered universe, not a whole-market screener. Adding a stock is one line in that file.

| Region | Symbols |
|---|---|
| USA | AAPL, MSFT, NVDA, AMD, GOOGL, META, AMZN, TSLA, KO, JPM, V, XOM, JNJ |
| Europe | ASML.AS, SHELL.AS, INGA.AS, HEIA.AS, MC.PA, AIR.PA, OR.PA, TTE.PA, SAN.PA, SAP.MI, NOVO-B.CO, DSV.CO, NOKIA.HE |
| Baltics | IGN1L.VS, TEL1L.VS, ROE1L.VS (Artea Bankas, formerly SAB1L), APG1L.VS, AKO1L.VS, KNE1L.VS, GRG1L.VS, LHV1T.TL, TAL1T.TL |
| Indices | Nasdaq 100, Nasdaq Composite, Euronext 100, OMX Vilnius |

## Data sources

All data is fetched by the Worker; nothing needs an API key or an account.

| Market | Source | Freshness | What it provides |
|---|---|---|---|
| USA | Nasdaq public quote service (`api.nasdaq.com`) | Real-time last sale for stocks, delayed for indices | Quote, daily OHLCV, intraday, market cap, EPS, revenue, analyst consensus |
| Copenhagen, Helsinki | Nasdaq Nordic (`api.nasdaq.com/api/nordic`) | Delayed 15 min | Quote, daily OHLCV, intraday, market cap |
| Amsterdam, Paris, Milan | Euronext historical price download (`live.euronext.com`) | End of day | Daily OHLCV, about two years back |
| Vilnius, Tallinn | Nasdaq Baltic (`nasdaqbaltic.com`) share list, price export, index chart, news RSS | Delayed 15 min | Quote, daily OHLCV, intraday trades, OMX Vilnius, issuer news |
| Exchange rates | ECB euro reference rates | Daily | Currency conversion on the portfolio and screener |

These are public pages and downloads of the exchanges, not licensed data feeds. They can change
format or be withdrawn without notice, and the exchanges' terms govern reuse of their data. Check
those terms before running the site commercially; a licensed feed can be added as another provider
in `worker/providers/` without touching the UI.

Every price on the site is shown with its freshness and timestamp. Where a source has no figure
the page shows a dash; nothing is estimated or invented.

### Refresh and caching

| Data | Cached for |
|---|---|
| Quotes and the Baltic share list | 60 s |
| Intraday series | 2 min |
| Summaries and fundamentals | 5 min to 24 h |
| Daily history | 15 min to 1 h |
| News | 5 min |
| ECB rates | 6 h |

Upstream responses are cached in the Worker (memory and the edge cache), API responses carry
`Cache-Control`, and the browser re-fetches quotes once a minute. Upstream calls have a 12 s
timeout and one retry. If a source fails, the affected quotes are reported as unavailable while
the rest of the page keeps working. `/api/status` and the "Data sources" page show which sources
respond.

## Known limitations

- **SAP is the Euronext Milan (EuroTLX) line, not Xetra.** No keyless public source for Xetra was
  found: Deutsche Börse's API needs signed requests, Stooq was unreachable, and Yahoo Finance
  answered every test request with HTTP 429 and does not permit this use. `SAP.DE` redirects to
  `SAP.MI`, which is labelled with its exchange.
- **Euronext stocks are end-of-day only**, have no intraday chart and no market cap or P/E.
  Euronext's live quote endpoint is deliberately obfuscated and is not used.
- **P/E and dividend yield exist only for US stocks**, and Nasdaq publishes no dividend for
  NYSE-listed shares (KO, JPM, V, XOM, JNJ). Beta is not available anywhere and was dropped.
- **Nasdaq Baltic sometimes refuses the live share list** (its bot protection answers with a
  refusal page). Baltic quotes then fall back to the last daily close and are labelled end of day.
- **Daily charts end at the last completed session** for US and Nordic stocks; the price in the
  page header is the current quote.
- **No S&P 500 or STOXX 600**: neither has a keyless source. The overview uses the Nasdaq 100,
  Nasdaq Composite, Euronext 100 and OMX Vilnius instead.
- **The market barometer is an in-house gauge** over the tracked stocks: 60% breadth (advancers
  minus decliners) and 40% average move capped at ±2%. It is not a market-wide index. Day changes
  of Euronext stocks in it are from the previous close.
- **Trading holidays** for 2026 and 2027 are listed by hand in `shared/exchanges.ts` and drive only
  the session widget; they need extending yearly.
- **The portfolio is an example.** Holdings, purchase prices and alert levels are invented and
  labelled as such; values use real quotes. Its performance chart is hypothetical (today's
  holdings held throughout, today's exchange rates).
- A request for 8 US stocks makes about 32 upstream calls, under the 50-subrequest limit of the
  Workers free plan. Keep the chunk size in `src/lib/api.ts` and `worker/index.ts` in step.

## Project layout

```
shared/     types, instrument catalogue, exchange sessions (used by Worker and frontend)
worker/     API routes, caching, one file per data provider
src/        React app: pages, components, i18n, formatting and chart maths
tests/      unit tests
```

There are no environment variables.
