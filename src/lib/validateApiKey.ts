import { debugLog } from '@/logs';

export const validateApiKey = async (apiKey: string) => {
  if (!apiKey || !apiKey.startsWith('sk-')) {
    debugLog('Invalid API key');
    return false;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return true;
    } else {
      const errorJson = await response.json();
      debugLog('OpenAI error', errorJson);
    }
  } catch (e) {
    debugLog('API validation error', e);
  }
  return false;
};
