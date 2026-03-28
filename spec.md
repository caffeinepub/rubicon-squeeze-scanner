# Rubicon Squeeze Scanner

## Current State
- Backend `scanMarkets()` hardcodes 20 BTC rows -- never parses real API data
- Frontend calls `actor.scanMarkets()` which returns broken placeholder data
- Squeeze Candidate signal logic exists but user wants it removed
- `getAllSignals()` caches broken data and should be removed

## Requested Changes (Diff)

### Add
- Frontend-side CoinGecko API integration using direct fetch calls (CORS supported)
- 7-day average volume computation: fetch `/coins/{id}/market_chart?vs_currency=usd&days=7&interval=daily` for each of the 20 coins, average the `total_volumes` array
- Rubicon logic in frontend: if `current_24h_volume > 2 * seven_day_avg_volume` → signal = "rubicon", else "neutral"
- Sequential API calls with small throttle delay to respect CoinGecko rate limits

### Modify
- `App.tsx`: Replace `actor.scanMarkets()` call with direct CoinGecko fetch flow
- `App.tsx`: Remove all Squeeze Candidate references (KPI card, badge, sort logic)
- `App.tsx`: Status column shows "RUBICON" in bright green or "--" in neutral gray (plain text, no emoji)
- `App.tsx`: Table header column "30d Avg Volume" → "7d Avg Volume"
- `App.tsx`: KPI cards remove "Squeeze Candidates" card, keep "Total Scanned" and "Rubicon Breakouts"
- Motoko `main.mo`: Strip broken logic, keep minimal stub with `transform` and no-op `scanMarkets`

### Remove
- `getAllSignals()` backend function and frontend usage
- All Squeeze Candidate signal logic
- `monthAvgVolume` field rename to `weekAvgVolume` (or keep field name, update semantics)

## Implementation Plan
1. Update `main.mo` to a clean minimal stub (keep `transform`, stub `scanMarkets` returning [])
2. Update `App.tsx`:
   a. Remove actor scan dependency; implement `handleScan` using fetch to CoinGecko
   b. Step 1: GET `/coins/markets?vs_currency=usd&order=volume_desc&per_page=20&page=1` → get 20 coins with current price, 24h volume, symbol, name
   c. Step 2: For each coin, GET `/coins/{id}/market_chart?vs_currency=usd&days=7&interval=daily` → extract `total_volumes`, compute mean
   d. Apply Rubicon condition; build CryptoSignal objects
   e. Remove Squeeze references; update Status badge to show "RUBICON" (green) or "--" (gray)
   f. Keep layout, colors, and overall design intact
