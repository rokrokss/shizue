import '@/assets/global.css';
import '@/assets/tailwind.css';
import YoutubeSubtitleToggle from '@/components/Youtube/YoutubeCaptionToggle';
import { contentScriptLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { StyleProvider as AntdStyleProvider } from '@ant-design/cssinjs';
import '@ant-design/v5-patch-for-react-19';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

const HOST_ID = 'shizue-youtube-caption-toggle-shadow-host';

export default defineContentScript({
  matches: ['https://youtube.com/*', 'https://www.youtube.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const mountUi = async () => {
      if (document.getElementById(HOST_ID)) return;

      const anchor = document.querySelector('.ytp-right-controls');
      if (!anchor) return;

      contentScriptLog('Youtube');

      let root: Root | null = null;

      const customDiv = document.createElement('div');
      customDiv.id = HOST_ID;
      customDiv.className =
        'sz:inline-block sz:w-fit sz:h-full sz:px-0 sz:py-0 sz:overflow-hidden sz:leading-0';
      anchor?.prepend(customDiv);

      const ui = await createShadowRootUi(ctx, {
        name: 'shizue-youtube-caption-toggle',
        position: 'inline',
        anchor: `#${HOST_ID}`,
        append: 'first',
        mode: 'closed',
        onMount: (container, shadow) => {
          const cssContainer = shadow.querySelector('head')!;
          root = createRoot(container);
          container.classList.add('sz:h-full');
          shadow.host.classList.add('sz:h-full');
          shadow.host.classList.add('sz:inline-flex');
          shadow.host.classList.add('sz:leading-0');
          root.render(
            <StrictMode>
              <JotaiProvider>
                <LanguageProvider loadingComponent={null}>
                  <AntdStyleProvider container={cssContainer}>
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
