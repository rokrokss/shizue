import TopMenu from '@/components/Chat/TopRightMenu';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import SettingsModalContent from '@/components/Setting/SettingsModalContent';
import { useThemeValue } from '@/hooks/layout';
import { debugLog } from '@/logs';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Button, Upload } from 'antd';
import { useState } from 'react';

const props: UploadProps = {
  name: 'file',
  action: 'https://660d2bd96ddfa2943b33731c.mockapi.io/api/upload',
  headers: {
    authorization: 'authorization-text',
  },
  onChange(info) {
    if (info.file.status !== 'uploading') {
      debugLog(info.file, info.fileList);
    }
    if (info.file.status === 'done') {
      debugLog(`${info.file.name} file uploaded successfully`);
    } else if (info.file.status === 'error') {
      debugLog(`${info.file.name} file upload failed.`);
    }
  },
};

const Pdf = () => {
  const theme = useThemeValue();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleTopMenuSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  return (
    <div className="sz-sidepanel sz:flex sz:flex-col sz:h-screen sz:font-ycom">
      <div
        className={`sz-pdf sz:w-full sz:h-full sz:flex sz:flex-col sz:items-center sz:font-ycom ${
          theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'
        }`}
      >
        <TopMenu onSettingsClick={handleTopMenuSettingsClick} />

        <div
          className="
            sz:w-full
            sz:h-full
            sz:flex
            sz:flex-col
            sz:items-center
            sz:justify-start
            sz:pt-10
          "
        >
          <Upload {...props}>
            <Button icon={<UploadOutlined />} className="sz:font-ycom sz:text-[14px]">
              PDF 파일 업로드
            </Button>
          </Upload>
        </div>

        {isSettingsOpen && (
          <SidePanelFullModal
            onClose={closeSettings}
            size="base"
            minHeight="374px"
            content={<SettingsModalContent />}
          />
        )}
      </div>
    </div>
  );
};

export default Pdf;
