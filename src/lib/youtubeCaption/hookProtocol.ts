// youtube-player-hook.content runs in the page's world, where YouTube's player fetches its media;
// the caption content script talks to it with CustomEvents whose detail is a JSON string (objects
// would not cross worlds), as with the Twitch bridge.
export const HOOK_TO_CONTENT_EVENT = 'shizue:youtube-hook';
export const CONTENT_TO_HOOK_EVENT = 'shizue:youtube-hook-request';

// Caption lines read from the player's responses: [start s, end s, text] in media time.
export type HookMessage = { type: 'captions'; cues: [number, number, string][] };

// Reading costs a copy of every media response, so it runs only while live captions want it.
export type HookRequest = { type: 'captions'; on: boolean };

export const parseHookDetail = <T extends { type: string }>(detail: unknown): T | null => {
  if (typeof detail !== 'string') return null;
  try {
    const message = JSON.parse(detail);
    return message && typeof message.type === 'string' ? (message as T) : null;
  } catch {
    return null;
  }
};
