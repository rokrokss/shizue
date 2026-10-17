// Netflix's player API lives in the page's own JavaScript (`window.netflix`), which an isolated
// content script cannot see, so a small MAIN-world script relays it. Messages cross worlds as JSON
// strings in CustomEvent.detail, as on Twitch.
export const BRIDGE_TO_CONTENT_EVENT = 'shizue:netflix-player';
export const CONTENT_TO_BRIDGE_EVENT = 'shizue:netflix-request';

// A subtitle track as the player lists it (forced-narrative, image and "Off" tracks left out).
export type NetflixTrack = {
  trackId: string;
  // BCP 47, e.g. "en", "ko", "zh-Hant", "pt-BR".
  language: string;
  label: string;
  closedCaptions: boolean;
};

export type BridgeMessage =
  | { type: 'pong' }
  // Sent every 500 ms while a watch session exists.
  | {
      type: 'state';
      movieId: number | null;
      title: string | null;
      audioLanguage: string | null;
      tracks: NetflixTrack[];
    }
  // The answer to a load request: the track's subtitle file (IMSC/TTML), or null when the player
  // gave no link in time.
  | { type: 'track'; requestId: number; trackId: string; url: string | null };

export type BridgeRequest = { type: 'ping' } | { type: 'load'; requestId: number; trackId: string };

export const parseBridgeMessage = (detail: unknown): BridgeMessage | null => {
  if (typeof detail !== 'string') return null;
  try {
    const message = JSON.parse(detail);
    return message && typeof message.type === 'string' ? (message as BridgeMessage) : null;
  } catch {
    return null;
  }
};
