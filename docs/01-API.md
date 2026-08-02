# API

42 HIGHLIGHTS fetches data from the official 42 API using `client_credentials` (Warsaw campus `67`, Common Core cursus `21`). The server manages all data collection and processing without requiring student logins.

## 42 endpoints

| Endpoint | What we take from it |
|---|---|
| `POST /oauth/token` | Access token and expiry time. |
| `GET /v2/campus/67` | Campus name and time zone. |
| `GET /v2/cursus_users` | Active student list, IDs, logins, levels, and start dates. |
| `GET /v2/users` | Display names and profile pictures. |
| `GET /v2/projects_users` | Project attempts, passes, exams, current projects, and team search. |
| `GET /v2/scale_teams` | Booked and completed peer evaluations. |
| `GET /v2/cursus/21/projects` | Project names, XP, and solo vs team classification. |
| `GET /v2/campus/67/locations` | Active workstation sessions and logged-in users. |
| `GET /v2/coalitions_users` | Student coalition membership and yearly score. |
| `GET /v2/blocs` | Coalition names, colours, and official scores. |

Requests are filtered by campus, course, date, user, or project state as needed.

## Data handling & edge cases

- **Unidentified students:** Anonymised or unlisted attempts count towards aggregate totals (e.g. weekly validations count), but never generate named cards or workstation pins.
- **Multiple project attempts:** We select the active Common Core session for Warsaw. If project ID matching fails, slug matching serves as a fallback.
- **Parent projects:** `parent` records (not real project attempts) are ignored. Team search takes the latest status per student and project.
- **Incomplete feeds:** Workstation pins and evaluator requests render only when their underlying API feeds succeed.

## Refresh rate & limits

- **Sync Schedule:** Full sync runs every 10 minutes; workstation and coalition data refresh every 2 minutes. The TV display polls `/api/snapshot` every ~200 seconds.
- **Throttling:** We maintain a 550 ms delay between API calls to stay within the 42 API limit (2 req/s, 1,200 req/h). A single full update uses at most 220 calls.

## Error handling

- `401`: Token refresh with a single retry before failing closed.
- `429`: Pause execution according to rate-limit delay headers.
- `5xx` / Network failure: Exponential backoff up to a max retry count.
- **Partial Sync:** If a feed fails, previously cached snapshot data is served with a `PARTIAL` or `STALE` indicator.
- **Cold Start:** If starting without cache or API connectivity, displays `No snapshot yet` rather than mock data.

## Internal API endpoints

- `GET /api/snapshot`: Pre-processed JSON payload for the front-end dashboard.
- `POST /api/refresh`: Triggers manual sync (optional authorization token).
- `GET /api/health`: Health status, cache state, and error counters.

Official references: [Getting started](https://api.intra.42.fr/apidoc/guides/getting_started) and [API specification](https://api.intra.42.fr/apidoc/guides/specification).
