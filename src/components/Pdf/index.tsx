import TopMenu from '@/components/Chat/TopRightMenu';
import Footer from '@/components/Footer';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import SettingsModalContent from '@/components/Setting/SettingsModalContent';
import { threadIdAtom } from '@/hooks/global';
import { useThemeValue } from '@/hooks/layout';
import { debugLog } from '@/logs';
import { HomeOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Button, Tooltip, Upload } from 'antd';
import { useSetAtom } from 'jotai';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  const setThreadId = useSetAtom(threadIdAtom);
  const { t } = useTranslation();

  const handleTopMenuSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  const handleNavigateToChat = async () => {
    debugLog('Pdf: Navigate to chat triggered');

    setThreadId(undefined);

    setTimeout(() => {
      navigate('/');
    }, 100);
  };

  return (
    <div
      className={`sz-sidepanel sz:flex sz:flex-col sz:h-screen sz:font-ycom ${
        theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'
      }`}
    >
      <div
        className={'sz-pdf sz:w-full sz:h-full sz:flex sz:flex-col sz:items-center sz:font-ycom'}
      >
        <Tooltip
          title={
            <div className={`sz:font-ycom ${theme == 'dark' ? 'sz:text-white' : 'sz:text-black'}`}>
              {t('home.title')}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
          className="sz:font-ycom"
          placement="bottomLeft"
          arrow={false}
        >
          <button
            className={`
            sz:fixed
            sz:top-3
            sz:left-4
            sz:z-10
            sz:p-[3px]
            sz:rounded
            sz:cursor-pointer
            sz:flex
            sz:flex-col
            sz:gap-2
            ${theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'}
          `}
            onClick={() => handleNavigateToChat()}
          >
            <HomeOutlined
              style={{
                fontSize: 22,
                filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none',
              }}
            />
          </button>
        </Tooltip>
        <TopMenu onSettingsClick={handleTopMenuSettingsClick} />

        <div
          className="
            sz:w-full
            sz:h-full
            sz:flex
            sz:flex-col
            sz:items-center
            sz:justify-start
            sz:pt-15
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
      <div className="sz-sidepanel-footer sz:h-6 sz:w-full sz:flex sz:items-center sz:justify-center">
        <Footer />
      </div>
    </div>
  );
};

export default Pdf;
