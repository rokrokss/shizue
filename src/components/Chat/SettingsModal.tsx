import SettingsModalContent from '@/components/Chat/SettingsModalContent';

const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <div
      className="
        sz:fixed sz:inset-0 sz:bg-black/30 sz:flex sz:pt-18 sz:items-start sz:justify-center sz:z-50
      "
      onClick={onClose}
    >
      <SettingsModalContent onClose={onClose} />
    </div>
  );
};

export default SettingsModal;
