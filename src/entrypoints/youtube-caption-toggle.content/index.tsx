import '@/assets/global.css';
import '@/assets/tailwind.css';
import YoutubeSubtitleToggle from '@/components/Youtube/YoutubeCaptionToggle';
import { contentScriptLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { StyleProvider as AntdStyleProvider } from '@ant-design/cssinjs';
import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css?inline';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

export const YOUTUBE_TOGGLE_SHADOW_HOST_ID = 'shizue-youtube-caption-toggle-shadow-host';

export default defineContentScript({
  matches: ['https://youtube.com/*', 'https://www.youtube.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const mountUi = async () => {
      if (document.getElementById(YOUTUBE_TOGGLE_SHADOW_HOST_ID)) return;

      const anchor = document.querySelector('.ytp-right-controls');
      if (!anchor) return;

      contentScriptLog('Youtube');

      let root: Root | null = null;

      const customDiv = document.createElement('div');
      customDiv.id = YOUTUBE_TOGGLE_SHADOW_HOST_ID;
      customDiv.className =
        'sz:inline-block sz:w-fit sz:h-full sz:px-0 sz:py-0 sz:overflow-hidden sz:leading-0 sz:align-top';
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

          root.render(
            <StrictMode>
              <JotaiProvider>
                <LanguageProvider loadingComponent={null}>
                  <AntdStyleProvider container={shadow.host}>
                    <AntdProvider>
                      <YoutubeSubtitleToggle />
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
