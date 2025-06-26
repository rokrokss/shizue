import LanguageOptionItem from '@/components/Youtube/LanguageOptionItem';
import { Language, useTranslateTargetLanguage } from '@/hooks/language';
import {
  useShowYoutubeBilingualCaption,
  useShowYoutubeCaptionToggleValue,
  useYoutubeCaptionSizeRatio,
} from '@/hooks/layout';
import { useGeminiValidatedValue, useOpenAIValidatedValue } from '@/hooks/models';
import { getCaptionInjector } from '@/lib/captionInjector';
import { languageOptions } from '@/lib/language';
import useAdObserver from '@/lib/useAdObserver';
import { getVideoData, getVideoId } from '@/lib/youtube';
import { debugLog } from '@/logs';
import { panelService } from '@/services/panelService';
import { LoadingOutlined, ReadFilled } from '@ant-design/icons';
import {
  Button,
  ConfigProvider,
  Divider,
  Dropdown,
  InputNumber,
  Popover,
  Space,
  Switch,
  theme,
  Tooltip,
} from 'antd';
import { cloneElement, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ERROR_TO_IGNORE = 'trigger element and popup element should in same shadow root';
const originalError = console.error;
console.error = (...args) => {
  const [firstArg] = args;
  if (typeof firstArg === 'string' && firstArg.includes(ERROR_TO_IGNORE)) {
    return;
  }
  originalError.apply(console, args);
};

const YoutubeCaptionToggle = () => {
  const { t } = useTranslation();

  const [isCaptionAvailable, setIsCaptionAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<Language>('English');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const [isLanguagePopoverOpen, setIsLanguagePopoverOpen] = useState(false);
  const [isActivated, setIsActivated] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const [numLines, setNumLines] = useState(1);
  const [storedTargetLanguage, setStoredTargetLanguage] = useTranslateTargetLanguage();
  const showToggleRef = useRef<boolean>(false);
  const showYoutubeCaptionToggle = useShowYoutubeCaptionToggleValue();
  const [showYoutubeBilingualCaption, setShowYoutubeBilingualCaption] =
    useShowYoutubeBilingualCaption();
  const [captionSizeRatio, setCaptionSizeRatio] = useYoutubeCaptionSizeRatio();
  const openAIValidated = useOpenAIValidatedValue();
  const geminiValidated = useGeminiValidatedValue();

  const lastVideoIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const isAdPlaying = () => {
    const ad = document.querySelector<HTMLDivElement>('.ytp-ad-module');
    return !!ad && ((ad.textContent?.trim().length ?? 0) > 0 || ad.childElementCount > 0);
  };

  const refreshCaptionStatus = useCallback(async () => {
    if (!showToggleRef.current) return;
    if (inFlightRef.current) return;
    if (!window.location.pathname.includes('watch') || isAdPlaying()) {
      debugLog('[YouTube] refreshCaptionStatus: not watch page or ad is playing');
      setIsCaptionAvailable(false);
      setIsDropdownOpen(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const vid = getVideoId();
    if (!vid || vid === lastVideoIdRef.current) return;

    inFlightRef.current = true;
    setIsDropdownOpen(false);
    setIsLoading(false);
    setIsActivated(false);
    getCaptionInjector().clear();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    try {
      lastVideoIdRef.current = vid;
      debugLog('[YouTube] checking captions for', vid);

      const data = await getVideoData(vid);
      debugLog('[Youtube] videoData', data);

      const videoElement = document.querySelector('video');

      if (data?.transcriptMetadata && videoElement && data.metadata) {
        lastVideoIdRef.current = vid;
        setIsCaptionAvailable(true);
        getCaptionInjector().setVideoElement(videoElement as HTMLVideoElement);
        getCaptionInjector().setMetaData(data.transcriptMetadata, data.metadata);
      } else {
        setIsCaptionAvailable(false);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const handleAdStart = useCallback(() => {
    debugLog('[Youtube] useAdObserver: ad is started');
    setIsCaptionAvailable(false);
  }, []);

  const handleAdEnd = useCallback(() => {
    debugLog('[Youtube] useAdObserver: ad is finished');
    refreshCaptionStatus();
  }, [refreshCaptionStatus]);

  useAdObserver(handleAdStart, handleAdEnd);

  useEffect(() => {
    refreshCaptionStatus();

    window.addEventListener('yt-navigate-finish', refreshCaptionStatus, { passive: true });

    return () => {
      window.removeEventListener('yt-navigate-finish', refreshCaptionStatus);
      getCaptionInjector().clear();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [refreshCaptionStatus]);

  const handleSelectTargetLanguage = (language: string) => {
    setStoredTargetLanguage(language as Language);
  };

  const handleDropdownOpenChange = (open: boolean) => {
    if (!openAIValidated && !geminiValidated) {
      debugLog('Youtube caption toggle clicked but not able to open translate settings');
      panelService.openPanel();
      return;
    }

    setIsDropdownOpen(open);

    if (open) {
      const videoElement = document.querySelector('video');
      if (videoElement && !videoElement.paused) {
        videoElement.pause();
        debugLog('[YouTube] Video paused by dropdown click');
      }
    }
  };

  const stateRef = useRef({
    isActivated,
    isLoading,
  });

  useEffect(() => {
    stateRef.current = {
      isActivated,
      isLoading,
    };
  }, [isActivated, isLoading]);

  useEffect(() => {
    showToggleRef.current = showYoutubeCaptionToggle;

    if (showYoutubeCaptionToggle) {
      refreshCaptionStatus();
    } else {
      const videoElement = document.querySelector('video');
      if (videoElement && !videoElement.paused) {
        videoElement.pause();
        debugLog('[YouTube] Video paused by deactivate');
      }
      setTimeout(() => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        getCaptionInjector().deactivate();
        setIsLoading(false);
        setIsActivated(false);
        setIsDropdownOpen(false);
      }, 0);
    }
  }, [showYoutubeCaptionToggle]);

  const updateLoop = () => {
    const isCurrentCaptionTranslated = getCaptionInjector().updateCurrentTime();

    const { isActivated: currentIsActivated, isLoading: currentIsLoading } = stateRef.current;

    if (currentIsActivated && !isCurrentCaptionTranslated != currentIsLoading) {
      setIsLoading(!isCurrentCaptionTranslated);
    }
    animationFrameRef.current = requestAnimationFrame(updateLoop);
  };

  const handleGenerateCaption = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    debugLog('[YouTube] generate caption');
    setIsDropdownOpen(false);
    setIsLoading(true);

    // starting translation in the background
    getCaptionInjector().activate(
      targetLanguage,
      numLines,
      showYoutubeBilingualCaption,
      captionSizeRatio
    );

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    animationFrameRef.current = requestAnimationFrame(updateLoop);

    setIsActivated(true);
    const videoElement = document.querySelector('video');
    if (videoElement && videoElement.paused) {
      videoElement.play();
      debugLog('[YouTube] Video played by generate caption');
    }
  };

  const handleDeactivateCaption = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    debugLog('[YouTube] deactivate caption');
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    getCaptionInjector().deactivate();
    setIsLoading(false);
    setIsActivated(false);
    setIsDropdownOpen(false);
  };

  useEffect(() => {
    if (!dropdownTriggerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && isDropdownOpen) {
            setIsDropdownOpen(false);
            debugLog('[YouTube] Dropdown closed due to scrolling out of view.');
          }
        });
      },
      {
        root: null,
        threshold: 0.1,
      }
    );

    observer.observe(dropdownTriggerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    setTargetLanguage(storedTargetLanguage);
  }, [storedTargetLanguage]);

  return (
    isCaptionAvailable &&
    showYoutubeCaptionToggle && (
      <ConfigProvider
        prefixCls="sz-ant-"
        iconPrefixCls="sz-ant-icon-"
        theme={{
          token: {
            colorPrimary: '#32CCBC',
          },
          algorithm: theme.darkAlgorithm,
        }}
      >
        <div
          className="
            sz-youtube-caption-toggle
            sz:flex
            sz:flex-col
            sz:justify-center
            sz:items-center
            sz:h-full
            sz:px-2
            sz:mx-2
            sz:py-[2px]
            sz:rounded-lg
            sz:font-youtube
          "
          ref={dropdownTriggerRef}
        >
          <Tooltip
            placement="top"
            title={t('youtube.aiCaption')}
            arrow={false}
            styles={{
              body: {
                color: '#E8E9EA',
                backgroundColor: 'rgba(0, 0, 0, 0.72)',
                fontSize: '13px',
                maxHeight: '24px',
                marginBottom: '27px',
                paddingTop: '2px',
                paddingBottom: '2px',
                minHeight: '24px',
                height: '24px',
                borderRadius: '4px',
                display: isDropdownOpen ? 'none' : 'block',
              },
            }}
          >
            <Dropdown
              placement="top"
              trigger={['click']}
              overlayStyle={{
                paddingBottom: '24px',
              }}
              open={isDropdownOpen}
              onOpenChange={handleDropdownOpenChange}
              menu={{
                items: [
                  {
                    key: 'aiCaption',
                    label: (
                      <div
                        className="
                          sz:flex
                          sz:flex-row
                          sz:items-center
                          sz:gap-2
                          sz:cursor-default
                          sz:text-[13px]
                        "
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <span className="sz:text-white">{t('youtube.aiCaption')}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'selectLanguage',
                    label: (
                      <Popover
                        placement="rightBottom"
                        styles={{
                          body: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            transform: 'translateY(7px)',
                            marginLeft: '7px',
                            padding: 0,
                          },
                        }}
                        arrow={false}
                        open={isDropdownOpen && isLanguagePopoverOpen}
                        onOpenChange={setIsLanguagePopoverOpen}
                        content={
                          <div
                            className="
                              sz:flex
                              sz:flex-col
                              sz:rounded-lg
                              sz:m-0 sz:p-0
                            "
                            style={{
                              height: '170px',
                              overflowY: 'auto',
                            }}
                          >
                            {languageOptions(t).map((option, index) => {
                              const isFirst = index === 0;
                              const isLast = index === languageOptions(t).length - 1;
                              return (
                                <LanguageOptionItem
                                  key={option.value}
                                  option={option}
                                  isFirst={isFirst}
                                  isLast={isLast}
                                  onClick={() => {
                                    handleSelectTargetLanguage(option.value);
                                    setIsLanguagePopoverOpen(false);
                                  }}
                                />
                              );
                            })}
                          </div>
                        }
                      >
                        <div
                          className="
                            sz:flex
                            sz:flex-row
                            sz:items-center
                            sz:justify-between
                            sz:gap-4
                            sz:cursor-default
                            sz:text-[13px]
                          "
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <span className="sz:text-white">{t('settings.targetLanguage')}</span>
                          <span className="sz:text-gray-400">
                            {t(`language.${targetLanguage.split('_')[0]}`)}
                          </span>
                        </div>
                      </Popover>
                    ),
                  },
                  {
                    key: 'seeOriginal',
                    label: (
                      <div
                        className="
                          sz:flex
                          sz:flex-row
                          sz:items-center
                          sz:justify-between
                          sz:gap-4
                          sz:cursor-default
                          sz:text-[13px]
                        "
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <span className="sz:text-white">{t('youtube.bilingual')}</span>
                        <Switch
                          size="small"
                          checked={showYoutubeBilingualCaption}
                          onChange={setShowYoutubeBilingualCaption}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'numLines',
                    label: (
                      <div
                        className="
                          sz:flex
                          sz:flex-row
                          sz:items-center
                          sz:justify-between
                          sz:gap-4
                          sz:cursor-default
                          sz:text-[13px]
                        "
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <span className="sz:text-white">{t('youtube.numCaptLines')}</span>
                        <InputNumber
                          min={1}
                          max={5}
                          value={numLines}
                          size="small"
                          style={{ textAlign: 'right', fontSize: '12px', width: '45px' }}
                          onChange={(value) => {
                            if (value) {
                              setNumLines(value);
                            }
                          }}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'captionSizeRatio',
                    label: (
                      <div
                        className="
                          sz:flex
                          sz:flex-row
                          sz:items-center
                          sz:justify-between
                          sz:gap-4
                          sz:cursor-default
                          sz:text-[13px]
                        "
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <span className="sz:text-white">{t('youtube.captionSizeRatio')}</span>
                        <InputNumber<number>
                          defaultValue={captionSizeRatio * 100}
                          size="small"
                          min={0}
                          max={500}
                          step={5}
                          style={{ textAlign: 'right', fontSize: '12px', width: '67px' }}
                          formatter={(value) => `${value}%`}
                          parser={(value) => value?.replace('%', '') as unknown as number}
                          onChange={(value) => {
                            if (value) {
                              setCaptionSizeRatio(value / 100);
                            }
                          }}
                        />
                      </div>
                    ),
                  },
                ],
              }}
              popupRender={(menu) => (
                <div
                  className="
                    sz-dropdown-caption-menu
                    sz:bg-black/72
                    sz:rounded-lg
                  "
                >
                  {cloneElement(
                    menu as React.ReactElement<{
                      style: React.CSSProperties;
                    }>,
                    {
                      style: { padding: 0, backgroundColor: 'transparent' },
                    }
                  )}
                  <Divider style={{ margin: 0 }} />
                  <Space
                    style={{ padding: 6 }}
                    className="sz:w-full sz:flex sz:flex-row sz:justify-center sz:items-center sz:gap-4"
                  >
                    <Button
                      type="primary"
                      size="small"
                      className="sz:w-full sz:text-[13px]"
                      onClick={handleGenerateCaption}
                    >
                      {t('youtube.activate')}
                    </Button>
                    <Button
                      type="dashed"
                      size="small"
                      className="sz:w-full sz:text-[13px]"
                      onClick={handleDeactivateCaption}
                    >
                      {t('youtube.deactivate')}
                    </Button>
                  </Space>
                </div>
              )}
            >
              <div
                className="
                  sz:flex
                  sz:flex-col
                  sz:justify-center
                  sz:items-center
                  sz:px-3
                  sz:gap-2
                  sz:cursor-pointer
                "
              >
                {isLoading ? (
                  <LoadingOutlined
                    style={{
                      fontSize: '21px',
                      color: '#E8E9EA',
                    }}
                  />
                ) : (
                  <ReadFilled
                    style={{
                      fontSize: '24px',
                      color: '#E8E9EA',
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'absolute',
                    borderRadius: '20%',
                    height: '3px',
                    width: isActivated ? '24px' : 0,
                    backgroundColor: '#32CCBC',
                    bottom: '10%',
                    transition: 'width 0.5s ease-in-out',
                  }}
                />
              </div>
            </Dropdown>
          </Tooltip>
        </div>
      </ConfigProvider>
    )
  );
};

export default YoutubeCaptionToggle;
