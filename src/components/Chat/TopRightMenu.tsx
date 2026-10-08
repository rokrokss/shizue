import { useThemeValue } from '@/hooks/layout';
import { SettingOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

const TopMenu = ({ onSettingsClick }: { onSettingsClick: () => void }) => {
  const theme = useThemeValue();
  const { t } = useTranslation();

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
