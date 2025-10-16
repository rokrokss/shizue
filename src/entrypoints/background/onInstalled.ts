export const onInstalled = () => {
  chrome.runtime.onInstalled.addListener(async (details) => {
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
