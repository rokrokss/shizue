import '@/assets/global.css';
import '@/assets/tailwind.css';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import { getDomCaptions } from '@/lib/trackCaptions/domCaptions';
import { mountTrackCaptionToggle } from '@/lib/trackCaptions/mountToggle';
import { streamingSiteFor } from '@/lib/trackCaptions/sites';
import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css?inline';

// Translated subtitles on Disney+, Prime Video and HBO Max, read off the player as they show
// (lib/trackCaptions/domCaptions.tsx).
export default defineContentScript({
  matches: [
    'https://*.disneyplus.com/*',
    'https://*.primevideo.com/*',
    'https://www.amazon.com/gp/video/*',
    'https://www.amazon.co.uk/gp/video/*',
    'https://www.amazon.de/gp/video/*',
    'https://www.amazon.co.jp/gp/video/*',
    'https://play.hbomax.com/*',
    'https://play.max.com/*',
  ],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const site = streamingSiteFor(location.hostname, location.pathname);
    if (!site) return;
    ctx.onInvalidated(registerContentScriptConnection('streaming-caption'));
    mountTrackCaptionToggle(ctx, site, getDomCaptions(site), { label: 'Streaming' });
  },
});
