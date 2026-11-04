import tailwindRaw from '@/assets/tailwind.css?inline';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import type { CaptionSettings } from '@/lib/trackCaptions/trackCaptions';
import type { TrackCaptionSite } from '@/lib/trackCaptions/tracks';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Our caption lines over a site's player, above its control bar, in a closed shadow root.
export const createCaptionOverlay = (site: Pick<TrackCaptionSite, 'name' | 'playerOf' | 'overlayBottom' | 'zIndex'>) => {
  let host: HTMLElement | null = null;
  let root: Root | null = null;
  let lastRendered = '';

  const ensure = (video: HTMLVideoElement): Root | null => {
    const container = site.playerOf(video);
    if (!container) return null;
    if (host?.parentElement !== container || !root) {
      root?.unmount();
      host?.remove();
      // Inline styles: this element sits in the site's DOM, outside our stylesheet.
      const element = document.createElement('div');
      element.id = `shizue-${site.name}-caption-overlay`;
      Object.assign(element.style, {
        position: 'absolute',
        left: '50%',
        bottom: `${site.overlayBottom ?? 64}px`,
        transform: 'translateX(-50%)',
        width: 'max-content',
        maxWidth: '90%',
        textAlign: 'center',
        // Players may set their own (TED's is 0, which draws wrapped lines over each other).
        lineHeight: 'normal',
        pointerEvents: 'none',
        zIndex: String(site.zIndex ?? 1),
      });
      element.dir = 'ltr';
      container.append(element);
      const shadow = element.attachShadow({ mode: 'closed' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(tailwindRaw);
      shadow.adoptedStyleSheets = [sheet];
      const mount = document.createElement('div');
      shadow.append(mount);
      host = element;
      root = createRoot(mount);
      lastRendered = '';
    }
    return root;
  };

  return {
    // `originalLines[i]` is the original under the translation `lines[i]`, or '' for none.
    render(video: HTMLVideoElement, lines: string[], originalLines: string[], settings: CaptionSettings) {
      const target = ensure(video);
      if (!target) return;
      // Players are small in a page and large in fullscreen: the size follows the player, as
      // YouTube's own captions do (1/22.5 of its height).
      const fontSize = `${Math.round((video.getBoundingClientRect().height / 22.5) * settings.captionSizeRatio)}px`;
      const key = JSON.stringify([lines, originalLines, settings.display, settings.captionStyle, fontSize]);
      if (key === lastRendered) return;
      lastRendered = key;
      target.render(
        <StrictMode>
          <CaptionDisplay
            lines={lines}
            originalLines={originalLines}
            display={settings.display}
            targetLanguage={settings.targetLanguage}
            captionStyle={settings.captionStyle}
            captionSizeRatio={settings.captionSizeRatio}
            fontSize={fontSize}
          />
        </StrictMode>
      );
    },
    // Draw again on the next render, though the lines are the same (settings changed).
    invalidate() {
      lastRendered = '';
    },
    remove() {
      root?.unmount();
      root = null;
      host?.remove();
      host = null;
      lastRendered = '';
    },
  };
};

export type CaptionOverlay = ReturnType<typeof createCaptionOverlay>;
