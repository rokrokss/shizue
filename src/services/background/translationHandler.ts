import { getTranslationTargetLanguage } from '@/entrypoints/background/states/language';
import {
  getConnectionModeFor,
  getCurrentAnthropicKey,
  getCurrentGeminiKey,
  getLocalModelFor,
  getCurrentOpenaiKey,
  getCurrentOpenrouterKey,
  getCurrentTranslateModel,
} from '@/entrypoints/background/states/models';
import { ModelPreset, getModelInstance, isLocalModel } from '@/lib/models';
import {
  getHtmlTranslationBatchPrompt,
  getHtmlTranslationPrompt,
  getYoutubeCaptionTranslationPrompt,
} from '@/lib/prompts';
import { trackTokenUsage } from '@/lib/tokenUsageTracker';
import { Caption, VideoMetadata } from '@/lib/youtube';
import { debugLog, errorLog } from '@/logs';
import { AIMessage, AIMessageChunk, HumanMessage } from '@langchain/core/messages';

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
  const modelName = getCurrentTranslateModel();
  const localModel = getLocalModelFor(modelName);
  const connectionMode = getConnectionModeFor(modelName);
  return {
    openaiKey,
    geminiKey,
    anthropicKey,
    openrouterKey,
    localModel,
    connectionMode,
    modelName,
  };
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

// Local models get at most this many snippets per request. With qwen3.5:9b and gemma4:12b the item
// count held at 4, 8 and 16 alike, but at 8 qwen3.5:9b put translations in the wrong slots on a
// real page, and at 4 it kept them in place. That costs about 30% more time than 8.
const LOCAL_TRANSLATION_BATCH_SIZE = 4;

// Ollama ignores minItems/maxItems (llama.cpp enforces them), so counts are still checked after parsing.
const translationsSchemaFor = (modelPreset: ModelPreset, count: number) =>
  isLocalModel(modelPreset.modelName)
    ? {
        ...TRANSLATIONS_JSON_SCHEMA,
        properties: {
          translations: {
            type: 'array',
            items: { type: 'string' },
            minItems: count,
            maxItems: count,
          },
        },
      }
    : TRANSLATIONS_JSON_SCHEMA;

// MV3 stops the service worker when a fetch() response takes over 30 seconds to arrive, which one
// batch on a slow local model can. A streamed response arrives with the first token.
async function invokeTranslation(
  llm: ReturnType<typeof getModelInstance>,
  prompt: string,
  modelPreset: ModelPreset
): Promise<AIMessage | AIMessageChunk> {
  const messages = [new HumanMessage(prompt)];
  if (!isLocalModel(modelPreset.modelName)) return llm.invoke(messages);
  let aggregated: AIMessageChunk | undefined;
  for await (const chunk of await llm.stream(messages)) {
    aggregated = aggregated ? aggregated.concat(chunk) : chunk;
  }
  return aggregated ?? new AIMessageChunk('');
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
        jsonSchema: translationsSchemaFor(modelPreset, captions.length),
      });

      debugLog('TranslationHandler [translateYoutubeCaption] modelPreset:', modelPreset);
      debugLog('TranslationHandler [translateYoutubeCaption] llm:', llm);

      debugLog('TranslationHandler [translateYoutubeCaption] prompt:', prompt);
      const response = await invokeTranslation(llm, prompt, modelPreset);
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
        if (captions.length > 1) {
          debugLog('TranslationHandler [translateYoutubeCaption] retrying in halves:', captions.length);
          return this.translateYoutubeCaptionInHalves(captions, targetLanguage, metadata);
        }
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

  // The model sometimes merges two fragmentary caption lines into one, so a chunk whose line
  // count comes back wrong is retried in halves. Parts that still fail keep their original text.
  private async translateYoutubeCaptionInHalves(
    captions: Caption[],
    targetLanguage: Language,
    metadata: VideoMetadata
  ): Promise<YoutubeCaptionTranslationResult> {
    const middle = Math.ceil(captions.length / 2);
    const parts = [captions.slice(0, middle), captions.slice(middle)];
    const results = await Promise.all(
      parts.map((part) => this.translateYoutubeCaption(part, targetLanguage, metadata))
    );
    return {
      success: true,
      captions: results.flatMap((result, i) =>
        result.success && result.captions ? result.captions : parts[i]
      ),
    };
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
      const modelPreset = getTranslationModelPreset();
      if (isLocalModel(modelPreset.modelName)) {
        return await this.translateHtmlTextBatchLocally(textBatch, modelPreset);
      }
      return await this.requestHtmlTranslations(textBatch, modelPreset);
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

  // A request whose JSON is broken or whose count is wrong is retried one snippet at a time; a
  // snippet that still fails stays untranslated ('').
  private async translateHtmlTextBatchLocally(
    textBatch: string[],
    modelPreset: ModelPreset
  ): Promise<BatchTranslationResult> {
    const translatedTexts: string[] = [];
    for (let i = 0; i < textBatch.length; i += LOCAL_TRANSLATION_BATCH_SIZE) {
      const chunk = textBatch.slice(i, i + LOCAL_TRANSLATION_BATCH_SIZE);
      const result = await this.requestHtmlTranslations(chunk, modelPreset);
      if (result.success && result.translatedTexts) {
        translatedTexts.push(...result.translatedTexts);
        continue;
      }
      for (const text of chunk) {
        const single = await this.requestHtmlTranslations([text], modelPreset);
        translatedTexts.push(single.translatedTexts?.[0] ?? '');
      }
    }
    return { success: true, translatedTexts };
  }

  private async requestHtmlTranslations(
    textBatch: string[],
    modelPreset: ModelPreset
  ): Promise<BatchTranslationResult> {
    const targetLanguage = getTranslationTargetLanguage();
    const serializedTextBatch = JSON.stringify(textBatch, null, 2);

    const batchPrompt = getHtmlTranslationBatchPrompt(serializedTextBatch, targetLanguage);

    const llm = getModelInstance({
      temperature: 0.1,
      maxTokens: 5000,
      streaming: false,
      fast: true,
      modelPreset: modelPreset,
      jsonSchema: translationsSchemaFor(modelPreset, textBatch.length),
    });

    debugLog('TranslationHandler [translateHtmlTextBatch] llm:', llm);

    const response = await invokeTranslation(llm, batchPrompt, modelPreset);

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
  }
}

let translationHandler: TranslationHandler | null = null;

export const getTranslationHandler = (): TranslationHandler => {
  if (!translationHandler) {
    translationHandler = new TranslationHandler();
  }
  return translationHandler;
};
