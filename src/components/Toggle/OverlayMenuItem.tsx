import { Theme } from '@/hooks/layout';
import { Tooltip } from 'antd';
import { forwardRef, ReactNode } from 'react';

export interface OverlayMenuItemProps {
  icon: ReactNode;
  theme: Theme;
  popoverContent?: ReactNode;
  isPopoverOpen?: boolean;
  tooltipMessage: string;
  onClick?: () => void;
}

const OverlayMenuItem = forwardRef<HTMLDivElement, OverlayMenuItemProps>(
  ({ theme, icon, popoverContent, isPopoverOpen, tooltipMessage, onClick }, triggerRef) => {
    return (
      <>
        <Tooltip
          placement="left"
          title={
            <div
              className={`sz:text-black sz:font-ycom sz:z-2147483647 ${
                theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
              }`}
            >
              {tooltipMessage}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
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
            ref={triggerRef}
          >
            <div
              className="sz:flex sz:items-center sz:justify-center"
              style={{
                width: 24,
                height: 24,
              }}
            >
              {icon}
            </div>
          </div>
        </Tooltip>
        {isPopoverOpen && popoverContent && popoverContent}
      </>
    );
  }
);

export default OverlayMenuItem;
