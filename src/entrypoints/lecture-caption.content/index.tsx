import '@/assets/global.css';
import '@/assets/tailwind.css';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import { mountTrackCaptionToggle } from '@/lib/trackCaptions/mountToggle';
import { getDomCaptions } from '@/lib/trackCaptions/domCaptions';
import { isDomCaptionSite, lectureSiteFor } from '@/lib/trackCaptions/sites';
import { getTrackCaptions } from '@/lib/trackCaptions/trackCaptions';
import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css?inline';

// Translated captions on lecture sites: Coursera, Udemy, TED, and Vimeo, on vimeo.com and in its
// player embedded on any page (lib/trackCaptions).
export default defineContentScript({
  matches: [
    'https://www.coursera.org/*',
    'https://www.udemy.com/*',
    'https://*.udemy.com/*',
    'https://www.ted.com/*',
    'https://vimeo.com/*',
    'https://player.vimeo.com/*',
  ],
  allFrames: true,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const site = lectureSiteFor(location.hostname);
    if (!site) return;
    ctx.onInvalidated(registerContentScriptConnection('lecture-caption'));
    // Vimeo's like, later and share buttons are down the player's top right.
    const corner = location.hostname.endsWith('vimeo.com') ? { top: '10px', right: '60px' } : undefined;
    // Udemy draws its subtitles itself; the others have text tracks.
    const controller = isDomCaptionSite(site) ? getDomCaptions(site) : getTrackCaptions(site);
    mountTrackCaptionToggle(ctx, site, controller, { label: 'Lecture', corner });
  },
});
