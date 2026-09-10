# Edgeboard

A dark, responsive Kalshi / Polymarket scanner with live API pagination, built-in automated probability estimates, YES and NO positions, category and closing-horizon filters, net-gap and AI-rating sorting, watchlists, CSV export, and 60-second refresh.

## Run

Requires Node 22.13+ and pnpm 11.19.

```
pnpm install
pnpm dev
```

Production build: `pnpm build`. Worker output: `dist/server/index.js`. This site requires a server/Cloudflare Worker; GitHub Pages alone cannot host its market proxy.

## Built-in model

Edgeboard AI v1 automatically creates a numeric estimate and 1.0–10.0 score for every market with a usable quote. It uses the live YES/NO spread, quote freshness, and reported liquidity. The estimate is anchored to market prices, so it is a screening model rather than a true probability or independent factual forecast. No forecast connection or user API key is required.

## Calculation

For $1 binary contracts held to settlement:

`raw gap (pp) = 100 × (forecast probability − actual best ask)`

`estimated net gap (pp) = raw gap − estimated costs in cents/share`

NO uses `1 − probabilityYes` and its own ask and AI rating. Default qualification is **strictly greater than 1.5 percentage points after costs**. The default 2¢/share total cost allowance is an editable assumption, not a verified fee. It should include fees and size-dependent slippage. Depth, order size, taxes, opportunity cost, actual fees and guarantee of execution are not modeled. Missing prices are never treated as zero. Quotes more than 120 seconds old, closed/ended markets, and expired forecasts are excluded from qualified results.

## Data coverage and limits

- Kalshi: public `/trade-api/v2/markets` cursor pagination; default excludes multivariate combos. An optional methodology switch includes combos. Series metadata supplies category where available. Quote values use dollar fields.
- Polymarket: Gamma `/markets/keyset` cursor pagination, followed by CLOB `/books` batches. Best asks are the minimum actual ask levels. Active, accepting-order, binary order-book markets are scanned. Only YES/NO labels map to forecasts; other two-outcome labels remain unquoted. Categories are inferred and labeled accordingly.
- Discovery stops at 10,000 loaded markets per platform. Once a platform reaches the cap, its list stays in place instead of restarting. A rotating set of loaded quotes refreshes every minute. Browsers may throttle background timers.
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
