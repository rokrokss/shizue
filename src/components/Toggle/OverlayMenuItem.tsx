import { Tooltip } from 'antd';
import { FC, ReactNode } from 'react';

export interface OverlayMenuItemProps {
  icon: ReactNode;
  popoverContent?: ReactNode;
  isPopoverOpen?: boolean;
  setPopoverOpen?: (open: boolean) => void;
  tooltipMessage: string;
  onClick?: () => void;
}

const OverlayMenuItem: FC<OverlayMenuItemProps> = ({
  icon,
  popoverContent,
  isPopoverOpen,
  setPopoverOpen,
  tooltipMessage,
  onClick,
}) => {
  return (
    <>
      {isPopoverOpen && popoverContent && popoverContent}
      <Tooltip
        placement="left"
        title={<div className="sz:text-black sz:font-ycom sz:z-2147483647">{tooltipMessage}</div>}
        color="white"
        mouseEnterDelay={0.03}
        zIndex={2147483647}
      >
        <div
          className="sz:cursor-pointer sz:rounded-full sz:flex sz:items-center sz:justify-center"
          style={{
            width: 34,
            height: 34,
            transition: 'background-color 0.1s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(203, 251, 246, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          {icon}
        </div>
      </Tooltip>
    </>
  );
};

export default OverlayMenuItem;
