import {
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  PORT_LISTEN_PANEL_CLOSED_KEY,
  STORAGE_GLOBAL_STATE,
} from '@/config/constants';
import { chatStatusAtom } from '@/hooks/chat';
import {
  actionTypeAtom,
  messageAddedInPanelAtom,
  sidePanelHydratedAtom,
  threadIdAtom,
} from '@/hooks/global';
import { addMessage, createThread } from '@/lib/indexDB';
import { getSummarizePageTextPrompt } from '@/lib/prompts';
import { readStorage } from '@/lib/storageBackend';
import { debugLog, errorLog } from '@/logs';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SidePanelProvider = ({
  loadingComponent,
  children,
}: {
  loadingComponent: ReactNode;
  children: ReactNode;
}) => {
  const [panelInitialized, setPanelInitialized] = useState(false);
  const [sidePanelHydrated, setSidePanelHydrated] = useAtom(sidePanelHydratedAtom);
  const [threadId, setThreadId] = useAtom(threadIdAtom);
  const setMessageAddedInPanel = useSetAtom(messageAddedInPanelAtom);
  const setActionType = useSetAtom(actionTypeAtom);
  const chatStatus = useAtomValue(chatStatusAtom);
  const navigate = useNavigate();

  const rollbackActionType = useCallback(() => {
    setActionType('chat');
  }, [setActionType]);

  const getInitData = useCallback(async () => {
    const initData = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
    debugLog('initData', initData);
    if (isChatWaiting(chatStatus)) {
      debugLog('SidePanelProvider: [getInitData] skip initData for chatStatus', chatStatus);
    } else if (initData?.actionType === 'chat' && window.location.hash === '#/shizue-pdf') {
      debugLog('SidePanelProvider: [getInitData] skip initData for actionType chat and pdf url');
    } else if (initData?.actionType === 'askForSummary') {
      const { summaryTitle, summaryText, summaryPageLink } = initData;

      debugLog('SidePanelProvider: [getInitData] summaryTitle', summaryTitle);
      debugLog('SidePanelProvider: [getInitData] threadId', threadId);

      let isNewThread = false;

      const isInPdfPage = window.location.hash === '#/shizue-pdf';

      let tid = threadId;
      if (!tid || isInPdfPage) {
        tid = await createThread(summaryTitle!.slice(0, 20));
        isNewThread = true;
      }

      const summarizePageTextPrompt = getSummarizePageTextPrompt(summaryTitle!, summaryText!);

      await addMessage({
        id: crypto.randomUUID(),
        threadId: tid,
        role: 'human',
        actionType: 'askForSummary',
        summaryTitle: summaryTitle,
        summaryPageLink: summaryPageLink,
        content: summarizePageTextPrompt,
        createdAt: Date.now(),
        done: true,
        onInterrupt: false,
        stopped: false,
      });

      debugLog('SidePanelProvider: [getInitData] setThreadId', tid);

      if (isNewThread) {
        setThreadId(tid);
      } else {
        setMessageAddedInPanel(Date.now());
      }

      if (isInPdfPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /');
        navigate('/');
      }
    } else if (initData?.actionType === 'translatePdf') {
      debugLog('SidePanelProvider: [getInitData] translatePdf');
      const isInPdfPage = window.location.hash === '#/shizue-pdf';
      debugLog('SidePanelProvider: [getInitData] isInPdfPage', isInPdfPage);
      if (!isInPdfPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /shizue-pdf');
        setTimeout(() => {
          navigate('/shizue-pdf');
        }, 100);
      }
    }
    rollbackActionType();
  }, [threadId, setThreadId, rollbackActionType, setMessageAddedInPanel, chatStatus, navigate]);

  const handleMessage = useCallback(
    async (request: any) => {
      if (request.action === MESSAGE_UPDATE_PANEL_INIT_DATA) {
        debugLog('handleMessage: MESSAGE_UPDATE_PANEL_INIT_DATA');
        await getInitData();
      }
    },
    [getInitData]
  );

  useEffect(() => {
    debugLog('SidePanelProvider: [useEffect] threadId', threadId);
  }, [threadId]);

  useEffect(() => {
    if (!sidePanelHydrated) return;
    getInitData();
  }, [sidePanelHydrated, getInitData, navigate]);

  useEffect(() => {
    // This effect runs after the first render.
    // We assume atomWithStorage has loaded the initial value from localStorage by this time.
    // This is usually safe for client-side rendering with localStorage.
    setSidePanelHydrated(true);
  }, [setSidePanelHydrated]);

  useEffect(() => {
    setPanelInitialized(true);

    chrome.runtime.onMessage.addListener(handleMessage);

    try {
      chrome.runtime.sendMessage({ action: MESSAGE_PANEL_OPENED_PING_FROM_PANEL });
      chrome.runtime.connect({ name: PORT_LISTEN_PANEL_CLOSED_KEY });
    } catch (error) {
      errorLog('connect backend port', error);
    }

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleMessage]);

  return <>{panelInitialized ? children : loadingComponent}</>;
};

export default SidePanelProvider;
