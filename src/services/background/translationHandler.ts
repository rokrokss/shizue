import { getTranslationTargetLanguage } from '@/entrypoints/background/states/language';
import {
  getCurrentAnthropicKey,
  getCurrentConnectionMode,
  getCurrentGeminiKey,
  getCurrentOpenaiKey,
  getCurrentOpenrouterKey,
  getCurrentTranslateModel,
} from '@/entrypoints/background/states/models';
import { ModelPreset, getModelInstance } from '@/lib/models';
import {
  getHtmlTranslationBatchPrompt,
  getHtmlTranslationPrompt,
  getYoutubeCaptionTranslationPrompt,
} from '@/lib/prompts';
import { trackTokenUsage } from '@/lib/tokenUsageTracker';
import { Caption, VideoMetadata } from '@/lib/youtube';
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

export interface YoutubeCaptionTranslationResult {
  success: boolean;
  captions?: Caption[];
  error?: string;
}

interface YoutubeCaptionTranslationJsonResponseFormat {
  translations: string[];
}

interface BatchTranslationJsonResponseFormat {
  translations: string[];
}

const TRANSLATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    translations: { type: 'array', items: { type: 'string' } },
  },
  required: ['translations'],
};

function getTranslationModelPreset(): ModelPreset {
  const openaiKey = getCurrentOpenaiKey();
  const geminiKey = getCurrentGeminiKey();
  const anthropicKey = getCurrentAnthropicKey();
  const openrouterKey = getCurrentOpenrouterKey();
  const connectionMode = getCurrentConnectionMode();
  const modelName = getCurrentTranslateModel();
  return { openaiKey, geminiKey, anthropicKey, openrouterKey, connectionMode, modelName };
}

/**
 * Removes markdown code fences (```json, ```, etc.) from JSON response
 * Some LLM models wrap JSON in markdown code blocks despite instructions
 */
function stripMarkdownCodeFence(content: string): string {
  const trimmed = content.trim();

  // Check if wrapped in markdown code fence (```json ... ``` or ``` ... ```)
  const codeBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = trimmed.match(codeBlockRegex);

  if (match) {
    return match[1].trim();
  }

  return trimmed;
}

export class TranslationHandler {
  constructor() {}

  public async translateYoutubeCaption(
    captions: Caption[],
    targetLanguage: Language,
    metadata: VideoMetadata
  ): Promise<YoutubeCaptionTranslationResult> {
    try {
      const prompt = getYoutubeCaptionTranslationPrompt(captions, targetLanguage, metadata);
      const modelPreset = getTranslationModelPreset();

      const llm = getModelInstance({
        temperature: 0.1,
        streaming: false,
        fast: true,
        modelPreset: modelPreset,
        jsonSchema: TRANSLATIONS_JSON_SCHEMA,
      });

      debugLog('TranslationHandler [translateYoutubeCaption] modelPreset:', modelPreset);
      debugLog('TranslationHandler [translateYoutubeCaption] llm:', llm);

      debugLog('TranslationHandler [translateYoutubeCaption] prompt:', prompt);
      const response = await llm.invoke([new HumanMessage(prompt)]);
      await trackTokenUsage(modelPreset, response);

      const rawResponseContent = response.text.trim();

      debugLog(
        'TranslationHandler [translateYoutubeCaption] raw response from AI:',
        rawResponseContent
      );

      let parsedResponse: YoutubeCaptionTranslationJsonResponseFormat;
      try {
        const cleanedContent = stripMarkdownCodeFence(rawResponseContent);
        parsedResponse = JSON.parse(cleanedContent);
      } catch (parseError) {
        errorLog(
          'TranslationHandler [translateYoutubeCaption] JSON parsing error:',
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
          'TranslationHandler [translateYoutubeCaption] JSON validation error:',
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

      if (translatedTextsArray.length !== captions.length) {
        const countMismatchErrorMsg = `Number of translated texts (${translatedTextsArray.length}) does not match input size (${captions.length}).`;
        errorLog(
          'ChatModelHandler [translateYoutubeCaption] Item count mismatch error:',
          countMismatchErrorMsg
        );
        return {
          success: false,
          error: `Item count mismatch in AI response. Details: ${countMismatchErrorMsg}`,
        };
      }

      return {
        success: true,
        captions: captions.map((c, index) => ({
          ...c,
          text: translatedTextsArray[index],
        })),
      };
    } catch (err) {
      errorLog('TranslationHandler [translateYoutubeCaption] general error:', err);
      return {
        success: false,
        error: `General error during Youtube Caption translation. Error: ${
          (err as Error).message ?? String(err)
        }`,
      };
    }
  }

  public async translateHtmlText(text: string): Promise<TranslationResult> {
    try {
      const targetLanguage = getTranslationTargetLanguage();
      const prompt = getHtmlTranslationPrompt(text, targetLanguage);
      const modelPreset = getTranslationModelPreset();

      const llm = getModelInstance({
        temperature: 0.1,
        maxTokens: 8000,
        streaming: false,
        modelPreset: modelPreset,
      });

      debugLog('TranslationHandler [translateHtmlText] llm:', llm);

      const response = await llm.invoke([new HumanMessage(prompt)]);

      await trackTokenUsage(modelPreset, response);

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
      const modelPreset = getTranslationModelPreset();

      const llm = getModelInstance({
        temperature: 0.1,
        maxTokens: 5000,
        streaming: false,
        fast: true,
        modelPreset: modelPreset,
        jsonSchema: TRANSLATIONS_JSON_SCHEMA,
      });

      debugLog('TranslationHandler [translateHtmlTextBatch] llm:', llm);

      const response = await llm.invoke([new HumanMessage(batchPrompt)]);

      await trackTokenUsage(modelPreset, response);

      const rawResponseContent = response.text.trim();

      debugLog(
        'TranslationHandler [translateHtmlTextBatch] raw response from AI:',
        rawResponseContent
      );

      let parsedResponse: BatchTranslationJsonResponseFormat;
      try {
        const cleanedContent = stripMarkdownCodeFence(rawResponseContent);
        parsedResponse = JSON.parse(cleanedContent);
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
