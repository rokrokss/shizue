import '@/assets/global.css';
import '@/assets/tailwind.css';
import { mountTrackCaptionToggle } from '@/lib/trackCaptions/mountToggle';
import { anyTrackSite } from '@/lib/trackCaptions/sites';
import { getTrackCaptions } from '@/lib/trackCaptions/trackCaptions';
import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css?inline';

// Translated captions on any other page whose <video> has a caption <track> (WebVTT), as video.js,
// Plyr, JW Player and plain HTML players add. Not listed in the manifest: track-detector.content
// asks the background to inject it into a frame once that frame has such a video, so pages
// without one never load it.
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const marker = '__shizueTrackCaptions';
    if ((window as any)[marker]) return;
    (window as any)[marker] = true;
    ctx.onInvalidated(() => delete (window as any)[marker]);
    mountTrackCaptionToggle(ctx, anyTrackSite, getTrackCaptions(anyTrackSite), { label: 'Video' });
  },
});
