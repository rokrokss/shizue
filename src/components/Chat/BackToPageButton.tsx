import { useThemeValue } from '@/hooks/layout';
import { backToPage, isPanelTab } from '@/lib/panelHost';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

// A panel tab (browsers without a side panel) hides the page it works on, so it offers the way back.
const BackToPageButton = () => {
  const theme = useThemeValue();
  const { t } = useTranslation();

  if (!isPanelTab()) return null;

  return (
    <Tooltip
      title={
        <div className={`sz:font-ycom ${theme == 'dark' ? 'sz:text-white' : 'sz:text-black'}`}>
          {t('chat.backToPage')}
        </div>
      }
      color={theme == 'dark' ? '#505362' : 'white'}
      className="sz:font-ycom"
      placement="bottomLeft"
      arrow={false}
    >
      <button
        type="button"
        aria-label={t('chat.backToPage')}
        className={`sz:fixed sz:top-3 sz:left-3 sz:z-10 sz:p-[3px] sz:rounded sz:cursor-pointer sz:flex ${
          theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'
        }`}
        onClick={() => void backToPage()}
      >
        <ArrowLeftOutlined
          style={{
            fontSize: 22,
            color: theme === 'dark' ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)',
          }}
        />
      </button>
    </Tooltip>
  );
};

export default BackToPageButton;
