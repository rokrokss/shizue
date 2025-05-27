import { SettingOutlined } from '@ant-design/icons';

const TopMenu = ({ onSettingsClick }: { onSettingsClick: () => void }) => {
  return (
    <button
      className="
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
        sz:bg-white
      "
      onClick={onSettingsClick}
    >
      <SettingOutlined style={{ fontSize: 22 }} />
    </button>
  );
};

export default TopMenu;
