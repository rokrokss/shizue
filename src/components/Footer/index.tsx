import DiscordIcon from '@/assets/icons/discord.svg?react';
import { useTranslation } from 'react-i18next';

const Footer = () => {
  const { t } = useTranslation();
  const theme = useThemeValue();

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
    </div>
  );
};

export default Footer;

