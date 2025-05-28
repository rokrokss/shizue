import { STORAGE_LANGUAGE, STORAGE_SETTINGS } from '@/config/constants';
import { Language } from '@/hooks/language';
import { debugLog, errorLog } from '@/logs';

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

    debugLog('번역 완료:', { original: text, translated: translatedText });

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

// 이미 번역 오버레이가 있는지 확인하는 함수
const hasTranslationOverlay = (element: Element): boolean => {
  return element.parentElement?.querySelector('shizue-translation-overlay') !== null ||
         element.nextElementSibling?.tagName === 'SHIZUE-TRANSLATION-OVERLAY';
};

const createTranslationOverlay = (originalTextElement: Element, translatedText: string): Element | undefined => {
  try {
    const overlay = document.createElement('shizue-translation-overlay') as any;
    overlay.setTexts(originalTextElement, translatedText);
    return overlay;

  } catch (error) {
    errorLog('번역 오버레이 생성 중 오류:', error);
  }
};

export const translatePageElements = async (
  elements: Array<Element>,
  targetLanguage?: string
): Promise<void> => {
  // 목표 언어가 지정되지 않은 경우 사용자의 현재 언어 설정 사용
  const finalTargetLanguage = targetLanguage || getLanguageName(await getCurrentLanguage());
  
  debugLog(`${elements.length}개 요소 번역 시작 (대상 언어: ${finalTargetLanguage})`);
  
  const elementsToTranslate = elements.filter(element => {
    const text = element.textContent?.trim();
    debugLog('text', text);
    return text && 
    text.trim().length > 0 &&
    text.trim().length < 500 && // 너무 긴 텍스트는 제외
    /[a-zA-Z가-힣]/.test(text) && // 실제 텍스트가 포함된 요소만 (숫자나 기호만 있는 요소 제외)
    !hasTranslationOverlay(element) // 이미 번역 오버레이가 있는 요소는 제외
  });

  debugLog(`필터링 후 번역 대상: ${elementsToTranslate.length}개 요소`);

  for (const element of elementsToTranslate) {
    try {
      const result = await translateText({
        text: element.textContent!,
        targetLanguage: finalTargetLanguage
      });

      if (result.success && result.translatedText) {
        // 번역 오버레이 웹 컴포넌트 생성
        const translationOverlay = createTranslationOverlay(element, result.translatedText);
        
        if (translationOverlay) {
          element.appendChild(translationOverlay);

          debugLog('번역 오버레이 생성 완료:', {
            original: element.textContent,
            translated: result.translatedText,
            element: element.tagName
          });
        }
      } else {
        debugLog('번역 실패:', {
          original: element.textContent,
          translated: result.translatedText,
          element: element.tagName
        });
      }
    } catch (error) {
      errorLog('개별 요소 번역 중 오류:', error);
    }

    // API 호출 제한을 피하기 위한 딜레이
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  debugLog('페이지 번역 완료');
};
