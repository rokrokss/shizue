import {
  CaptionMenuLanguageRow,
  CaptionMenuRow,
  CaptionMenuTitle,
  CaptionToggle,
} from '@/components/Caption/CaptionToggle';
import { Language, useTranslateTargetLanguage } from '@/hooks/language';
import {
  useShowYoutubeBilingualCaption,
  useShowYoutubeCaptionToggleValue,
  useUseYoutubeKeyboardNavigate,
  useYoutubeCaptionSizeRatio,
} from '@/hooks/layout';
import { useAnyModelAvailable } from '@/hooks/models';
import { getCaptionInjector } from '@/lib/captionInjector';
import { languageOptions } from '@/lib/language';
import useAdObserver from '@/lib/useAdObserver';
import { getVideoData, getVideoId } from '@/lib/youtube';
import { debugLog } from '@/logs';
import { panelService } from '@/services/panelService';
import { InputNumber, Switch } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [useYoutubeKeyboardNavigate, setUseYoutubeKeyboardNavigate] =
    useUseYoutubeKeyboardNavigate();
  const [captionSizeRatio, setCaptionSizeRatio] = useYoutubeCaptionSizeRatio();
  const anyModelAvailable = useAnyModelAvailable();

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
    if (!anyModelAvailable) {
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

  // Add keyboard event handlers for 'a' and 'd' keys
  useEffect(() => {
    if (!isActivated || !useYoutubeKeyboardNavigate) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyA') {
        getCaptionInjector().handlePressKeyToNextChunk(true);
      } else if (e.code === 'KeyD') {
        getCaptionInjector().handlePressKeyToNextChunk(false);
      }
    };

    // Add event listener to document
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup function
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActivated, useYoutubeKeyboardNavigate]);

  return (
    isCaptionAvailable &&
    showYoutubeCaptionToggle && (
      <CaptionToggle
        className="
          sz-youtube-caption-toggle
          sz:flex
          sz:flex-col
          sz:justify-center
          sz:items-center
          sz:h-full
          sz:px-2
          sz:mx-2
          sz:my-0
          sz:py-0
          sz:rounded-lg
          sz:font-youtube
        "
        triggerRef={dropdownTriggerRef}
        tooltip={t('youtube.aiCaption')}
        open={isDropdownOpen}
        onOpenChange={handleDropdownOpenChange}
        items={[
          {
            key: 'aiCaption',
            label: <CaptionMenuTitle label={t('youtube.aiCaption')} />,
          },
          {
            key: 'selectLanguage',
            label: (
              <CaptionMenuLanguageRow
                label={t('settings.targetLanguage')}
                valueLabel={t(`language.${targetLanguage.split('_')[0]}`)}
                options={languageOptions(t)}
                open={isDropdownOpen && isLanguagePopoverOpen}
                onOpenChange={setIsLanguagePopoverOpen}
                onSelect={handleSelectTargetLanguage}
              />
            ),
          },
          {
            key: 'seeOriginal',
            label: (
              <CaptionMenuRow label={t('youtube.bilingual')}>
                <Switch
                  size="small"
                  checked={showYoutubeBilingualCaption}
                  onChange={setShowYoutubeBilingualCaption}
                />
              </CaptionMenuRow>
            ),
          },
          {
            key: 'useKeyboardNavigate',
            label: (
              <CaptionMenuRow label={t('youtube.useKeyboardNavigate')}>
                <Switch
                  size="small"
                  checked={useYoutubeKeyboardNavigate}
                  onChange={setUseYoutubeKeyboardNavigate}
                />
              </CaptionMenuRow>
            ),
          },
          {
            key: 'numLines',
            label: (
              <CaptionMenuRow label={t('youtube.numCaptLines')}>
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
              </CaptionMenuRow>
            ),
          },
          {
            key: 'captionSizeRatio',
            label: (
              <CaptionMenuRow label={t('youtube.captionSizeRatio')}>
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
              </CaptionMenuRow>
            ),
          },
        ]}
        activateLabel={t('youtube.activate')}
        deactivateLabel={t('youtube.deactivate')}
        onActivate={handleGenerateCaption}
        onDeactivate={handleDeactivateCaption}
        isLoading={isLoading}
        isActivated={isActivated}
      />
    )
  );
};

export default YoutubeCaptionToggle;
