import { ReactNode } from 'react';

const YoutubeCaptionSettingModal = ({
  onClose,
  content,
  tooltipX,
  tooltipY,
}: {
  onClose: () => void;
  content: ReactNode;
  tooltipX: number;
  tooltipY: number;
}) => {
  return (
    <div
      className="
        sz:fixed
        sz:inset-0
        sz:flex
        sz:pt-18
        sz:items-end
        sz:justify-center
        sz:z-2147483647
        sz:max-h-full
      "
      onClick={onClose}
    >
      <div
        className="
          sz:absolute
          sz:rounded-xl
          sz:px-3
          sz:pt-6
          sz:pb-9
          sz:shadow-xl
          sz:w-[200px]
          sz:max-h-full
        "
        style={{
          backgroundColor: 'rgba(21, 20, 28, 0.87)',
          left: tooltipX,
          top: tooltipY,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
};

export default YoutubeCaptionSettingModal;
