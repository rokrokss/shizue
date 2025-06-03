import BookIcon from '@/assets/icons/book.svg?react';
import SettingIcon from '@/assets/icons/setting.svg?react';
import TranslateIcon from '@/assets/icons/translate.svg?react';
import TranslateCheckIcon from '@/assets/icons/translate_check.svg?react';
import CharacterPickToggle, {
  characterCountChat,
} from '@/components/Character/CharacterPickToggle';
import TogglePopoverModal from '@/components/Modal/TogglePopoverModal';
import OverlayMenu from '@/components/Toggle/OverlayMenu';
import OverlayMenuItem from '@/components/Toggle/OverlayMenuItem';
import {
  MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
} from '@/config/constants';
import { useLayout } from '@/hooks/layout';
import { hashStringToIndex } from '@/lib/hash';
import { languageOptions } from '@/lib/language';
import { TranslateModel } from '@/lib/models';
import { getPageTranslator } from '@/lib/pageTranslator';
import { initSummarizePageContent } from '@/lib/summarize';
import { debugLog } from '@/logs';
import { panelService } from '@/services/panelService';
import { translationService } from '@/services/translationService';
import { Select } from 'antd';
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
  const [layout, setLayout] = useLayout();
  const [isTranslationActive, setIsTranslationActive] = useState(false);
  const isTranslationActiveRef = useRef(isTranslationActive);
  const [settingsTriggerYPosition, setSettingsTriggerYPosition] = useState(0);
  const [models, setModels] = useModels();
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();

  const isVisible =
    isHoveringCharacter || isHoveringMenu || translateSettingsModalOpen || isTranslationActive;

  const width = 43;
  const height = 43;
  const widthFull = 55;
  const menuIconSize = 20;

  const tooltipMessages = [
    t('overlayMenu.translateSettings'),
    t('overlayMenu.translatePage'),
    t('overlayMenu.summarizePage'),
    t('overlayMenu.removeTranslation'),
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

  useEffect(() => {
    isTranslationActiveRef.current = isTranslationActive;
  }, [isTranslationActive]);

  const setPanelOpenOrNot = () => {
    panelService.setPanelOpenOrNot();
  };

  const setPanelOpen = () => {
    panelService.openPanel();
  };

  const handleClick = () => {
    debugLog('Toggle clicked');
    if (isDragging) return;
    setPanelOpenOrNot();
  };

  const handleTranslateSettingsOpenChange = (newOpen: boolean) => {
    if (newOpen && translateSettingsPopoverTriggerRef.current) {
      const rect = translateSettingsPopoverTriggerRef.current.getBoundingClientRect();
      setSettingsTriggerYPosition(rect.top);
      debugLog('handleTranslateSettingsOpenChange: Settings trigger Y position:', rect.top);
    }
    setTranslateSettingsModalOpen(newOpen);
  };

  const handleSelectTranslateModel = (model: string) => {
    setModels((prev) => ({
      ...prev,
      translateModel: model as TranslateModel,
    }));
  };

  const handleSelectTargetLanguage = (language: string) => {
    setTargetLanguage(language as Language);
  };

  const handleSummarizePage = async () => {
    debugLog('Summarize page clicked');
    if (isDragging) return;
    const pageText = document.body.innerText;
    await initSummarizePageContent(document.title, pageText, window.location.href);
    void chrome.runtime.sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA }).catch((err) => {
      debugLog('handleSummarizePage: Panel not opened yet', err);
    });
    setPanelOpen();
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const newYPosition = layout.toggleYPosition + info.offset.y;
    setLayout({ ...layout, toggleYPosition: newYPosition });
    debugLog('Toggle: [handleDragEnd] newYPosition', newYPosition);
  };

  const handleTranslatePage = useCallback(async () => {
    debugLog('Translate page clicked');

    if (isDragging) return;

    const canTranslate = await translationService.canTranslate();
    if (!canTranslate) {
      debugLog('Translate page clicked but not able to translate');
      return;
    }

    getPageTranslator().toggle();
    setIsTranslationActive(!isTranslationActive);
  }, [isDragging, isTranslationActive]);

  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.action === MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE) {
        if (!isTranslationActiveRef.current) handleTranslatePage();
      } else if (message.action === MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE) {
        handleSummarizePage();
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  return (
    layout.showToggle && (
      <motion.div
        drag="y"
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ y: layout.toggleYPosition }}
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
              <OverlayMenuItem
                icon={
                  <SettingIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />
                }
                tooltipMessage={tooltipMessages[0]}
                onClick={() => handleTranslateSettingsOpenChange(!translateSettingsModalOpen)}
                ref={translateSettingsPopoverTriggerRef}
                popoverContent={
                  <TogglePopoverModal
                    triggerRef={translateSettingsPopoverTriggerRef}
                    settingsTriggerYPosition={settingsTriggerYPosition}
                    onClose={() => handleTranslateSettingsOpenChange(false)}
                    content={
                      <div className="sz:flex sz:flex-col sz:items-center sz:gap-[10px]">
                        <div className="sz:font-ycom sz:text-black sz:text-[16px] sz:mb-[2px] sz:text-center">
                          {t('overlayMenu.translateSettings')}
                        </div>
                        <div className="sz:flex sz:flex-row sz:items-center sz:gap-[10px] sz:w-full sz:justify-between">
                          <div className="sz:font-ycom sz:text-gray-700 sz:text-[14px]">
                            {t('settings.translateModel')}
                          </div>
                          <Select
                            value={models.translateModel}
                            onChange={handleSelectTranslateModel}
                            className="sz:font-ycom sz:w-[150px]"
                            getPopupContainer={() => {
                              const modal = document.getElementsByClassName(
                                'sz-toggle-translate-settings-modal'
                              )[0];
                              return modal as HTMLElement;
                            }}
                            size="small"
                            options={[
                              {
                                value: 'gpt-4.1',
                                label: 'GPT 4.1',
                                className: 'sz:font-ycom sz:text-gray-700',
                              },
                              {
                                value: 'gpt-4.1-mini',
                                label: 'GPT 4.1 Mini',
                                className: 'sz:font-ycom sz:text-gray-700',
                              },
                              {
                                value: 'wip',
                                label: t('onboarding.selectProvider.chatGPTWebApp.title'),
                                className: 'sz:font-ycom',
                                disabled: true,
                              },
                            ]}
                          />
                        </div>
                        <div className="sz:flex sz:flex-row sz:items-center sz:gap-[10px] sz:w-full sz:justify-between">
                          <div className="sz:text-gray-700 sz:text-[14px] sz:font-ycom">
                            {t('settings.targetLanguage')}
                          </div>
                          <Select
                            value={targetLanguage}
                            onChange={handleSelectTargetLanguage}
                            className="sz:font-ycom sz:w-[150px] sz:text-gray-700"
                            getPopupContainer={() => {
                              const modal = document.getElementsByClassName(
                                'sz-toggle-translate-settings-modal'
                              )[0];
                              return modal as HTMLElement;
                            }}
                            size="small"
                            options={languageOptions(t)}
                            optionRender={(option) => {
                              return (
                                <div className="sz:font-ycom sz:text-gray-700">
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
                        </div>
                      </div>
                    }
                  />
                }
                isPopoverOpen={translateSettingsModalOpen}
              />

              <OverlayMenuItem
                icon={
                  isTranslationActive ? (
                    <TranslateCheckIcon
                      className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`}
                    />
                  ) : (
                    <TranslateIcon
                      className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`}
                    />
                  )
                }
                tooltipMessage={isTranslationActive ? tooltipMessages[3] : tooltipMessages[1]}
                onClick={handleTranslatePage}
              />

              <OverlayMenuItem
                icon={<BookIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />}
                tooltipMessage={tooltipMessages[2]}
                onClick={handleSummarizePage}
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
    )
  );
};

export default Toggle;
