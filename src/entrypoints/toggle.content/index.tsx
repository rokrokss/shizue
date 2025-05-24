import '@/assets/tailwind.css';
import Toggle from '@/components/Toggle';
import { contentScriptLog, debugLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import { EventEmitterProvider } from '@/providers/EventEmitterProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

type EventEmitter = {
  listeners: Set<(data: any) => void>;
  emit: (data: any) => void;
  subscribe: (listener: (data: any) => void) => () => void;
};

const createEventEmitter = (): EventEmitter => {
  const listeners = new Set<(data: any) => void>();
  return {
    listeners,
    emit(data) {
      listeners.forEach((listener) => listener(data));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const setupMessageListener = () => {
  const handler = (message: any, sender: any, sendResponse: any) => {
    debugLog('Message received:', message);
  };
  browser.runtime.onMessage.addListener(handler);

  return () => browser.runtime.onMessage.removeListener(handler);
};

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*', '<all_urls>'],
  main(ctx) {
    contentScriptLog('Toggle');

    const cleanupMessageListener = setupMessageListener();
    const eventEmitter = createEventEmitter();

    let root: Root | null = null;

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        root = createRoot(container);
        root.render(
          <StrictMode>
            <EventEmitterProvider eventEmitter={eventEmitter}>
              <JotaiProvider>
                <LanguageProvider loadingComponent={null}>
                  <AntdProvider>
                    <Toggle />
                  </AntdProvider>
                </LanguageProvider>
              </JotaiProvider>
            </EventEmitterProvider>
          </StrictMode>
        );
        return root;
      },
      onRemove: () => {
        eventEmitter.listeners.clear();
        root?.unmount();
        cleanupMessageListener?.();
      },
    });

    ui.mount();
  },
});
