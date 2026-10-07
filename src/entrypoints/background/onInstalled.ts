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

      // Development builds stored one LOCAL_MODEL behind a 'local' slot, before chat and
      // translation could pick different local models.
      const { LOCAL_MODEL } = await chrome.storage.local.get('LOCAL_MODEL');
      if (LOCAL_MODEL || CHAT_MODEL === 'local' || TRANSLATE_MODEL === 'local') {
        const ref = LOCAL_MODEL ? `local:${LOCAL_MODEL.model}` : undefined;
        await chrome.storage.local.set({
          ...(LOCAL_MODEL
            ? {
                LOCAL_SERVER: {
                  kind: LOCAL_MODEL.kind,
                  baseUrl: LOCAL_MODEL.baseUrl,
                  apiKey: LOCAL_MODEL.apiKey,
                  models: [
                    {
                      id: LOCAL_MODEL.model,
                      supportsImages: LOCAL_MODEL.supportsImages,
                      supportsThinking: LOCAL_MODEL.supportsThinking,
                      contextLength: LOCAL_MODEL.contextLength,
                    },
                  ],
                },
              }
            : {}),
          ...(CHAT_MODEL === 'local' ? { CHAT_MODEL: ref ?? 'gpt' } : {}),
          ...(TRANSLATE_MODEL === 'local' ? { TRANSLATE_MODEL: ref ?? 'gpt-mini' } : {}),
        });
        await chrome.storage.local.remove('LOCAL_MODEL');
      }

      // The PDF translation feature was removed; drop its leftover settings.
      await chrome.storage.local.remove(['PDF_TRANSLATE_TASK_INFO', 'PDF_TRANSLATE_NO_DUAL']);
    }
  });
};
