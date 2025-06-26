import DiscordIcon from '@/assets/icons/discord.svg?react';
import { HeartFilled, HeartOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

const Footer = () => {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [isHoverHeart, setIsHoverHeart] = useState(false);

  return (
    <div className="sz:w-full sz:h-full sz:flex sz:items-center sz:justify-center">
      <div
        onClick={() => window.open('https://discord.gg/ukfPmxsyEy', '_blank')}
        className={`sz:text-sm sz:cursor-pointer sz:flex sz:items-center sz:justify-center sz:gap-1 ${
          theme == 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-500'
        }`}
      >
        {t('footer.joinDiscord')}
        <DiscordIcon
          className="sz:w-4 sz:h-4"
          style={{ filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none' }}
        />
      </div>
      <Tooltip
        title={
          <div
            className={`sz:text-black sz:font-ycom sz:z-2147483647 ${
              theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
            }`}
          >
            {t('footer.rate')}
          </div>
        }
        placement="topRight"
        arrow={false}
        color={theme == 'dark' ? '#505362' : 'white'}
        className="sz:font-ycom"
      >
        <div
          className="sz:absolute sz:right-[17px] sz:cursor-pointer"
          onMouseEnter={() => setIsHoverHeart(true)}
          onMouseLeave={() => setIsHoverHeart(false)}
          onClick={() =>
            window.open(
              'https://chromewebstore.google.com/detail/mpcbgfkoholfgapcgcmfjobnfcbnfanm/reviews?utm_source=item-share-cb',
              '_blank'
            )
          }
        >
          {isHoverHeart ? (
            <HeartFilled style={{ fontSize: '17px', color: '#ff7086' }} />
          ) : (
            <HeartOutlined
              style={{
                fontSize: '17px',
                color: theme == 'dark' ? 'rgb(107 114 128)' : 'oklch(0.551 0.027 264.364)',
              }}
            />
          )}
        </div>
      </Tooltip>
    </div>
  );
};

export default Footer;

