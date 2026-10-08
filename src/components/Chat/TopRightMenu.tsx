import { useThemeValue } from '@/hooks/layout';
import { preloadSettings } from '@/components/Setting/SettingsModal';
import { SettingOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';

const TopMenu = ({ onSettingsClick }: { onSettingsClick: () => void }) => {
  const theme = useThemeValue();
  const { t } = useTranslation();

  useEffect(() => {
    // Let the chat paint first, then prepare only this frequently used screen.
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(preloadSettings);
      else preloadSettings();
    }, 250);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, []);

  return (
    <Tooltip
      title={
        <div className={`sz:font-ycom ${theme == 'dark' ? 'sz:text-white' : 'sz:text-black'}`}>
          {t('settings.title')}
        </div>
      }
      color={theme == 'dark' ? '#505362' : 'white'}
      className="sz:font-ycom"
      placement="bottomRight"
      arrow={false}
    >
      <button
        type="button"
        aria-label={t('settings.title')}
        className={`
        sz:fixed
        sz:top-3
        sz:right-3
        sz:z-10
        sz:p-[3px]
        sz:rounded
        sz:cursor-pointer
        sz:flex
        sz:flex-col
        sz:gap-2
        ${theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'}
      `}
        onClick={onSettingsClick}
        onPointerEnter={preloadSettings}
        onFocus={preloadSettings}
      >
        <SettingOutlined
          style={{
            fontSize: 22,
            color: theme === 'dark' ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)',
          }}
        />
      </button>
    </Tooltip>
  );
};

export default TopMenu;
