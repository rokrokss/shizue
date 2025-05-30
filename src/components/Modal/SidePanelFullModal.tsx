import { ReactNode } from 'react';

const SidePanelFullModal = ({
  onClose,
  size,
  content,
}: {
  onClose: () => void;
  size: 'base' | 'large';
  content: ReactNode;
}) => {
  return (
    <div
      className="sz:fixed sz:inset-0 sz:bg-black/30 sz:flex sz:pt-18 sz:items-start sz:justify-center sz:z-50 sz:max-h-full"
      onClick={onClose}
    >
      <div
        className={
          size === 'base'
            ? 'sz:bg-white sz:rounded-xl sz:px-3 sz:pt-6 sz:pb-9 sz:shadow-xl sz:min-w-70 sz:max-h-full sz:relative'
            : 'sz:bg-white sz:rounded-xl sz:px-3 sz:pt-6 sz:pb-9 sz:shadow-xl sz:w-7/8 sz:max-h-full sz:relative'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="sz:absolute sz:top-2 sz:right-3 sz:text-gray-400 hover:sz:text-black sz:cursor-pointer"
          onClick={onClose}
        >
          ✕
        </button>
        {content}
      </div>
    </div>
  );
};

export default SidePanelFullModal;
