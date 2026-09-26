import { ApiKeyProvider } from '@/lib/modelRegistry';
import { debugLog } from '@/logs';

// Keys are treated as opaque strings and verified against the provider API: key formats
// change over time (e.g. Gemini moved from `AIza…` standard keys to `AQ.…` auth keys in 2026).
export const validateApiKey = async (apiKey: string, provider: ApiKeyProvider) => {
  if (!apiKey) {
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
      // Auth keys must be sent as a header; the `?key=` query parameter is not supported for them.
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: {
          'x-goog-api-key': apiKey,
        },
      });
      debugLog('Gemini response', response);
      if (response.ok) {
        return true;
      } else {
        const errorJson = await response.json();
        debugLog('Gemini error', errorJson);
      }
    } else if (provider === 'anthropic-api-key') {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          // Required for CORS from browser/extension origins.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (response.ok) {
        return true;
      } else {
        const errorJson = await response.json();
        debugLog('Anthropic error', errorJson);
      }
    } else if (provider === 'openrouter-api-key') {
      // `/models` is public on OpenRouter, so it would accept any key; `/key` requires auth.
      const response = await fetch('https://openrouter.ai/api/v1/key', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (response.ok) {
        return true;
      } else {
        const errorJson = await response.json();
        debugLog('OpenRouter error', errorJson);
      }
    }
  } catch (e) {
    debugLog('API validation error', e);
  }
  return false;
};
