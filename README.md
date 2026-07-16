# Thirsk Dog Walk

Aggregator for **~1-hour** private dog-field availability within about 30 minutes of **YO7 4SQ**.

Set when you're leaving home; we only show slots that start after `leaveAt + drive time` (optional: include tomorrow).

## What it does

- Pulls live slots from Acuity / Squarespace Scheduling parks (Hopewell, Yolk Farm, South Acres Thirsk, Corners K9, Happy Paws)
- Pulls Cundall via GoDaddy Online Appointments (`api.ola.godaddy.com`) — Woodland + Adventure 1hr services
- Pulls Dogzone Ripon via Amelia’s public booking ajax API
- Pulls Brackenfarg via Wix Bookings public endpoints (55-minute private hire counts as the 1hr product)
- Filters by real OSRM drive time from YO7 4SQ (buffer to 35 min for OSRM variance)
- Deep-links into each venue’s booking flow with time preselected where the provider allows

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Availability API: `GET /api/availability?leaveAt=<ISO>&includeTomorrow=0|1`

## Verify

With the app running locally:

```bash
npm run build && npm run start
npm run verify
```

This checks API filtering, Acuity deep-link URL shape, a live Acuity booking page (time locked), and UI contrast/layout (form stays inside the dark hero).

## Notes

- No venue API keys required — adapters use the same public endpoints the booking widgets call.
- Results are cached in-memory for ~90 seconds.
- Brackenfarg’s standard private hire is 55 minutes; that is intentionally included.
- South Acres Thirsk 50-minute sessions are included (near-hour).
