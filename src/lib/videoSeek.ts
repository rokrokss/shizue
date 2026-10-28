import { videoTimeUrl, youtubeVideoId } from '@/lib/videoTranscript';

// Side panel: plays a YouTube video from `seconds`, in a tab that shows it (this window's first)
// or else in a new tab.
export const seekVideo = async (videoId: string, seconds: number) => {
  const tabs = await chrome.tabs.query({
    url: ['https://www.youtube.com/watch*', 'https://youtube.com/watch*'],
  });
  const current = await chrome.windows.getCurrent().catch(() => null);
  const tab = tabs
    .filter((t) => youtubeVideoId(t.url) === videoId)
    .sort((a, b) => Number(b.windowId === current?.id) - Number(a.windowId === current?.id))[0];
  if (tab?.id === undefined) {
    await chrome.tabs.create({ url: videoTimeUrl(videoId, seconds) });
    return;
  }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
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
