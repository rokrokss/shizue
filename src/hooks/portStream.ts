import { MESSAGE_RUN_GRAPH_STREAM, PORT_STREAM_MESSAGE } from '@/config/constants';
import { useCallback, useEffect, useRef } from 'react';

interface StreamOptions {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError?: (e: unknown) => void;
}

export const useChromePortStream = () => {
  const portRef = useRef<chrome.runtime.Port | null>(null);

  const startStream = useCallback((payload: { threadId: string }, opts: StreamOptions) => {
    if (portRef.current) portRef.current.disconnect();

    const port = chrome.runtime.connect({ name: PORT_STREAM_MESSAGE });
    portRef.current = port;

    const handleMessage = (msg: any) => {
      if ('delta' in msg) {
        opts.onDelta(msg.delta);
      } else if ('error' in msg) {
        opts.onError?.(msg.error);
        port.disconnect();
      } else if (msg.done) {
        opts.onDone();
        port.disconnect();
      }
    };

    const handleDisconnect = () => {
      port.onMessage.removeListener(handleMessage);
    };

    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(handleDisconnect);

    port.postMessage({ type: MESSAGE_RUN_GRAPH_STREAM, ...payload });
  }, []);

  const cancelStream = useCallback(() => {
    portRef.current?.disconnect();
    portRef.current = null;
  }, []);

  // cleanup
  useEffect(() => () => cancelStream(), [cancelStream]);

  return { startStream, cancelStream };
};
