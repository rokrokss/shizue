import tailwindRaw from '@/assets/tailwind.css?inline';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import { Language } from '@/hooks/language';
import { Caption, TranscriptMetadata, VideoMetadata } from '@/lib/youtube';
import { debugLog, errorLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { translationService } from '@/services/translationService';
import { StyleProvider as AntdStyleProvider } from '@ant-design/cssinjs';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

const CUSTOM_CAPTION_ID = 'shizue-custom-caption';
const CAPTION_CHUNK_SIZE = 10;

export class CaptionInjector {
  private customCaptionRoot: Root | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private targetLanguage: Language = 'English';
  private captionCache: Map<Language, Caption[]> = new Map();
  private currentTime: number = 0;
  private numLines = 1;
  private currentCaptionLines: string[] = [];
  private lastFoundCaptionIndex: number | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private transcriptMetadata: TranscriptMetadata[] = [];
  private videoMetadata: VideoMetadata | null = null;
  private isTranslating = false;
  private translatedChunks = new Set<number>();
  private priorityChunkQueue = new Set<number>();
  private sequentialChunkIndex = 0;

  constructor() {
    this.handleVideoSeeked = this.handleVideoSeeked.bind(this);
  }

  public setMetaData = (transcriptMetadata: TranscriptMetadata[], videoMetadata: VideoMetadata) => {
    this.transcriptMetadata = transcriptMetadata;
    this.videoMetadata = videoMetadata;
  };

  public setVideoElement = (videoElement: HTMLVideoElement) => {
    if (this.videoElement) {
      this.videoElement.removeEventListener('seeked', this.handleVideoSeeked);
    }
    this.videoElement = videoElement;
    this.videoElement.addEventListener('seeked', this.handleVideoSeeked);
  };

  private _getChunkIndexFromTime(time: number): number | null {
    const baseLanguage = this.transcriptMetadata[0]?.language;
    if (!baseLanguage) return null;

    const baseCaptions = this.captionCache.get(baseLanguage);
    if (!baseCaptions) return null;

    const targetCaptionIndex = baseCaptions.findIndex(
      (c) => time >= c.startTime && time < c.endTime
    );

    if (targetCaptionIndex === -1) {
      if (time > baseCaptions[baseCaptions.length - 1].endTime) {
        return Math.floor((baseCaptions.length - 1) / CAPTION_CHUNK_SIZE);
      }
      return null;
    }

    return Math.floor(targetCaptionIndex / CAPTION_CHUNK_SIZE);
  }

  private handleVideoSeeked() {
    debugLog('[YouTube] handleVideoSeeked', this.isTranslating, this.videoElement);
    if (!this.isTranslating || !this.videoElement) return;

    const seekedTime = this.videoElement.currentTime;

    const chunkIndex = this._getChunkIndexFromTime(seekedTime);
    if (chunkIndex === null) return;

    const chunkStartIndex = chunkIndex * CAPTION_CHUNK_SIZE;

    if (!this.translatedChunks.has(chunkStartIndex)) {
      debugLog(`[YouTube] Seek detected. Prioritizing chunk starting at index ${chunkStartIndex}`);
      this.priorityChunkQueue.add(chunkStartIndex);
      this.sequentialChunkIndex = chunkIndex;
      debugLog(`[YouTube] Sequential translation index reset to ${chunkIndex}`);
    }
  }

  private findCaptionIndex = (time: number): number | null => {
    const allCaptions = this.captionCache.get(this.targetLanguage) ?? [];
    if (allCaptions.length === 0) return null;

    if (this.lastFoundCaptionIndex !== null) {
      const lastCaption = allCaptions[this.lastFoundCaptionIndex];
      if (lastCaption && time >= lastCaption.startTime && time < lastCaption.endTime) {
        return this.lastFoundCaptionIndex;
      }
    }

    let lo = 0,
      hi = allCaptions.length - 1;
    let foundIndex: number | null = null;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = allCaptions[mid];
      if (time < c.startTime) {
        hi = mid - 1;
      } else if (time >= c.endTime) {
        lo = mid + 1;
      } else {
        foundIndex = mid;
        break;
      }
    }

    this.lastFoundCaptionIndex = foundIndex;
    return foundIndex;
  };

  public updateCurrentTime = () => {
    if (!this.videoElement || !this.customCaptionRoot) return true;

    this.currentTime = this.videoElement.currentTime;
    const allCaptions = this.captionCache.get(this.targetLanguage) ?? [];

    const currentIndex = this.findCaptionIndex(this.currentTime);

    let isCurrentCaptionTranslated = true;

    if (currentIndex) {
      const chunkStartIndex = Math.floor(currentIndex / CAPTION_CHUNK_SIZE) * CAPTION_CHUNK_SIZE;
      if (!this.translatedChunks.has(chunkStartIndex)) {
        isCurrentCaptionTranslated = false;
      }
    }

    let newLines: string[] = [];
    if (currentIndex !== null) {
      const startIndex = Math.max(0, currentIndex - this.numLines + 1);
      newLines = allCaptions.slice(startIndex, currentIndex + 1).map((c) => c.text);
    }

    if (JSON.stringify(newLines) !== JSON.stringify(this.currentCaptionLines)) {
      this.currentCaptionLines = newLines;

      this.customCaptionRoot!.render(
        <StrictMode>
          <JotaiProvider>
            <LanguageProvider loadingComponent={null}>
              <AntdStyleProvider container={this.shadowRoot!}>
                <AntdProvider>
                  <CaptionDisplay lines={this.currentCaptionLines} />
                </AntdProvider>
              </AntdStyleProvider>
            </LanguageProvider>
          </JotaiProvider>
        </StrictMode>
      );
    }

    return isCurrentCaptionTranslated;
  };

  private async fetchNativeCaptions(language: Language): Promise<Caption[] | null> {
    const metadata = this.transcriptMetadata.find((m) => m.language === language);
    if (!metadata) return null;

    try {
      const response = await fetch(metadata.baseUrl);
      const data = await response.json();
      const captions = data.events
        .filter((event: any) => event.segs)
        .map((event: any) => ({
          startTime: event.tStartMs / 1000,
          endTime: (event.tStartMs + event.dDurationMs) / 1000,
          text: event.segs
            .map((seg: any) => seg.utf8)
            .join('')
            .trim(),
        }))
        .filter((caption: Caption) => caption.text.length > 0);

      return captions;
    } catch (err) {
      errorLog(`[YouTube] Failed to fetch captions for ${language}`, err);
      return null;
    }
  }

  private async startStreamingTranslation() {
    if (this.isTranslating) return;

    this.isTranslating = true;
    this.priorityChunkQueue.clear();

    try {
      const nativeCaptions = await this.fetchNativeCaptions(this.targetLanguage);
      if (nativeCaptions) {
        this.captionCache.set(this.targetLanguage, nativeCaptions);
        debugLog('[YouTube] Using native captions for', this.targetLanguage);
        this.isTranslating = false;
        return;
      }

      if (!this.captionCache.has(this.targetLanguage)) {
        debugLog(`[YouTube] No cache for ${this.targetLanguage}. Initializing new translation.`);

        const baseLanguage = this.transcriptMetadata[0]?.language;
        const baseCaptions = await this.fetchNativeCaptions(baseLanguage);
        if (!baseCaptions) {
          throw new Error(`Could not fetch base captions for ${baseLanguage}`);
        }
        this.captionCache.set(baseLanguage, baseCaptions);

        const currentTime = this.videoElement?.currentTime ?? 0;
        const currentChunkIndex = this._getChunkIndexFromTime(currentTime) ?? 0;

        this.sequentialChunkIndex = currentChunkIndex;
        debugLog(
          `[YouTube] Initializing sequential index to ${currentChunkIndex} based on current time.`
        );

        this.translatedChunks.clear();
        this.priorityChunkQueue.clear();
        this.captionCache.set(this.targetLanguage, [...baseCaptions]);
      }

      const baseCaptions = this.captionCache.get(this.transcriptMetadata[0]?.language)!;
      const totalChunks = Math.ceil(baseCaptions.length / CAPTION_CHUNK_SIZE);

      if (this.translatedChunks.size >= totalChunks) {
        debugLog('[YouTube] All chunks already translated.');
        this.isTranslating = false;
        return;
      }

      debugLog(`[YouTube] Starting or resuming chunk translation to ${this.targetLanguage}`);

      while (this.translatedChunks.size < totalChunks) {
        if (!this.isTranslating) {
          debugLog('[YouTube] Translation cancelled.');
          break;
        }

        let chunkStartIndex: number | undefined = undefined;

        if (this.priorityChunkQueue.size > 0) {
          chunkStartIndex = this.priorityChunkQueue.values().next().value!;
          this.priorityChunkQueue.delete(chunkStartIndex);
        } else {
          const nextIndex = this.sequentialChunkIndex * CAPTION_CHUNK_SIZE;
          if (nextIndex < baseCaptions.length && !this.translatedChunks.has(nextIndex)) {
            chunkStartIndex = nextIndex;
          }
          this.sequentialChunkIndex++;
        }

        if (chunkStartIndex === undefined) {
          // wait for queued chunks to resolve
          if (this.translatedChunks.size < totalChunks) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          } else {
            break;
          }
        }

        if (this.translatedChunks.has(chunkStartIndex)) {
          continue;
        }

        const chunk = baseCaptions.slice(chunkStartIndex, chunkStartIndex + CAPTION_CHUNK_SIZE);

        const result = await translationService.translateYoutubeCaption(
          chunk,
          this.targetLanguage,
          this.videoMetadata!
        );

        if (result.success && result.captions) {
          const targetCache = this.captionCache.get(this.targetLanguage);
          if (targetCache) {
            result.captions.forEach((caption, i) => {
              targetCache[chunkStartIndex! + i] = caption;
            });
          }
        } else {
          errorLog(
            `[YouTube] Failed to translate chunk at index ${chunkStartIndex}:`,
            result.error
          );
        }

        this.translatedChunks.add(chunkStartIndex);
      }

      debugLog('[YouTube] Finished all translation chunks.');
    } finally {
      debugLog('[YouTube] Streaming translation finished.');
      this.isTranslating = false;
    }
  }

  public activate = async (targetLanguage: Language, numLines: number) => {
    if (document.getElementById(CUSTOM_CAPTION_ID)) {
      this.deactivate();
    }

    this.numLines = numLines;
    this.targetLanguage = targetLanguage;

    this.videoElement = document.querySelector('video');

    document
      .querySelectorAll<HTMLDivElement>('.ytp-caption-window-container')
      .forEach((el) => (el.style.display = 'none'));

    const container = document.createElement('div');
    container.id = CUSTOM_CAPTION_ID;
    container.className = 'ytp-caption-window-container';

    const windowBottom = document.createElement('div');
    windowBottom.className = 'caption-window ytp-caption-window-bottom';
    windowBottom.style.bottom = '2%';
    windowBottom.style.textAlign = 'center';
    windowBottom.style.left = '50%';
    windowBottom.style.transform = 'translateX(-50%)';
    windowBottom.style.width = 'max-content';
    windowBottom.style.maxWidth = '90%';

    const shadowHost = document.createElement('div');
    shadowHost.dir = 'ltr';
    shadowHost.style.display = 'contents';

    windowBottom.appendChild(shadowHost);
    container.appendChild(windowBottom);
    document.querySelector('.html5-video-player')?.appendChild(container);

    this.shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(tailwindRaw);
    this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, sheet];
    const reactMountPoint = document.createElement('div');
    this.shadowRoot.appendChild(reactMountPoint);

    this.customCaptionRoot = createRoot(reactMountPoint);
    this.customCaptionRoot.render(
      <StrictMode>
        <JotaiProvider>
          <LanguageProvider loadingComponent={null}>
            <AntdStyleProvider container={this.shadowRoot}>
              <AntdProvider>
                <CaptionDisplay lines={[]} />
              </AntdProvider>
            </AntdStyleProvider>
          </LanguageProvider>
        </JotaiProvider>
      </StrictMode>
    );

    this.startStreamingTranslation().catch((err) => {
      errorLog('[YouTube] Streaming translation failed:', err);
      this.deactivate(); // Clean up on failure
    });
  };

  public deactivate = () => {
    debugLog('[YouTube] deactivate');
    this.isTranslating = false;
    const host = document.getElementById(CUSTOM_CAPTION_ID);

    this.customCaptionRoot?.unmount();
    this.customCaptionRoot = null;
    this.shadowRoot = null;
    this.currentCaptionLines = [];

    if (host) {
      host.remove();
    }

    document
      .querySelectorAll<HTMLDivElement>('.ytp-caption-window-container')
      .forEach((el) => (el.style.display = 'block'));
  };

  public clear = () => {
    this.transcriptMetadata = [];
    this.videoMetadata = null;
    this.captionCache.clear();
    this.targetLanguage = 'English';
    this.lastFoundCaptionIndex = null;
    this.translatedChunks.clear();
    this.priorityChunkQueue.clear();
    if (this.videoElement) {
      this.videoElement.removeEventListener('seeked', this.handleVideoSeeked);
    }
    this.videoElement = null;
    this.deactivate();
  };
}

let captionInjector: CaptionInjector | null = null;

export const getCaptionInjector = (): CaptionInjector => {
  if (!captionInjector) {
    captionInjector = new CaptionInjector();
  }
  return captionInjector;
};
