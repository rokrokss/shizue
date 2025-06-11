import { useState } from 'react';

const LanguageOptionItem = ({
  option,
  onClick,
  isFirst,
  isLast,
}: {
  option: { value: string; label: string; desc: string };
  onClick: () => void;
  isFirst: boolean;
  isLast: boolean;
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="
        sz:font-youtube
        sz:text-white
        sz:cursor-pointer
        sz:text-[13px]
        sz:flex
        sz:items-center
        sz:justify-start
      "
      style={{
        backgroundColor: hovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
        borderTopLeftRadius: isFirst ? '8px' : '0',
        borderTopRightRadius: isFirst ? '8px' : '0',
        borderBottomLeftRadius: isLast ? '8px' : '0',
        borderBottomRightRadius: isLast ? '8px' : '0',
        paddingLeft: '12px',
        height: '34px',
        maxHeight: '34px',
        minHeight: '34px',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {option.label}
      {option.label !== option.desc && (
        <span className="sz:text-gray-500 sz:ml-[5px] sz:text-[11px]">{option.desc}</span>
      )}
    </div>
  );
};

export default LanguageOptionItem;
