export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  // The page's viewport width in CSS pixels; the capture's width over it is the scale to cut at.
  viewportWidth: number;
}

// Injected into the tab, so it must not use anything from outside. Dims the page and lets the
// user drag a rectangle; resolves with it, or null on Escape, a right click or a bare click.
// The dimming is gone (and painted away) before it resolves, so the capture doesn't show it.
export function selectRegion(hint: string): Promise<CaptureRegion | null> {
  const id = '__shizue_region_capture__';
  if (document.getElementById(id)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const dim = 'rgba(0, 0, 0, 0.35)';
    const root = document.createElement('div');
    root.id = id;
    root.setAttribute(
      'style',
      `all: initial; position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair; background: ${dim};`
    );
    // The box's huge shadow dims everything around the selection once dragging starts.
    const box = document.createElement('div');
    box.setAttribute(
      'style',
      `all: initial; position: fixed; display: none; border: 2px solid #32CCBC; box-sizing: border-box; box-shadow: 0 0 0 100vmax ${dim};`
    );
    const label = document.createElement('div');
    label.textContent = hint;
    label.setAttribute(
      'style',
      'all: initial; position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 6px 12px; border-radius: 8px; background: #1C1D26; color: #fff; font: 13px/1.4 system-ui, sans-serif; pointer-events: none; white-space: nowrap;'
    );
    root.append(box, label);

    let start: { x: number; y: number } | null = null;
    const rectTo = (e: PointerEvent) => ({
      x: Math.min(start!.x, e.clientX),
      y: Math.min(start!.y, e.clientY),
      width: Math.abs(e.clientX - start!.x),
      height: Math.abs(e.clientY - start!.y),
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finish(null);
    };
    const finish = (region: CaptureRegion | null) => {
      root.remove();
      removeEventListener('keydown', onKey, true);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(region)));
    };

    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      root.setPointerCapture(e.pointerId);
      root.style.background = 'transparent';
      label.style.display = 'none';
      box.style.display = 'block';
    });
    root.addEventListener('pointermove', (e) => {
      if (!start) return;
      const rect = rectTo(e);
      Object.assign(box.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    });
    root.addEventListener('pointerup', (e) => {
      if (!start) return;
      const rect = rectTo(e);
      finish(rect.width < 4 || rect.height < 4 ? null : { ...rect, viewportWidth: innerWidth });
    });
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      finish(null);
    });
    addEventListener('keydown', onKey, true);
    document.documentElement.append(root);
  });
}

// Cuts the region out of a capture of the whole view, at the capture's own resolution.
export const cropCapture = async (dataUrl: string, region: CaptureRegion): Promise<File> => {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = bitmap.width / region.viewportWidth;
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(region.width * scale)),
    Math.max(1, Math.round(region.height * scale))
  );
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      region.x * scale,
      region.y * scale,
      region.width * scale,
      region.height * scale,
      0,
      0,
      canvas.width,
      canvas.height
    );
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return new File([blob], 'region.jpg', { type: blob.type });
};
