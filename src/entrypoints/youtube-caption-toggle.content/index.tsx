import '@/assets/global.css';
import '@/assets/tailwind.css';
import YoutubeSubtitleToggle from '@/components/Youtube/YoutubeCaptionToggle';
import { watchPlayerCaptionRequests } from '@/lib/youtube';
import { contentScriptLog } from '@/logs';
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
  matches: ['https://youtube.com/*', 'https://www.youtube.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    watchPlayerCaptionRequests();

    const mountUi = async () => {
      if (document.getElementById(YOUTUBE_TOGGLE_SHADOW_HOST_ID)) return;

      const anchor = document.querySelector('.ytp-right-controls');
      if (!anchor) return;

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
      });

      ui.mount();
    };

    await mountUi();

    window.addEventListener('yt-navigate-finish', mountUi, {
      passive: true,
    });
  },
});
