// Play counters for the games.orangely.xyz stats module.
// Same protocol as games/public/analytics.js (window.hubTrack): POST
// {game, event} to the shared games-analytics Worker as text/plain via
// sendBeacon (no CORS preflight). Aggregate counts only, no personal data;
// failures are silent. The id must be in the Worker's GAMES whitelist,
// which is generated from games.config.json -> site.home.externalGames.

const ENDPOINT = 'https://games-analytics.orangely.workers.dev/event';
const GAME_ID = 'dots';

export type TrackEvent = 'play' | 'finish';

// Local dev / `wrangler dev` must not pollute production counters.
function isLocalHost(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]';
}

export function track(event: TrackEvent): void {
  if (typeof window === 'undefined' || isLocalHost()) return;
  try {
    const payload = JSON.stringify({ game: GAME_ID, event });
    if (navigator.sendBeacon?.(ENDPOINT, payload)) return;
    fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true }).catch(() => {});
  } catch {
    // stats must never break the game
  }
}
