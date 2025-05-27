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

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
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
        return root;
      },
      onRemove: () => {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
