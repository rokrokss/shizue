import CharacterStanding from '@/components/Character/CharacterStanding';
import { MESSAGE_ACTION_SET_PANEL_OPEN_OR_NOT } from '@/config/constants';
import { overlayMenuItems } from '@/lib/overlayMenu';
import { debugLog } from '@/logs';
import { useEventEmitter } from '@/providers/EventEmitterProvider';
import { Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Toggle = () => {
  const eventEmitter = useEventEmitter();
  const [isHoveringCharacter, setIsHoveringCharacter] = useState(false);
  const [isHoveringMenu, setIsHoveringMenu] = useState(false);
  const { t } = useTranslation();

  const isVisible = isHoveringCharacter || isHoveringMenu;

  const width = 42;
  const height = 42;
  const widthFull = 54;

  const menuSize = 34;

  useEffect(() => {
    const handleMessage = (message: any) => {
      debugLog('Toggle received message:', message);
    };
    const unsubscribe = eventEmitter.subscribe(handleMessage);
    return () => {
      unsubscribe();
    };
  }, [eventEmitter]);

  const setPanelOpenOrNot = () => {
    void chrome.runtime.sendMessage({ action: MESSAGE_ACTION_SET_PANEL_OPEN_OR_NOT });
  };

  const handleClick = () => {
    debugLog('Toggle clicked');
    setPanelOpenOrNot();
  };

  return (
    <div className="sz:fixed sz:right-0 sz:bottom-[28px] sz:flex sz:flex-col sz:items-end sz:z-2147483647">
      <div
        onMouseEnter={() => setIsHoveringMenu(true)}
        onMouseLeave={() => setIsHoveringMenu(false)}
        className={`
          sz:flex sz:flex-col
          sz:items-center
          sz:shadow-md
          sz:pb-[8px]
          sz:pr-[8px]
          sz:transition-all sz:duration-300
          ${
            isVisible
              ? 'sz:opacity-100 sz:translate-x-0 sz:pointer-events-auto'
              : 'sz:opacity-0 sz:translate-x-[8px] sz:pointer-events-none'
          }
          `}
        style={{
          transition: 'opacity 0.3s ease-in-out, translate 0.3s ease-in-out',
        }}
      >
        <div
          className="sz:shadow-lg sz:shadow-cyan-400/20"
          style={{
            borderRadius: `${menuSize / 2}px`,
            background: 'linear-gradient( 135deg, #90F7EC 10%, #32CCBC 100%)',
          }}
        >
          {overlayMenuItems.map((item, index) => (
            <div
              key={index}
              className={`sz:flex sz:items-center sz:justify-center ${
                index === 0 ? 'sz:rounded-t-full' : ''
              } ${index === overlayMenuItems.length - 1 ? 'sz:rounded-b-full' : ''}`}
              style={{ width: `${menuSize}px`, height: `${menuSize}px` }}
            >
              <Tooltip
                placement="left"
                title={<div className="sz:text-black sz:font-ycom">{t(item.tooltip)}</div>}
                color="white"
                className="sz:font-ycom"
              >
                <div
                  className="sz:cursor-pointer sz:rounded-full sz:flex sz:items-center sz:justify-center"
                  style={{
                    width: `${menuSize}px`,
                    height: `${menuSize}px`,
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(203, 251, 246, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onClick={item.onClick}
                >
                  {item.icon}
                </div>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
      <div
        onMouseEnter={() => setIsHoveringCharacter(true)}
        onMouseLeave={() => setIsHoveringCharacter(false)}
        className="sz:flex sz:items-center sz:justify-center sz:cursor-pointer sz:shadow-lg sz:shadow-cyan-400/20"
        onClick={handleClick}
        style={{
          width: isVisible ? `${widthFull}px` : `${width}px`,
          height: `${height}px`,
          transition: 'width 0.3s ease-in-out',
          background: 'linear-gradient( 135deg, #90F7EC 10%, #32CCBC 100%)',
          borderTopLeftRadius: '9999px',
          borderBottomLeftRadius: '9999px',
          borderTopRightRadius: '0',
          borderBottomRightRadius: '0',
        }}
      >
        <CharacterStanding scale={1.8} marginLeft={'6px'} />
      </div>
    </div>
  );
};

export default Toggle;
