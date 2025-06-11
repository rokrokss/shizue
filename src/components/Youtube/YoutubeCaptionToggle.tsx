import LanguageOptionItem from '@/components/Youtube/LanguageOptionItem';
import { Language } from '@/hooks/language';
import { getCaptionInjector } from '@/lib/captionInjector';
import { languageOptions } from '@/lib/language';
import useAdObserver from '@/lib/useAdObserver';
import { getVideoData, getVideoId } from '@/lib/youtube';
import { debugLog } from '@/logs';
import { LoadingOutlined, ReadFilled } from '@ant-design/icons';
import {
  Button,
  ConfigProvider,
  Divider,
  Dropdown,
  InputNumber,
  Popover,
  Space,
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

  const lastVideoIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const isAdPlaying = () => {
    const ad = document.querySelector<HTMLDivElement>('.ytp-ad-module');
    return !!ad && ((ad.textContent?.trim().length ?? 0) > 0 || ad.childElementCount > 0);
  };

  const refreshCaptionStatus = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!window.location.pathname.includes('watch') || isAdPlaying()) {
      debugLog('[YouTube] refreshCaptionStatus: not watch page or ad is playing');
      setIsCaptionAvailable(false);
      setIsDropdownOpen(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const vid = getVideoId();
    if (!vid || vid === lastVideoIdRef.current) return;

    inFlightRef.current = true;
    setIsDropdownOpen(false);
    setIsActivated(false);
    getCaptionInjector().clear();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    try {
      lastVideoIdRef.current = vid;
      debugLog('[YouTube] checking captions for', vid);

      const data = await getVideoData(vid);
      debugLog('[Youtube] videoData', data);

      const videoElement = document.querySelector('video');

      if (data?.transcriptMetadata && videoElement) {
        lastVideoIdRef.current = vid;
        setIsCaptionAvailable(true);
        getCaptionInjector().setVideoElement(videoElement as HTMLVideoElement);
        getCaptionInjector().setTranscriptMetadata(data.transcriptMetadata);
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
      }
    };
  }, [refreshCaptionStatus]);

  const handleSelectTargetLanguage = (language: string) => {
    setTargetLanguage(language as Language);
  };

  const handleDropdownOpenChange = (open: boolean) => {
    setIsDropdownOpen(open);

    if (open) {
      const videoElement = document.querySelector('video');
      if (videoElement && !videoElement.paused) {
        videoElement.pause();
        debugLog('[YouTube] Video paused by dropdown click');
      }
    }
  };

  const updateLoop = () => {
    getCaptionInjector().updateCurrentTime();
    animationFrameRef.current = requestAnimationFrame(updateLoop);
  };

  const handleGenerateCaption = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    debugLog('[YouTube] generate caption');
    setIsDropdownOpen(false);
    getCaptionInjector().activate(targetLanguage, numLines);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(updateLoop);

    setIsActivated(true);
    const videoElement = document.querySelector('video');
    if (videoElement && videoElement.paused) {
      videoElement.play();
      debugLog('[YouTube] Video played by generate caption');
    }
  };

  const handleClickIcon = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActivated) return;

    e.stopPropagation();
    e.preventDefault();
    debugLog('[YouTube] deactivate caption');
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    getCaptionInjector().deactivate();
    setIsActivated(false);
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

  return (
    isCaptionAvailable && (
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
              trigger={isActivated ? [] : ['click']}
              overlayStyle={{
                paddingBottom: '24px',
              }}
              open={isActivated ? false : isDropdownOpen}
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
                            sz:gap-2
                            sz:cursor-default
                            sz:text-[13px]
                          "
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <span className="sz:text-white">{t('settings.targetLanguage')}</span>
                          <span className="sz:text-gray-400">
                            {t(`language.${targetLanguage}`)}
                          </span>
                        </div>
                      </Popover>
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
                        <span className="sz:text-white">자막 줄 수</span>
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
                    className="sz:w-full sz:flex sz:justify-center sz:items-center"
                  >
                    <Button
                      variant="filled"
                      size="small"
                      className="sz:w-full sz:text-[13px]"
                      onClick={handleGenerateCaption}
                    >
                      자막 생성
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
                onClick={handleClickIcon}
              >
                {isLoading ? (
                  <LoadingOutlined
                    style={{
                      fontSize: '24px',
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
