import { ModelProvider } from '@/lib/models';
import { debugLog } from '@/logs';

export const validateApiKey = async (apiKey: string, provider: ModelProvider) => {
  if (
    !apiKey ||
    (!apiKey.startsWith('sk-') && provider === 'openai-api-key') ||
    (!apiKey.startsWith('AIza') && provider === 'gemini-api-key')
  ) {
    debugLog('Invalid API key');
    return false;
  }

  try {
    if (provider === 'openai-api-key') {
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
    } else if (provider === 'gemini-api-key') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      debugLog('Gemini response', response);
      if (response.ok) {
        return true;
      } else {
        const errorJson = await response.json();
        debugLog('Gemini error', errorJson);
      }
    }
  } catch (e) {
    debugLog('API validation error', e);
  }
  return false;
};
