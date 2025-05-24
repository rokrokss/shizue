import BookIcon from '@/assets/icons/book.svg?react';
import ChatIcon from '@/assets/icons/chat.svg?react';
import ScreenshotIcon from '@/assets/icons/screenshot.svg?react';
import SettingIcon from '@/assets/icons/setting.svg?react';

export const overlayMenuItems = [
  {
    name: 'Settings',
    onClick: () => {},
    icon: <SettingIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: i18n.t('overlayMenu.settings'),
  },
  {
    name: 'Screenshot',
    onClick: () => {},
    icon: <ScreenshotIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: i18n.t('overlayMenu.screenshot'),
  },
  {
    name: 'Summarize this Page',
    onClick: () => {},
    icon: <BookIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: i18n.t('overlayMenu.summarizePage'),
  },
  {
    name: 'Quick Chat',
    onClick: () => {},
    icon: <ChatIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: i18n.t('overlayMenu.quichChat'),
  },
];
