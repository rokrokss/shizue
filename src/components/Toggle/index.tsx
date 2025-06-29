import BookIcon from '@/assets/icons/book.svg?react';
import CloseIcon from '@/assets/icons/close.svg?react';
import SettingIcon from '@/assets/icons/setting.svg?react';
import TranslateIcon from '@/assets/icons/translate.svg?react';
import TranslateCheckIcon from '@/assets/icons/translate_check.svg?react';
import CharacterPickToggle, {
  characterCountChat,
} from '@/components/Character/CharacterPickToggle';
import ToggleClosePopoverModal from '@/components/Modal/ToggleClosePopoverModal';
import TogglePopoverModal from '@/components/Modal/TogglePopoverModal';
import OverlayMenu from '@/components/Toggle/OverlayMenu';
import OverlayMenuItem from '@/components/Toggle/OverlayMenuItem';
import {
  MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
} from '@/config/constants';
import { Language } from '@/hooks/language';
import { useShowToggle, useToggleHiddenSiteList, useToggleYPosition } from '@/hooks/layout';
import {
  useGeminiValidatedValue,
  useOpenAIValidatedValue,
  useTranslateModel,
} from '@/hooks/models';
import { hashStringToIndex } from '@/lib/hash';
import { languageOptions } from '@/lib/language';
import { TranslateModel } from '@/lib/models';
import { getPageTranslator } from '@/lib/pageTranslator';
import { initSummarizePageContent } from '@/lib/summarize';
import { debugLog } from '@/logs';
import { panelService } from '@/services/panelService';
import { Button, Select } from 'antd';
import { motion, PanInfo } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Toggle = () => {
  const { t } = useTranslation();

  const toggleRef = useRef<HTMLDivElement>(null);
  const translateSettingsPopoverTriggerRef = useRef<HTMLDivElement>(null);
  const closeModalTriggerRef = useRef<HTMLDivElement>(null);

  const [isHoveringCharacter, setIsHoveringCharacter] = useState(false);
  const [isHoveringClose, setIsHoveringClose] = useState(false);
  const [isHoveringMenu, setIsHoveringMenu] = useState(false);
  const [characterIndex, setCharacterIndex] = useState(0);
  const [translateSettingsModalOpen, setTranslateSettingsModalOpen] = useState(false);
  const [closeIconModalOpen, setCloseIconModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [toggleYPosition, setToggleYPosition] = useToggleYPosition();
  const [isTranslationActive, setIsTranslationActive] = useState(false);
  const isTranslationActiveRef = useRef(isTranslationActive);
  const [settingsTriggerYPosition, setSettingsTriggerYPosition] = useState(0);
  const [closeIconTriggerYPosition, setCloseIconTriggerYPosition] = useState(0);
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();
  const theme = useThemeValue();
  const [translateModel, setTranslateModel] = useTranslateModel();
  const [motionDivId, setMotionDivId] = useState(0);
  const openAIValidated = useOpenAIValidatedValue();
  const geminiValidated = useGeminiValidatedValue();
  const [showToggle, setShowToggle] = useShowToggle();
  const [toggleHiddenSiteList, setToggleHiddenSiteList] = useToggleHiddenSiteList();
  const [isHoveringHideFromCurrentSite, setIsHoveringHideFromCurrentSite] = useState(false);
  const [isHoveringHideFromAllSites, setIsHoveringHideFromAllSites] = useState(false);

  const isVisible =
    isHoveringCharacter ||
    isHoveringMenu ||
    translateSettingsModalOpen ||
    isTranslationActive ||
    isHoveringClose ||
    closeIconModalOpen;

  const width = 43;
  const height = 43;
  const widthFull = 55;
  const menuIconSize = 23;

  const tooltipMessages = [
    t('overlayMenu.translateSettings'),
    t('overlayMenu.translatePage'),
    t('overlayMenu.summarizePage'),
    t('overlayMenu.removeTranslation'),
  ];

  const getCurrentDomain = useCallback(() => {
    return window.location.hostname;
  }, []);

  const isCurrentSiteHidden = useMemo(() => {
    if (!showToggle) return true;
    const currentDomain = getCurrentDomain();
    debugLog('currentDomain', currentDomain, 'toggleHiddenSiteList', toggleHiddenSiteList);
    return toggleHiddenSiteList.includes(currentDomain);
  }, [toggleHiddenSiteList, showToggle, getCurrentDomain]);

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
    if (!openAIValidated && !geminiValidated) {
      debugLog('Translate page clicked but not able to open translate settings');
      setPanelOpen();
      return;
    }

    if (newOpen && translateSettingsPopoverTriggerRef.current) {
      const rect = translateSettingsPopoverTriggerRef.current.getBoundingClientRect();
      setSettingsTriggerYPosition(rect.top);
      debugLog('handleTranslateSettingsOpenChange: Settings trigger Y position:', rect.top);
    }
    setTranslateSettingsModalOpen(newOpen);
  };

  const handleCloseIconClick = (newOpen: boolean) => {
    if (newOpen && closeModalTriggerRef.current) {
      const rect = closeModalTriggerRef.current.getBoundingClientRect();
      const triggerYPosition = rect.top - 150;
      setCloseIconTriggerYPosition(triggerYPosition);
      debugLog('handleCloseIconClick: Close icon trigger Y position:', triggerYPosition);
    }
    setCloseIconModalOpen(newOpen);
  };

  const handleHideToggle = () => {
    setCloseIconModalOpen(false);
    setShowToggle(false);
  };

  const handleHideToggleFromCurrentSite = () => {
    setCloseIconModalOpen(false);
    setToggleHiddenSiteList([...toggleHiddenSiteList, getCurrentDomain()]);
  };

  const handleSelectTranslateModel = (model: string) => {
    setTranslateModel(model as TranslateModel);
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
    const newYPosition = toggleYPosition + info.offset.y;
    setToggleYPosition(newYPosition);
    debugLog('Toggle: [handleDragEnd] newYPosition', newYPosition);
  };

  useEffect(() => {
    debugLog('Toggle: [useEffect] toggleYPosition', toggleYPosition, 'motionDivId', motionDivId);
    setMotionDivId(motionDivId + 1);
  }, [toggleYPosition]);

  const handleTranslatePage = useCallback(async () => {
    debugLog('Translate page clicked');

    if (isDragging) return;

    if (!openAIValidated && !geminiValidated) {
      debugLog(
        'Translate page clicked but not able to translate, openAIValidated',
        openAIValidated,
        'geminiValidated',
        geminiValidated
      );
      setPanelOpen();
      return;
    }

    if (isTranslationActive) {
      getPageTranslator().deactivate();
    } else {
      getPageTranslator().activate(targetLanguage as Language);
    }

    setIsTranslationActive(!isTranslationActive);
  }, [isDragging, isTranslationActive, targetLanguage, openAIValidated, geminiValidated]);

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
    !isCurrentSiteHidden && (
      <motion.div
        key={motionDivId}
        drag="y"
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{
          y: toggleYPosition,
          filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none',
        }}
        className="sz:fixed sz:right-0 sz:bottom-[26px] sz:flex sz:flex-col sz:items-end sz:z-2147483647"
      >
        <div
          className="sz:flex sz:flex-col sz:items-end sz:z-2147483647"
          style={{
            pointerEvents: isVisible ? 'auto' : 'none',
          }}
          ref={toggleRef}
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
              sz:overflow-hidden
              ${
                isVisible
                  ? 'sz:opacity-100 sz:translate-x-0 sz:pointer-events-auto sz:max-h-[500px]'
                  : 'sz:opacity-0 sz:translate-x-[8px] sz:pointer-events-none sz:max-h-0'
              }
            `}
            style={{
              transition: 'opacity 0.3s ease-in-out, translate 0.3s ease-in-out',
            }}
          >
            <OverlayMenu>
              <OverlayMenuItem
                theme={theme}
                icon={
                  <SettingIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />
                }
                tooltipMessage={tooltipMessages[0]}
                onClick={() => handleTranslateSettingsOpenChange(!translateSettingsModalOpen)}
                ref={translateSettingsPopoverTriggerRef}
                popoverContent={
                  <TogglePopoverModal
                    toggleRef={toggleRef}
                    triggerRef={translateSettingsPopoverTriggerRef}
                    settingsTriggerYPosition={settingsTriggerYPosition}
                    onClose={() => handleTranslateSettingsOpenChange(false)}
                    theme={theme}
                    content={
                      <div className="sz:flex sz:flex-col sz:items-center sz:gap-[10px]">
                        <div
                          className={`sz:font-ycom sz:text-[16px] sz:mb-[2px] sz:text-center sz:leading-[16px] ${
                            theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                          }`}
                        >
                          {t('overlayMenu.translateSettings')}
                        </div>
                        <div className="sz:flex sz:flex-row sz:items-center sz:gap-[10px] sz:w-full sz:justify-between">
                          <div
                            className={`sz:font-ycom sz:text-[14px] ${
                              theme == 'dark' ? 'sz:text-white' : 'sz:text-gray-700'
                            }`}
                          >
                            {t('settings.translateModel')}
                          </div>
                          <Select
                            value={translateModel}
                            onChange={handleSelectTranslateModel}
                            className="sz:font-ycom sz:w-[180px]"
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
                                className: 'sz:font-ycom',
                                styles: {
                                  color: openAIValidated
                                    ? theme == 'dark'
                                      ? 'white'
                                      : 'rgb(55, 65, 81)'
                                    : theme == 'dark'
                                    ? 'rgba(255, 255, 255, 0.25)'
                                    : 'rgba(55, 65, 81, 0.25)',
                                },
                                disabled: !openAIValidated,
                              },
                              {
                                value: 'gpt-4.1-mini',
                                label: 'GPT 4.1 Mini',
                                className: 'sz:font-ycom',
                                styles: {
                                  color: openAIValidated
                                    ? theme == 'dark'
                                      ? 'white'
                                      : 'rgb(55, 65, 81)'
                                    : theme == 'dark'
                                    ? 'rgba(255, 255, 255, 0.25)'
                                    : 'rgba(55, 65, 81, 0.25)',
                                },
                                disabled: !openAIValidated,
                              },
                              {
                                value: 'gemini-2.5-flash',
                                label: 'Gemini 2.5 Flash',
                                className: 'sz:font-ycom',
                                styles: {
                                  color: geminiValidated
                                    ? theme == 'dark'
                                      ? 'white'
                                      : 'rgb(55, 65, 81)'
                                    : theme == 'dark'
                                    ? 'rgba(255, 255, 255, 0.25)'
                                    : 'rgba(55, 65, 81, 0.25)',
                                },
                                disabled: !geminiValidated,
                              },
                              {
                                value: 'gemini-2.5-flash-lite-preview-06-17',
                                label: 'Gemini 2.5 Flash Lite',
                                className: 'sz:font-ycom',
                                styles: {
                                  color: geminiValidated
                                    ? theme == 'dark'
                                      ? 'white'
                                      : 'rgb(55, 65, 81)'
                                    : theme == 'dark'
                                    ? 'rgba(255, 255, 255, 0.25)'
                                    : 'rgba(55, 65, 81, 0.25)',
                                },
                                disabled: !geminiValidated,
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
                          <div
                            className={`sz:text-[14px] sz:font-ycom ${
                              theme == 'dark' ? 'sz:text-white' : 'sz:text-gray-700'
                            }`}
                          >
                            {t('settings.targetLanguage')}
                          </div>
                          <Select
                            value={targetLanguage}
                            onChange={handleSelectTargetLanguage}
                            className="sz:font-ycom sz:w-[180px] sz:text-gray-700"
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
                                <div
                                  className={`sz:font-ycom ${
                                    theme == 'dark' ? 'sz:text-white' : 'sz:text-gray-700'
                                  }`}
                                >
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
                theme={theme}
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
                theme={theme}
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
          <div
            className="sz:relative"
            style={{
              opacity: isVisible && !closeIconModalOpen ? 1 : 0,
              pointerEvents: isVisible && !closeIconModalOpen ? 'auto' : 'none',
              width: isVisible && !closeIconModalOpen ? `${widthFull + 12}px` : `${width + 12}px`,
              transition: isVisible && !closeIconModalOpen ? 'opacity 0.2s ease-in-out' : 'none',
              marginTop: '-4.5px',
            }}
            onMouseEnter={() => setIsHoveringClose(true)}
            onMouseLeave={() => setIsHoveringClose(false)}
            ref={closeModalTriggerRef}
          >
            <CloseIcon
              className="sz:w-[14px] sz:h-[14px] sz:cursor-pointer"
              onClick={() => handleCloseIconClick(!closeIconModalOpen)}
            />
          </div>
          {closeIconModalOpen && (
            <ToggleClosePopoverModal
              toggleRef={toggleRef}
              settingsTriggerYPosition={closeIconTriggerYPosition}
              onClose={() => handleCloseIconClick(false)}
              theme={theme}
              content={
                <div className="sz:flex sz:flex-col sz:items-center sz:gap-[10px]">
                  <div
                    className={`sz:font-ycom sz:text-[16px] sz:mb-[2px] sz:text-center sz:leading-[16px] ${
                      theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                    }`}
                  >
                    {t('layout.hideToggle')}
                  </div>
                  <div className="sz:flex sz:flex-col sz:items-center sz:gap-[10px]">
                    <Button
                      type="default"
                      size="middle"
                      className={`sz:w-full sz:text-[14px] sz:font-ycom`}
                      onMouseEnter={() => setIsHoveringHideFromCurrentSite(true)}
                      onMouseLeave={() => setIsHoveringHideFromCurrentSite(false)}
                      style={{
                        border: isHoveringHideFromCurrentSite
                          ? '1px solid #32CCBC'
                          : theme == 'dark'
                          ? '1px solid #434343'
                          : '1px solid #d9d9d9',
                      }}
                      onClick={handleHideToggleFromCurrentSite}
                    >
                      {t('layout.hideFromCurrentSite')}
                    </Button>
                    <Button
                      type="default"
                      size="middle"
                      className={`sz:w-full sz:text-[14px] sz:font-ycom`}
                      onMouseEnter={() => setIsHoveringHideFromAllSites(true)}
                      onMouseLeave={() => setIsHoveringHideFromAllSites(false)}
                      style={{
                        border: isHoveringHideFromAllSites
                          ? '1px solid #32CCBC'
                          : theme == 'dark'
                          ? '1px solid #434343'
                          : '1px solid #d9d9d9',
                      }}
                      onClick={handleHideToggle}
                    >
                      {t('layout.hideFromAllSites')}
                    </Button>
                  </div>
                </div>
              }
            />
          )}
        </div>
      </motion.div>
    )
  );
};

export default Toggle;
