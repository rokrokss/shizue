import { PORT_YOUTUBE_CAPTION } from '@/config/constants';
import { whenBackgroundStateReady } from '@/entrypoints/background/states/ready';
import { errorLog } from '@/logs';
import { getTranslationHandler } from '@/services/background/translationHandler';

// A chunk of YouTube captions arrives over its own port, and each translated line goes back as
// `{line: [index, text]}` as soon as the model writes it, then `{done: translations}` or `{error}`.
// The caption script disconnects when it no longer wants the chunk (a seek away from it), which
// stops the model's answer.
export const captionPortListeners = () => {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_YOUTUBE_CAPTION) return;
    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());
    const post = (message: object) => {
      if (controller.signal.aborted) return;
      try {
        port.postMessage(message);
      } catch {
        controller.abort();
      }
    };

    // Safari can deliver the first message twice (see sidepanel.ts).
    let answered = false;
    port.onMessage.addListener(async (msg) => {
      if (answered) return;
      answered = true;
      await whenBackgroundStateReady();
      try {
        const translations = await getTranslationHandler().streamYoutubeCaption(
          msg,
          (index, text) => post({ line: [index, text] }),
          controller.signal
        );
        post({ done: translations });
      } catch (error) {
        if (controller.signal.aborted) return;
        errorLog('[captionPort] YouTube caption translation failed:', error);
        post({ error: (error as Error).message ?? String(error) });
      }
    });
  });
};
