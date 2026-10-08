import {
  isSelectionActionType,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  MESSAGE_WAIT_PANEL_SUMMARY,
  STORAGE_GLOBAL_STATE,
} from '@/config/constants';
import { chatStatusAtom, isChatWaiting } from '@/hooks/chat';
import {
  sidePanelHydratedAtom,
  threadIdAtom,
  updateGlobalStateAtom,
} from '@/hooks/global';
import { useTranslateTargetLanguageValue } from '@/hooks/language';
import { addMessage, createThread } from '@/lib/indexDB';
import { getSelectionActionPrompt, getSummarizePageTextPrompt } from '@/lib/prompts';
import { readStorage } from '@/lib/storageBackend';
import { debugLog, errorLog } from '@/logs';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
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
  const sidePanelHydrated = useAtomValue(sidePanelHydratedAtom);
  const setThreadId = useSetAtom(threadIdAtom);
  const updateGlobalState = useSetAtom(updateGlobalStateAtom);
  const store = useStore();
  const chatStatus = useAtomValue(chatStatusAtom);
  const targetLanguage = useTranslateTargetLanguageValue();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isProcessingActionRef = useRef(false);
  const actionRefreshPendingRef = useRef(false);
  const refreshActionRef = useRef<() => Promise<void>>(async () => {});

  const rollbackActionType = useCallback(async () => {
    // Clear once through the atom so its selected thread and storage stay in sync.
    await updateGlobalState({
      actionType: 'chat',
      summaryTitle: undefined,
      summaryPageLink: undefined,
      summaryText: undefined,
      selectionText: undefined,
      imageBase64: undefined,
      imageUrl: undefined,
    });
  }, [updateGlobalState]);

  const getInitData = useCallback(async () => {
    if (!sidePanelHydrated) return;
    if (isProcessingActionRef.current) {
      actionRefreshPendingRef.current = true;
      debugLog('SidePanelProvider: [getInitData] already processing action, skipping');
      return;
    }
    
    // Lock before reading storage: mount, storage and message events can arrive together.
    isProcessingActionRef.current = true;
    try {
      await chrome.runtime.sendMessage({ action: MESSAGE_WAIT_PANEL_SUMMARY });
      const initData = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
      // Use the same storage snapshot as the action, not a pre-hydration render.
      const threadId = initData?.threadId;
      debugLog('initData', initData);
    
      if (isChatWaiting(store.get(chatStatusAtom))) {
        debugLog('SidePanelProvider: [getInitData] skip initData while a chat is running');
        return;
      } else if (initData?.actionType === 'chat' && window.location.hash === '#/shizue-memo') {
        debugLog('SidePanelProvider: [getInitData] skip initData for actionType chat and memo url');
        return;
      } else if (initData?.actionType === 'askForSummary') {
        // Clear the action immediately to prevent duplicate processing
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
          await setThreadId(tid);
        }

        if (isInMemoPage) {
          debugLog('SidePanelProvider: [getInitData] navigate to /');
          navigate('/');
        }
      } else if (initData && isSelectionActionType(initData.actionType)) {
        // Clear the action immediately to prevent duplicate processing
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
          await setThreadId(tid);
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
          navigate('/shizue-memo');
        }
      } else if (initData?.actionType === 'describeImage') {
        // Clear the action immediately to prevent duplicate processing
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
          await setThreadId(tid);
        }

        if (isInMemoPage) {
          debugLog('SidePanelProvider: [getInitData] navigate to /');
          navigate('/');
        }
      } else if (initData?.actionType === 'extractImageText') {
        // Clear the action immediately to prevent duplicate processing
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
          await setThreadId(tid);
        }

        if (isInMemoPage) {
          debugLog('SidePanelProvider: [getInitData] navigate to /');
          navigate('/');
        }
      }
    } catch (error) {
      errorLog('Unable to initialize the side panel action', error);
    } finally {
      isProcessingActionRef.current = false;
      if (actionRefreshPendingRef.current) {
        actionRefreshPendingRef.current = false;
        void refreshActionRef.current();
      } else {
        setPanelInitialized(true);
      }
    }
  }, [sidePanelHydrated, setThreadId, rollbackActionType, chatStatus, navigate, t, targetLanguage, store]);
  refreshActionRef.current = getInitData;

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
    if (!sidePanelHydrated) return;
    getInitData();
  }, [sidePanelHydrated, getInitData]);

  useEffect(() => {
    const handleStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const action = changes[STORAGE_GLOBAL_STATE]?.newValue?.actionType;
      if (area === 'local' && action && action !== 'chat') void getInitData();
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.storage.onChanged.addListener(handleStorage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorage);
    };
  }, [handleMessage, getInitData]);

  return <>{sidePanelHydrated && panelInitialized ? children : loadingComponent}</>;
};

export default SidePanelProvider;
