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
  useTwitchChromeTranslation,
  useUseYoutubeKeyboardNavigate,
  useYoutubeCaptionSizeRatio,
  useYoutubeChannelLanguage,
} from '@/hooks/layout';
import { useAnyModelAvailable } from '@/hooks/models';
import { getCaptionInjector } from '@/lib/captionInjector';
import { languageOptions } from '@/lib/language';
import { isChromeTranslatorSupported } from '@/lib/liveCaption/chromeTranslator';
import type { CaptionStatus } from '@/lib/liveCaption/liveCaptionController';
import { SPEECH_LANGUAGES, speechLanguageLabel } from '@/lib/liveCaption/speechLanguage';
import { isSpeechRecognitionSupported } from '@/lib/liveCaption/webSpeechSource';
import useAdObserver from '@/lib/useAdObserver';
import { getVideoData, getVideoId, isYoutubeAdPlaying } from '@/lib/youtube';
import {
  createYoutubeLiveCaptions,
  liveCaptionTrack,
  YoutubeCaptionSource,
  YoutubeLiveCaptions,
  YoutubeVideo,
} from '@/lib/youtubeCaption/youtubePlatform';
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

// Where the original text comes from, chosen per video: the video's caption track (a live stream's
// captions on screen), or speech recognition on its audio. A video with caption tracks uses
// captionInjector unless speech recognition is picked; everything else uses the live captions
// (lib/youtubeCaption), whose controller exists only while that path is in use.
type SourceMode = 'auto' | YoutubeCaptionSource | 'stt';

const sourceLabelKey: Record<YoutubeCaptionSource | 'stt', string> = {
  track: 'youtube.sourceTrack',
  stt: 'twitch.sourceSpeech',
};

const YoutubeCaptionToggle = () => {
  const { t } = useTranslation();

  const [isCaptionAvailable, setIsCaptionAvailable] = useState(false);
  const [isAdShowing, setIsAdShowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<Language>('English');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const [openPopover, setOpenPopover] = useState<'target' | 'source' | 'speech' | null>(null);
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
  const [chromeTranslationOn, setChromeTranslationOn] = useTwitchChromeTranslation();
  const [channelLanguages, setChannelLanguages] = useYoutubeChannelLanguage();
  // As on Twitch, Chrome's on-device translator (the default) translates live captions without an
  // API key; with its switch off the chosen LLM does. The caption track path is LLM only.
  const chromeTranslation = isChromeTranslatorSupported() && (chromeTranslationOn || !anyModelAvailable);

  const [video, setVideo] = useState<YoutubeVideo | null>(null);
  const [speechUsable, setSpeechUsable] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>('auto');
  const liveRef = useRef<YoutubeLiveCaptions | null>(null);
  const [liveStatus, setLiveStatus] = useState<CaptionStatus<YoutubeCaptionSource> | null>(null);

  const lastVideoIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const liveTrack = liveCaptionTrack(video?.live);
  const realtime = sourceMode === 'stt' || !isCaptionAvailable;

  const disposeLive = useCallback(() => {
    liveRef.current?.dispose();
    liveRef.current = null;
    setLiveStatus(null);
  }, []);

  const ensureLive = () => {
    if (liveRef.current || !video) return liveRef.current;
    const live = createYoutubeLiveCaptions(video);
    live.controller.subscribe(setLiveStatus);
    liveRef.current = live;
    return live;
  };

  const refreshCaptionStatus = useCallback(async () => {
    if (!showToggleRef.current) return;
    if (inFlightRef.current) return;
    if (!window.location.pathname.includes('watch') || isYoutubeAdPlaying()) {
      debugLog('[YouTube] refreshCaptionStatus: not watch page or ad is playing');
      setIsCaptionAvailable(false);
      setIsDropdownOpen(false);
      if (getVideoId() !== lastVideoIdRef.current) {
        disposeLive();
        setVideo(null);
        setSpeechUsable(false);
      }
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
    setOpenPopover(null);
    setIsLoading(false);
    setIsActivated(false);
    getCaptionInjector().clear();
    disposeLive();
    setVideo(null);
    setSourceMode('auto');
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

      if (data.metadata) {
        setVideo({
          videoId: vid,
          channelId: data.metadata.channelId ?? null,
          title: data.metadata.title ?? '',
          author: data.metadata.author ?? '',
          description: data.metadata.shortDescription ?? '',
          live: data.live,
        });
      }
      // Encrypted (DRM) media can't be captured for speech recognition.
      setSpeechUsable(isSpeechRecognitionSupported() && !!videoElement && !videoElement.mediaKeys);

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
  }, [disposeLive]);

  const handleAdStart = useCallback(() => {
    debugLog('[Youtube] useAdObserver: ad is started');
    setIsAdShowing(true);
  }, []);

  // The video's captions are still known after an ad in the middle of it; only a video not checked
  // yet (an ad before it) needs checking now.
  const handleAdEnd = useCallback(() => {
    debugLog('[Youtube] useAdObserver: ad is finished');
    setIsAdShowing(false);
    refreshCaptionStatus();
  }, [refreshCaptionStatus]);

  useAdObserver(handleAdStart, handleAdEnd);

  useEffect(() => {
    refreshCaptionStatus();

    window.addEventListener('yt-navigate-finish', refreshCaptionStatus, { passive: true });

    return () => {
      window.removeEventListener('yt-navigate-finish', refreshCaptionStatus);
      getCaptionInjector().clear();
      disposeLive();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [refreshCaptionStatus, disposeLive]);

  const handleSelectTargetLanguage = (language: string) => {
    setStoredTargetLanguage(language as Language);
  };

  const handleDropdownOpenChange = (open: boolean) => {
    // Chrome's translator needs no API key; only the LLM sends people to set one up.
    if (!anyModelAvailable && !(realtime && chromeTranslation)) {
      debugLog('Youtube caption toggle clicked but not able to open translate settings');
      panelService.openPanel();
      return;
    }

    setIsDropdownOpen(open);
    if (!open) setOpenPopover(null);
    if (open && realtime) ensureLive();

    // Pausing a live stream would leave it behind live, so only videos pause.
    if (open && !video?.live?.isLive) {
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
        disposeLive();
        setIsLoading(false);
        setIsActivated(false);
        setIsDropdownOpen(false);
      }, 0);
    }
  }, [showYoutubeCaptionToggle]);

  // Live captions follow the menu while they run.
  useEffect(() => {
    liveRef.current?.controller.updateSettings({
      targetLanguage,
      numLines,
      bilingual: showYoutubeBilingualCaption,
      captionSizeRatio,
    });
  }, [targetLanguage, numLines, showYoutubeBilingualCaption, captionSizeRatio, liveStatus?.active]);

  // Speech recognition is running, or is how this mode would get captions once it can run.
  const usesSpeech =
    realtime &&
    (liveStatus?.activeSource === 'stt' || !!liveRef.current?.controller.speechRelevant(sourceMode));

  // Whether recognition can run on this device for the video's language (no audio leaves it).
  useEffect(() => {
    if (isDropdownOpen && usesSpeech) void liveRef.current?.controller.refreshOnDeviceSpeech();
  }, [isDropdownOpen, usesSpeech]);

  const updateLoop = () => {
    const isCurrentCaptionTranslated = getCaptionInjector().updateCurrentTime();

    const { isActivated: currentIsActivated, isLoading: currentIsLoading } = stateRef.current;

    if (currentIsActivated && !isCurrentCaptionTranslated != currentIsLoading) {
      setIsLoading(!isCurrentCaptionTranslated);
    }
    animationFrameRef.current = requestAnimationFrame(updateLoop);
  };

  const startTrackCaptions = () => {
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
  };

  const stopTrackCaptions = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    getCaptionInjector().deactivate();
    setIsLoading(false);
    setIsActivated(false);
  };

  // A click: Chrome may need it to download its speech or translation model.
  const startLiveCaptions = (mode: SourceMode, withChrome = chromeTranslation) => {
    ensureLive()?.controller.activate({
      targetLanguage,
      numLines,
      bilingual: showYoutubeBilingualCaption,
      captionSizeRatio,
      mode,
      speechAllowed: false,
      chromeTranslation: withChrome,
    });
  };

  const handleGenerateCaption = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    debugLog('[YouTube] generate caption');
    setIsDropdownOpen(false);
    setOpenPopover(null);
    if (realtime) startLiveCaptions(sourceMode);
    else startTrackCaptions();

    const videoElement = document.querySelector('video');
    if (videoElement && videoElement.paused && !video?.live?.isLive) {
      videoElement.play();
      debugLog('[YouTube] Video played by generate caption');
    }
  };

  const handleDeactivateCaption = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    debugLog('[YouTube] deactivate caption');
    if (realtime) liveRef.current?.controller.deactivate();
    else stopTrackCaptions();
    setIsDropdownOpen(false);
  };

  // Switching while captions are on takes effect right away.
  const handleSelectSource = (value: string) => {
    const mode = value as SourceMode;
    if (mode === sourceMode) return;
    const nextRealtime = mode === 'stt' || !isCaptionAvailable;
    const wasActive = isActivated || !!liveStatus?.active;
    if (isActivated && nextRealtime) stopTrackCaptions();
    // Back to the caption track: the live captions' controller goes away.
    if (!nextRealtime) disposeLive();
    setSourceMode(mode);
    if (nextRealtime && wasActive) startLiveCaptions(mode);
    else if (nextRealtime) ensureLive();
    else if (wasActive) startTrackCaptions();
  };

  // A click, which Chrome's model download needs. Switching while captions are on restarts them.
  const handleChromeTranslationChange = (on: boolean) => {
    if (!on && !anyModelAvailable) {
      panelService.openPanel();
      return;
    }
    void setChromeTranslationOn(on);
    if (liveStatus?.active) startLiveCaptions(sourceMode, isChromeTranslatorSupported() && on);
  };

  const handleSelectSpeechLanguage = (value: string) => {
    const channelId = video?.channelId;
    if (channelId) void setChannelLanguages({ ...channelLanguages, [channelId]: value });
    liveRef.current?.controller.setSpeechLanguage(value);
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

  const isAvailable =
    isCaptionAvailable || (!!video && (!!liveTrack || speechUsable));
  if (!isAvailable || !showYoutubeCaptionToggle || isAdShowing || liveStatus?.adPlaying) return null;

  const sources: (YoutubeCaptionSource | 'stt')[] = [
    ...(isCaptionAvailable || liveTrack ? (['track'] as const) : []),
    ...(speechUsable ? (['stt'] as const) : []),
  ];
  const sourceOptions = [
    { value: 'auto', label: t('twitch.sourceAuto'), desc: t('twitch.sourceAuto') },
    ...sources.map((source) => ({
      value: source,
      label: t(sourceLabelKey[source]),
      desc: t(sourceLabelKey[source]),
    })),
  ];
  const sourceValueLabel = (() => {
    if (realtime && liveStatus?.activeSource === 'stt' && liveStatus.speechError) return t('twitch.speechStopped');
    if (sourceMode !== 'auto') return t(sourceLabelKey[sourceMode]);
    const current = !realtime ? 'track' : liveStatus?.active ? liveStatus.activeSource : null;
    return current ? `${t('twitch.sourceAuto')} · ${t(sourceLabelKey[current])}` : t('twitch.sourceAuto');
  })();

  // Only on-device recognition is used here: a language the device can't recognize can't start.
  const needsSpeech = realtime && (sourceMode === 'stt' || (sourceMode === 'auto' && !liveTrack));
  const speechUnavailable = needsSpeech && !liveStatus?.active && liveStatus?.onDeviceSpeech === 'unavailable';
  const speechUnavailableFooter = speechUnavailable ? (
    <div className="sz:p-2" style={{ maxWidth: 230 }}>
      <span className="sz:text-[12px] sz:text-gray-300 sz:whitespace-normal">
        {t('youtube.speechUnavailable')}
      </span>
    </div>
  ) : undefined;

  return (
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
      footer={speechUnavailableFooter}
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
              open={isDropdownOpen && openPopover === 'target'}
              onOpenChange={(open) => setOpenPopover(open ? 'target' : null)}
              onSelect={handleSelectTargetLanguage}
            />
          ),
        },
        {
          key: 'source',
          label: (
            <CaptionMenuLanguageRow
              label={t('twitch.source')}
              valueLabel={sourceValueLabel}
              options={sourceOptions}
              open={isDropdownOpen && openPopover === 'source'}
              onOpenChange={(open) => setOpenPopover(open ? 'source' : null)}
              onSelect={handleSelectSource}
            />
          ),
        },
        // The spoken language is what speech recognition listens for and what Chrome translates
        // from.
        ...(realtime && (usesSpeech || chromeTranslation)
          ? [
              {
                key: 'speechLanguage',
                label: (
                  <CaptionMenuLanguageRow
                    label={t('youtube.spokenLanguage')}
                    valueLabel={speechLanguageLabel(liveStatus?.speechLanguage)}
                    options={SPEECH_LANGUAGES}
                    open={isDropdownOpen && openPopover === 'speech'}
                    onOpenChange={(open) => setOpenPopover(open ? 'speech' : null)}
                    onSelect={handleSelectSpeechLanguage}
                  />
                ),
              },
            ]
          : []),
        ...(realtime && isChromeTranslatorSupported()
          ? [
              {
                key: 'chromeTranslation',
                label: (
                  <CaptionMenuRow label={t('twitch.chromeTranslation')}>
                    <Switch size="small" checked={chromeTranslation} onChange={handleChromeTranslationChange} />
                  </CaptionMenuRow>
                ),
              },
            ]
          : []),
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
        // Live captions have no list of upcoming lines to move between.
        ...(!realtime
          ? [
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
            ]
          : []),
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
      isLoading={realtime ? !!liveStatus?.loading : isLoading}
      isActivated={realtime ? !!liveStatus?.active : isActivated}
    />
  );
};

export default YoutubeCaptionToggle;
