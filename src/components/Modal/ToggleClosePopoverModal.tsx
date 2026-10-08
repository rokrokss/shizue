import { debugLog } from '@/logs';
import { ReactNode, RefObject, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ToggleClosePopoverModal = ({
  container,
  onClose,
  toggleRef,
  content,
  settingsTriggerYPosition,
  theme,
}: {
  container: HTMLElement;
  onClose: () => void;
  toggleRef: RefObject<HTMLDivElement | null>;
  content: ReactNode;
  settingsTriggerYPosition: number;
  theme: Theme;
}) => {
  if (typeof window === 'undefined') return null;

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDownCapture = (e: MouseEvent) => {
      if (!e.isTrusted) return;

      // At the document, clicks inside our shadow root are retargeted to its host.
      const target = e.composedPath()[0] as Node;

      if (modalRef.current?.contains(target)) return;

      if (toggleRef.current?.contains(target)) {
        debugLog('handleMouseDownCapture: Toggle contains target');
        onClose();
        return;
      }

      const root = modalRef.current?.getRootNode();
      onClose();
      setTimeout(() => {
        let el = document.elementFromPoint(e.clientX, e.clientY);
        if (root instanceof ShadowRoot && el === root.host) {
          el = root.elementFromPoint(e.clientX, e.clientY);
        }
        if (!el) return;

        const forwarded = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          screenX: e.screenX,
          screenY: e.screenY,
          view: window,
        });
        el.dispatchEvent(forwarded);
      }, 0);
    };

    document.addEventListener('mousedown', handleMouseDownCapture, true);
    return () => document.removeEventListener('mousedown', handleMouseDownCapture, true);
  }, [onClose]);

  return createPortal(
    <div
      ref={modalRef}
      className="
          sz-toggle-translate-settings-modal shizue-preflight sz:rounded-xl sz:px-[15px] sz:pt-[10px] sz:pb-[10px] sz:shadow-xl sz:min-w-[230px] sz:h-[130px] sz:max-w-sm
          sz:fixed sz:right-[47px] sz:z-2147483647
        "
      style={{
        top: settingsTriggerYPosition - 25,
        backgroundColor: theme == 'dark' ? '#1A1B22' : 'white',
        color: theme == 'dark' ? 'white' : 'oklch(55.1% 0.027 264.364)',
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={`
          sz:absolute
          sz:top-[8px]
          sz:right-[12px]
          sz:cursor-pointer
          sz:bg-transparent
          sz:text-[12px]
          sz:font-ycom
          ${theme == 'dark' ? 'sz:text-white sz:hover:text-gray-300' : 'sz:text-gray-600 sz:hover:text-black'}`}
        onClick={onClose}
      >
        ✕
      </button>
      {content}
    </div>,
    container
  );
};

export default ToggleClosePopoverModal;
