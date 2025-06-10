import tailwindRaw from '@/assets/tailwind.css?inline';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { StyleProvider as AntdStyleProvider } from '@ant-design/cssinjs';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

const CUSTOM_CAPTION_ID = 'shizue-custom-caption';

export class CaptionInjector {
  private customCaptionRoot: Root | null = null;

  constructor() {}

  public activate = () => {
    if (document.getElementById(CUSTOM_CAPTION_ID)) return;

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
                <div className="sz:w-fit sz:text-[2.4vw] min-[1015px]:sz:text-[1.6vw] min-[1935px]:sz:text-[28px]">
                  <div>
                    <span className="sz:px-2 sz:py-1 sz:inline-block sz:bg-[rgba(8,8,8,0.75)] sz:text-white sz:fill-white">
                      Hello, world!
                    </span>
                  </div>
                </div>
              </AntdProvider>
            </AntdStyleProvider>
          </LanguageProvider>
        </JotaiProvider>
      </StrictMode>
    );
  };

  public deactivate = () => {
    const host = document.getElementById(CUSTOM_CAPTION_ID);
    if (!host) return;

    this.customCaptionRoot?.unmount();
    this.customCaptionRoot = null;

    host.remove();

    document
      .querySelectorAll<HTMLDivElement>('.ytp-caption-window-container')
      .forEach((el) => (el.style.display = 'block'));
  };
}

let captionInjector: CaptionInjector | null = null;

export const getCaptionInjector = (): CaptionInjector => {
  if (!captionInjector) {
    captionInjector = new CaptionInjector();
  }
  return captionInjector;
};
