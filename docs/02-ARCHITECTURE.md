# Architecture

42 HIGHLIGHTS is a Next.js web application designed for the 1920 x 1080 MagicInfo TV display in the 42 Warsaw Social Space. The app loops through three scenes automatically every 60 seconds (Completed: 24 s, Connect: 18 s, Campus: 18 s).

## Tech stack

- **Next.js (App Router) & React:** Single codebase handling data aggregation, backend API routes, and front-end scene rendering.
- **TypeScript:** Strict type checking across API responses and UI components.
- **Docker:** Standardised Node.js 22 production environment for deployment on the local campus server.

No external database or background worker service is needed; everything runs within the Next.js process using local memory and JSON file caching.

## Data flow

Data flows through four clear stages:

1. **Background Sync:** The Next.js server periodically fetches data from 10 endpoints on the 42 API using `client_credentials`. Calls are throttled (550 ms delay) to respect rate limits.
2. **Aggregation & Normalisation:** Raw responses are parsed, joined by student ID, filtered for active Common Core students on campus 67, and cleaned of incomplete records.
3. **Caching (`snapshot.json`):** Processed data is assembled into a single lightweight JSON payload, kept in memory and saved to disk at `.cache/snapshot.json`.
4. **Client Rendering:** The TV display opens `http://localhost:4242` and polls `/api/snapshot` every ~200 seconds. The front end renders scenes from pre-computed snapshot data.

## Resilience and caching

- **Persistence:** On server restart, the app immediately loads `.cache/snapshot.json` to render the display instantly without waiting for an initial sync.
- **Partial updates:** If an API endpoint fails, valid data sections are preserved and displayed with a `PARTIAL` or `STALE` indicator.
- **Missing data handling:** Workstation pins or evaluation requests with missing dependencies are hidden rather than filled with fake demo data.

## Deployment

1. Clone repository on campus host machine and create `.env` from `.env.example` with API credentials.
2. Run `docker compose up --build -d`.
3. Verify status at `http://HOST_IP:4242/api/health`.
4. Point MagicInfo browser to `http://HOST_IP:4242` set to 1920 x 1080 resolution.

The container runs as a non-root user on port `4242` with volume persistence for `.cache`.
