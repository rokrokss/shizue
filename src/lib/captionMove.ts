// Captions can be dragged anywhere in the player, and the place is kept for every video after.
// Dragging the handle at their top right corner makes them larger or smaller (the size setting),
// and a double click puts them back at the bottom.

// Where the box's center is from the player's left, and its bottom from the player's bottom, as
// shares of the player's width and height.
export type CaptionPosition = { x: number; y: number };

export const DEFAULT_CAPTION_POSITION: CaptionPosition = { x: 0.5, y: 0.02 };

const MIN_SIZE_RATIO = 0.3;
const MAX_SIZE_RATIO = 5;
// A press that moves less than this is a click.
const DRAG_THRESHOLD_PX = 4;
const HANDLE_PX = 14;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isCaptionPosition = (value: unknown): value is CaptionPosition =>
  !!value &&
  typeof (value as CaptionPosition).x === 'number' &&
  typeof (value as CaptionPosition).y === 'number' &&
  Number.isFinite((value as CaptionPosition).x) &&
  Number.isFinite((value as CaptionPosition).y);

// The place a drag of (dx, dy) px from `start` gives, kept inside the player.
export const movedPosition = (
  start: CaptionPosition,
  dx: number,
  dy: number,
  box: { width: number; height: number },
  area: { width: number; height: number }
): CaptionPosition => {
  const halfWidth = Math.min(0.5, box.width / 2 / area.width);
  const height = Math.min(1, box.height / area.height);
  return {
    x: clamp(start.x + dx / area.width, halfWidth, 1 - halfWidth),
    y: clamp(start.y - dy / area.height, 0, 1 - height),
  };
};

// The size a drag of the corner `dx` px to the right gives: the box is centered, so its right edge
// follows the pointer.
export const resizedRatio = (startRatio: number, dx: number, boxWidth: number) => {
  const half = Math.max(1, boxWidth / 2);
  return Math.round(clamp((startRatio * (half + dx)) / half, MIN_SIZE_RATIO, MAX_SIZE_RATIO) * 20) / 20;
};

export const placeCaption = (box: HTMLElement, position: CaptionPosition) => {
  box.style.left = `${position.x * 100}%`;
  box.style.bottom = `${position.y * 100}%`;
};

type Options = {
  // The player the captions move in.
  area: HTMLElement;
  position: () => CaptionPosition;
  sizeRatio: () => number;
  onMove: (position: CaptionPosition, done: boolean) => void;
  onResize: (ratio: number, done: boolean) => void;
};

// Makes `box` (the captions' page element, positioned in `area` with placeCaption) movable.
// Presses on its words never get here: the words stop them for their own popup.
export const makeCaptionMovable = (box: HTMLElement, { area, position, sizeRatio, onMove, onResize }: Options) => {
  box.style.pointerEvents = 'auto';
  box.style.cursor = 'move';
  box.style.touchAction = 'none';
  box.style.userSelect = 'none';

  const handle = document.createElement('div');
  Object.assign(handle.style, {
    position: 'absolute',
    top: `${-HANDLE_PX / 2}px`,
    right: `${-HANDLE_PX / 2}px`,
    width: `${HANDLE_PX}px`,
    height: `${HANDLE_PX}px`,
    borderTop: '2px solid #fff',
    borderRight: '2px solid #fff',
    boxSizing: 'border-box',
    cursor: 'nesw-resize',
    opacity: '0',
    transition: 'opacity 0.15s',
  });
  box.appendChild(handle);
  const showHandle = (shown: boolean) => (handle.style.opacity = shown ? '0.9' : '0');

  let drag: {
    pointerId: number;
    resize: boolean;
    x: number;
    y: number;
    moved: boolean;
    position: CaptionPosition;
    ratio: number;
    box: DOMRect;
  } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    // The player would pause, seek or start its own drag.
    event.stopPropagation();
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      resize: event.target === handle,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      position: position(),
      ratio: sizeRatio(),
      box: box.getBoundingClientRect(),
    };
    box.setPointerCapture(event.pointerId);
  };

  const step = (event: PointerEvent, done: boolean) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    if (drag.resize) {
      onResize(resizedRatio(drag.ratio, dx, drag.box.width), done);
    } else {
      onMove(movedPosition(drag.position, dx, dy, drag.box, area.getBoundingClientRect()), done);
    }
  };

  const onPointerMove = (event: PointerEvent) => step(event, false);
  const onPointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    step(event, true);
    const moved = drag.moved;
    drag = null;
    if (box.hasPointerCapture(event.pointerId)) box.releasePointerCapture(event.pointerId);
    // A drag ends without a click reaching the player.
    if (moved) {
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    }
  };
  const onPointerCancel = () => (drag = null);
  const stop = (event: Event) => event.stopPropagation();
  const onDoubleClick = (event: MouseEvent) => {
    // Not the player's full screen.
    event.stopPropagation();
    onMove(DEFAULT_CAPTION_POSITION, true);
  };
  const onEnter = () => showHandle(true);
  const onLeave = () => showHandle(false);

  box.addEventListener('pointerdown', onPointerDown);
  box.addEventListener('pointermove', onPointerMove);
  box.addEventListener('pointerup', onPointerUp);
  box.addEventListener('pointercancel', onPointerCancel);
  box.addEventListener('mousedown', stop);
  box.addEventListener('mouseup', stop);
  box.addEventListener('dblclick', onDoubleClick);
  box.addEventListener('pointerenter', onEnter);
  box.addEventListener('pointerleave', onLeave);

  return () => {
    box.removeEventListener('pointerdown', onPointerDown);
    box.removeEventListener('pointermove', onPointerMove);
    box.removeEventListener('pointerup', onPointerUp);
    box.removeEventListener('pointercancel', onPointerCancel);
    box.removeEventListener('mousedown', stop);
    box.removeEventListener('mouseup', stop);
    box.removeEventListener('dblclick', onDoubleClick);
    box.removeEventListener('pointerenter', onEnter);
    box.removeEventListener('pointerleave', onLeave);
    handle.remove();
  };
};
