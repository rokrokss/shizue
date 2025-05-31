import BookIcon from '@/assets/icons/book.svg?react';
import TranslateIcon from '@/assets/icons/translate.svg?react';
import CharacterPickToggle, {
  characterCountChat,
} from '@/components/Character/CharacterPickToggle';
import OverlayMenu from '@/components/Toggle/OverlayMenu';
import OverlayMenuItem from '@/components/Toggle/OverlayMenuItem';
import {
  MESSAGE_OPEN_PANEL,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
} from '@/config/constants';
import { hashStringToIndex } from '@/lib/hash';
import { debugLog } from '@/logs';
import { getChatModelService } from '@/services/chatModelService';
import { getPageTranslationService } from '@/services/PageTranslationService';
import { motion, PanInfo } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Toggle = () => {
  const { t } = useTranslation();

  const translateSettingsPopoverTriggerRef = useRef<HTMLDivElement>(null);

  const [isHoveringCharacter, setIsHoveringCharacter] = useState(false);
  const [isHoveringMenu, setIsHoveringMenu] = useState(false);
  const [characterIndex, setCharacterIndex] = useState(0);
  const [translateSettingsModalOpen, setTranslateSettingsModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedYPosition, setDraggedYPosition] = useState(0);

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

  const setPanelOpen = () => {
    void chrome.runtime.sendMessage({ action: MESSAGE_OPEN_PANEL });
  };

  const handleClick = () => {
    debugLog('Toggle clicked');
    if (isDragging) return;
    setPanelOpenOrNot();
  };

  const handleTranslateSettingsOpenChange = (newOpen: boolean) => {
    setTranslateSettingsModalOpen(newOpen);
  };

  const handleSummarizePage = async () => {
    debugLog('Summarize page clicked');
    if (isDragging) return;
    const pageText = document.body.innerText;
    await getChatModelService().initSummarizePageContent(
      document.title,
      pageText,
      window.location.href
    );
    void chrome.runtime.sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA }).catch((err) => {
      debugLog('handleSummarizePage: Panel not opened yet', err);
    });
    setPanelOpen();
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const newYPosition = draggedYPosition + info.offset.y;
    setDraggedYPosition(newYPosition);
    localStorage.setItem('toggleYPosition', newYPosition.toString());
    debugLog('Toggle: [handleDragEnd] newYPosition', newYPosition);
  };

  useEffect(() => {
    const savedYPositionString = localStorage.getItem('toggleYPosition');
    if (savedYPositionString) {
      const savedYPosition = parseFloat(savedYPositionString);
      debugLog('Toggle: [useEffect] Loaded savedYPosition from localStorage', savedYPosition);
      setDraggedYPosition(savedYPosition);
    }
  }, []);

  return (
    <motion.div
      drag="y"
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      style={{ y: draggedYPosition }}
      className="sz:fixed sz:right-0 sz:bottom-[26px] sz:flex sz:flex-col sz:items-end sz:z-2147483647"
    >
      <div
        className="sz:flex sz:flex-col sz:items-end sz:z-2147483647"
        style={{
          pointerEvents: isVisible ? 'auto' : 'none',
        }}
      >
        <div
          onMouseEnter={() => setIsHoveringMenu(true)}
          onMouseLeave={() => setIsHoveringMenu(false)}
          className={`
            sz:flex sz:flex-col
            sz:items-center
            sz:pb-[8px]
            sz:pr-[8px]
            sz:transition-all sz:duration-300
            sz:z-2147483647
            ${
              isVisible
                ? 'sz:opacity-100 sz:translate-x-0 sz:pointer-events-auto'
                : 'sz:opacity-0 sz:translate-x-[8px] sz:pointer-events-none'
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
              icon={
                <TranslateIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />
              }
              tooltipMessage={tooltipMessages[1]}
              onClick={() => getPageTranslationService().toggle()}
            />

            <OverlayMenuItem
              icon={<BookIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />}
              tooltipMessage={tooltipMessages[2]}
              onClick={() => handleSummarizePage()}
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
            pointerEvents: 'auto',
          }}
        >
          <CharacterPickToggle index={characterIndex} />
        </div>
      </div>
    </motion.div>
  );
};

export default Toggle;
