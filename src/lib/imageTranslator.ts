import type { Language } from '@/hooks/language';
import type { ImageTextBlock } from '@/lib/imageTranslation';
import { debugLog } from '@/logs';
import { translationService } from '@/services/translationService';

// Translations drawn over an image on the page, where its text is (lib/imageTranslation.ts): one
// image from the context menu, or every image of a page as it scrolls into view (a manga chapter,
// a webtoon). The overlay is fixed over the image and follows it each frame while any is shown,
// so it stays put in pages that scroll inside their own boxes. Its boxes let clicks through; a
// small chip in the image's corner tells what is happening and switches back to the original.

export type ImageTranslationLabels = {
  translating: string;
  translated: string;
  original: string;
  showOriginal: string;
  showTranslation: string;
  noText: string;
  failed: string;
  retry: string;
  noImageModel: string;
  close: string;
  pageActive: string;
  stop: string;
};

type State = 'loading' | 'done' | 'empty' | 'failed' | 'noModel';

// An image worth translating in a page: big enough to hold text one would read.
const MIN_NATURAL = { width: 200, height: 150 };
const MIN_SHOWN = { width: 120, height: 100 };
const NEAR_VIEWPORT_PX = 600;
const CONCURRENCY = 2;
// Model boxes hug the letters; a little margin hides the original's edges.
const BOX_MARGIN_PX = 4;
const MIN_FONT_PX = 9;
const MAX_FONT_PX = 26;
// A click on the chip is ours, not the page's (a reader turns the page on a click).
const OWN_EVENTS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'];

const STYLE = `
:host { all: initial; }
.root { position: absolute; inset: 0; pointer-events: none; font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Noto Sans JP', sans-serif; }
.block {
  position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  padding: 1px 3px; border-radius: 6px; background: rgba(255, 255, 255, 0.96); color: #111;
  font-weight: 600; line-height: 1.15; text-align: center; overflow: hidden;
  word-break: keep-all; overflow-wrap: anywhere; white-space: pre-wrap;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
  animation: in 240ms ease-out both;
  transition: opacity 160ms ease;
}
.original .block { opacity: 0; animation: none; }
.chip {
  position: absolute; top: 8px; right: 8px; display: inline-flex; align-items: center; gap: 6px;
  box-sizing: border-box; height: 26px; padding: 0 10px; border-radius: 9999px;
  background: rgba(0, 0, 0, 0.72); color: #fff; font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif;
  font-size: 12px; line-height: 1; pointer-events: auto; white-space: nowrap; user-select: none;
  backdrop-filter: blur(6px); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  transition: opacity 180ms ease;
}
.chip.quiet { opacity: 0; pointer-events: none; }
.chip.pill { position: static; height: 34px; padding: 0 8px 0 14px; gap: 8px; font-size: 13px; animation: rise 220ms ease-out both; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: #32ccbc; flex: none; }
.spin { width: 11px; height: 11px; box-sizing: border-box; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.3); border-top-color: #32ccbc; animation: spin 0.8s linear infinite; flex: none; }
.chip button { all: unset; cursor: pointer; color: #32ccbc; font-weight: 600; padding: 4px 0; }
.chip button:hover { color: #6ee2d6; }
.chip button:focus-visible { outline: 2px solid #32ccbc; outline-offset: 2px; border-radius: 4px; }
.chip.pill button { padding: 5px 10px; border-radius: 9999px; background: rgba(255, 255, 255, 0.1); }
.chip.pill button:hover { background: rgba(255, 255, 255, 0.18); }
.chip button.close { color: rgba(255, 255, 255, 0.6); font-weight: 400; font-size: 14px; padding: 4px 0 4px 2px; }
.chip button.close:hover { color: #fff; }
.warn { color: #ffb4a8; }
@keyframes in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .block, .spin, .chip.pill { animation: none; } }
`;

const span = (text: string, className = '') => Object.assign(document.createElement('span'), { textContent: text, className });

const button = (label: string, onClick: () => void, className = '') => {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  if (className) element.className = className;
  element.addEventListener('click', (event) => {
    event.preventDefault();
    onClick();
  });
  return element;
};

// A shadow-rooted element of ours on the page.
const ownHost = (style: Partial<CSSStyleDeclaration>) => {
  const host = document.createElement('div');
  host.setAttribute('data-shizue-image-translation', '');
  Object.assign(host.style, style);
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.append(Object.assign(document.createElement('style'), { textContent: STYLE }));
  return { host, shadow };
};

const keepEvents = (element: HTMLElement) => {
  for (const type of OWN_EVENTS) element.addEventListener(type, (event) => event.stopPropagation());
};

class ImageOverlay {
  private host: HTMLElement;
  private root = document.createElement('div');
  private chip = document.createElement('div');
  private blocks: ImageTextBlock[] = [];
  private state: State = 'loading';
  private showingOriginal = false;
  private hovered = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRect = '';
  private fittedWidth = 0;

  constructor(
    readonly image: HTMLImageElement,
    private labels: ImageTranslationLabels,
    private onRetry: () => void,
    private onClose: () => void
  ) {
    const { host, shadow } = ownHost({ position: 'fixed', zIndex: '2147483000', pointerEvents: 'none', left: '0', top: '0' });
    this.host = host;
    this.root.className = 'root';
    this.chip.className = 'chip';
    keepEvents(this.chip);
    shadow.append(this.root, this.chip);
    document.documentElement.append(host);
    this.renderChip();
    this.follow(image.getBoundingClientRect(), false);
  }

  get current() {
    return this.state;
  }

  setState(state: State, blocks: ImageTextBlock[] = []) {
    this.state = state;
    this.blocks = blocks;
    this.showingOriginal = false;
    this.renderBlocks();
    this.renderChip();
    if (state === 'empty') setTimeout(() => this.state === 'empty' && this.onClose(), 3000);
  }

  private renderChip() {
    const labels = this.labels;
    const parts: Node[] = [];
    switch (this.state) {
      case 'loading':
        parts.push(span('', 'spin'), span(labels.translating));
        break;
      case 'done':
        parts.push(
          span('', 'dot'),
          span(this.showingOriginal ? labels.original : labels.translated),
          button(this.showingOriginal ? labels.showTranslation : labels.showOriginal, () => {
            this.showingOriginal = !this.showingOriginal;
            this.root.classList.toggle('original', this.showingOriginal);
            this.renderChip();
          })
        );
        break;
      case 'empty':
        parts.push(span('', 'dot'), span(labels.noText));
        break;
      case 'failed':
        parts.push(span(labels.failed, 'warn'), button(labels.retry, this.onRetry));
        break;
      case 'noModel':
        parts.push(span(labels.noImageModel, 'warn'));
        break;
    }
    if (this.state !== 'loading') {
      const close = button('×', this.onClose, 'close');
      close.setAttribute('aria-label', labels.close);
      parts.push(close);
    }
    this.chip.replaceChildren(...parts);
    // Once translated, the chip steps aside until the pointer comes over the image.
    this.chip.classList.toggle('quiet', this.state === 'done' && !this.hovered);
  }

  private renderBlocks() {
    this.root.classList.toggle('original', this.showingOriginal);
    this.root.replaceChildren(
      ...this.blocks.map((block) => {
        const [top, left, bottom, right] = block.box;
        const element = document.createElement('div');
        element.className = 'block';
        element.dir = 'auto';
        element.textContent = block.translation;
        element.title = block.text;
        Object.assign(element.style, {
          top: `calc(${top * 100}% - ${BOX_MARGIN_PX}px)`,
          left: `calc(${left * 100}% - ${BOX_MARGIN_PX}px)`,
          height: `calc(${(bottom - top) * 100}% + ${BOX_MARGIN_PX * 2}px)`,
          width: `calc(${(right - left) * 100}% + ${BOX_MARGIN_PX * 2}px)`,
        });
        return element;
      })
    );
    this.fittedWidth = 0;
    this.lastRect = '';
  }

  // The largest size at which each block's translation fits its box.
  private fit() {
    for (const element of Array.from(this.root.children) as HTMLElement[]) {
      let size = Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, Math.round(element.clientHeight * 0.62)));
      element.style.fontSize = `${size}px`;
      while (
        size > MIN_FONT_PX &&
        (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)
      ) {
        size--;
        element.style.fontSize = `${size}px`;
      }
    }
  }

  // Each frame while the overlay is up: over the image wherever it is now (`rect`), its chip
  // shown while the pointer is over it (`pointerInside`) and a moment after.
  follow(rect: DOMRect, pointerInside: boolean) {
    if (pointerInside !== this.hovered) this.hover(pointerInside);
    const shown = this.image.isConnected && rect.width > 0 && rect.height > 0;
    const key = shown ? `${rect.left},${rect.top},${rect.width},${rect.height}` : 'hidden';
    if (key === this.lastRect) return;
    this.lastRect = key;
    this.host.style.display = shown ? 'block' : 'none';
    if (!shown) return;
    Object.assign(this.host.style, {
      transform: `translate(${rect.left}px, ${rect.top}px)`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    if (Math.abs(rect.width - this.fittedWidth) > 1 && this.blocks.length) {
      this.fittedWidth = rect.width;
      this.fit();
    }
  }

  private hover(inside: boolean) {
    if (inside) {
      if (this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = null;
      this.hovered = true;
      this.renderChip();
    } else if (!this.hideTimer) {
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        this.hovered = false;
        this.renderChip();
      }, 400);
    }
  }

  remove() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.host.remove();
  }
}

const srcOf = (image: HTMLImageElement) => image.currentSrc || image.src;

const readAsDataUrl = async (url: string): Promise<string | undefined> => {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
};

const isNearViewport = (rect: DOMRect) =>
  rect.bottom > -NEAR_VIEWPORT_PX && rect.top < window.innerHeight + NEAR_VIEWPORT_PX;

class ImageTranslator {
  private overlays = new Map<HTMLImageElement, ImageOverlay>();
  private lastContextImage: HTMLImageElement | null = null;
  private frame: number | null = null;
  private pointer: { x: number; y: number } | null = null;
  private target: Language | null = null;
  private labels: ImageTranslationLabels | null = null;
  private queue: HTMLImageElement[] = [];
  private running = 0;
  // The page's images, translated as they come into view.
  private pageMode = false;
  private intersection: IntersectionObserver | null = null;
  private mutation: MutationObserver | null = null;
  private pill: { host: HTMLElement; indicator: HTMLElement } | null = null;
  // Images closed or with nothing to translate, left alone when they come back into view.
  private settled = new WeakSet<HTMLImageElement>();

  constructor() {
    // The image right-clicked: the menu only says its address, which several images may share.
    document.addEventListener(
      'contextmenu',
      (event) => {
        this.lastContextImage = event.target instanceof HTMLImageElement ? event.target : null;
      },
      true
    );
    // Readers cover their pages with click areas, so the pointer is found by where it is.
    document.addEventListener(
      'pointermove',
      (event) => {
        this.pointer = { x: event.clientX, y: event.clientY };
      },
      { capture: true, passive: true }
    );
    document.documentElement.addEventListener('pointerleave', () => {
      this.pointer = null;
    });
  }

  // The image the context menu was opened on (its address is `srcUrl`).
  translateImageAt(srcUrl: string, target: Language, labels: ImageTranslationLabels) {
    const image =
      this.lastContextImage && srcOf(this.lastContextImage) === srcUrl
        ? this.lastContextImage
        : Array.from(document.images).find((img) => srcOf(img) === srcUrl);
    if (!image) return;
    this.target = target;
    this.labels = labels;
    this.overlays.get(image)?.remove();
    this.overlays.delete(image);
    this.queue = this.queue.filter((queued) => queued !== image);
    this.overlayFor(image);
    this.queue.unshift(image);
    this.pump();
  }

  // Every image of the page, as it comes into view; called again, everything goes back.
  togglePage(target: Language, labels: ImageTranslationLabels) {
    if (this.pageMode) return this.stopPage();
    this.pageMode = true;
    this.target = target;
    this.labels = labels;
    this.intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) this.consider(entry.target as HTMLImageElement);
        this.pump();
      },
      { rootMargin: `${NEAR_VIEWPORT_PX}px 0px` }
    );
    const observe = (root: ParentNode) => {
      const images = root instanceof HTMLImageElement ? [root] : Array.from(root.querySelectorAll('img'));
      images.forEach((image) => this.intersection?.observe(image));
    };
    observe(document);
    // Readers load the next pages as one scrolls.
    this.mutation = new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach((node) => node instanceof Element && observe(node));
    });
    this.mutation.observe(document.body, { childList: true, subtree: true });
    // An image already in view that finishes loading, or swaps its placeholder for the page.
    document.addEventListener('load', this.onImageLoad, true);
    this.showPill();
  }

  private onImageLoad = (event: Event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !isNearViewport(image.getBoundingClientRect())) return;
    this.consider(image);
    this.pump();
  };

  private stopPage() {
    this.pageMode = false;
    this.intersection?.disconnect();
    this.intersection = null;
    this.mutation?.disconnect();
    this.mutation = null;
    document.removeEventListener('load', this.onImageLoad, true);
    this.queue = [];
    this.overlays.forEach((overlay) => overlay.remove());
    this.overlays.clear();
    this.pill?.host.remove();
    this.pill = null;
    this.settled = new WeakSet();
    this.stopFollowing();
  }

  private consider(image: HTMLImageElement) {
    if (this.overlays.has(image) || this.settled.has(image) || !this.worthTranslating(image)) return;
    this.overlayFor(image);
    this.queue.push(image);
  }

  private worthTranslating(image: HTMLImageElement) {
    if (!image.complete) return false;
    const rect = image.getBoundingClientRect();
    return (
      image.naturalWidth >= MIN_NATURAL.width &&
      image.naturalHeight >= MIN_NATURAL.height &&
      rect.width >= MIN_SHOWN.width &&
      rect.height >= MIN_SHOWN.height &&
      /^(https?|data|blob):/.test(srcOf(image))
    );
  }

  private overlayFor(image: HTMLImageElement) {
    const overlay = new ImageOverlay(
      image,
      this.labels!,
      () => {
        overlay.setState('loading');
        this.queue.unshift(image);
        this.pump();
      },
      () => {
        overlay.remove();
        if (this.overlays.get(image) === overlay) this.overlays.delete(image);
        if (this.pageMode) this.settled.add(image);
        if (!this.overlays.size && !this.pageMode) this.stopFollowing();
      }
    );
    this.overlays.set(image, overlay);
    this.startFollowing();
    return overlay;
  }

  private pump() {
    while (this.running < CONCURRENCY && this.queue.length) {
      const image = this.queue.shift()!;
      const overlay = this.overlays.get(image);
      if (!overlay || !image.isConnected || overlay.current !== 'loading') continue;
      this.running++;
      void this.translate(image, overlay).finally(() => {
        this.running--;
        this.pump();
      });
    }
    this.renderPill();
  }

  private async translate(image: HTMLImageElement, overlay: ImageOverlay) {
    const target = this.target;
    if (!target) return;
    const src = srcOf(image);
    try {
      let result = await translationService.translateImage(src, undefined, target, document.title);
      // A site that serves its images only to its own pages, or an image the page drew: send
      // the page's copy.
      if (!result.success && result.error === 'unreadable') {
        const dataUrl = src.startsWith('data:') ? src : await readAsDataUrl(src);
        if (dataUrl) result = await translationService.translateImage(src, dataUrl, target, document.title);
      }
      if (this.overlays.get(image) !== overlay) return;
      if (result.success) overlay.setState(result.blocks.length ? 'done' : 'empty', result.blocks);
      else overlay.setState(result.error === 'no_image_model' ? 'noModel' : 'failed');
    } catch (error) {
      debugLog('Image translation failed', error);
      if (this.overlays.get(image) === overlay) overlay.setState('failed');
    }
  }

  // While the page's images are translated: a pill at the bottom to say so and to stop.
  private showPill() {
    const labels = this.labels!;
    const { host, shadow } = ownHost({
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      transform: 'translateX(-50%)',
      zIndex: '2147483001',
    });
    const chip = document.createElement('div');
    chip.className = 'chip pill';
    chip.setAttribute('role', 'status');
    keepEvents(chip);
    const indicator = span('', 'dot');
    chip.append(indicator, span(labels.pageActive), button(labels.stop, () => this.stopPage()));
    shadow.append(chip);
    document.documentElement.append(host);
    this.pill = { host, indicator };
  }

  private renderPill() {
    if (this.pill) this.pill.indicator.className = this.running ? 'spin' : 'dot';
  }

  // Rects are read for every overlay before any moves, so a frame lays the page out once.
  private startFollowing() {
    if (this.frame !== null) return;
    const step = () => {
      const overlays = Array.from(this.overlays.values());
      const rects = overlays.map((overlay) => overlay.image.getBoundingClientRect());
      const pointer = this.pointer;
      overlays.forEach((overlay, index) => {
        const rect = rects[index];
        const inside =
          !!pointer && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
        overlay.follow(rect, inside);
      });
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private stopFollowing() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

let instance: ImageTranslator | null = null;

// Created when the page loads, so it sees which image a context menu opens on.
export const getImageTranslator = () => {
  instance ??= new ImageTranslator();
  return instance;
};
