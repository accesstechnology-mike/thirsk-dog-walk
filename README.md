# Thirsk Dog Walk

Aggregator for **1-hour** private dog-field availability within about 30 minutes of **YO7 4SQ**, from now + 30 minutes through end of tomorrow.

## What it does

- Pulls live slots from Acuity / Squarespace Scheduling parks (Hopewell, Yolk Farm, South Acres Thirsk, Corners K9, Happy Paws)
- Pulls Cundall via GoDaddy Online Appointments (`api.ola.godaddy.com`) — Woodland + Adventure 1hr services
- Pulls Dogzone Ripon via Amelia’s public booking ajax API
- Pulls Brackenfarg via Wix Bookings public endpoints (55-minute private hire counts as the 1hr product)
- Filters by real OSRM drive time from YO7 4SQ
- Deep-links to each venue’s own booking page

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Availability API: `GET /api/availability`.

## Notes

- No venue API keys required — adapters use the same public endpoints the booking widgets call.
- Results are cached in-memory for ~90 seconds.
- Brackenfarg’s standard private hire is 55 minutes; that is intentionally included.
