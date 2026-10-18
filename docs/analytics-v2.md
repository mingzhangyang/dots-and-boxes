# Analytics V2

The standalone game asynchronously loads the central `https://games.orangely.xyz/analytics.js` script **only** on `https://dots-and-boxes.orangely.xyz`. Its registered ID is `dots`. No direct legacy beacons remain, preventing double counting. The shared script owns anonymous opens, visible/focused activity time, gameplay time, retries and IDs; the board emits play for the first accepted move and finish for a completed match.

The gameplay-time predicate checks for a non-empty, unfinished match; online rooms must additionally be ready (not waiting, connecting or disconnected). Localhost and preview do not load or send production analytics. Failures are nonblocking; no cookies or additional D1 migrations.

Run `npm run lint && npm run test:analytics && npm run build`. Local tests use a fake browser and never send production requests. The separate `games-analytics` Worker requires manual deployment of the existing registry changes, then verification of `GET /stats?v=2` on the live site.
