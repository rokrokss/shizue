import '@/assets/global.css';
import '@/assets/tailwind.css';
import YoutubeSubtitleToggle from '@/components/Youtube/YoutubeCaptionToggle';
import { isYoutubeEmbed, watchPlayerCaptionRequests } from '@/lib/youtube';
import { registerYoutubeTranscriptListener } from '@/lib/youtubeTranscript';
import { contentScriptLog, errorLog } from '@/logs';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { StyleProvider as AntdStyleProvider, createCache } from '@ant-design/cssinjs';
import '@ant-design/v5-patch-for-react-19';
import { ConfigProvider } from 'antd';
import 'antd/dist/reset.css?inline';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

export const YOUTUBE_TOGGLE_SHADOW_HOST_ID = 'shizue-youtube-caption-toggle-shadow-host';
const YOUTUBE_POPUP_HOST_TAG = 'shizue-youtube-caption-popups';

export default defineContentScript({
  // Frames too, for videos other sites embed.
  matches: ['https://youtube.com/*', 'https://www.youtube.com/*', 'https://www.youtube-nocookie.com/embed/*'],
  allFrames: true,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    // youtube.com's own frames (live chat and the like) have no player.
    if (window !== window.top && !isYoutubeEmbed()) return;
    ctx.onInvalidated(registerContentScriptConnection('youtube-caption-toggle'));
    ctx.onInvalidated(watchPlayerCaptionRequests());
    ctx.onInvalidated(registerYoutubeTranscriptListener());
    document.getElementById(YOUTUBE_TOGGLE_SHADOW_HOST_ID)?.remove();
    document.querySelectorAll(YOUTUBE_POPUP_HOST_TAG).forEach((host) => host.remove());
    let mounting = false;

    const mountUi = async () => {
      if (ctx.isInvalid || mounting) return;
      if (document.getElementById(YOUTUBE_TOGGLE_SHADOW_HOST_ID)) return;
      // Vertical embeds (Shorts and the like) are left as they are. An embed's video has a size
      // only once it loads.
      if (isYoutubeEmbed()) {
        const video = document.querySelector('video');
        if (!video?.videoWidth) return;
        if (video.videoHeight > video.videoWidth || window.innerHeight > window.innerWidth) return;
      }

      // An embed may have the newer controls, whose buttons sit at the top right.
      const anchor =
        document.querySelector('.ytp-right-controls') ?? document.querySelector('.player-controls-top-right');
      if (!anchor) return;
      mounting = true;

      contentScriptLog('Youtube');

      let root: Root | null = null;

      const customDiv = document.createElement('div');
      customDiv.id = YOUTUBE_TOGGLE_SHADOW_HOST_ID;
      // Inline styles: this div is in YouTube's DOM, which our shadow-root stylesheet doesn't reach.
      Object.assign(customDiv.style, {
        display: 'inline-block',
        width: 'fit-content',
        height: '100%',
        padding: '0',
        overflow: 'hidden',
        lineHeight: '0',
        verticalAlign: 'top',
      });
      anchor?.prepend(customDiv);

      try {
        const ui = await createShadowRootUi(ctx, {
          name: 'shizue-youtube-caption-toggle',
          position: 'inline',
          anchor: `#${YOUTUBE_TOGGLE_SHADOW_HOST_ID}`,
          append: 'first',
          mode: 'open',
          onMount: (container, shadow) => {
            root = createRoot(container);
            container.classList.add('sz:h-full');
            container.classList.add('sz:flex');
            container.classList.add('sz:flex-col');
            container.classList.add('sz:m-0');

            // Add :host styles to shadow DOM
            const hostStyle = document.createElement('style');
            hostStyle.textContent = `
              :host {
                display: inline-block !important;
                height: 100% !important;
                line-height: 0 !important;
                vertical-align: middle !important;
                /* An embed's newer controls hide with visibility, which the host's reset drops. */
                visibility: inherit !important;
              }
              :host > * {
                height: 100% !important;
              }
            `;
            shadow.appendChild(hostStyle);

            // Tooltips and dropdowns still open on <body>, but inside their own shadow root that
            // reuses the stylesheet WXT put in this one.
            document.querySelector(YOUTUBE_POPUP_HOST_TAG)?.remove();
            const popupHost = document.createElement(YOUTUBE_POPUP_HOST_TAG);
            const popupShadow = popupHost.attachShadow({ mode: 'open' });
            const popupContainer = document.createElement('div');
            popupShadow.append(shadow.querySelector('style')!.cloneNode(true), popupContainer);
            document.body.append(popupHost);
            ctx.onInvalidated(() => popupHost.remove());

            root.render(
              <StrictMode>
                <JotaiProvider>
                  <LanguageProvider loadingComponent={null}>
                    <AntdStyleProvider container={popupShadow} cache={createCache()}>
                      <AntdProvider>
                        <ConfigProvider getPopupContainer={() => popupContainer}>
                          <YoutubeSubtitleToggle />
                        </ConfigProvider>
                      </AntdProvider>
                    </AntdStyleProvider>
                  </LanguageProvider>
                </JotaiProvider>
              </StrictMode>
            );
            return root;
          },
          onRemove: () => {
            root?.unmount();
            customDiv.remove();
          },
        });

        if (ctx.isInvalid || !customDiv.isConnected) { ui.remove(); return; }
        ui.mount();
      } catch (error) {
        customDiv.remove();
        throw error;
      } finally { mounting = false; }
    };

    const mount = () => { void mountUi().catch((error) => errorLog('YouTube recovery mount failed', error)); };
    mount();

    ctx.addEventListener(window, 'yt-navigate-finish', mount, {
      passive: true,
    });
    // An embed's newer controls and its video's size show up only once the video first plays.
    if (isYoutubeEmbed()) ctx.setInterval(mount, 1000);
  },
});
