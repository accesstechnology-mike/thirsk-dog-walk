<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Next.js 16 (Turbopack) + React 19 single app. Standard commands live in `package.json`/`README.md`: `npm run dev` (port 3000), `npm run lint`, `npm run build`. Typecheck with `npx tsc --noEmit`. The startup update script already runs `npm install`.

Non-obvious notes:
- No API keys or env vars are required — provider adapters (`src/lib/providers/*`) hit the same public endpoints the booking widgets use.
- `GET /api/availability` makes live outbound HTTP calls to external providers (Acuity/Squarespace, GoDaddy OLA, Amelia, Wix) plus OSRM for drive times. This works from the Cloud VM (outbound network is available); if a provider fails it is reported per-venue under "Park notes" rather than failing the whole page.
- Availability responses are cached in-memory for ~90s (`src/lib/cache.ts`), so clicking "Refresh availability" within that window returns identical cached data — this is expected, not a bug.
- `scripts/probe-*.mjs` are ad-hoc diagnostics that use Playwright; browsers are not installed by `npm install`. Run `npx playwright install chromium` first if you need them (not required to run the app).
