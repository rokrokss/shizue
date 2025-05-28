import { STORAGE_LANGUAGE, STORAGE_SETTINGS } from '@/config/constants';
import { Language } from '@/hooks/language';
import { errorLog } from '@/logs';

export interface TranslationOptions {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export interface TranslationResult {
  success: boolean;
  translatedText?: string;
  error?: string;
}

// 언어 코드를 OpenAI가 이해할 수 있는 언어명으로 매핑
export const getLanguageName = (languageCode: Language): string => {
  const languageMap: Record<Language, string> = {
    'ko': 'Korean',
    'en': 'English'
  };
  
  return languageMap[languageCode] || 'English';
};

// 현재 사용자 언어 설정 가져오기
export const getCurrentLanguage = async (): Promise<Language> => {
  try {
    const storage = await chrome.storage.local.get(STORAGE_LANGUAGE);
    return storage[STORAGE_LANGUAGE] || 'ko';
  } catch (error) {
    errorLog('언어 설정을 가져오는 중 오류:', error);
    return 'ko';
  }
};

export const translateText = async ({
  text,
  targetLanguage,
  sourceLanguage = 'auto'
}: TranslationOptions): Promise<TranslationResult> => {
  try {
    // OpenAI API 키 가져오기
    const settings = await chrome.storage.local.get(STORAGE_SETTINGS);
    const apiKey = settings[STORAGE_SETTINGS]?.openAIKey;

    if (!apiKey) {
      return {
        success: false,
        error: 'OpenAI API 키가 설정되지 않았습니다.'
      };
    }

    const prompt = sourceLanguage === 'auto'
      ? `Translate the following text to ${targetLanguage}. Only return the translated text without any explanation:\n\n${text}`
      : `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Only return the translated text without any explanation:\n\n${text}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API 오류: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const translatedText = data.choices[0]?.message?.content?.trim();

    if (!translatedText) {
      throw new Error('번역 결과를 받을 수 없습니다.');
    }

    return {
      success: true,
      translatedText
    };

  } catch (error) {
    errorLog('번역 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
    };
  }
};
