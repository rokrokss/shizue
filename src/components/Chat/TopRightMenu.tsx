import { SettingOutlined } from '@ant-design/icons';

const TopMenu = ({ onSettingsClick }: { onSettingsClick: () => void }) => {
  return (
    <button
      className="
        sz:absolute
        sz:top-3
        sz:right-2
        sz:z-10
        sz:p-2
        sz:rounded
        sz:cursor-pointer
        sz:flex
        sz:flex-col
        sz:gap-2
      "
      onClick={onSettingsClick}
    >
      <SettingOutlined style={{ fontSize: 22 }} />
    </button>
  );
};

export default TopMenu;
