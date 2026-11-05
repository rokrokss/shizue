import { MESSAGE_INJECT_TRACK_CAPTIONS } from '@/config/constants';

// Looks for a <video> with a caption <track> on pages no caption script of their own covers, and
// once a frame has one, asks for track-caption.content there. It holds no UI, so it costs every
// page little: a look at the frame's videos every few seconds until one has captions.

const LOOK_EVERY_MS = 3000;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  // These sites have their own caption scripts (lecture-, streaming-, meeting-, netflix-, twitch-,
  // x-caption and youtube-caption-toggle).
  excludeMatches: [
    'https://youtube.com/*',
    'https://*.youtube.com/*',
    'https://www.youtube-nocookie.com/*',
    'https://www.netflix.com/*',
    'https://twitch.tv/*',
    'https://*.twitch.tv/*',
    'https://x.com/*',
    'https://twitter.com/*',
    'https://www.coursera.org/*',
    'https://www.udemy.com/*',
    'https://*.udemy.com/*',
    'https://www.ted.com/*',
    'https://vimeo.com/*',
    'https://player.vimeo.com/*',
    'https://*.disneyplus.com/*',
    'https://*.primevideo.com/*',
    'https://www.amazon.com/gp/video/*',
    'https://www.amazon.co.uk/gp/video/*',
    'https://www.amazon.de/gp/video/*',
    'https://www.amazon.co.jp/gp/video/*',
    'https://play.hbomax.com/*',
    'https://play.max.com/*',
    'https://meet.google.com/*',
    'https://teams.microsoft.com/*',
    'https://teams.live.com/*',
    'https://teams.cloud.microsoft/*',
    'https://*.zoom.us/*',
  ],
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    const videos = document.getElementsByTagName('video');
    const watched = new WeakSet<HTMLVideoElement>();
    let asked = false;

    const hasCaptions = (video: HTMLVideoElement) =>
      Array.from(video.textTracks).some((track) => track.kind === 'subtitles' || track.kind === 'captions');

    const look = () => {
      if (asked) return;
      for (const video of Array.from(videos)) {
        if (!watched.has(video)) {
          watched.add(video);
          // A player may add its tracks after the video.
          video.textTracks.addEventListener('addtrack', look);
        }
        if (!hasCaptions(video)) continue;
        asked = true;
        clearInterval(timer);
        chrome.runtime.sendMessage({ action: MESSAGE_INJECT_TRACK_CAPTIONS }).catch(() => {});
        return;
      }
    };

    const timer = setInterval(look, LOOK_EVERY_MS);
    ctx.onInvalidated(() => clearInterval(timer));
    look();
  },
});
