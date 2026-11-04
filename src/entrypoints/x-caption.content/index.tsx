import '@/assets/global.css';
import '@/assets/tailwind.css';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import { mountTrackCaptionToggle } from '@/lib/trackCaptions/mountToggle';
import { xSite } from '@/lib/trackCaptions/sites';
import { getTrackCaptions } from '@/lib/trackCaptions/trackCaptions';
import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css?inline';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    ctx.onInvalidated(registerContentScriptConnection('x-caption'));
    mountTrackCaptionToggle(ctx, xSite, getTrackCaptions(xSite), { label: 'X' });
  },
});
