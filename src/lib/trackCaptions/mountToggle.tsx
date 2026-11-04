import TrackCaptionToggle from '@/components/Caption/TrackCaptionToggle';
import type { VideoCaptionController } from '@/lib/trackCaptions/trackCaptions';
import type { TrackCaptionSite } from '@/lib/trackCaptions/tracks';
import { contentScriptLog, errorLog } from '@/logs';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import { StyleProvider as AntdStyleProvider, createCache } from '@ant-design/cssinjs';
import { ConfigProvider } from 'antd';
import { Provider as JotaiProvider } from 'jotai';
import { ReactNode, StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';

// A click on a player plays, pauses or opens the video. Our button keeps its events to itself.
const OWN_EVENTS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup'];
const keepEventsInside = (element: HTMLElement) => {
  for (const type of OWN_EVENTS) element.addEventListener(type, (event) => event.stopPropagation());
};

// A captions button in a pill-shaped element of the site's page (`style` places it), drawn by
// `content` in a shadow root once `mount` is called. Its tooltips and menus open in a shadow root
// of their own on <body>, moved into the fullscreen element in fullscreen, which is all that's drawn.
export const createCaptionButton = (
  ctx: ContentScriptContext,
  { name, label, style, content }: { name: string; label: string; style: Record<string, string>; content: () => ReactNode }
) => {
  const hostId = `shizue-${name}-caption-toggle-shadow-host`;
  const popupTag = `shizue-${name}-caption-popups`;
  document.getElementById(hostId)?.remove();
  document.querySelectorAll(popupTag).forEach((host) => host.remove());

  const element = document.createElement('div');
  element.id = hostId;
  // Inline styles: this div is in the site's DOM, which our shadow-root stylesheet doesn't reach.
  Object.assign(element.style, {
    height: '32px',
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '9999px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    lineHeight: '0',
    ...style,
  });
  keepEventsInside(element);
  let root: Root | null = null;

  const popupHost = document.createElement(popupTag);
  keepEventsInside(popupHost);
  const popupShadow = popupHost.attachShadow({ mode: 'open' });
  const popupContainer = document.createElement('div');
  Object.assign(popupContainer.style, { position: 'relative', zIndex: '2147483647' });
  const followFullscreen = () => {
    const fullscreen = document.fullscreenElement;
    const target = fullscreen && !(fullscreen instanceof HTMLVideoElement) ? fullscreen : document.body;
    if (popupHost.parentElement !== target) target.append(popupHost);
  };
  document.addEventListener('fullscreenchange', followFullscreen);
  ctx.onInvalidated(() => {
    document.removeEventListener('fullscreenchange', followFullscreen);
    popupHost.remove();
  });

  const render = () =>
    root?.render(
      <StrictMode>
        <JotaiProvider>
          <LanguageProvider loadingComponent={null}>
            <AntdStyleProvider container={popupShadow} cache={createCache()}>
              <AntdProvider>
                <ConfigProvider getPopupContainer={() => popupContainer}>{content()}</ConfigProvider>
              </AntdProvider>
            </AntdStyleProvider>
          </LanguageProvider>
        </JotaiProvider>
      </StrictMode>
    );

  let mounted: Promise<void> | null = null;
  // Call it once the element is in the page.
  const mount = () =>
    (mounted ??= (async () => {
      contentScriptLog(label);
      const ui = await createShadowRootUi(ctx, {
        name: `shizue-${name}-caption-toggle`,
        position: 'inline',
        anchor: `#${hostId}`,
        append: 'first',
        mode: 'open',
        onMount: (container, shadow) => {
          container.classList.add('sz:h-full', 'sz:flex', 'sz:flex-col', 'sz:m-0');
          popupShadow.append(shadow.querySelector('style')!.cloneNode(true), popupContainer);
          followFullscreen();
          root = createRoot(container);
          render();
          return root;
        },
        onRemove: () => {
          root?.unmount();
          root = null;
          element.remove();
        },
      });
      if (ctx.isInvalid) {
        ui.remove();
        return;
      }
      ui.mount();
      ctx.onInvalidated(() => ui.remove());
    })().catch((error) => errorLog(`${label} caption toggle mount failed`, error)));

  return { element, mount, render, mounted: () => root !== null };
};

// One captions button, moved to the player the pointer is over when its video has captions, at
// `corner` of it (top right by default).
export const mountTrackCaptionToggle = (
  ctx: ContentScriptContext,
  site: Pick<TrackCaptionSite, 'name' | 'playerOf' | 'hasCaptions' | 'zIndex'>,
  controller: VideoCaptionController,
  { label, corner = { top: '8px', right: '8px' } }: { label: string; corner?: Record<string, string> }
) => {
  ctx.onInvalidated(() => controller.deactivate());
  let video: HTMLVideoElement | null = null;
  const button = createCaptionButton(ctx, {
    name: site.name,
    label,
    style: { position: 'absolute', ...corner, zIndex: String((site.zIndex ?? 1) + 1) },
    content: () => <TrackCaptionToggle controller={controller} video={video} />,
  });

  const place = (player: HTMLElement, next: HTMLVideoElement) => {
    if (button.element.parentElement !== player) player.append(button.element);
    if (video !== next) {
      video = next;
      button.render();
    }
    if (!button.mounted()) void button.mount();
  };

  // The video under the pointer, found by where it is drawn: players cover it with their
  // controls. A player adds a video's caption tracks once its stream loads, so each hover looks
  // again.
  const onPointerOver = (event: PointerEvent) => {
    if (ctx.isInvalid) return;
    const next = Array.from(document.querySelectorAll('video')).find((video) => {
      const rect = video.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const player = next && site.hasCaptions(next) ? site.playerOf(next) : null;
    if (next && player) place(player, next);
  };
  document.addEventListener('pointerover', onPointerOver, true);
  ctx.onInvalidated(() => document.removeEventListener('pointerover', onPointerOver, true));
};
