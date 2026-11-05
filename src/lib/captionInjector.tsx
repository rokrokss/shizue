import tailwindRaw from '@/assets/tailwind.css?inline';
import { STORAGE_YOUTUBE_CAPTION_POSITION, STORAGE_YOUTUBE_CAPTION_SIZE_RATIO } from '@/config/constants';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import { Language } from '@/hooks/language';
import {
  CaptionPosition,
  DEFAULT_CAPTION_POSITION,
  isCaptionPosition,
  makeCaptionMovable,
  placeCaption,
} from '@/lib/captionMove';
import { createCueTranslator, CueTranslator } from '@/lib/netflix/cueTranslator';
import { alignCues } from '@/lib/netflix/subtitles';
import type { CaptionDisplayMode, CaptionStyle } from '@/hooks/layout';
import { srtFileName, toSrt } from '@/lib/srt';
import { Caption, fetchCaptionTrack, TranscriptMetadata, VideoMetadata } from '@/lib/youtube';
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
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
// Captions are translated from the line playing to 5 minutes past it (paused too), not to the
// video's end: a video left halfway costs half. Saving the translations asks for the rest.
const LOOKAHEAD_SECONDS = 300;
// Playback moves the translator on once a second of the video.
const POSITION_STEP_SECONDS = 1;

// A subtitle file holds the originals, the translations, or each original over its translation.
export type SubtitleKind = 'original' | 'translation' | 'bilingual';

export type CaptionLook = {
  numLines: number;
  display: CaptionDisplayMode;
  captionStyle: CaptionStyle;
  captionSizeRatio: number;
  // Speech recognition times its words: the one being said shows in color in the original.
  wordHighlight: boolean;
};

export class CaptionInjector {
  private customCaptionRoot: Root | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private targetLanguage: Language = 'English';
  private baseLanguage: Language = 'English';
  // The tracks fetched for this video, by language.
  private tracks: Map<Language, Caption[]> = new Map();
  // The captions shown: the target language's own track, or the original's being translated.
  private lines: Caption[] = [];
  private native = false;
  private translator: CueTranslator | null = null;
  private positionSentAt = -Infinity;
  // Bumped by each start and stop, so a track that arrives late belongs to nothing.
  private session = 0;
  private currentTime: number = 0;
  private numLines = 1;
  private display: CaptionDisplayMode = 'translation';
  private captionStyle: CaptionStyle = 'default';
  private captionSizeRatio = 1.0;
  private wordHighlight = false;
  private currentCaptionLines: string[] = [];
  private currentSpoken = '';
  private position: CaptionPosition = DEFAULT_CAPTION_POSITION;
  private stopMoving: (() => void) | null = null;
  private lastFoundCaptionIndex: number | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private transcriptMetadata: TranscriptMetadata[] = [];
  private videoMetadata: VideoMetadata | null = null;
  private originalTrack: TranscriptMetadata | undefined;
  // With the target language's own track, the original captions spoken over each of its captions.
  private nativeOriginalLines: string[] = [];

  constructor() {
    this.handleVideoSeeked = this.handleVideoSeeked.bind(this);
  }

  public setMetaData = (
    transcriptMetadata: TranscriptMetadata[],
    videoMetadata: VideoMetadata,
    originalTrack: TranscriptMetadata | undefined
  ) => {
    this.transcriptMetadata = transcriptMetadata;
    this.videoMetadata = videoMetadata;
    this.originalTrack = originalTrack;
  };

  public setVideoElement = (videoElement: HTMLVideoElement) => {
    if (this.videoElement) {
      this.videoElement.removeEventListener('seeked', this.handleVideoSeeked);
    }
    this.videoElement = videoElement;
    this.videoElement.addEventListener('seeked', this.handleVideoSeeked);
  };

  private handleVideoSeeked() {
    if (!this.translator || !this.videoElement) return;
    this.positionSentAt = this.videoElement.currentTime;
    this.translator.setPosition(this.positionSentAt);
  }

  public handlePressKeyToNextChunk = (backward: boolean) => {
    if (!this.videoElement) {
      debugLog('[YouTube] handlePressKeyToNextChunk, no video element');
      return;
    }

    const baseCaptions = this.lines;
    if (!baseCaptions.length) {
      debugLog('[YouTube] handlePressKeyToNextChunk, no captions');
      return;
    }

    debugLog('[YouTube] handlePressKeyToNextChunk, backward:', backward);
    debugLog('[YouTube] handlePressKeyToNextChunk, baseCaptions:', baseCaptions);

    const currentTime = this.videoElement.currentTime;
    debugLog('[YouTube] handlePressKeyToNextChunk, currentTime:', currentTime);

    let nextTime = -1;

    if (!backward) {
      for (let i = 0; i < baseCaptions.length; i++) {
        const caption = baseCaptions[i];
        if (caption.startTime > currentTime) {
          debugLog('[YouTube] handlePressKeyToNextChunk, caption:', caption);
          nextTime = caption.startTime;
          break;
        }
      }
    } else {
      for (let i = baseCaptions.length - 1; i >= 0; i--) {
        const caption = baseCaptions[i];
        if (caption.endTime < currentTime) {
          debugLog('[YouTube] handlePressKeyToNextChunk, caption:', caption);
          nextTime = caption.startTime;
          break;
        }
      }
    }

    if (nextTime !== -1) {
      this.videoElement.currentTime = nextTime;
    }
  };

  private findCaptionIndex = (time: number): number | null => {
    const allCaptions = this.lines;
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
    if (this.translator && Math.abs(this.currentTime - this.positionSentAt) >= POSITION_STEP_SECONDS) {
      this.positionSentAt = this.currentTime;
      this.translator.setPosition(this.currentTime);
    }

    const currentIndex = this.findCaptionIndex(this.currentTime);

    let isCurrentCaptionTranslated = true;
    let newLines: string[] = [];
    let originalLines: string[] = [];
    let spoken: { line: number; start: number; end: number } | null = null;
    if (currentIndex !== null) {
      const startIndex = Math.max(0, currentIndex - this.numLines + 1);
      const shown = this.lines.slice(startIndex, currentIndex + 1);
      if (this.native) {
        newLines = shown.map((c) => c.text);
        originalLines = this.nativeOriginalLines.slice(startIndex, currentIndex + 1);
      } else {
        // Untranslated, the lines are the originals.
        originalLines = shown.map((c) => c.text);
        newLines = shown.map((c, i) => this.translator?.translation(startIndex + i) ?? c.text);
        isCurrentCaptionTranslated = this.translator?.translation(currentIndex) !== undefined;
      }
      // A line the model left empty shows its original, as on Netflix, and a line that is its
      // original (its chunk failed) shows it once.
      newLines = newLines.map((line, i) => (line.trim() ? line : (originalLines[i] ?? line)));
      originalLines = originalLines.map((original, i) => (original === newLines[i] ? '' : original));

      // The word being said in the line playing, from speech recognition's own timings.
      const caption = this.lines[currentIndex];
      const line = currentIndex - startIndex;
      if (this.wordHighlight && !this.native && caption.words?.length && originalLines[line]) {
        const words = caption.words;
        let word = words.length - 1;
        while (word > 0 && words[word].time > this.currentTime) word--;
        if (words[word].time <= this.currentTime) {
          spoken = { line, start: words[word].offset, end: words[word + 1]?.offset ?? caption.text.length };
        }
      }
    }

    const spokenKey = spoken && isCurrentCaptionTranslated ? `${spoken.line}:${spoken.start}` : '';
    if (JSON.stringify(newLines) !== JSON.stringify(this.currentCaptionLines) || spokenKey !== this.currentSpoken) {
      this.currentCaptionLines = newLines;
      this.currentSpoken = spokenKey;

      this.customCaptionRoot!.render(
        <StrictMode>
          <JotaiProvider>
            <LanguageProvider loadingComponent={null}>
              <AntdStyleProvider container={this.shadowRoot!}>
                <AntdProvider>
                  <CaptionDisplay
                    lines={this.currentCaptionLines}
                    // Untranslated, the lines are the originals.
                    originalLines={isCurrentCaptionTranslated ? originalLines : []}
                    display={this.display}
                    targetLanguage={this.targetLanguage}
                    captionStyle={this.captionStyle}
                    captionSizeRatio={this.captionSizeRatio}
                    spoken={isCurrentCaptionTranslated ? spoken : null}
                    lookup={{
                      video: this.videoElement,
                      live: false,
                      title: this.videoMetadata?.title ?? document.title,
                      targetLanguage: this.targetLanguage,
                    }}
                  />
                </AntdProvider>
              </AntdStyleProvider>
            </LanguageProvider>
          </JotaiProvider>
        </StrictMode>
      );
    }

    return isCurrentCaptionTranslated;
  };

  private async fetchTrack(language: Language): Promise<Caption[] | null> {
    const fetched = this.tracks.get(language);
    if (fetched) return fetched;
    const metadata = this.transcriptMetadata.find((m) => m.language === language);
    if (!metadata) return null;
    const captions = await fetchCaptionTrack(metadata, true);
    if (captions) this.tracks.set(language, captions);
    return captions;
  }

  private async startCaptions() {
    const session = this.session;
    const targetLanguage = this.targetLanguage;

    const nativeCaptions = await this.fetchTrack(targetLanguage);
    if (session !== this.session) return;
    if (nativeCaptions) {
      debugLog('[YouTube] Using native captions for', targetLanguage);
      this.lines = nativeCaptions;
      this.native = true;
      this.baseLanguage = targetLanguage;
      this.nativeOriginalLines = [];

      const original = this.originalTrack;
      if (original && original.language !== targetLanguage) {
        const originalCaptions = await fetchCaptionTrack(original);
        if (originalCaptions && session === this.session) {
          // Netflix's pairing with the target track's captions as the lines: each gets every
          // original caption it substantially overlaps, so a long speech recognition caption
          // shows under each line it spans. Original captions overlapping none come back as
          // lines without text, left out.
          const { cues, translations } = alignCues(nativeCaptions, originalCaptions);
          this.nativeOriginalLines = translations.filter((_, i) => cues[i].text);
        }
      }
      return;
    }

    const baseLanguage = this.transcriptMetadata[0]?.language;
    const baseCaptions = await this.fetchTrack(baseLanguage);
    if (session !== this.session) return;
    if (!baseCaptions) {
      debugLog('[YouTube] transcriptMetadata', this.transcriptMetadata);
      throw new Error(`Could not fetch base captions for ${baseLanguage}`);
    }
    this.baseLanguage = baseLanguage;
    this.lines = baseCaptions;
    this.native = false;

    debugLog(`[YouTube] Translating captions to ${targetLanguage}`);
    const metadata = this.videoMetadata!;
    const translator: CueTranslator = createCueTranslator({
      cues: baseCaptions,
      chunkSize: CAPTION_CHUNK_SIZE,
      lookaheadSeconds: LOOKAHEAD_SECONDS,
      // The next frame shows what arrived.
      onUpdate: () => {},
      translate: (part, start, onLine, signal) => {
        // The lines around the chunk, as on Netflix. A line before it without a translation isn't
        // translated yet (after a seek) or its chunk failed: it goes without one.
        const context = baseCaptions
          .slice(Math.max(0, start - CONTEXT_BEFORE), start)
          .map((caption, i, before) => {
            const translation = translator.translation(start - before.length + i) ?? '';
            return { source: caption.text, translation: translation === caption.text ? '' : translation };
          });
        const following = baseCaptions
          .slice(start + part.length, start + part.length + CONTEXT_AFTER)
          .map((caption) => caption.text);
        return translationService.streamYoutubeCaption(
          { lines: part.map((caption) => caption.text), context, following, targetLanguage, metadata },
          onLine,
          signal
        );
      },
    });
    this.translator = translator;
    this.positionSentAt = this.videoElement?.currentTime ?? 0;
    translator.setPosition(this.positionSentAt);
  }

  // How the captions show, applied from the next frame on.
  public updateSettings = (settings: CaptionLook) => {
    this.numLines = settings.numLines;
    this.display = settings.display;
    this.captionStyle = settings.captionStyle;
    this.captionSizeRatio = settings.captionSizeRatio;
    this.wordHighlight = settings.wordHighlight;
    this.currentCaptionLines = [];
  };

  public activate = async (targetLanguage: Language, settings: CaptionLook) => {
    if (document.getElementById(CUSTOM_CAPTION_ID)) {
      this.deactivate();
    }

    this.updateSettings(settings);
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
    windowBottom.style.textAlign = 'center';
    windowBottom.style.transform = 'translateX(-50%)';
    windowBottom.style.width = 'max-content';
    windowBottom.style.maxWidth = '90%';
    placeCaption(windowBottom, this.position);
    // Where they were dragged to last, on any video.
    void chrome.storage.local.get(STORAGE_YOUTUBE_CAPTION_POSITION).then((stored) => {
      const position = stored[STORAGE_YOUTUBE_CAPTION_POSITION];
      if (!isCaptionPosition(position) || !windowBottom.isConnected) return;
      this.position = position;
      placeCaption(windowBottom, position);
    });
    this.stopMoving = makeCaptionMovable(windowBottom, {
      area: container,
      position: () => this.position,
      sizeRatio: () => this.captionSizeRatio,
      onMove: (position, done) => {
        this.position = position;
        placeCaption(windowBottom, position);
        if (done) void chrome.storage.local.set({ [STORAGE_YOUTUBE_CAPTION_POSITION]: position });
      },
      onResize: (ratio, done) => {
        this.captionSizeRatio = ratio;
        this.currentCaptionLines = [];
        // The menu's size setting follows, and comes back here through updateSettings.
        if (done) void chrome.storage.local.set({ [STORAGE_YOUTUBE_CAPTION_SIZE_RATIO]: ratio });
      },
    });

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
                <CaptionDisplay
                  lines={[]}
                  originalLines={[]}
                  display={this.display}
                  targetLanguage={this.targetLanguage}
                  captionStyle={this.captionStyle}
                  captionSizeRatio={1.0}
                />
              </AntdProvider>
            </AntdStyleProvider>
          </LanguageProvider>
        </JotaiProvider>
      </StrictMode>
    );

    this.session++;
    this.startCaptions().catch((err) => {
      errorLog('[YouTube] Caption translation failed:', err);
      this.deactivate(); // Clean up on failure
    });
  };

  public deactivate = () => {
    debugLog('[YouTube] deactivate');
    this.session++;
    this.translator?.stop();
    this.translator = null;
    this.lines = [];
    this.native = false;
    this.lastFoundCaptionIndex = null;
    const host = document.getElementById(CUSTOM_CAPTION_ID);

    this.stopMoving?.();
    this.stopMoving = null;
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

  // How much of the video is translated, from 0 to 1. The target language's own track is all there.
  public translationProgress = () => {
    if (!this.lines.length) return 0;
    if (this.native) return 1;
    return this.translator?.progress() ?? 0;
  };

  // Translation normally stays a few minutes ahead; a subtitle file wants the whole video.
  public translateAll = () => {
    this.translator?.translateAll();
  };

  // The captions shown, as a subtitle file, named after the video and its languages.
  public subtitleFile = (kind: SubtitleKind) => {
    if (!this.lines.length) return null;
    const captions = this.lines.map((caption, index) => {
      const original = (this.native ? this.nativeOriginalLines[index] : caption.text) || caption.text;
      const translated = this.native ? caption.text : (this.translator?.translation(index) ?? '');
      // A line the model left empty keeps its original, as on screen.
      const translation = translated.trim() ? translated : original;
      const text =
        kind === 'original'
          ? original
          : kind === 'translation' || original === translation
            ? translation
            : `${original}\n${translation}`;
      return { ...caption, text };
    });
    const name = (language: Language) => language.split('_')[0];
    const originalLanguage = name(this.originalTrack?.language ?? this.baseLanguage);
    const label =
      kind === 'original'
        ? originalLanguage
        : kind === 'translation'
          ? name(this.targetLanguage)
          : `${originalLanguage}-${name(this.targetLanguage)}`;
    return { name: srtFileName(this.videoMetadata?.title ?? document.title, label), text: toSrt(captions) };
  };

  public clear = () => {
    this.transcriptMetadata = [];
    this.videoMetadata = null;
    this.originalTrack = undefined;
    this.nativeOriginalLines = [];
    this.tracks.clear();
    this.targetLanguage = 'English';
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
