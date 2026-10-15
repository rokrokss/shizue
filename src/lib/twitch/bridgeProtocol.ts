// The Twitch player object lives in the page's own JavaScript (React props), which an isolated
// content script cannot see, so a small MAIN-world script relays it. Messages cross worlds as
// JSON strings in CustomEvent.detail; objects would not.
export const BRIDGE_TO_CONTENT_EVENT = 'shizue:twitch-player';
export const CONTENT_TO_BRIDGE_EVENT = 'shizue:twitch-request';

export type BridgeMessage =
  | { type: 'pong' }
  // A CEA-608 caption window from PlayerTextCue: the whole roll-up text, lines joined by \r\n.
  | { type: 'cue'; text: string; position: number }
  | { type: 'state'; state: string; paused: boolean }
  | { type: 'seeked' }
  // The page's player object was replaced or found for the first time.
  | { type: 'player' }
  // The broadcast language of the channel (or of a VOD's channel), e.g. "EN"; null if unknown.
  | { type: 'language'; path: string; login: string | null; code: string | null };

export type BridgeRequest = { type: 'ping' } | { type: 'language' };

export const parseBridgeMessage = (detail: unknown): BridgeMessage | null => {
  if (typeof detail !== 'string') return null;
  try {
    const message = JSON.parse(detail);
    return message && typeof message.type === 'string' ? (message as BridgeMessage) : null;
  } catch {
    return null;
  }
};
