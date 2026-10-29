import { netflixVideoId, videoTimeUrl, youtubeVideoId } from '@/lib/videoTranscript';

// The tab that shows a video, this window's first.
const findVideoTab = async (patterns: string[], matches: (url: string | undefined) => boolean) => {
  const tabs = await chrome.tabs.query({ url: patterns });
  const current = await chrome.windows.getCurrent().catch(() => null);
  return tabs
    .filter((t) => matches(t.url))
    .sort((a, b) => Number(b.windowId === current?.id) - Number(a.windowId === current?.id))[0];
};

const showTab = async (tab: chrome.tabs.Tab) => {
  await chrome.tabs.update(tab.id!, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
};

const seekYoutube = async (videoId: string, seconds: number) => {
  const tab = await findVideoTab(
    ['https://www.youtube.com/watch*', 'https://youtube.com/watch*'],
    (url) => youtubeVideoId(url) === videoId
  );
  if (tab?.id === undefined) {
    await chrome.tabs.create({ url: videoTimeUrl(videoId, seconds) });
    return;
  }
  await showTab(tab);
  // The player's own seekTo is in the page's world. It also handles an ad that is playing, where
  // the <video> element is the ad's.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: (time: number) => {
      const player = document.getElementById('movie_player') as any;
      if (typeof player?.seekTo === 'function') {
        player.seekTo(time, true);
        player.playVideo?.();
        return;
      }
      const video = document.querySelector('video');
      if (!video) return;
      video.currentTime = time;
      void video.play();
    },
    args: [seconds],
  });
};

const netflixTimeUrl = (movieId: string, seconds: number) =>
  `https://www.netflix.com/watch/${movieId}?t=${Math.floor(seconds)}`;

const seekNetflix = async (movieId: string, seconds: number) => {
  const tab = await findVideoTab(
    ['https://www.netflix.com/watch/*'],
    (url) => netflixVideoId(url) === movieId
  );
  if (tab?.id === undefined) {
    await chrome.tabs.create({ url: netflixTimeUrl(movieId, seconds) });
    return;
  }
  await showTab(tab);
  // Seeking through <video>.currentTime stops Netflix with error M7375, so this goes through the
  // player API in the page's world, finding the watch session as netflix-player-bridge.content does.
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: (id: number, ms: number) => {
      const videoPlayer = (window as any).netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
      const sessions: string[] = (videoPlayer?.getAllPlayerSessionIds?.() ?? []).filter((session: string) =>
        session.startsWith('watch')
      );
      for (const session of sessions) {
        const player = videoPlayer.getVideoPlayerBySessionId?.(session);
        if (player?.getMovieId?.() !== id || typeof player.seek !== 'function') continue;
        player.seek(ms);
        player.play?.();
        return true;
      }
      return false;
    },
    args: [Number(movieId), Math.floor(seconds * 1000)],
  });
  // No player to seek yet (the page is still loading): open the title at that time instead.
  if (result?.result !== true) await chrome.tabs.update(tab.id, { url: netflixTimeUrl(movieId, seconds) });
};

// Side panel: plays a video (a videoKey from lib/videoTranscript.ts) from `seconds`, in a tab that
// shows it or else in a new tab.
export const seekVideo = async (video: string, seconds: number) => {
  const [platform, id] = video.split(':');
  if (platform === 'youtube') await seekYoutube(id, seconds);
  else if (platform === 'netflix') await seekNetflix(id, seconds);
};
