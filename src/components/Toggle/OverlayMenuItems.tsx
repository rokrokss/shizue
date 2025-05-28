import BookIcon from '@/assets/icons/book.svg?react';
import ChatIcon from '@/assets/icons/chat.svg?react';
import ScreenshotIcon from '@/assets/icons/screenshot.svg?react';
import SettingIcon from '@/assets/icons/setting.svg?react';
import TranslateIcon from '@/assets/icons/translate.svg?react';
import { getPageTranslator } from '@/utils/pageTranslator';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

const overlayMenuItems = [
  {
    name: 'Settings',
    onClick: () => {},
    icon: <SettingIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.settings',
  },
  {
    name: 'Screenshot',
    onClick: () => {},
    icon: <ScreenshotIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.screenshot',
  },
  {
    name: 'Summarize this Page',
    onClick: () => {},
    icon: <BookIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.summarizePage',
  },
  {
    name: 'Translate this Page',
    onClick: async () => {
      getPageTranslator().toggle();
    },
    icon: <TranslateIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.translatePage',
  },
  {
    name: 'Quick Chat',
    onClick: () => {},
    icon: <ChatIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.quickChat',
  },
];

const OverlayMenuItems = () => {
  const { t } = useTranslation();

  const menuSize = 34;

  return (
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
  );
};

export default OverlayMenuItems;
