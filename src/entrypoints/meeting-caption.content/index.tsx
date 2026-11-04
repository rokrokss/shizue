import '@/assets/global.css';
import '@/assets/tailwind.css';
import MeetingCaptionToggle from '@/components/Caption/MeetingCaptionToggle';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import { getMeetingCaptions } from '@/lib/meetingCaptions/meetingCaptions';
import { meetingSiteFor } from '@/lib/meetingCaptions/sites';
import { createCaptionButton } from '@/lib/trackCaptions/mountToggle';
import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css?inline';

// Translated captions for meetings on the web: Google Meet, Microsoft Teams, and Zoom's web client
// (whose meeting runs in a frame of its own). The button shows while the meeting's captions are on.
export default defineContentScript({
  matches: [
    'https://meet.google.com/*',
    'https://teams.microsoft.com/*',
    'https://teams.live.com/*',
    'https://teams.cloud.microsoft/*',
    'https://*.zoom.us/*',
  ],
  allFrames: true,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const site = meetingSiteFor(location.hostname, location.pathname);
    if (!site) return;
    ctx.onInvalidated(registerContentScriptConnection('meeting-caption'));
    const controller = getMeetingCaptions(site);
    ctx.onInvalidated(() => controller.dispose());

    // Low on the left, above the meeting's own controls.
    const button = createCaptionButton(ctx, {
      name: `${site.name}-meeting`,
      label: 'Meeting',
      style: { position: 'fixed', left: '16px', bottom: '96px', zIndex: '2147483646', display: 'none' },
      content: () => <MeetingCaptionToggle controller={controller} />,
    });
    document.body.append(button.element);
    const unsubscribe = controller.subscribe(({ captionsOn, active }) => {
      const shown = captionsOn || active;
      button.element.style.display = shown ? 'inline-flex' : 'none';
      if (shown) void button.mount();
    });
    ctx.onInvalidated(unsubscribe);
  },
});
