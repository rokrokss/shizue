import '@/assets/global.css';
import '@/assets/tailwind.css';
import Toggle from '@/components/Toggle';
import { contentScriptLog, errorLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { registerPageSummaryListener } from '@/services/pageSummary';
import { registerContentScriptConnection } from '@/lib/contentScriptConnection';
import { StyleProvider as AntdStyleProvider, createCache } from '@ant-design/cssinjs';
import '@ant-design/v5-patch-for-react-19';
import { ConfigProvider } from 'antd';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*', '<all_urls>'],
  runAt: 'document_idle',
  // Keep every style inside the shadow root. CSS injected into the page leaks both ways: our
  // @layer names reordered the page's own layers, and page CSS restyled the toggle.
  cssInjectionMode: 'ui',
  main(ctx) {
    ctx.onInvalidated(registerContentScriptConnection('toggle'));
    ctx.onInvalidated(registerPageSummaryListener());
    // WXT invalidates the previous instance; also remove orphaned hosts left by older builds.
    document.querySelectorAll('shizue-toggle').forEach((host) => host.remove());
    const mountUi = async () => {
      if (ctx.isInvalid) return;
      contentScriptLog('Toggle');

      let root: Root | null = null;
      let mo: MutationObserver | null = null;
      let debounceId: number | null = null;
      let uiContainer: HTMLElement | null = null;

      const handleFullscreenChange = () => {
        if (!uiContainer) return;

        const isInFullscreen = !!document.fullscreenElement;

        // Hide the inner container: `:host { all: initial !important }` pins the host's display.
        if (isInFullscreen) {
          uiContainer.style.setProperty('display', 'none', 'important');
        } else {
          uiContainer.style.removeProperty('display');
        }
      };

      const ui = await createShadowRootUi(ctx, {
        name: 'shizue-toggle',
        position: 'inline',
        anchor: 'body',
        onMount: (container, shadow, shadowHost) => {
          uiContainer = container;
          shadowHost.id = '_shizue_toggle_overlay_';
          container.classList.add('shizue-preflight');

          // Popovers, tooltips and antd styles also stay inside the shadow root. Popovers go
          // before the toggle so the toggle still paints over them, as when they were on <body>.
          const portalContainer = document.createElement('div');
          shadow.insertBefore(portalContainer, container);

          root = createRoot(container);
          root.render(
            <StrictMode>
              <JotaiProvider>
                <LanguageProvider loadingComponent={null}>
                  <AntdStyleProvider container={shadow} cache={createCache()}>
                    <AntdProvider>
                      <ConfigProvider getPopupContainer={() => portalContainer}>
                        <Toggle portalContainer={portalContainer} />
                      </ConfigProvider>
                    </AntdProvider>
                  </AntdStyleProvider>
                </LanguageProvider>
              </JotaiProvider>
            </StrictMode>
          );

          document.addEventListener('fullscreenchange', handleFullscreenChange);
          handleFullscreenChange();

          mo = new MutationObserver(() => {
            if (debounceId !== null) clearTimeout(debounceId);

            debounceId = window.setTimeout(() => {
              debounceId = null;
              if (!shadowHost.isConnected) return;
              if (document.body.lastElementChild !== shadowHost) {
                document.body.append(shadowHost);
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
          document.removeEventListener('fullscreenchange', handleFullscreenChange);
          uiContainer = null;
        },
      });

      if (ctx.isInvalid) { ui.remove(); return; }
      ui.mount();
    };

    const mount = () => { void mountUi().catch((error) => errorLog('Toggle recovery mount failed', error)); };
    if (document.body) {
      mount();
    } else {
      ctx.addEventListener(document, 'DOMContentLoaded', mount, { once: true });
    }
  },
});
