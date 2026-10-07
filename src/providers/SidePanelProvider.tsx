import {
  isSelectionActionType,
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
import { useTranslateTargetLanguageValue } from '@/hooks/language';
import { addMessage, createThread } from '@/lib/indexDB';
import { getSelectionActionPrompt, getSummarizePageTextPrompt } from '@/lib/prompts';
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
  const targetLanguage = useTranslateTargetLanguageValue();
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
      selectionText: undefined,
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
    } else if (initData?.actionType === 'chat' && window.location.hash === '#/shizue-memo') {
      debugLog('SidePanelProvider: [getInitData] skip initData for actionType chat and memo url');
      return;
    } else if (initData?.actionType === 'askForSummary') {
      // Clear the action immediately to prevent duplicate processing
      isProcessingActionRef.current = true;
      await rollbackActionType();
      const { summaryTitle, summaryText, summaryPageLink } = initData;

      debugLog('SidePanelProvider: [getInitData] summaryTitle', summaryTitle);
      debugLog('SidePanelProvider: [getInitData] threadId', threadId);

      let isNewThread = false;

      const isInMemoPage = window.location.hash === '#/shizue-memo';

      let tid = threadId;
      if (!tid || isInMemoPage) {
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

      if (isInMemoPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /');
        navigate('/');
      }
    } else if (initData && isSelectionActionType(initData.actionType)) {
      // Clear the action immediately to prevent duplicate processing
      isProcessingActionRef.current = true;
      await rollbackActionType();
      const actionType = initData.actionType;
      const { selectionText, summaryTitle, summaryPageLink } = initData;

      debugLog('SidePanelProvider: [getInitData] selection action', actionType);
      debugLog('SidePanelProvider: [getInitData] threadId', threadId);

      let isNewThread = false;
      const isInMemoPage = window.location.hash === '#/shizue-memo';

      let tid = threadId;
      if (!tid || isInMemoPage) {
        tid = await createThread(selectionText!.slice(0, 20));
        isNewThread = true;
      }

      await addMessage({
        id: crypto.randomUUID(),
        threadId: tid,
        role: 'human',
        actionType,
        summaryTitle,
        summaryPageLink,
        selectionText,
        content: getSelectionActionPrompt(
          actionType,
          selectionText!,
          summaryTitle ?? '',
          targetLanguage
        ),
        createdAt: Date.now(),
        done: true,
        onInterrupt: false,
        stopped: false,
      });

      debugLog('SidePanelProvider: [getInitData] setThreadId', tid);

      if (isNewThread) {
        setThreadId(tid);
      }

      if (isInMemoPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /');
        navigate('/');
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
      const isInMemoPage = window.location.hash === '#/shizue-memo';

      let tid = threadId;
      if (!tid || isInMemoPage) {
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

      if (isInMemoPage) {
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
      const isInMemoPage = window.location.hash === '#/shizue-memo';

      let tid = threadId;
      if (!tid || isInMemoPage) {
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

      if (isInMemoPage) {
        debugLog('SidePanelProvider: [getInitData] navigate to /');
        navigate('/');
      }
    }
    isProcessingActionRef.current = false;
  }, [threadId, setThreadId, rollbackActionType, chatStatus, navigate, t, targetLanguage]);

  // Not async: Chrome takes a listener's returned promise as its reply, so an async listener here
  // answered every message (e.g. a content script's translation batch) with undefined before the
  // background could.
  const handleMessage = useCallback(
    (request: any) => {
      if (request.action === MESSAGE_UPDATE_PANEL_INIT_DATA) {
        debugLog('handleMessage: MESSAGE_UPDATE_PANEL_INIT_DATA');
        void getInitData();
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
