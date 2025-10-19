import {
  MESSAGE_GET_PANEL_OPENED_WINDOW,
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  PORT_LISTEN_PANEL_CLOSED_KEY,
  STORAGE_GLOBAL_STATE,
} from '@/config/constants';
import { chatStatusAtom, isChatWaiting } from '@/hooks/chat';
import {
  actionTypeAtom,
  sidePanelHydratedAtom,
  threadIdAtom,
} from '@/hooks/global';
import { addMessage, createThread } from '@/lib/indexDB';
import { getSummarizePageTextPrompt } from '@/lib/prompts';
import { readStorage, setStorage } from '@/lib/storageBackend';
import { debugLog, errorLog } from '@/logs';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const setActionType = useSetAtom(actionTypeAtom);
  const chatStatus = useAtomValue(chatStatusAtom);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isProcessingActionRef = useRef(false);

  const rollbackActionType = useCallback(async () => {
    setActionType('chat');
    // Clear the action-specific data from global state to prevent duplicate processing
    const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
    await setStorage(STORAGE_GLOBAL_STATE, {
      ...(prevGlobalState ?? {}),
      actionType: 'chat',
      summaryTitle: undefined,
      summaryPageLink: undefined,
      summaryText: undefined,
      imageBase64: undefined,
      imageUrl: undefined,
    });
  }, [setActionType]);

  const getInitData = useCallback(async () => {
    if (isProcessingActionRef.current) {
      debugLog('SidePanelProvider: [getInitData] already processing action, skipping');
      return;
    }
    
    const initData = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
    debugLog('initData', initData);
    
    if (isChatWaiting(chatStatus)) {
      debugLog('SidePanelProvider: [getInitData] skip initData for chatStatus', chatStatus);
      return;
    } else if (initData?.actionType === 'chat' && (window.location.hash === '#/shizue-pdf' || window.location.hash === '#/shizue-memo')) {
      debugLog('SidePanelProvider: [getInitData] skip initData for actionType chat and pdf or memo url');
      return;
    } else if (initData?.actionType === 'askForSummary') {
      // Clear the action immediately to prevent duplicate processing
      isProcessingActionRef.current = true;
      await rollbackActionType();
      const { summaryTitle, summaryText, summaryPageLink } = initData;

      debugLog('SidePanelProvider: [getInitData] summaryTitle', summaryTitle);
      debugLog('SidePanelProvider: [getInitData] threadId', threadId);

      let isNewThread = false;

      const isInPdfPage = window.location.hash === '#/shizue-pdf';
      const isInMemoPage = window.location.hash === '#/shizue-memo';

      let tid = threadId;
      if (!tid || isInPdfPage || isInMemoPage) {
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
        translateMode: false,
        content: summarizePageTextPrompt,
        createdAt: Date.now(),
        done: true,
        onInterrupt: false,
        stopped: false,
      });

      debugLog('SidePanelProvider: [getInitData] setThreadId', tid);

      if (isNewThread) {
        setThreadId(tid);
      }

      if (isInPdfPage || isInMemoPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /');
        navigate('/');
      }
    } else if (initData?.actionType === 'translatePdf') {
      debugLog('SidePanelProvider: [getInitData] translatePdf');
      await rollbackActionType();

      const isInPdfPage = window.location.hash === '#/shizue-pdf';

      debugLog('SidePanelProvider: [getInitData] isInPdfPage', isInPdfPage);

      if (!isInPdfPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /shizue-pdf');
        setTimeout(() => {
          navigate('/shizue-pdf');
        }, 100);
      }
    } else if (initData?.actionType === 'memo') {
      debugLog('SidePanelProvider: [getInitData] memo');
      await rollbackActionType();

      const isInMemoPage = window.location.hash === '#/shizue-memo';

      debugLog('SidePanelProvider: [getInitData] isInMemoPage', isInMemoPage);

      if (!isInMemoPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /shizue-memo');
        setTimeout(() => {
          navigate('/shizue-memo');
        }, 100);
      }
    } else if (initData?.actionType === 'describeImage') {
      // Clear the action immediately to prevent duplicate processing
      isProcessingActionRef.current = true;
      await rollbackActionType();
      const { imageBase64, imageUrl } = initData;

      debugLog('SidePanelProvider: [getInitData] describeImage', imageUrl);
      debugLog('SidePanelProvider: [getInitData] threadId', threadId);

      if (!imageBase64) {
        debugLog('SidePanelProvider: [getInitData] imageBase64 is undefined');
        return;
      }

      let isNewThread = false;
      const isInPdfPage = window.location.hash === '#/shizue-pdf';
      const isInMemoPage = window.location.hash === '#/shizue-memo';

      let tid = threadId;
      if (!tid || isInPdfPage || isInMemoPage) {
        tid = await createThread(t('chat.describeImageRequest'));
        isNewThread = true;
      }

      // Base64 이미지 처리 (File 변환은 필요시에만)
      await addMessage({
        id: crypto.randomUUID(),
        threadId: tid,
        role: 'human',
        actionType: 'describeImage',
        content: t('chat.describeImageRequest'),
        images: [imageBase64],
        createdAt: Date.now(),
        done: true,
        onInterrupt: false,
        stopped: false,
      });

      debugLog('SidePanelProvider: [getInitData] setThreadId', tid);

      if (isNewThread) {
        setThreadId(tid);
      }

      if (isInPdfPage || isInMemoPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /');
        navigate('/');
      }
    } else if (initData?.actionType === 'extractImageText') {
      // Clear the action immediately to prevent duplicate processing
      isProcessingActionRef.current = true;
      await rollbackActionType();
      const { imageBase64, imageUrl } = initData;

      debugLog('SidePanelProvider: [getInitData] extractImageText', imageUrl);
      debugLog('SidePanelProvider: [getInitData] threadId', threadId);

      if (!imageBase64) {
        debugLog('SidePanelProvider: [getInitData] imageBase64 is undefined');
        return;
      }

      let isNewThread = false;
      const isInPdfPage = window.location.hash === '#/shizue-pdf';
      const isInMemoPage = window.location.hash === '#/shizue-memo';

      let tid = threadId;
      if (!tid || isInPdfPage || isInMemoPage) {
        tid = await createThread(t('chat.extractImageTextRequest'));
        isNewThread = true;
      }

      await addMessage({
        id: crypto.randomUUID(),
        threadId: tid,
        role: 'human',
        actionType: 'extractImageText',
        content: t('chat.extractImageTextRequest'),
        images: [imageBase64],
        createdAt: Date.now(),
        done: true,
        onInterrupt: false,
        stopped: false,
      });

      debugLog('SidePanelProvider: [getInitData] setThreadId', tid);

      if (isNewThread) {
        setThreadId(tid);
      }

      if (isInPdfPage || isInMemoPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /');
        navigate('/');
      }
    }
    isProcessingActionRef.current = false;
  }, [threadId, setThreadId, rollbackActionType, chatStatus, navigate, t]);

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
  }, [sidePanelHydrated]);

  // Chrome Storage 변경 감지 - 같은 윈도우에서 Summary 등을 클릭했을 때 처리
  useEffect(() => {
    const handleStorageChange = async (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes[STORAGE_GLOBAL_STATE]) {
        const newValue = changes[STORAGE_GLOBAL_STATE].newValue as GlobalState | undefined;
        debugLog('SidePanelProvider: [Storage changed] GLOBAL_STATE:', newValue);

        // actionType이 변경되었을 때만 getInitData() 재실행
        if (newValue?.actionType && newValue.actionType !== 'chat') {
          try {
            // 현재 윈도우 ID 확인
            const currentWindow = await chrome.windows.getCurrent();

            // Background에서 실제로 열린 패널의 windowId 가져오기
            const response = await chrome.runtime.sendMessage({
              action: MESSAGE_GET_PANEL_OPENED_WINDOW
            });

            debugLog('SidePanelProvider: [Storage changed] currentWindow:', currentWindow.id, 'openedWindow:', response?.windowId);

            // 현재 윈도우가 열린 패널일 때만 처리
            if (currentWindow.id === response?.windowId) {
              debugLog('SidePanelProvider: [Storage changed] This is the opened panel, triggering getInitData with 200ms delay');

              // 200ms 대기 후 실행 (이전 윈도우 완전히 정리될 때까지)
              setTimeout(() => {
                getInitData();
              }, 200);
            } else {
              debugLog('SidePanelProvider: [Storage changed] Not the opened panel, ignoring (closing window)');
            }
          } catch (error) {
            errorLog('SidePanelProvider: [Storage changed] Error checking window:', error);
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [getInitData]);

  useEffect(() => {
    // This effect runs after the first render.
    // We assume atomWithStorage has loaded the initial value from localStorage by this time.
    // This is usually safe for client-side rendering with localStorage.
    setSidePanelHydrated(true);
  }, [setSidePanelHydrated]);

  useEffect(() => {
    setPanelInitialized(true);

    chrome.runtime.onMessage.addListener(handleMessage);

    const connectPort = async () => {
      try {
        // windowId 포함한 Port 생성
        const currentWindow = await chrome.windows.getCurrent();

        debugLog('SidePanelProvider: Sending panel opened ping, windowId:', currentWindow.id);

        // Background에 side panel이 열렸음을 알림 (상태 복원용)
        const response = await chrome.runtime.sendMessage({
          action: MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
          windowId: currentWindow.id
        });

        debugLog('SidePanelProvider: Panel opened ping response:', response);

        const portName = `${PORT_LISTEN_PANEL_CLOSED_KEY}:${currentWindow.id}`;
        debugLog('SidePanelProvider: Connecting port with name:', portName);
        chrome.runtime.connect({ name: portName });
      } catch (error) {
        errorLog('SidePanelProvider: Failed to connect backend port:', error);
      }
    };

    connectPort();

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleMessage]);

  return <>{panelInitialized ? children : loadingComponent}</>;
};

export default SidePanelProvider;
