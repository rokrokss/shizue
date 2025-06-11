import tailwindRaw from '@/assets/tailwind.css?inline';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import { Language } from '@/hooks/language';
import { Caption, TranscriptMetadata, VideoMetadata } from '@/lib/youtube';
import { debugLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { translationService } from '@/services/translationService';
import { StyleProvider as AntdStyleProvider } from '@ant-design/cssinjs';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

const CUSTOM_CAPTION_ID = 'shizue-custom-caption';

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

  constructor() {}

  public setMetaData = (transcriptMetadata: TranscriptMetadata[], videoMetadata: VideoMetadata) => {
    this.transcriptMetadata = transcriptMetadata;
    this.videoMetadata = videoMetadata;
  };

  public setVideoElement = (videoElement: HTMLVideoElement) => {
    this.videoElement = videoElement;
  };

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
    if (!this.videoElement || !this.customCaptionRoot) return;

    this.currentTime = this.videoElement.currentTime;
    const allCaptions = this.captionCache.get(this.targetLanguage) ?? [];

    const currentIndex = this.findCaptionIndex(this.currentTime);

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
  };

  public activate = async (targetLanguage: Language, numLines: number) => {
    this.numLines = numLines;
    if (document.getElementById(CUSTOM_CAPTION_ID)) return;

    this.targetLanguage = targetLanguage;
    if (!this.captionCache.has(targetLanguage)) {
      for (const metadata of this.transcriptMetadata) {
        if (metadata.language === targetLanguage) {
          const captionResponse = await fetch(metadata.baseUrl);
          const data = await captionResponse.json();
          debugLog('[YouTube] caption data', data);
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
            .filter((caption: Caption) => caption.text.length > 0 && caption.text !== '[Music]');
          this.captionCache.set(targetLanguage, captions);
        }
      }
    }

    if (!this.captionCache.has(targetLanguage)) {
      // get baseCaption from transcriptMetadata
      const base = this.transcriptMetadata[0];
      const baseCaptionResponse = await fetch(base.baseUrl);
      const baseData = await baseCaptionResponse.json();
      debugLog('[YouTube] base caption data', baseData);
      const baseCaptions = baseData.events
        .filter((event: any) => event.segs)
        .map((event: any) => ({
          startTime: event.tStartMs / 1000,
          endTime: (event.tStartMs + event.dDurationMs) / 1000,
          text: event.segs
            .map((seg: any) => seg.utf8)
            .join('')
            .trim(),
        }))
        .filter((caption: Caption) => caption.text.length > 0 && caption.text !== '[Music]');
      this.captionCache.set(base.language, baseCaptions);

      // translate base captions to target language
      const translatedCaptions = await translationService.translateYoutubeCaption(
        baseCaptions,
        targetLanguage,
        this.videoMetadata!
      );
      this.captionCache.set(targetLanguage, translatedCaptions.captions!);
    }

    debugLog('[YouTube] captionCache', this.captionCache);

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
  };

  public deactivate = () => {
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
    this.videoElement = null;
    this.captionCache.clear();
    this.targetLanguage = 'English';
    this.lastFoundCaptionIndex = null;
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
