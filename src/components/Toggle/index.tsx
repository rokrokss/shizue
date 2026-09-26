import BookIcon from '@/assets/icons/book.svg?react';
import CloseIcon from '@/assets/icons/close.svg?react';
import MemoIcon from '@/assets/icons/note.svg?react';
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
  MESSAGE_CONTEXT_MENU_DESCRIBE_IMAGE,
  MESSAGE_CONTEXT_MENU_EXTRACT_IMAGE_TEXT,
  MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  SUMMARY_PAGE_TEXT_MAX_CHARS,
} from '@/config/constants';
import { Language, useTranslateTargetLanguage } from '@/hooks/language';
import {
  useShowToggle,
  useThemeValue,
  useToggleHiddenSiteList,
  useToggleYPosition,
} from '@/hooks/layout';
import { useAnyModelAvailable, useModelAvailability, useTranslateModel } from '@/hooks/models';
import { hashStringToIndex } from '@/lib/hash';
import {
  initDescribeImageContent,
  initExtractImageTextContent,
  initMemoPageContent,
  initSummarizePageContent,
} from '@/lib/initPanelData';
import { languageOptions } from '@/lib/language';
import { MODEL_OPTIONS, MODELS, TranslateModel } from '@/lib/modelRegistry';
import { getPageTranslator } from '@/lib/pageTranslator';
import { debugLog } from '@/logs';
import { panelService } from '@/services/panelService';
import { Button, Select } from 'antd';
import { motion, PanInfo } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const modelAvailability = useModelAvailability();
  const anyModelAvailable = useAnyModelAvailable();
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

  const [delayedVisible, setDelayedVisible] = useState(isVisible);

  useEffect(() => {
    if (isVisible) {
      // 즉시 표시
      setDelayedVisible(true);
    } else {
      // 0.2초 지연 후 숨김
      const timeout = setTimeout(() => {
        setDelayedVisible(false);
      }, 200);

      return () => clearTimeout(timeout);
    }
  }, [isVisible]);

  const width = 43;
  const height = 43;
  const widthFull = 55;
  const menuIconSize = 23;

  const tooltipMessages = [
    t('overlayMenu.translateSettings'),
    t('overlayMenu.translatePage'),
    t('overlayMenu.summarizePage'),
    t('overlayMenu.removeTranslation'),
    t('memo.memo'),
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
    const newYPosition = constrain(toggleYPosition);
    setToggleYPosition(newYPosition);
    setMotionDivId(motionDivId + 1);
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
    if (!anyModelAvailable) {
      debugLog('Translate page clicked but not able to open translate settings');
      setPanelOpen();
      return;
    }

    if (newOpen && translateSettingsPopoverTriggerRef.current) {
      const rect = translateSettingsPopoverTriggerRef.current.getBoundingClientRect();
      setSettingsTriggerYPosition(rect.top + 34);
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

  const handleSummarizePage = useCallback(async () => {
    debugLog('Summarize page clicked');
    if (isDragging) return;
    const pageText = document.body.innerText.slice(0, SUMMARY_PAGE_TEXT_MAX_CHARS);
    await initSummarizePageContent(document.title, pageText, window.location.href);
    void chrome.runtime.sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA }).catch((err) => {
      debugLog('handleSummarizePage: Panel not opened yet', err);
    });
    setPanelOpen();
  }, [isDragging]);

  const handleDescribeImage = useCallback(
    async (srcUrl: string) => {
      debugLog('Describe image clicked', srcUrl);
      if (isDragging) return;

      // 이미지를 다운로드하여 Base64로 변환
      try {
        const response = await fetch(srcUrl);
        const blob = await response.blob();
        const reader = new FileReader();

        reader.onload = async () => {
          const base64 = reader.result as string;
          // GlobalState에 이미지 데이터 저장
          await initDescribeImageContent(base64, srcUrl);
          void chrome.runtime
            .sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA })
            .catch((err) => {
              debugLog('handleDescribeImage: Panel not opened yet', err);
            });
          setPanelOpen();
        };

        reader.readAsDataURL(blob);
      } catch (error) {
        debugLog('handleDescribeImage: Failed to load image', error);
      }
    },
    [isDragging]
  );

  const handleExtractImageText = useCallback(
    async (srcUrl: string) => {
      debugLog('Extract image text clicked', srcUrl);
      if (isDragging) return;

      // 이미지를 다운로드하여 Base64로 변환
      try {
        const response = await fetch(srcUrl);
        const blob = await response.blob();
        const reader = new FileReader();

        reader.onload = async () => {
          const base64 = reader.result as string;
          // GlobalState에 이미지 데이터 저장
          await initExtractImageTextContent(base64, srcUrl);
          void chrome.runtime
            .sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA })
            .catch((err) => {
              debugLog('handleExtractImageText: Panel not opened yet', err);
            });
          setPanelOpen();
        };

        reader.readAsDataURL(blob);
      } catch (error) {
        debugLog('handleExtractImageText: Failed to load image', error);
      }
    },
    [isDragging]
  );

  const constrain = (yPosition: number) => {
    const viewportHeight = window.innerHeight;
    const toggleHeight = 90;
    const minY = toggleHeight - viewportHeight;
    const maxY = 18;

    return Math.max(minY, Math.min(maxY, yPosition));
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const newYPosition = constrain(toggleYPosition + info.offset.y);
    setToggleYPosition(newYPosition);
    setMotionDivId(motionDivId + 1);
    debugLog('Toggle: [handleDragEnd] newYPosition', newYPosition);
  };

  useEffect(() => {
    debugLog('Toggle: [useEffect] toggleYPosition', toggleYPosition, 'motionDivId', motionDivId);
    setMotionDivId(motionDivId + 1);
  }, [toggleYPosition]);

  const handleMemoClick = async () => {
    debugLog('handleMemoClick');
    if (isDragging) return;
    await initMemoPageContent();
    void chrome.runtime.sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA }).catch((err) => {
      debugLog('handleMemoClick: Panel not opened yet', err);
    });
    setPanelOpen();
  };

  const handleTranslatePage = useCallback(async () => {
    debugLog('Translate page clicked');

    if (isDragging) return;

    if (!anyModelAvailable) {
      debugLog('Translate page clicked but not able to translate, no model available');
      setPanelOpen();
      return;
    }

    if (isTranslationActive) {
      getPageTranslator().deactivate();
    } else {
      getPageTranslator().activate(targetLanguage as Language);
    }

    setIsTranslationActive(!isTranslationActive);
  }, [isDragging, isTranslationActive, targetLanguage, anyModelAvailable]);

  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.action === MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE) {
        if (!isTranslationActiveRef.current) handleTranslatePage();
      } else if (message.action === MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE) {
        handleSummarizePage();
      } else if (message.action === MESSAGE_CONTEXT_MENU_DESCRIBE_IMAGE) {
        handleDescribeImage(message.srcUrl);
      } else if (message.action === MESSAGE_CONTEXT_MENU_EXTRACT_IMAGE_TEXT) {
        handleExtractImageText(message.srcUrl);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [handleTranslatePage, handleSummarizePage, handleDescribeImage]);

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
            pointerEvents: delayedVisible ? 'auto' : 'none',
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
                delayedVisible
                  ? 'sz:opacity-100 sz:translate-x-0 sz:pointer-events-auto sz:max-h-[600px]'
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
                icon={<MemoIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />}
                tooltipMessage={tooltipMessages[4]}
                onClick={handleMemoClick}
                hideTooltip={translateSettingsModalOpen || closeIconModalOpen}
              />
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
                          data-set-margin="true"
                          className={`sz:font-ycom sz:text-[16px] sz:mb-[2px] sz:mt-0 sz:mr-0 sz:ml-0 sz:text-center sz:leading-[16px] ${
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
                            options={MODEL_OPTIONS.map((value) => {
                              const validated = modelAvailability[value];
                              return {
                                value,
                                label: MODELS[value].label,
                                className: 'sz:font-ycom',
                                styles: {
                                  color: validated
                                    ? theme == 'dark'
                                      ? 'white'
                                      : 'rgb(55, 65, 81)'
                                    : theme == 'dark'
                                    ? 'rgba(255, 255, 255, 0.25)'
                                    : 'rgba(55, 65, 81, 0.25)',
                                },
                                disabled: !validated,
                              };
                            })}
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
                hideTooltip={translateSettingsModalOpen || closeIconModalOpen}
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
                hideTooltip={translateSettingsModalOpen || closeIconModalOpen}
              />

              <OverlayMenuItem
                theme={theme}
                icon={<BookIcon className={`sz:w-[${menuIconSize}px] sz:h-[${menuIconSize}px]`} />}
                tooltipMessage={tooltipMessages[2]}
                onClick={handleSummarizePage}
                hideTooltip={translateSettingsModalOpen || closeIconModalOpen}
              />
            </OverlayMenu>
          </div>
          <div
            onMouseEnter={() => setIsHoveringCharacter(true)}
            onMouseLeave={() => setIsHoveringCharacter(false)}
            className="sz:flex sz:items-center sz:justify-center sz:cursor-pointer sz:shadow-lg sz:shadow-cyan-400/20 sz:z-2147483647"
            onClick={handleClick}
            style={{
              width: delayedVisible ? `${widthFull}px` : `${width}px`,
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
            data-set-margin="true"
            className="sz:relative sz:mr-0 sz:ml-0 sz:mb-0"
            style={{
              opacity: delayedVisible && !closeIconModalOpen ? 1 : 0,
              pointerEvents: delayedVisible && !closeIconModalOpen ? 'auto' : 'none',
              width:
                delayedVisible && !closeIconModalOpen ? `${widthFull + 12}px` : `${width + 12}px`,
              transition:
                delayedVisible && !closeIconModalOpen ? 'opacity 0.2s ease-in-out' : 'none',
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
                    data-set-margin="true"
                    className={`sz:font-ycom sz:text-[16px] sz:mb-[2px] sz:mt-0 sz:mr-0 sz:ml-0sz:text-center sz:leading-[16px] ${
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
