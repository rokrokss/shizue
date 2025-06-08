import '@/assets/global.css';
import '@/assets/tailwind.css';
import YoutubeSubtitleToggle from '@/components/Youtube/YoutubeCaptionToggle';
import { contentScriptLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import { StyleProvider as AntdStyleProvider } from '@ant-design/cssinjs';
import '@ant-design/v5-patch-for-react-19';
import { createRoot, Root } from 'react-dom/client';

export default defineContentScript({
  matches: ['https://youtube.com/watch*', 'https://www.youtube.com/watch*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    contentScriptLog('Youtube');

    let root: Root | null = null;

    const anchor = document.querySelector('.ytp-right-controls');
    const customDiv = document.createElement('div');
    customDiv.id = 'shizue-youtube-caption-toggle-shadow-host';
    customDiv.className =
      'sz:inline-block sz:w-fit sz:h-full sz:px-0 sz:py-0 sz:overflow-hidden sz:leading-0';
    anchor?.prepend(customDiv);

    const ui = await createShadowRootUi(ctx, {
      name: 'shizue-youtube-caption-toggle',
      position: 'inline',
      anchor: '#shizue-youtube-caption-toggle-shadow-host',
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
          <AntdStyleProvider container={cssContainer}>
            <AntdProvider>
              <YoutubeSubtitleToggle />
            </AntdProvider>
          </AntdStyleProvider>
        );
        return root;
      },
    });

    ui.mount();
  },
});
