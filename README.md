# Edgeboard

A dark, responsive Kalshi / Polymarket scanner with live API pagination, YES and NO positions, category and closing-horizon filters, estimated edge sorting, independent AI rating sorting, watchlists, CSV export, and 60-second refresh.

## Run

Requires Node 22.13+ and pnpm 11.19.

```
pnpm install
pnpm dev
```

Production build: `pnpm build`. Worker output: `dist/server/index.js`. This site requires a server/Cloudflare Worker; GitHub Pages alone cannot host its market proxy.

## Forecast connection

No forecasts or AI scores are fabricated. With no source connected, qualified results are empty and all live markets can be explored through **Browse markets**.

Connect a public HTTPS JSON URL from **Forecast source** (must support browser CORS), paste JSON for local import, or set `FORECAST_FEED_URL` and optional `FORECAST_FEED_TOKEN` as hosted environment secrets for a private feed. Local development keys match `.env.example`. Never commit credentials. Public feed URLs and imports are stored only in browser localStorage. Failed feeds clear their forecasts rather than continuing to recommend from an unavailable source.

The JSON object has a `forecasts` array. Each entry requires:

- `platform`: `kalshi` or `polymarket`
- `marketId`: exact Kalshi market ticker or Polymarket Gamma market ID (not event or token ID)
- `probabilityYes`: numeric 0–1
- `source`, HTTPS `sourceUrl`, and `rationale`
- `updatedAt` and `expiresAt`: ISO timestamps, expiry after update
- Optional `ai`: `{ "yes": 7.8, "no": 2.2, "model": "your-model-name" }`

The feed must derive forecasts independently and account for the precise settlement rules. Ratings come from the provider, are not calibrated win probabilities, and are not verified by Edgeboard. No AI inference service or paid data subscription is included. Imported forecasts do not refresh automatically.

## Calculation

For $1 binary contracts held to settlement:

`raw gap (pp) = 100 × (forecast probability − actual best ask)`

`estimated net gap (pp) = raw gap − estimated costs in cents/share`

NO uses `1 − probabilityYes` and its own ask and AI rating. Default qualification is **strictly greater than 1.5 percentage points after costs**. The default 2¢/share total cost allowance is an editable assumption, not a verified fee. It should include fees and size-dependent slippage. Depth, order size, taxes, opportunity cost, actual fees and guarantee of execution are not modeled. Missing prices are never treated as zero. Quotes more than 120 seconds old, closed/ended markets, and expired forecasts are excluded from qualified results.

## Data coverage and limits

- Kalshi: public `/trade-api/v2/markets` cursor pagination; default excludes multivariate combos. An optional methodology switch includes combos. Series metadata supplies category where available. Quote values use dollar fields.
- Polymarket: Gamma `/markets/keyset` cursor pagination, followed by CLOB `/books` batches. Best asks are the minimum actual ask levels, avoiding ambiguous BUY/SELL side conventions in the price endpoint. Active, accepting-order, binary order-book markets are scanned. Only YES/NO labels map to forecasts; other two-outcome labels remain unquoted. Categories are inferred and labeled accordingly.
- Scans progressively replace rows and expose scanned records, page count, completeness and errors. There is no claim that a scan is a synchronized snapshot. Metadata/quotes can change during pagination. Refresh triggers each 60 seconds while the browser page is open; an ongoing sweep is not overlapped. Markets with connected forecasts also receive a separate priority quote refresh every minute, so a long discovery sweep does not prevent quote refreshes for scored markets. Broad scans can take longer. Browsers may throttle background timers. A 100,000-loaded-market guard marks coverage partial instead of exhausting browser memory.
- Each fetched page has its own timestamp. No demo/sample market data appears as live results.
- No trade placement, exchange wallet access or user authentication credentials are required for the public market reads.

## Checks

```
pnpm exec tsc --noEmit
node --experimental-strip-types --test tests/*.test.ts
pnpm build
```

GitHub Actions runs these checks on pushes and pull requests. GitHub repository creation requires a connected/signed-in GitHub account; this source project is prepared for pushing to one.

## Sources

- https://docs.kalshi.com/api-reference/market/get-markets
- https://docs.polymarket.com/api-reference/markets/list-markets-keyset-pagination
- https://docs.polymarket.com/market-data/prices-order-books
- https://help.kalshi.com/en/articles/13823805-fees
- https://docs.polymarket.com/trading/fees
