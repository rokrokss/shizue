import { getTranslationTargetLanguage } from '@/entrypoints/background/states/language';
import {
  getCurrentOpenaiKey,
  getCurrentTranslateModel,
} from '@/entrypoints/background/states/models';
import { ModelPreset, getModelInstance } from '@/lib/models';
import { getHtmlTranslationBatchPrompt, getHtmlTranslationPrompt } from '@/lib/prompts';
import { debugLog, errorLog } from '@/logs';
import { HumanMessage } from '@langchain/core/messages';

export interface TranslationResult {
  success: boolean;
  translatedText?: string;
  error?: string;
}

export interface BatchTranslationResult {
  success: boolean;
  translatedTexts?: string[];
  error?: string;
}

interface BatchTranslationJsonResponseFormat {
  translations: string[];
}

function getTranslationModelPreset(): ModelPreset {
  const openaiKey = getCurrentOpenaiKey();
  const modelName = getCurrentTranslateModel();
  return { openaiKey, modelName };
}

export class TranslationHandler {
  constructor() {}

  public async canTranslate(): Promise<boolean> {
    const openaiKey = getCurrentOpenaiKey();
    return Boolean(openaiKey);
  }

  public async translateHtmlText(text: string): Promise<TranslationResult> {
    try {
      const targetLanguage = getTranslationTargetLanguage();
      const prompt = getHtmlTranslationPrompt(text, targetLanguage);

      const llm = await getModelInstance({
        temperature: 0.1,
        maxTokens: 5000,
        streaming: false,
        modelPreset: getTranslationModelPreset(),
      });
      const response = await llm.invoke([new HumanMessage(prompt)]);

      debugLog('TranslationHandler [translateText] response:', response);

      return { success: true, translatedText: (response.content as string).trim() };
    } catch (err) {
      errorLog('TranslationHandler [translateText] error:', err);
      return { success: false, error: (err as Error).message ?? String(err) };
    }
  }

  public async translateHtmlTextBatch(textBatch: string[]): Promise<BatchTranslationResult> {
    if (!textBatch || textBatch.length === 0) {
      debugLog('TranslationHandler [translateHtmlTextBatch] received empty batch.');
      return { success: false, error: 'Empty batch provided.' };
    }

    try {
      const targetLanguage = getTranslationTargetLanguage();
      const serializedTextBatch = JSON.stringify(textBatch, null, 2);

      const batchPrompt = getHtmlTranslationBatchPrompt(serializedTextBatch, targetLanguage);

      const llm = await getModelInstance({
        temperature: 0.1,
        maxTokens: 5000,
        streaming: false,
        modelPreset: getTranslationModelPreset(),
        responseFormat: { type: 'json_object' },
      });

      const response = await llm.invoke([new HumanMessage(batchPrompt)]);
      const rawResponseContent = (response.content as string)?.trim();

      debugLog(
        'TranslationHandler [translateHtmlTextBatch] raw response from AI:',
        rawResponseContent
      );

      let parsedResponse: BatchTranslationJsonResponseFormat;
      try {
        parsedResponse = JSON.parse(rawResponseContent);
      } catch (parseError) {
        errorLog(
          'TranslationHandler [translateHtmlTextBatch] JSON parsing error:',
          (parseError as Error).message,
          'Raw response:',
          rawResponseContent
        );
        return {
          success: false,
          error: `Failed to parse model response. Error: ${(parseError as Error).message}`,
        };
      }

      if (
        !parsedResponse ||
        !parsedResponse.translations ||
        !Array.isArray(parsedResponse.translations) ||
        !parsedResponse.translations.every((item) => typeof item === 'string')
      ) {
        const validationErrorMsg =
          "AI response is not a valid JSON object with a 'translations' array of strings.";
        errorLog(
          'TranslationHandler [translateHtmlTextBatch] JSON validation error:',
          validationErrorMsg,
          'Parsed response:',
          parsedResponse
        );
        return {
          success: false,
          error: `Invalid JSON structure in AI response. Details: ${validationErrorMsg}`,
        };
      }

      const translatedTextsArray = parsedResponse.translations;

      if (translatedTextsArray.length !== textBatch.length) {
        const countMismatchErrorMsg = `Number of translated texts (${translatedTextsArray.length}) does not match input batch size (${textBatch.length}).`;
        errorLog(
          'ChatModelHandler [translateHtmlTextBatch] Item count mismatch error:',
          countMismatchErrorMsg
        );
        return {
          success: false,
          error: `Item count mismatch in AI response. Details: ${countMismatchErrorMsg}`,
        };
      }

      return {
        success: true,
        translatedTexts: translatedTextsArray,
      };
    } catch (err) {
      errorLog('TranslationHandler [translateHtmlTextBatch] general error:', err);
      return {
        success: false,
        error: `General error during batch translation. Error: ${
          (err as Error).message ?? String(err)
        }`,
      };
    }
  }
}

let translationHandler: TranslationHandler | null = null;

export const getTranslationHandler = (): TranslationHandler => {
  if (!translationHandler) {
    translationHandler = new TranslationHandler();
  }
  return translationHandler;
};
