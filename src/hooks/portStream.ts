import {
  MESSAGE_AGENT_APPROVAL,
  MESSAGE_RETRY_GRAPH_STREAM,
  MESSAGE_RUN_GRAPH_STREAM,
  PORT_STREAM_MESSAGE,
} from '@/config/constants';
import type { AgentLabels, AgentRun } from '@/lib/browserAgent';
import type { WebSource } from '@/lib/webSources';
import { debugLog } from '@/logs';
import { useCallback, useEffect, useRef } from 'react';

interface StreamOptions {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError?: (message: string) => void;
  // The background cut a long message to fit a local model's context.
  onContextTruncated?: () => void;
  // The pages a web search answer drew on, sent once the answer is complete.
  onSources?: (sources: WebSource[]) => void;
  // The thinking the model shows before it answers, and how long it thought once it answers.
  onReasoning?: (delta: string) => void;
  onThinkingMs?: (ms: number) => void;
  // How much of the model's context the request fills (0–1), and whether older turns were folded
  // into the chat's summary for it. Sent before the answer starts.
  onContextUsage?: (usage: number, compacted: boolean) => void;
  // The browser agent's actions so far, whole each time one changes.
  onAgent?: (run: AgentRun) => void;
  // The question asked to act in the tab with browser control off.
  onBrowserControlHint?: () => void;
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
        } else if ('reasoning' in msg) {
          opts.onReasoning?.(msg.reasoning);
        } else if ('thinkingMs' in msg) {
          opts.onThinkingMs?.(msg.thinkingMs);
        } else if ('agent' in msg) {
          opts.onAgent?.(msg.agent);
        } else if ('contextUsage' in msg) {
          opts.onContextUsage?.(msg.contextUsage, !!msg.contextCompacted);
        } else if ('error' in msg) {
          finished = true;
          opts.onError?.(msg.message ?? msg.error);
          port.disconnect();
        } else if (msg.contextTruncated) {
          opts.onContextTruncated?.();
        } else if (msg.browserControlHint) {
          opts.onBrowserControlHint?.();
        } else if ('sources' in msg) {
          opts.onSources?.(msg.sources);
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
    (payload: { threadId: string; actionType: ActionType; agentLabels?: AgentLabels }, opts: StreamOptions) => {
      _initiatePortCommunication(MESSAGE_RUN_GRAPH_STREAM, payload, opts);
    },
    [_initiatePortCommunication]
  );

  const startRetryStream = useCallback(
    (
      payload: { threadId: string; actionType: ActionType; messageIdxToRetry: number; agentLabels?: AgentLabels },
      opts: StreamOptions
    ) => {
      _initiatePortCommunication(MESSAGE_RETRY_GRAPH_STREAM, payload, opts);
    },
    [_initiatePortCommunication]
  );

  // The user's answer to a browser agent approval card, to the answer streaming now.
  const answerAgentApproval = useCallback((stepId: string, approved: boolean) => {
    portRef.current?.postMessage({ action: MESSAGE_AGENT_APPROVAL, stepId, approved });
  }, []);

  const cancelStream = useCallback(() => {
    portRef.current?.disconnect();
    portRef.current = null;
  }, []);

  useEffect(() => () => cancelStream(), [cancelStream]);

  return { startStream, startRetryStream, cancelStream, answerAgentApproval };
};
