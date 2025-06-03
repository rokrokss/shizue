import { ReactNode, RefObject, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const TogglePopoverModal = ({
  onClose,
  triggerRef,
  content,
  settingsTriggerYPosition,
}: {
  onClose: () => void;
  triggerRef: RefObject<HTMLDivElement | null>;
  content: ReactNode;
  settingsTriggerYPosition: number;
}) => {
  if (typeof window === 'undefined') return null;

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDownCapture = (e: MouseEvent) => {
      if (!e.isTrusted) return;

      const target = e.target as Node;

      if (modalRef.current?.contains(target)) return;

      if (triggerRef.current?.contains(target)) {
        return;
      }

      onClose();
      setTimeout(() => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
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
  }, [onClose, triggerRef]);

  return createPortal(
    <div
      ref={modalRef}
      className="
          sz-toggle-translate-settings-modal
          sz:bg-white sz:rounded-xl sz:px-[15px] sz:pt-[10px] sz:pb-[10px] sz:shadow-xl sz:min-w-[280px] sz:h-[127px] sz:max-w-sm
          sz:fixed sz:right-[47px] sz:z-2147483647
        "
      style={{ top: settingsTriggerYPosition - 25 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="sz:absolute sz:top-[8px] sz:right-[12px] sz:text-gray-500 hover:sz:text-black sz:cursor-pointer"
        onClick={onClose}
      >
        ✕
      </button>
      {content}
    </div>,
    document.body
  );
};

export default TogglePopoverModal;
