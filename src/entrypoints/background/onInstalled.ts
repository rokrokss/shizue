import { debugLog, errorLog } from '@/logs';

/**
 * 이미 열려있는 탭에 content script를 수동으로 주입합니다.
 * 익스텐션 설치/업데이트 시 기존 탭에는 content script가 자동 주입되지 않아
 * Toggle 버튼이 표시되지 않는 문제를 해결합니다.
 */
async function injectContentScriptsToExistingTabs() {
  try {
    // 모든 http(s) 탭 가져오기
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });

    debugLog('[onInstalled] Injecting content scripts to', tabs.length, 'existing tabs');

    for (const tab of tabs) {
      if (!tab.id) continue;

      try {
        // toggle.content script 주입
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          files: ['content-scripts/toggle.content.js'],
        });

        debugLog('[onInstalled] Content script injected to tab:', tab.id, tab.url);
      } catch (error) {
        // Chrome 내부 페이지(chrome://, chrome-extension://)는 실패할 수 있음
        errorLog('[onInstalled] Failed to inject content script to tab:', tab.id, error);
      }
    }
  } catch (error) {
    errorLog('[onInstalled] Failed to inject content scripts:', error);
  }
}

export const onInstalled = () => {
  chrome.runtime.onInstalled.addListener(async (details) => {
    // 익스텐션 설치 또는 업데이트 시 기존 탭에 content script 주입
    if (details.reason === 'install' || details.reason === 'update') {
      await injectContentScriptsToExistingTabs();
    }

    // 모델 마이그레이션 (업데이트 시에만)
    if (details.reason === 'update') {
      const { CHAT_MODEL, TRANSLATE_MODEL } = await chrome.storage.local.get([
        'CHAT_MODEL',
        'TRANSLATE_MODEL',
      ]);

      const migrations: Record<string, string> = {
        'gpt-4.1': 'gpt',
        'gpt-4.1-mini': 'gpt-mini',
        'gemini-2.5-flash': 'gemini-flash',
        'gemini-2.5-flash-lite-preview-06-17': 'gemini-flash-lite',
        'claude-sonnet-4-20250514': 'claude-sonnet',
        'claude-3-5-haiku-20241022': 'claude-haiku',
      };

      if (migrations[CHAT_MODEL]) {
        await chrome.storage.local.set({ CHAT_MODEL: migrations[CHAT_MODEL] });
      }
      if (migrations[TRANSLATE_MODEL]) {
        await chrome.storage.local.set({ TRANSLATE_MODEL: migrations[TRANSLATE_MODEL] });
      }
    }
  });
};
