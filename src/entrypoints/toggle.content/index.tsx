import '@/assets/tailwind.css';
import Toggle from '@/components/Toggle';
import { contentScriptLog, debugLog } from '@/logs';
import { EventEmitterProvider } from '@/providers/EventEmitterProvider';
import ShortcutProvider from '@/providers/ShortcutProvider';
import { createRoot } from 'react-dom/client';

const setupMessageListener = () => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    debugLog('Message received:', message);
  });
};

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*', '<all_urls>'],
  main(ctx) {
    contentScriptLog('Toggle');
    setupMessageListener();

    const eventEmitter = {
      listeners: new Set<(data: any) => void>(),
      emit(data: any) {
        this.listeners.forEach((listener) => listener(data));
      },
      subscribe(listener: (data: any) => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        const root = createRoot(container);
        root.render(
          <ShortcutProvider>
            <EventEmitterProvider eventEmitter={eventEmitter}>
              <Toggle />
            </EventEmitterProvider>
          </ShortcutProvider>
        );
        return root;
      },
      onRemove: (root) => {
        eventEmitter.listeners.clear();
        root?.unmount();
      },
    });

    ui.mount();
  },
});
