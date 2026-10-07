import {
  MESSAGE_RETRY_GRAPH_STREAM,
  MESSAGE_RUN_GRAPH_STREAM,
  PORT_STREAM_MESSAGE,
} from '@/config/constants';
import { debugLog } from '@/logs';
import { useCallback, useEffect, useRef } from 'react';

interface StreamOptions {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError?: (message: string) => void;
  // The background cut a long message to fit a local model's context.
  onContextTruncated?: () => void;
}

export const useChromePortStream = () => {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const streamOptionsRef = useRef<StreamOptions | null>(null);

  const _initiatePortCommunication = useCallback(
    (action: string, payload: Record<string, any>, opts: StreamOptions) => {
      if (portRef.current) {
        portRef.current.disconnect();
      }
      streamOptionsRef.current = opts;

      const port = chrome.runtime.connect({ name: PORT_STREAM_MESSAGE });
      portRef.current = port;
      let finished = false;

      const handleMessage = (msg: any) => {
        const activeOpts = streamOptionsRef.current;
        if (!activeOpts) return;

        if ('delta' in msg) {
          opts.onDelta(msg.delta);
        } else if ('error' in msg) {
          finished = true;
          opts.onError?.(msg.message ?? msg.error);
          port.disconnect();
        } else if (msg.contextTruncated) {
          opts.onContextTruncated?.();
        } else if (msg.done) {
          finished = true;
          opts.onDone();
          port.disconnect();
        }
      };

      // Fires only when the background side goes away (e.g. the service worker was terminated).
      const handleDisconnect = (p: chrome.runtime.Port) => {
        if (!finished && streamOptionsRef.current === opts) {
          finished = true;
          opts.onError?.(chrome.runtime.lastError?.message ?? 'Connection to background lost');
        }
        if (portRef.current === p) {
          p.onMessage.removeListener(handleMessage);
          p.onDisconnect.removeListener(handleDisconnect);
          portRef.current = null;
          streamOptionsRef.current = null;
        }
      };

      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(handleDisconnect);
      debugLog('useChromePortStream: [initiatePortCommunication] port.postMessage:', {
        action,
        ...payload,
      });
      port.postMessage({ action, ...payload });
    },
    []
  );

  const startStream = useCallback(
    (payload: { threadId: string; actionType: ActionType }, opts: StreamOptions) => {
      _initiatePortCommunication(MESSAGE_RUN_GRAPH_STREAM, payload, opts);
    },
    [_initiatePortCommunication]
  );

  const startRetryStream = useCallback(
    (
      payload: { threadId: string; actionType: ActionType; messageIdxToRetry: number },
      opts: StreamOptions
    ) => {
      _initiatePortCommunication(MESSAGE_RETRY_GRAPH_STREAM, payload, opts);
    },
    [_initiatePortCommunication]
  );

  const cancelStream = useCallback(() => {
    portRef.current?.disconnect();
    portRef.current = null;
  }, []);

  useEffect(() => () => cancelStream(), [cancelStream]);

  return { startStream, startRetryStream, cancelStream };
};
