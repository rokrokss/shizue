import {
  BRIDGE_TO_CONTENT_EVENT,
  BridgeMessage,
  CONTENT_TO_BRIDGE_EVENT,
} from '@/lib/twitch/bridgeProtocol';

// Twitch's player (Amazon IVS) reports CEA-608 captions through PlayerTextCue even when the
// viewer has captions turned off. The player object is only reachable through React's props, so
// this runs in the page's world and forwards what the caption content script needs.

type TwitchPlayer = {
  addEventListener: (type: string, listener: (event: any) => void) => void;
  removeEventListener: (type: string, listener: (event: any) => void) => void;
  getPosition: () => number;
  getState: () => string;
  isPaused: () => boolean;
};

export default defineContentScript({
  matches: ['https://www.twitch.tv/*', 'https://twitch.tv/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    const marker = '__shizueTwitchBridge';
    if ((window as any)[marker]) return;
    (window as any)[marker] = true;

    const post = (message: BridgeMessage) => {
      window.dispatchEvent(
        new CustomEvent(BRIDGE_TO_CONTENT_EVENT, { detail: JSON.stringify(message) })
      );
    };

    const findPlayer = (): TwitchPlayer | null => {
      const element = document.querySelector('[data-a-target="player-overlay-click-handler"]');
      if (!element) return null;
      const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
      let fiber = key ? (element as any)[key] : null;
      for (let depth = 0; fiber && depth < 50; depth++, fiber = fiber.return) {
        const player = fiber.memoizedProps?.mediaPlayerInstance;
        if (player?.addEventListener) return player;
      }
      return null;
    };

    let player: TwitchPlayer | null = null;
    const listeners: Record<string, (event: any) => void> = {
      PlayerTextCue: (event) => {
        if (!player || typeof event?.text !== 'string') return;
        post({ type: 'cue', text: event.text, position: player.getPosition() });
      },
      PlayerStateChanged: () => {
        if (player) post({ type: 'state', state: player.getState(), paused: player.isPaused() });
      },
      PlayerSeekCompleted: () => post({ type: 'seeked' }),
    };

    const attach = () => {
      const found = findPlayer();
      if (found === player) return;
      if (player) {
        for (const [type, listener] of Object.entries(listeners)) {
          player.removeEventListener(type, listener);
        }
      }
      player = found;
      if (!player) return;
      for (const [type, listener] of Object.entries(listeners)) {
        player.addEventListener(type, listener);
      }
      post({ type: 'player' });
    };

    // Twitch keeps one player across channel changes but can remount it (theatre mode,
    // pop-out, navigation to a VOD), so keep checking.
    attach();
    setInterval(attach, 1000);

    // The language a channel broadcasts in, from the same GQL API (and public client ID) the
    // Twitch page itself uses. Tags are unreliable: in testing the first tag was the language on
    // only 5 of 12 channels.
    const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
    const lookUpLanguage = async () => {
      const path = location.pathname;
      const videoId = path.match(/^\/videos\/(\d+)/)?.[1];
      const login = videoId ? null : path.split('/')[1] || null;
      const query = videoId
        ? 'query($id:ID!){video(id:$id){owner{login broadcastSettings{language}}}}'
        : 'query($login:String!){user(login:$login){login broadcastSettings{language}}}';
      try {
        const response = await fetch('https://gql.twitch.tv/gql', {
          method: 'POST',
          headers: { 'Client-ID': TWITCH_WEB_CLIENT_ID },
          body: JSON.stringify({ query, variables: videoId ? { id: videoId } : { login } }),
        });
        const data = (await response.json())?.data;
        const user = videoId ? data?.video?.owner : data?.user;
        post({
          type: 'language',
          path,
          login: user?.login ?? login,
          code: user?.broadcastSettings?.language ?? null,
        });
      } catch {
        post({ type: 'language', path, login, code: null });
      }
    };

    window.addEventListener(CONTENT_TO_BRIDGE_EVENT, (event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail !== 'string') return;
      let type: unknown;
      try {
        type = JSON.parse(detail)?.type;
      } catch {
        return;
      }
      if (type === 'ping') post({ type: 'pong' });
      else if (type === 'language') void lookUpLanguage();
    });
  },
});
