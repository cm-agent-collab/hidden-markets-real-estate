# Hidden Markets · Real Estate Research — Web App

Interactive weighted-composite sorter for the US real-estate metro research.

**[ View live → ](https://christianmarino.github.io/)**

## What it does
- Loads 214 US metros (dragnet) with the top-18 deep-dive + BRRR overrides merged in.
- 15 adjustable criterion weights. Drag any slider and the table **re-sorts live** by the recomputed composite score.
- Filters: by state, top-18-only scope, and row count.

## Data
- `data/real-estate-data.json` — full 214-metro dragnet (price, rent, vacancy, pop growth, rentership, tax, landlord-friendliness, internet)
- `data/real-estate-final.json` — top-18 deep-dive ground-truth (buy-below %, DOM, appreciation, employment diversity, rent growth, climate, unknown-ness)
- `data/real-estate-brrr.json` — BRRR underwrite (buy price, refi, net $/door/mo)

## Run locally
```bash
npm install
npm run dev      # http://localhost:5173
```

## Build (for GitHub Pages)
```bash
npm run build    # outputs static site to ./dist
```
`base: './'` is set in `vite.config.js` so the build deploys to any Pages subpath.

## Deploy to GitHub Pages
1. `gh repo create hidden-markets-real-estate --public --source=. --push`
2. Push the whole folder (including `dist/` or add a Pages workflow).
3. Enable **Settings → Pages → Source: GitHub Actions** (or deploy `dist/` from a branch).