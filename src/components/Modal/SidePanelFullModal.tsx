import { DotCycle } from '@/components/Loader/DotCycle';
import { ReactNode, Suspense } from 'react';

const SidePanelFullModal = ({
  onClose,
  size,
  content,
  minHeight,
}: {
  onClose: () => void;
  size: 'base' | 'large';
  content: ReactNode;
  minHeight?: string;
}) => {
  const theme = useThemeValue();

  return (
    <div
      className="sz:fixed sz:inset-0 sz:bg-black/30 sz:flex sz:pt-18 sz:items-start sz:justify-center sz:z-50 sz:max-h-full"
      onClick={onClose}
    >
      <div
        className={
          size === 'base'
            ? `sz:rounded-xl sz:px-3 sz:pt-6 sz:pb-9 sz:shadow-xl sz:min-w-78 sz:max-h-full sz:relative`
            : `sz:rounded-xl sz:px-3 sz:pt-6 sz:pb-9 sz:shadow-xl sz:w-7/8 sz:max-h-full sz:relative`
        }
        style={{
          backgroundColor: theme == 'dark' ? '#24252D' : 'white',
          minHeight: minHeight ? minHeight : 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className={`sz:absolute sz:top-2 sz:right-3 sz:cursor-pointer ${
            theme == 'dark' ? 'sz:text-white sz:hover:text-gray-300' : 'sz:text-gray-600 sz:hover:text-black'
          }`}
          onClick={onClose}
        >
          ✕
        </button>
        <Suspense fallback={<div aria-busy="true"><DotCycle /></div>}>
          {content}
        </Suspense>
      </div>
    </div>
  );
};

export default SidePanelFullModal;
