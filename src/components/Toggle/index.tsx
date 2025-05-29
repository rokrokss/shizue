import BookIcon from '@/assets/icons/book.svg?react';
import TranslateIcon from '@/assets/icons/translate.svg?react';
import CharacterPickToggle, {
  characterCountChat,
} from '@/components/Character/CharacterPickToggle';
import OverlayMenu from '@/components/Toggle/OverlayMenu';
import OverlayMenuItem from '@/components/Toggle/OverlayMenuItem';
import { MESSAGE_SET_PANEL_OPEN_OR_NOT } from '@/config/constants';
import { debugLog } from '@/logs';
import { getPageTranslator } from '@/utils/pageTranslator';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Toggle = () => {
  const { t } = useTranslation();

  const translateSettingsPopoverTriggerRef = useRef<HTMLDivElement>(null);

  const [isHoveringCharacter, setIsHoveringCharacter] = useState(false);
  const [isHoveringMenu, setIsHoveringMenu] = useState(false);
  const [characterIndex, setCharacterIndex] = useState(0);
  const [translateSettingsModalOpen, setTranslateSettingsModalOpen] = useState(false);

  const isVisible = isHoveringCharacter || isHoveringMenu || translateSettingsModalOpen;

  const width = 43;
  const height = 43;
  const widthFull = 55;
  const menuIconSize = 20;

  const tooltipMessages = [
    t('overlayMenu.translateSettings'),
    t('overlayMenu.translatePage'),
    t('overlayMenu.summarizePage'),
  ];

  useEffect(() => {
    const date = new Date();
    const charIndex = hashStringToIndex(
      date.toISOString().split('T')[0] + date.getHours(),
      null,
      characterCountChat
    );
    setCharacterIndex(charIndex);
  }, []);

  const setPanelOpenOrNot = () => {
    void chrome.runtime.sendMessage({ action: MESSAGE_SET_PANEL_OPEN_OR_NOT });
  };

  const handleClick = () => {
    debugLog('Toggle clicked');
    setPanelOpenOrNot();
  };

  const handleTranslateSettingsOpenChange = (newOpen: boolean) => {
    setTranslateSettingsModalOpen(newOpen);
  };

  return (
    <div className="sz:fixed sz:right-0 sz:bottom-[26px] sz:flex sz:flex-col sz:items-end sz:z-2147483647">
      <div
        onMouseEnter={() => setIsHoveringMenu(true)}
        onMouseLeave={() => setIsHoveringMenu(false)}
        className={`
          sz:flex sz:flex-col
          sz:items-center
          sz:shadow-md
          sz:pb-[8px]
          sz:pr-[8px]
          sz:transition-all sz:duration-300
          sz:z-2147483647
          ${
            isVisible
              ? 'sz:opacity-100 sz:translate-x-0 sz:pointer-events-auto'
              : 'sz:opacity-0 sz:translate-x-[8px] sz:pointer-events-none sz:hidden'
          }
      `}
        style={{
          transition: 'opacity 0.3s ease-in-out, translate 0.3s ease-in-out',
        }}
      >
        <OverlayMenu>
          {/* <OverlayMenuItem
            icon={<SettingIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />}
            tooltipMessage={tooltipMessages[0]}
            onClick={() => handleTranslateSettingsOpenChange(!translateSettingsModalOpen)}
            ref={translateSettingsPopoverTriggerRef}
            popoverContent={
              <TogglePopoverModal
                triggerRef={translateSettingsPopoverTriggerRef}
                onClose={() => handleTranslateSettingsOpenChange(false)}
                content={
                  <>
                    <div className="sz:font-ycom sz:text-black sz:text-[14px] sz:mb-[2px] sz:text-center">
                      {t('overlayMenu.translateSettings')}
                    </div>
                    <div className="sz:font-ycom sz:text-gray-700 sz:text-[12px] sz:text-center">
                      ...
                    </div>
                  </>
                }
              />
            }
            isPopoverOpen={translateSettingsModalOpen}
          /> */}

          <OverlayMenuItem
            icon={<TranslateIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />}
            tooltipMessage={tooltipMessages[1]}
            onClick={() => getPageTranslator().toggle()}
          />

          <OverlayMenuItem
            icon={<BookIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />}
            tooltipMessage={tooltipMessages[2]}
            onClick={() => {}}
          />
        </OverlayMenu>
      </div>
      <div
        onMouseEnter={() => setIsHoveringCharacter(true)}
        onMouseLeave={() => setIsHoveringCharacter(false)}
        className="sz:flex sz:items-center sz:justify-center sz:cursor-pointer sz:shadow-lg sz:shadow-cyan-400/20 sz:z-2147483647"
        onClick={handleClick}
        style={{
          width: isVisible ? `${widthFull}px` : `${width}px`,
          height: `${height}px`,
          transition: 'width 0.3s ease-in-out',
          background: 'linear-gradient( 135deg, #90F7EC 10%, #32CCBC 100%)',
          borderTopLeftRadius: '9999px',
          borderBottomLeftRadius: '9999px',
          borderTopRightRadius: '0',
          borderBottomRightRadius: '0',
        }}
      >
        <CharacterPickToggle index={characterIndex} />
      </div>
    </div>
  );
};

export default Toggle;
