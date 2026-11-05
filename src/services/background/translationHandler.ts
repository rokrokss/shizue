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
import { ModelPreset, getModelInstance, getModelSpec, isChatGPTModel, isLocalModel } from '@/lib/models';
import { createNumberedLineReader } from '@/lib/numberedLines';
import type { TranslationContext } from '@/lib/liveCaption/types';
import {
  getHtmlTranslationBatchPrompt,
  getHtmlTranslationPrompt,
  getLiveCaptionTranslationPrompt,
  getSubtitleTranslationPrompt,
  getWordMeaningPrompt,
  getYoutubeCaptionTranslationPrompt,
  LiveCaptionMetadata,
  PageContext,
  SubtitleMetadata,
} from '@/lib/prompts';
import { cacheTranslations, getCachedTranslations } from '@/lib/indexDB';
import { warmUpChatGPT } from '@/services/background/chatgpt';
import { rateLimitWaitMs } from '@/lib/rateLimit';
import { trackTokenUsage } from '@/lib/tokenUsageTracker';
import { parseWordMeaning, WORD_MEANING_JSON_SCHEMA, WordMeaning } from '@/lib/wordLookup';
import { VideoMetadata } from '@/lib/youtube';
import { debugLog, errorLog } from '@/logs';
import { AIMessage, AIMessageChunk, HumanMessage } from '@langchain/core/messages';

export interface TranslationResult {
  success: boolean;
  translatedText?: string;
  error?: string;
}

// An empty translation means the snippet needs none; null, that it couldn't be translated.
export interface BatchTranslationResult {
  success: boolean;
  translatedTexts?: (string | null)[];
  error?: string;
}

interface HtmlTranslationsResult {
  success: boolean;
  translatedTexts?: string[];
  error?: string;
}

// Saved translations are found by model, target language and snippet, never by the page.
const translationCacheKey = async (model: string, language: string, text: string) => {
  const bytes = new TextEncoder().encode(`${model}\u0000${language}\u0000${text}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export interface YoutubeCaptionRequest {
  lines: string[];
  context: TranslationContext[];
  following: string[];
  targetLanguage: Language;
  metadata: VideoMetadata;
}

export interface LiveCaptionTranslationResult {
  success: boolean;
  translations?: string[];
  error?: string;
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
// batch on a slow local model can. A streamed response arrives with the first token. Local models
// must be built with `streaming` on: with it off, ChatOpenAI's stream() sends an unstreamed request.
async function requestTranslation(
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

// After a 429 every translation request waits, since they all count against the same limit
// (lib/rateLimit.ts). Chrome stops a service worker after 30 s without an event or an extension
// API call, so a longer wait makes a call every 20 s.
let rateLimitedUntil = 0;

async function waitForRateLimit() {
  for (let left = rateLimitedUntil - Date.now(); left > 0; left = rateLimitedUntil - Date.now()) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(left, 20_000)));
    await chrome.runtime.getPlatformInfo();
  }
}

async function invokeTranslation(
  llm: ReturnType<typeof getModelInstance>,
  prompt: string,
  modelPreset: ModelPreset
): Promise<AIMessage | AIMessageChunk> {
  for (let retry = 0; ; retry++) {
    await waitForRateLimit();
    try {
      return await requestTranslation(llm, prompt, modelPreset);
    } catch (error) {
      const wait = rateLimitWaitMs(error, retry);
      if (wait === undefined) throw error;
      debugLog(`TranslationHandler rate limited, retrying in ${wait} ms`);
      rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + wait);
    }
  }
}

// A saved chunk of caption translations, when it has one per line.
const savedLines = (saved: string | undefined, count: number): string[] | null => {
  if (saved === undefined) return null;
  try {
    const lines = JSON.parse(saved);
    return Array.isArray(lines) && lines.length === count && lines.every((line) => typeof line === 'string')
      ? lines
      : null;
  } catch {
    return null;
  }
};

// Streams an answer of numbered lines (lib/numberedLines.ts), each going to `onLine` once it is
// complete. A rate limit before the first line waits and asks again, as invokeTranslation does; an
// error after some lines ends the answer there, and the lines missing are asked again.
async function streamNumberedLines(
  prompt: string,
  count: number,
  modelPreset: ModelPreset,
  signal: AbortSignal,
  onLine: (index: number, text: string) => void
) {
  const llm = getModelInstance({
    temperature: 0.1,
    // The ChatGPT plan model always streams, and with `streaming` it would also ask for its thinking.
    streaming: !isChatGPTModel(modelPreset.modelName),
    fast: true,
    modelPreset,
  });
  for (let retry = 0; ; retry++) {
    await waitForRateLimit();
    signal.throwIfAborted();
    const reader = createNumberedLineReader(count, onLine);
    let aggregated: AIMessageChunk | undefined;
    let heard = false;
    try {
      for await (const chunk of await llm.stream([new HumanMessage(prompt)], { signal })) {
        aggregated = aggregated ? aggregated.concat(chunk) : chunk;
        if (chunk.text) {
          heard = true;
          reader.push(chunk.text);
        }
      }
      reader.end();
      if (aggregated) await trackTokenUsage(modelPreset, aggregated);
      return;
    } catch (error) {
      if (aggregated) await trackTokenUsage(modelPreset, aggregated);
      if (signal.aborted) throw error;
      if (heard) {
        errorLog('TranslationHandler [streamNumberedLines] answer cut short:', error);
        reader.end();
        return;
      }
      const wait = rateLimitWaitMs(error, retry);
      if (wait === undefined) throw error;
      debugLog(`TranslationHandler rate limited, retrying in ${wait} ms`);
      rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + wait);
    }
  }
}

// Where each provider's API answers. Local servers are near enough to need no warming.
const API_ORIGINS = {
  'openai-api-key': 'https://api.openai.com',
  'gemini-api-key': 'https://generativelanguage.googleapis.com',
  'anthropic-api-key': 'https://api.anthropic.com',
  'openrouter-api-key': 'https://openrouter.ai',
} as const;

const WARM_UP_INTERVAL_MS = 30_000;
let warmedUpAt = 0;

export class TranslationHandler {
  constructor() {}

  // Before a video's first caption chunk. The message asking for this already woke the worker and
  // loaded its state; a ChatGPT sign-in also gets a fresh token and its model list, and a connection
  // to the model's server opens, so the first request skips the TLS handshake. Only a HEAD is sent.
  public async warmUp() {
    if (Date.now() - warmedUpAt < WARM_UP_INTERVAL_MS) return;
    warmedUpAt = Date.now();
    const { modelName, connectionMode } = getTranslationModelPreset();
    if (isLocalModel(modelName)) return;
    const chatGPT = isChatGPTModel(modelName);
    const provider = chatGPT
      ? 'openai-api-key'
      : connectionMode === 'openrouter'
        ? 'openrouter-api-key'
        : getModelSpec(modelName)?.provider;
    try {
      await Promise.all([
        chatGPT ? warmUpChatGPT() : undefined,
        provider ? fetch(API_ORIGINS[provider], { method: 'HEAD', cache: 'no-store' }) : undefined,
      ]);
    } catch (error) {
      debugLog('TranslationHandler [warmUp] failed:', error);
    }
  }

  // One chunk of YouTube captions, each line handed to `onLine` as the model writes it (by its
  // index in the chunk). Lines the answer skipped are asked once more on their own; one still
  // missing comes back ''. A chunk translated before, by the same model into the same language,
  // comes from the saved translations.
  public async streamYoutubeCaption(
    { lines, context, following, targetLanguage, metadata }: YoutubeCaptionRequest,
    onLine: (index: number, text: string) => void,
    signal: AbortSignal
  ): Promise<string[]> {
    const modelPreset = getTranslationModelPreset();
    const key = await translationCacheKey(
      modelPreset.modelName,
      targetLanguage,
      `youtube-caption\u0000${JSON.stringify(lines)}`
    );
    const saved = savedLines(await getCachedTranslations([key]).then(([row]) => row), lines.length);
    if (saved) {
      saved.forEach((text, index) => onLine(index, text));
      return saved;
    }

    const translations: (string | undefined)[] = new Array(lines.length).fill(undefined);
    const ask = (indexes: number[]) => {
      const first = indexes[0];
      const last = indexes[indexes.length - 1];
      // Asked again, a line keeps the ones the answer did give around it as context.
      const before = lines.slice(0, first).map((source, i) => ({ source, translation: translations[i] ?? '' }));
      const prompt = getYoutubeCaptionTranslationPrompt(
        indexes.map((index) => lines[index]),
        [...context, ...before],
        [...lines.slice(last + 1), ...following],
        targetLanguage,
        metadata
      );
      debugLog('TranslationHandler [streamYoutubeCaption] prompt:', prompt);
      return streamNumberedLines(prompt, indexes.length, modelPreset, signal, (i, text) => {
        translations[indexes[i]] = text;
        onLine(indexes[i], text);
      });
    };

    await ask(lines.map((_, index) => index));
    const missing = lines.map((_, index) => index).filter((index) => translations[index] === undefined);
    if (missing.length && !signal.aborted) {
      debugLog('TranslationHandler [streamYoutubeCaption] asking again for lines:', missing);
      await ask(missing);
    }
    const result = translations.map((text) => text ?? '');
    if (translations.every((text) => text !== undefined)) {
      await cacheTranslations([{ key, translation: JSON.stringify(result) }]);
    }
    return result;
  }

  public async translateLiveCaption(
    lines: string[],
    context: TranslationContext[],
    targetLanguage: Language,
    metadata: LiveCaptionMetadata
  ): Promise<LiveCaptionTranslationResult> {
    return this.translateLines(
      lines,
      (part) => getLiveCaptionTranslationPrompt(part, context, targetLanguage, metadata),
      'translateLiveCaption'
    );
  }

  // Netflix subtitles, with the lines around them as context.
  public async translateSubtitles(
    lines: string[],
    context: TranslationContext[],
    following: string[],
    targetLanguage: Language,
    metadata: SubtitleMetadata
  ): Promise<LiveCaptionTranslationResult> {
    // Saved like YouTube captions: a title watched again costs nothing.
    const key = await translationCacheKey(
      getCurrentTranslateModel(),
      targetLanguage,
      `subtitles\u0000${JSON.stringify(lines)}`
    );
    const saved = savedLines(await getCachedTranslations([key]).then(([row]) => row), lines.length);
    if (saved) return { success: true, translations: saved };
    const result = await this.translateLines(
      lines,
      (part) => getSubtitleTranslationPrompt(part, context, following, targetLanguage, metadata),
      'translateSubtitles'
    );
    // A part the halves retry gave up on comes back '' and is asked again next time.
    if (result.success && result.translations?.every((text, i) => text.trim() || !lines[i].trim())) {
      await cacheTranslations([{ key, translation: JSON.stringify(result.translations) }]);
    }
    return result;
  }

  // A word clicked in a caption line, explained by the translation model; null when it can't say.
  public async lookupWord(
    word: string,
    sentence: string,
    translation: string,
    targetLanguage: Language
  ): Promise<WordMeaning | null> {
    try {
      const modelPreset = getTranslationModelPreset();
      const llm = getModelInstance({
        temperature: 0.1,
        streaming: isLocalModel(modelPreset.modelName),
        fast: true,
        modelPreset,
        jsonSchema: WORD_MEANING_JSON_SCHEMA,
      });
      const response = await invokeTranslation(
        llm,
        getWordMeaningPrompt(word, sentence, translation, targetLanguage),
        modelPreset
      );
      await trackTokenUsage(modelPreset, response);
      const meaning = parseWordMeaning(response.text);
      if (!meaning) errorLog('TranslationHandler [lookupWord] invalid response:', response.text);
      return meaning;
    } catch (err) {
      errorLog('TranslationHandler [lookupWord] general error:', err);
      return null;
    }
  }

  // One translation per line, from a prompt that carries its own context.
  private async translateLines(
    lines: string[],
    buildPrompt: (lines: string[]) => string,
    name: string
  ): Promise<LiveCaptionTranslationResult> {
    try {
      const prompt = buildPrompt(lines);
      const modelPreset = getTranslationModelPreset();
      const llm = getModelInstance({
        temperature: 0.1,
        streaming: isLocalModel(modelPreset.modelName),
        fast: true,
        modelPreset,
        jsonSchema: translationsSchemaFor(modelPreset, lines.length),
      });
      debugLog(`TranslationHandler [${name}] prompt:`, prompt);
      const response = await invokeTranslation(llm, prompt, modelPreset);
      await trackTokenUsage(modelPreset, response);

      const rawResponseContent = response.text.trim();
      let translations: unknown;
      try {
        translations = JSON.parse(stripMarkdownCodeFence(rawResponseContent))?.translations;
      } catch (parseError) {
        errorLog(`TranslationHandler [${name}] JSON parsing error:`, rawResponseContent);
        return { success: false, error: `Failed to parse model response. Error: ${(parseError as Error).message}` };
      }
      if (!Array.isArray(translations) || !translations.every((item) => typeof item === 'string')) {
        errorLog(`TranslationHandler [${name}] invalid response:`, rawResponseContent);
        return { success: false, error: "AI response is not a JSON object with a 'translations' array of strings." };
      }
      if (translations.length !== lines.length) {
        errorLog(`TranslationHandler [${name}] item count mismatch:`, translations.length, lines.length);
        if (lines.length > 1) return this.translateLinesInHalves(lines, buildPrompt, name);
        return { success: false, error: `Item count mismatch: ${translations.length} for ${lines.length}.` };
      }
      return { success: true, translations };
    } catch (err) {
      errorLog(`TranslationHandler [${name}] general error:`, err);
      return { success: false, error: `Caption translation failed: ${(err as Error).message ?? String(err)}` };
    }
  }

  // Same recovery as YouTube captions: a batch whose count comes back wrong is retried in halves,
  // and a part that still fails comes back as an empty string.
  private async translateLinesInHalves(
    lines: string[],
    buildPrompt: (lines: string[]) => string,
    name: string
  ): Promise<LiveCaptionTranslationResult> {
    const middle = Math.ceil(lines.length / 2);
    const parts = [lines.slice(0, middle), lines.slice(middle)];
    const results = await Promise.all(parts.map((part) => this.translateLines(part, buildPrompt, name)));
    return {
      success: true,
      translations: results.flatMap((result, i) =>
        result.success && result.translations ? result.translations : parts[i].map(() => '')
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

  public async translateHtmlTextBatch(
    textBatch: string[],
    context?: PageContext
  ): Promise<BatchTranslationResult> {
    if (!textBatch || textBatch.length === 0) {
      debugLog('TranslationHandler [translateHtmlTextBatch] received empty batch.');
      return { success: false, error: 'Empty batch provided.' };
    }

    try {
      const modelPreset = getTranslationModelPreset();
      const targetLanguage = getTranslationTargetLanguage();
      const keys = await Promise.all(
        textBatch.map((text) => translationCacheKey(modelPreset.modelName, targetLanguage, text))
      );
      const translatedTexts: (string | null | undefined)[] = await getCachedTranslations(keys).catch(
        (error) => {
          errorLog('TranslationHandler [translateHtmlTextBatch] cache read failed:', error);
          return keys.map(() => undefined);
        }
      );
      const missing = textBatch.flatMap((_, i) => (translatedTexts[i] === undefined ? [i] : []));
      if (missing.length > 0) {
        const texts = missing.map((i) => textBatch[i]);
        const fresh = isLocalModel(modelPreset.modelName)
          ? await this.translateHtmlTextBatchLocally(texts, modelPreset, context)
          : await this.translateHtmlInHalves(texts, modelPreset, context);
        missing.forEach((index, j) => (translatedTexts[index] = fresh[j]));
        void cacheTranslations(
          missing.flatMap((index, j) =>
            fresh[j] === null ? [] : [{ key: keys[index], translation: fresh[j] as string }]
          )
        ).catch((error) => errorLog('TranslationHandler [translateHtmlTextBatch] cache write failed:', error));
      }
      debugLog(
        `TranslationHandler [translateHtmlTextBatch] ${textBatch.length - missing.length} of ${textBatch.length} from saved translations`
      );
      return { success: true, translatedTexts: translatedTexts as (string | null)[] };
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

  // A response whose JSON is broken or whose count is wrong is retried in halves, down to single
  // snippets. One that still fails on its own comes back as null, and the page offers to try it
  // again. An error from the request itself (network, key, quota) fails the whole batch at once.
  private async translateHtmlInHalves(
    texts: string[],
    modelPreset: ModelPreset,
    context?: PageContext
  ): Promise<(string | null)[]> {
    const result = await this.requestHtmlTranslations(texts, modelPreset, context);
    if (result.success && result.translatedTexts) return result.translatedTexts;
    if (texts.length === 1) return [null];
    debugLog('TranslationHandler [translateHtmlTextBatch] retrying in halves:', texts.length);
    const middle = Math.ceil(texts.length / 2);
    const parts = await Promise.all(
      [texts.slice(0, middle), texts.slice(middle)].map((part) =>
        this.translateHtmlInHalves(part, modelPreset, context)
      )
    );
    return parts.flat();
  }

  // A request whose JSON is broken or whose count is wrong is retried one snippet at a time; a
  // snippet that still fails comes back as null.
  private async translateHtmlTextBatchLocally(
    textBatch: string[],
    modelPreset: ModelPreset,
    context?: PageContext
  ): Promise<(string | null)[]> {
    const translatedTexts: (string | null)[] = [];
    for (let i = 0; i < textBatch.length; i += LOCAL_TRANSLATION_BATCH_SIZE) {
      const chunk = textBatch.slice(i, i + LOCAL_TRANSLATION_BATCH_SIZE);
      const result = await this.requestHtmlTranslations(chunk, modelPreset, context);
      if (result.success && result.translatedTexts) {
        translatedTexts.push(...result.translatedTexts);
        continue;
      }
      for (const text of chunk) {
        const single = await this.requestHtmlTranslations([text], modelPreset, context);
        translatedTexts.push(single.translatedTexts?.[0] ?? null);
      }
    }
    return translatedTexts;
  }

  private async requestHtmlTranslations(
    textBatch: string[],
    modelPreset: ModelPreset,
    context?: PageContext
  ): Promise<HtmlTranslationsResult> {
    const targetLanguage = getTranslationTargetLanguage();
    const serializedTextBatch = JSON.stringify(textBatch, null, 2);

    const batchPrompt = getHtmlTranslationBatchPrompt(serializedTextBatch, targetLanguage, context);

    const llm = getModelInstance({
      temperature: 0.1,
      maxTokens: 5000,
      streaming: isLocalModel(modelPreset.modelName),
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
