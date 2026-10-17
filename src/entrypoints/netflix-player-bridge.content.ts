import {
  BRIDGE_TO_CONTENT_EVENT,
  BridgeMessage,
  CONTENT_TO_BRIDGE_EVENT,
  NetflixTrack,
} from '@/lib/netflix/bridgeProtocol';

// Netflix's player API (`netflix.appContext.state.playerApp`) is only reachable from the page's own
// world, so this relays the watch session's movie, audio language and subtitle tracks to
// the caption content script, and fetches a track's file link on request. It changes nothing in
// Netflix's requests. Shapes as used by asbplayer, Language Reactor and other tools in 2026-10.

type PlayerTrack = {
  trackId: string;
  bcp47?: string;
  displayName?: string;
  rawTrackType?: string;
  isNoneTrack?: boolean;
  isForcedNarrative?: boolean;
  isImageBased?: boolean;
};

type NetflixPlayer = {
  getMovieId: () => number;
  getAudioTrack: () => { bcp47?: string } | null;
  getTimedTextTrackList: () => PlayerTrack[] | null;
  getTimedTextTrack: () => PlayerTrack | null;
  setTimedTextTrack: (track: PlayerTrack) => unknown;
};

// How long the player may take to fetch a track's links after switching to it.
const LOAD_TIMEOUT_MS = 10_000;
// The search for links stops this deep, or after this many objects, so it can't stall the page.
const WALK_MAX_DEPTH = 20;
const WALK_MAX_NODES = 200_000;

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    const marker = '__shizueNetflixBridge';
    if ((window as any)[marker]) return;
    (window as any)[marker] = true;

    const post = (message: BridgeMessage) => {
      window.dispatchEvent(
        new CustomEvent(BRIDGE_TO_CONTENT_EVENT, { detail: JSON.stringify(message) })
      );
    };

    const playerApp = () => (window as any).netflix?.appContext?.state?.playerApp;

    // The session playing this /watch/ page. Previews on the browse page (billboard, video-merch,
    // preview-modal) have their own sessions; the watch page's start with "watch".
    const findSession = (): { id: string; player: NetflixPlayer } | null => {
      const videoPlayer = playerApp()?.getAPI?.()?.videoPlayer;
      const ids: string[] = (videoPlayer?.getAllPlayerSessionIds?.() ?? []).filter((id: string) =>
        id.startsWith('watch')
      );
      const urlMovieId = Number(location.pathname.match(/^\/watch\/(\d+)/)?.[1]);
      let fallback: { id: string; player: NetflixPlayer } | null = null;
      for (const id of ids) {
        const player = videoPlayer.getVideoPlayerBySessionId?.(id) as NetflixPlayer | undefined;
        if (!player?.getTimedTextTrackList) continue;
        if (player.getMovieId?.() === urlMovieId) return { id, player };
        fallback = { id, player };
      }
      return fallback;
    };

    const titleCache = new Map<number, string | null>();
    const titleOf = (movieId: number): string | null => {
      if (titleCache.has(movieId)) return titleCache.get(movieId)!;
      let title: string | null = null;
      try {
        const video = playerApp()?.getAPI?.()?.getVideoMetadataByVideoId?.(movieId)?.getCurrentVideo?.();
        title = video?.getTitle?.() ?? null;
        if (title && video.isEpisodic?.()) {
          const season = video.getSeason?.()?._season?.seq;
          const episode = video.getEpisodeNumber?.();
          const episodeTitle = video.getEpisodeTitle?.();
          title = `${title} S${season ?? '?'}E${episode ?? '?'}${episodeTitle ? ` ${episodeTitle}` : ''}`;
        }
      } catch {
        title = null;
      }
      // Metadata may arrive after the session; only cache a found title.
      if (title) titleCache.set(movieId, title);
      return title;
    };

    const usableTracks = (player: NetflixPlayer): PlayerTrack[] =>
      (player.getTimedTextTrackList?.() ?? []).filter(
        (track) => track?.trackId && track.bcp47 && !track.isNoneTrack && !track.isForcedNarrative && !track.isImageBased
      );

    const postState = () => {
      let session: ReturnType<typeof findSession> = null;
      try {
        session = findSession();
      } catch {
        session = null;
      }
      if (!session) return;
      const { player } = session;
      try {
        const movieId = player.getMovieId?.() ?? null;
        const tracks: NetflixTrack[] = usableTracks(player).map((track) => ({
          trackId: track.trackId,
          language: track.bcp47!,
          label: track.displayName || track.bcp47!,
          closedCaptions: track.rawTrackType?.toUpperCase() === 'CLOSEDCAPTIONS',
        }));
        post({
          type: 'state',
          movieId,
          title: movieId === null ? null : titleOf(movieId),
          audioLanguage: player.getAudioTrack?.()?.bcp47 ?? null,
          tracks,
        });
      } catch {
        // The player is being torn down (next episode, leaving the page).
      }
    };

    // Subtitle links the player holds, by track ID: objects of the form
    // { type: 'timedtext', trackId, urls: [{ url }] } somewhere under the session's player.
    const trackLinks = (sessionId: string): Map<string, string> => {
      const links = new Map<string, string>();
      const videoPlayerState = playerApp()?.getState?.()?.videoPlayer;
      const root = videoPlayerState?.cadmiumPlayerRepository?.playersById?.[sessionId] ?? videoPlayerState;
      if (!root || typeof root !== 'object') return links;
      const seen = new WeakSet<object>();
      const stack: [any, number][] = [[root, 0]];
      let visited = 0;
      while (stack.length && visited < WALK_MAX_NODES) {
        const [node, depth] = stack.pop()!;
        if (!node || typeof node !== 'object' || depth > WALK_MAX_DEPTH || seen.has(node)) continue;
        // DOM nodes lead into the whole page through React's fiber keys.
        if (node instanceof ArrayBuffer || ArrayBuffer.isView(node) || node instanceof Node || node === window) continue;
        seen.add(node);
        visited++;
        try {
          if (
            node.type === 'timedtext' &&
            typeof node.trackId === 'string' &&
            Array.isArray(node.urls) &&
            typeof node.urls[0]?.url === 'string' &&
            !links.has(node.trackId)
          ) {
            links.set(node.trackId, node.urls[0].url);
          }
          const children = Array.isArray(node) ? node : Object.keys(node).map((key) => node[key]);
          for (const child of children) {
            if (child && typeof child === 'object') stack.push([child, depth + 1]);
          }
        } catch {
          // Getters may throw.
        }
      }
      return links;
    };

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Netflix gives links for only some tracks. Switching the player to a track makes it fetch that
    // track's links; the previous track is put back right after. The content script hides
    // Netflix's own subtitles first, so the switch doesn't show.
    const loadTrack = async (trackId: string): Promise<string | null> => {
      const session = findSession();
      if (!session) return null;
      const known = trackLinks(session.id).get(trackId);
      if (known) return known;
      const { player } = session;
      const track = player.getTimedTextTrackList?.()?.find((candidate) => candidate.trackId === trackId);
      if (!track) return null;
      const previous = player.getTimedTextTrack?.() ?? null;
      let switched = false;
      try {
        await player.setTimedTextTrack(track);
        switched = true;
        for (let waited = 0; waited < LOAD_TIMEOUT_MS; waited += 250) {
          await delay(250);
          const url = trackLinks(session.id).get(trackId);
          if (url) return url;
        }
        return null;
      } finally {
        if (switched && previous && previous.trackId !== trackId) {
          try {
            await player.setTimedTextTrack(previous);
          } catch {
            // The session ended meanwhile.
          }
        }
      }
    };

    // One switch at a time, so restoring one track can't undo another load.
    let loading: Promise<unknown> = Promise.resolve();
    const handleLoad = (requestId: number, trackId: string) => {
      loading = loading
        .then(() => loadTrack(trackId))
        .catch(() => null)
        .then((url) => post({ type: 'track', requestId, trackId, url: typeof url === 'string' ? url : null }));
    };

    window.addEventListener(CONTENT_TO_BRIDGE_EVENT, (event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail !== 'string') return;
      let request: any;
      try {
        request = JSON.parse(detail);
      } catch {
        return;
      }
      if (request?.type === 'ping') post({ type: 'pong' });
      else if (request?.type === 'load' && typeof request.trackId === 'string') {
        handleLoad(Number(request.requestId), request.trackId);
      }
    });

    postState();
    setInterval(postState, 500);
  },
});
