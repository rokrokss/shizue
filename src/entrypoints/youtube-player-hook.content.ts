import {
  CONTENT_TO_HOOK_EVENT,
  HOOK_TO_CONTENT_EVENT,
  HookMessage,
  HookRequest,
  parseHookDetail,
} from '@/lib/youtubeCaption/hookProtocol';
import { createUmpCaptionReader } from '@/lib/youtubeCaption/sabr';

// A YouTube live stream's captions reach the player 12–21 s before they show, inside the SABR
// responses it fetches. This wraps `fetch` before YouTube's scripts run and, only while live captions
// ask for it, reads a copy of those responses for the caption segments, so translation can start
// before the captions are on screen. It reads only what the player itself downloaded. If anything
// here fails, the player runs untouched and captions come from the screen alone. Asked, it also
// hands over the player's data for the video (lib/youtube.ts getPlayerData).

export default defineContentScript({
  matches: ['https://youtube.com/*', 'https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const marker = '__shizueYoutubeHook';
    if ((window as any)[marker]) return;
    (window as any)[marker] = true;

    let reading = false;
    window.addEventListener(CONTENT_TO_HOOK_EVENT, (event) => {
      const request = parseHookDetail<HookRequest>((event as CustomEvent).detail);
      if (request?.type === 'captions') reading = request.on;
      if (request?.type === 'audioTrack') post({ type: 'audioTrack', id: playingAudioTrack() });
      if (request?.type === 'playerResponse') post({ type: 'playerResponse', response: playerResponse() });
    });

    const post = (message: HookMessage) => {
      window.dispatchEvent(new CustomEvent(HOOK_TO_CONTENT_EVENT, { detail: JSON.stringify(message) }));
    };

    // The player's track object keeps its fields under minified names; the one naming the track
    // ('ko.4': its language, then 4 for the original, 3 or 10 for a dub) is found by its shape.
    const playingAudioTrack = () => {
      try {
        const track = (document.getElementById('movie_player') as any)?.getAudioTrack?.();
        const named = Object.values(track ?? {}).find(
          (value: any) => typeof value?.id === 'string' && /^[\w-]+\.\d+$/.test(value.id)
        ) as { id: string } | undefined;
        return named?.id ?? null;
      } catch {
        return null;
      }
    };

    // The video's data, which the caption toggle would otherwise fetch the watch page again for.
    const playerResponse = () => {
      try {
        return (document.getElementById('movie_player') as any)?.getPlayerResponse?.() ?? null;
      } catch {
        return null;
      }
    };

    const readCaptions = async (response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) return;
      const ump = createUmpCaptionReader((cues) =>
        post({ type: 'captions', cues: cues.map((cue) => [cue.start, cue.end, cue.text]) })
      );
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        ump.push(value);
      }
    };

    const realFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      const promise = realFetch.apply(window, args);
      if (!reading) return promise;
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/videoplayback') && url.includes('sabr')) {
          // Registered before the player's own handlers, so the copy is made before it reads the body.
          // The player aborts some requests; their copies just end.
          void promise.then((response) => readCaptions(response.clone())).catch(() => {});
        }
      } catch {
        // Never stand in the player's way.
      }
      return promise;
    } as typeof fetch;
  },
});
