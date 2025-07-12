import TopMenu from '@/components/Chat/TopRightMenu';
import Footer from '@/components/Footer';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import SettingsModalContent from '@/components/Setting/SettingsModalContent';
import { threadIdAtom } from '@/hooks/global';
import { Language, useTranslateTargetLanguage } from '@/hooks/language';
import { useThemeValue } from '@/hooks/layout';
import {
  defaultTaskInfo,
  TaskInfo,
  usePdfTranslateTaskInfo,
  usePdfTranslationNoDual,
} from '@/hooks/pdf';
import { languageOptions } from '@/lib/language';
import { debugLog } from '@/logs';
import { DeleteOutlined, DownloadOutlined, HomeOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { Button, Checkbox, message, Select, Tooltip, Upload } from 'antd';
import axios, { type AxiosResponse } from 'axios';
import { useSetAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface TranslationResponse {
  task_id: string;
  status: string;
  message: string;
  download_url?: string;
}

interface TaskStatus {
  task_id: string;
  status: string;
  message: string;
  file_name: string;
  download_url?: string;
}

const API_BASE_URL = 'http://localhost:8000';

const { Dragger } = Upload;

const Pdf = () => {
  const theme = useThemeValue();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigate = useNavigate();
  const setThreadId = useSetAtom(threadIdAtom);
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<UploadFile | null>(null);
  const [taskInfo, setTaskInfo] = usePdfTranslateTaskInfo();
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const statusCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const [pdfTranslationNoDual, setPdfTranslationNoDual] = usePdfTranslationNoDual();

  const deleteTask = async (taskId: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/tasks/${taskId}`);
      setTaskInfo(defaultTaskInfo);
      setTaskStatus(null);
      debugLog('Task deleted successfully');
    } catch (error) {
      debugLog('Error deleting task:', error);
    }
  };

  const checkTaskStatus = async (taskId: string) => {
    try {
      const response: AxiosResponse<TaskStatus> = await axios.get(
        `${API_BASE_URL}/status/${taskId}`
      );
      debugLog('Task status:', response.data);
      setTaskStatus(response.data as unknown as TaskStatus);

      if (response.data.status === 'completed') {
        setIsLoading(false);
        if (statusCheckInterval.current) {
          clearInterval(statusCheckInterval.current);
          statusCheckInterval.current = null;
        }
      } else if (response.data.status === 'failed') {
        setIsLoading(false);
        if (statusCheckInterval.current) {
          clearInterval(statusCheckInterval.current);
          statusCheckInterval.current = null;
        }
      }
    } catch (error) {
      debugLog('Error checking task status:', error);
      setIsLoading(false);
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
        statusCheckInterval.current = null;
      }
    }
  };

  const startStatusPolling = (taskId: string) => {
    if (statusCheckInterval.current) {
      clearInterval(statusCheckInterval.current);
    }

    statusCheckInterval.current = setInterval(() => {
      checkTaskStatus(taskId);
    }, 2000);
  };

  useEffect(() => {
    if (taskInfo.task_id && taskInfo.task_id !== '') {
      if (Date.now() - new Date(taskInfo.created_at).getTime() > 1000 * 60 * 60 * 3) {
        deleteTask(taskInfo.task_id);
      } else {
        checkTaskStatus(taskInfo.task_id);
        startStatusPolling(taskInfo.task_id);
      }
    }

    return () => {
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
        statusCheckInterval.current = null;
      }
    };
  }, [taskInfo.task_id]);

  const handleSelectTargetLanguage = (value: string) => {
    setTargetLanguage(value as Language);
  };

  const props: UploadProps = {
    name: 'file',
    accept: '.pdf',
    beforeUpload: (file) => {
      debugLog('File selected locally:', file);
      if (file.size > 50 * 1024 * 1024) {
        message.error(t('pdf.fileSizeExceeds').replace('{SIZE_REPLACEMENT}', '50'));
        return false;
      }
      setSelectedFile(file);
      return false;
    },
    onChange: (info) => {
      if (info.fileList.length === 0) {
        setSelectedFile(null);
      }
    },
    fileList: selectedFile ? [selectedFile] : [],
    maxCount: 1,
    itemRender: (originNode) => {
      return <div className="sz:font-ycom sz:text-[10px]">{originNode}</div>;
    },
  };

  const handleProcessFile = async () => {
    if (!selectedFile || isLoading || (taskStatus && taskStatus.status !== 'completed')) {
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile as unknown as File);
      formData.append('lang_out', targetLanguage);
      formData.append('no_dual', pdfTranslationNoDual.toString());

      const response: AxiosResponse<TranslationResponse> = await axios.post(
        `${API_BASE_URL}/translate`,
        formData
      );

      if (response.status === 200) {
        const taskId = response.data.task_id;
        const newTaskInfo: TaskInfo = { task_id: taskId, created_at: new Date().toISOString() };
        setTaskInfo(newTaskInfo);
        setTaskStatus(response.data as unknown as TaskStatus);
        startStatusPolling(taskId);
        debugLog('Translation request successful');
      } else {
        setIsLoading(false);
      }
    } catch (error: any) {
      debugLog('Translation request error:', error);
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!taskStatus || !taskStatus.download_url) {
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/download/${taskStatus.task_id}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${(taskStatus.file_name || 'document.pdf').replace('.pdf', '')}_translated.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      debugLog('Download error:', error);
    }
  };

  const handleCancelTask = async () => {
    if (taskInfo.task_id) {
      await deleteTask(taskInfo.task_id);
      setTaskInfo(defaultTaskInfo);
      setTaskStatus(null);
      setIsLoading(false);
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
        statusCheckInterval.current = null;
      }
    }
  };

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

  const handleTogglePdfTranslationNoDual = () => {
    setPdfTranslationNoDual(!pdfTranslationNoDual);
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
            sz:gap-5
            sz:px-4
          "
        >
          <Dragger
            {...props}
            className="sz:w-50 sz:flex sz:flex-col sz:items-center sz:justify-center sz:font-ycom"
          >
            <InboxOutlined style={{ fontSize: 24, color: theme == 'dark' ? 'white' : 'grey' }} />
            <div
              className={`sz:font-ycom sz:text-[14px] ${
                theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-600'
              }`}
            >
              {t('pdf.selectPdfFile')}
            </div>
          </Dragger>

          <div className="sz:flex sz:flex-col sz:gap-4 sz:items-center">
            <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
              <div
                className={`sz:text-sm ${
                  theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                }`}
              >
                {t('settings.translateTargetLanguage')}
              </div>
              <Select
                value={targetLanguage}
                onChange={handleSelectTargetLanguage}
                className="sz:font-ycom sz:w-50"
                options={languageOptions(t)}
                optionRender={(option) => {
                  return (
                    <div className="sz:font-ycom">
                      {option.label}
                      {option.label != option.data.desc ? (
                        <span className="sz:text-gray-500 sz:ml-[5px] sz:text-[12px]">
                          {option.data.desc}
                        </span>
                      ) : null}
                    </div>
                  );
                }}
              />
              <div className="sz:flex sz:flex-col sz:items-center sz:justify-center sz:w-50">
                <Checkbox
                  checked={!pdfTranslationNoDual}
                  onChange={handleTogglePdfTranslationNoDual}
                  className={`sz:font-ycom sz:w-50 sz:flex sz:flex-row sz:items-center sz:justify-center ${
                    theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                  }`}
                >
                  {t('youtube.bilingual')}
                </Checkbox>
              </div>
            </div>

            {selectedFile && (
              <div className="sz:flex sz:gap-2 sz:w-full">
                <Button
                  type="primary"
                  className="sz:font-ycom sz:text-[14px] sz:w-50"
                  onClick={handleProcessFile}
                  loading={
                    isLoading || ((taskStatus && taskStatus.status !== 'completed') as boolean)
                  }
                >
                  {t('pdf.startTranslation')}
                </Button>
              </div>
            )}
          </div>

          {taskStatus && (
            <div className="sz:flex sz:flex-col sz:gap-4 sz:items-center sz:w-full sz:max-w-md">
              <div
                className={`sz:p-4 sz:rounded-lg sz:border sz:w-full ${
                  theme == 'dark'
                    ? 'sz:bg-[#2A2B36] sz:border-gray-500'
                    : 'sz:bg-gray-50 sz:border-gray-200'
                }`}
              >
                <div className="sz:flex sz:flex-row sz:items-center sz:gap-2 sz:mb-2 sz:justify-between sz:h-full">
                  <div
                    className={`sz:text-sm sz:flex sz:items-center sz:justify-center sz:h-full ${
                      theme == 'dark' ? 'sz:text-gray-300' : 'sz:text-gray-500'
                    }`}
                  >
                    {taskStatus.file_name && taskStatus.file_name.length > 22
                      ? taskStatus.file_name.slice(0, 22) + '...'
                      : taskStatus.file_name}
                  </div>
                  <div className="sz:flex sz:flex-row sz:gap-2 sz:items-center sz:justify-center sz:h-full">
                    {(taskStatus.status === 'completed' ||
                      taskStatus.status === 'pending' ||
                      taskStatus.status === 'processing') && (
                      <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={handleDownload}
                        className="sz:font-ycom sz:text-[14px]"
                        loading={taskStatus.status !== 'completed'}
                      ></Button>
                    )}

                    {(taskStatus.status === 'pending' ||
                      taskStatus.status === 'processing' ||
                      taskStatus.status === 'completed' ||
                      taskStatus.status === 'failed') && (
                      <Button
                        icon={<DeleteOutlined />}
                        onClick={handleCancelTask}
                        className="sz:font-ycom sz:text-[14px]"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
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
