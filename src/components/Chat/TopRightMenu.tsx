import { useThemeValue } from '@/hooks/layout';
import { SettingOutlined } from '@ant-design/icons';

const TopMenu = ({ onSettingsClick }: { onSettingsClick: () => void }) => {
  const theme = useThemeValue();

  return (
    <button
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
        style={{ fontSize: 22, filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none' }}
      />
    </button>
  );
};

export default TopMenu;
