import tailwindRaw from '@/assets/tailwind.css?inline';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import { Language } from '@/hooks/language';
import { TranscriptMetadata } from '@/lib/youtube';
import { debugLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { StyleProvider as AntdStyleProvider } from '@ant-design/cssinjs';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

const CUSTOM_CAPTION_ID = 'shizue-custom-caption';

type Caption = {
  startTime: number;
  endTime: number;
  text: string;
};

export class CaptionInjector {
  private customCaptionRoot: Root | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private transcriptMetadata: TranscriptMetadata[] = [];
  private targetLanguage: Language = 'English';
  private captionCache: Map<Language, Caption[]> = new Map();
  private currentTime: number = 0;
  private captionTextElement: HTMLSpanElement | null = null;
  private lastFoundCaption: Caption | null = null;

  constructor() {}

  public setTranscriptMetadata = (transcriptMetadata: TranscriptMetadata[]) => {
    this.transcriptMetadata = transcriptMetadata;
  };

  public setVideoElement = (videoElement: HTMLVideoElement) => {
    this.videoElement = videoElement;
  };

  private findCaption = (time: number): Caption | null => {
    if (
      this.lastFoundCaption &&
      time >= this.lastFoundCaption.startTime &&
      time < this.lastFoundCaption.endTime
    ) {
      return this.lastFoundCaption;
    }

    const arr = this.captionCache.get(this.targetLanguage) ?? [];
    let lo = 0,
      hi = arr.length - 1;

    let foundCaption: Caption | null = null;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = arr[mid];
      if (time < c.startTime) {
        hi = mid - 1;
      } else if (time >= c.endTime) {
        lo = mid + 1;
      } else {
        foundCaption = c; // startTime ≤ time < endTime
        break;
      }
    }

    this.lastFoundCaption = foundCaption;
    return foundCaption;
  };

  public updateCurrentTime = () => {
    if (!this.videoElement || !this.captionTextElement) return;

    this.currentTime = this.videoElement.currentTime;

    const line = this.findCaption(this.currentTime);
    const newText = line?.text ?? '';

    if (this.captionTextElement.textContent !== newText) {
      this.captionTextElement.textContent = newText;
    }
  };

  public activate = async (targetLanguage: Language) => {
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

    const shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(tailwindRaw);
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
    const reactMountPoint = document.createElement('div');
    shadowRoot.appendChild(reactMountPoint);

    this.customCaptionRoot = createRoot(reactMountPoint);
    this.customCaptionRoot.render(
      <StrictMode>
        <JotaiProvider>
          <LanguageProvider loadingComponent={null}>
            <AntdStyleProvider container={shadowRoot}>
              <AntdProvider>
                <CaptionDisplay
                  ref={(el) => {
                    this.captionTextElement = el;
                  }}
                />
              </AntdProvider>
            </AntdStyleProvider>
          </LanguageProvider>
        </JotaiProvider>
      </StrictMode>
    );
  };

  public deactivate = () => {
    const host = document.getElementById(CUSTOM_CAPTION_ID);

    this.captionTextElement = null;
    this.customCaptionRoot?.unmount();
    this.customCaptionRoot = null;

    if (host) {
      host.remove();
    }

    document
      .querySelectorAll<HTMLDivElement>('.ytp-caption-window-container')
      .forEach((el) => (el.style.display = 'block'));
  };

  public clear = () => {
    this.transcriptMetadata = [];
    this.videoElement = null;
    this.captionCache.clear();
    this.targetLanguage = 'English';
    this.lastFoundCaption = null;
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
