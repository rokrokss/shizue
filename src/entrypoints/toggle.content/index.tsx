import '@/assets/global.css';
import '@/assets/tailwind.css';
import Toggle from '@/components/Toggle';
import { contentScriptLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import '@ant-design/v5-patch-for-react-19';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*', '<all_urls>'],
  main(ctx) {
    contentScriptLog('Toggle');

    let root: Root | null = null;
    let mo: MutationObserver | null = null;
    let debounceId: number | null = null;

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        container.id = '_shizue_toggle_overlay_';
        Object.assign(container.style, {
          position: 'fixed',
          inset: '0 auto auto 0',
          zIndex: '2147483647',
          pointerEvents: 'auto',
        });
        document.body.append(container);

        root = createRoot(container);
        root.render(
          <StrictMode>
            <JotaiProvider>
              <LanguageProvider loadingComponent={null}>
                <AntdProvider>
                  <Toggle />
                </AntdProvider>
              </LanguageProvider>
            </JotaiProvider>
          </StrictMode>
        );

        mo = new MutationObserver(() => {
          if (debounceId !== null) clearTimeout(debounceId);

          debounceId = window.setTimeout(() => {
            debounceId = null;
            if (!container.isConnected) return;
            if (document.body.lastElementChild !== container) {
              document.body.append(container);
            }
          }, 100);
        });

        mo.observe(document.body, { childList: true, subtree: true });
        return root;
      },
      onRemove: () => {
        mo?.disconnect();
        if (debounceId !== null) clearTimeout(debounceId);
        root?.unmount();
      },
    });

    ui.mount();
  },
});
