import { getCurrentChatModel, getCurrentLocalServer } from '@/entrypoints/background/states/models';
import type { Language } from '@/hooks/language';
import { formatImagesForMessage } from '@/lib/imageFormatHelper';
import { ImageTextBlock, imageScale, imageTiles, parseImageBlocks } from '@/lib/imageTranslation';
import { cacheTranslations, getCachedTranslations } from '@/lib/indexDB';
import { getModelInstance, isLocalModel } from '@/lib/models';
import { modelSupportsImages } from '@/lib/modelRegistry';
import { getImageTranslationPrompt, IMAGE_TRANSLATION_JSON_SCHEMA } from '@/lib/prompts';
import { trackTokenUsage } from '@/lib/tokenUsageTracker';
import { errorLog } from '@/logs';
import { getChatModelPreset } from '@/services/background/chatModelHandler';
import { AIMessage, AIMessageChunk, HumanMessage } from '@langchain/core/messages';

// An image on a page, translated by the chat model (lib/imageTranslation.ts). The background
// fetches it, since a page's scripts may not read another site's image; a page that serves its
// images only to itself sends its own copy (`dataUrl`). The answer is kept with the page
// translations, by the image's address, for 30 days.

export type ImageTranslationResult =
  | { success: true; blocks: ImageTextBlock[] }
  | { success: false; error: 'no_image_model' | 'unreadable' | 'failed'; message?: string };

const cacheKey = async (model: string, language: string, srcUrl: string) => {
  const bytes = new TextEncoder().encode(`image\u0000${model}\u0000${language}\u0000${srcUrl}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const imageBlob = async (srcUrl: string, dataUrl?: string): Promise<Blob | null> => {
  try {
    const response = await fetch(dataUrl ?? srcUrl, { credentials: 'include' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.type.startsWith('image/') || dataUrl ? blob : null;
  } catch {
    return null;
  }
};

// The image scaled for the model and cut into tiles, each a JPEG data URL.
const tilesOf = async (blob: Blob) => {
  const bitmap = await createImageBitmap(blob);
  const scale = imageScale(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const tiles = imageTiles(width, height);
  const urls: string[] = [];
  for (const tile of tiles) {
    const canvas = new OffscreenCanvas(width, tile.height);
    const context = canvas.getContext('2d')!;
    // Transparent PNGs turn black as JPEG without a background.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, tile.height);
    context.drawImage(bitmap, 0, tile.top / scale, bitmap.width, tile.height / scale, 0, 0, width, tile.height);
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    urls.push(`data:image/jpeg;base64,${toBase64(new Uint8Array(await jpeg.arrayBuffer()))}`);
  }
  bitmap.close();
  return { tiles, urls, height };
};

export const translateImage = async (
  srcUrl: string,
  dataUrl: string | undefined,
  targetLanguage: Language,
  title: string
): Promise<ImageTranslationResult> => {
  const modelPreset = getChatModelPreset();
  const localServer = getCurrentLocalServer() ?? undefined;
  if (!modelSupportsImages(getCurrentChatModel(), localServer)) return { success: false, error: 'no_image_model' };
  // An image drawn by the page itself (blob:, data:) has no lasting address to remember it by.
  const key = /^https?:/.test(srcUrl) ? await cacheKey(modelPreset.modelName, targetLanguage, srcUrl) : null;
  if (key) {
    const [cached] = await getCachedTranslations([key]).catch(() => [undefined]);
    if (cached) {
      try {
        return { success: true, blocks: JSON.parse(cached) as ImageTextBlock[] };
      } catch {
        // Read it again below.
      }
    }
  }
  const blob = await imageBlob(srcUrl, dataUrl);
  if (!blob) return { success: false, error: 'unreadable' };
  try {
    const { tiles, urls, height } = await tilesOf(blob);
    const local = isLocalModel(modelPreset.modelName);
    const llm = getModelInstance({
      temperature: 0.2,
      maxTokens: 4000,
      streaming: local,
      modelPreset,
      jsonSchema: IMAGE_TRANSLATION_JSON_SCHEMA,
    });
    const prompt = getImageTranslationPrompt(targetLanguage, title);
    const answers = await Promise.all(
      urls.map(async (url) => {
        const messages = [
          new HumanMessage({
            content: [
              { type: 'text', text: prompt },
              ...formatImagesForMessage([url], modelPreset.modelName, modelPreset.connectionMode, localServer),
            ] as any,
          }),
        ];
        // A slow local model's single response can outlast the service worker's fetch limit.
        let response: AIMessage | AIMessageChunk | undefined;
        if (local) {
          for await (const chunk of await llm.stream(messages)) {
            response = response ? (response as AIMessageChunk).concat(chunk) : chunk;
          }
        } else {
          response = await llm.invoke(messages);
        }
        if (response) await trackTokenUsage(modelPreset, response);
        return response?.text ?? '';
      })
    );
    const blocks = answers.flatMap((answer, i) => parseImageBlocks(answer, tiles[i], height));
    if (key) await cacheTranslations([{ key, translation: JSON.stringify(blocks) }]).catch(() => {});
    return { success: true, blocks };
  } catch (error) {
    errorLog('translateImage failed:', error);
    return { success: false, error: 'failed', message: (error as Error)?.message };
  }
};
