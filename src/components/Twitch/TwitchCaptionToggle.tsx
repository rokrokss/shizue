import {
  CaptionMenuLanguageRow,
  CaptionMenuRow,
  CaptionMenuTitle,
  CaptionToggle,
} from '@/components/Caption/CaptionToggle';
import { useTranslateTargetLanguage } from '@/hooks/language';
import {
  TwitchCaptionSourceMode,
  useShowTwitchCaptionToggleValue,
  useShowYoutubeBilingualCaption,
  useSpeechRecognitionConsent,
  useTwitchCaptionSource,
  useTwitchChannelLanguage,
  useYoutubeCaptionSizeRatio,
} from '@/hooks/layout';
import { useAnyModelAvailable } from '@/hooks/models';
import { languageOptions } from '@/lib/language';
import {
  CaptionSettings,
  CaptionSource,
  CaptionStatus,
  getTwitchLiveCaptions,
  isTwitchVod,
} from '@/lib/twitch/liveCaptionController';
import {
  hideTwitchControls,
  showTwitchControls,
  TWITCH_POPUP_HOST_TAG,
  twitchPlayerAround,
} from '@/lib/twitch/playerControls';
import { SPEECH_LANGUAGES, speechLanguageLabel } from '@/lib/twitch/speechLanguage';
import { panelService } from '@/services/panelService';
import { Button, InputNumber, Space, Switch } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const sourceLabelKey: Record<CaptionSource, string> = {
  cea608: 'twitch.sourceCaptions',
  scc: 'twitch.sourceScc',
  stt: 'twitch.sourceSpeech',
};

const initialStatus: CaptionStatus = {
  available: [],
  active: false,
  activeSource: null,
  loading: false,
  speechLanguage: 'en-US',
  speechError: null,
  onDeviceSpeech: 'unavailable',
  adPlaying: false,
};

// The same button and menu as the YouTube caption toggle (CaptionToggle). Twitch adds where the
// original text comes from, and the stream's language when speech recognition supplies it.
const TwitchCaptionToggle = () => {
  const { t } = useTranslation();
  const controller = getTwitchLiveCaptions();
  const [status, setStatus] = useState<CaptionStatus>(initialStatus);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openPopover, setOpenPopover] = useState<'target' | 'source' | 'speech' | null>(null);
  const [numLines, setNumLines] = useState(1);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();
  const [bilingual, setBilingual] = useShowYoutubeBilingualCaption();
  const [captionSizeRatio, setCaptionSizeRatio] = useYoutubeCaptionSizeRatio();
  const [sourceMode, setSourceMode] = useTwitchCaptionSource();
  const [consent, setConsent] = useSpeechRecognitionConsent();
  const [channelLanguages, setChannelLanguages] = useTwitchChannelLanguage();
  const showToggle = useShowTwitchCaptionToggleValue();
  const anyModelAvailable = useAnyModelAvailable();

  useEffect(() => controller.subscribe(setStatus), [controller]);

  const settings: CaptionSettings = { targetLanguage, numLines, bilingual, captionSizeRatio };
  useEffect(() => {
    controller.updateSettings(settings);
  }, [controller, targetLanguage, numLines, bilingual, captionSizeRatio]);

  useEffect(() => {
    if (!showToggle) {
      controller.deactivate();
      setIsDropdownOpen(false);
    }
  }, [controller, showToggle]);

  // Close the menu when the player scrolls out of view, as on YouTube.
  useEffect(() => {
    if (!dropdownTriggerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && isDropdownOpen) setIsDropdownOpen(false);
        });
      },
      { root: null, threshold: 0.1 }
    );
    observer.observe(dropdownTriggerRef.current);
    return () => observer.disconnect();
  }, [isDropdownOpen]);

  // The open menu counts as part of the player. It opens outside the player, so Twitch would take
  // the mouse moving onto it as leaving and hide its controls. Instead the controls stay while the
  // mouse is over the player or the menu, and when it leaves both the menu closes with them.
  // (YouTube doesn't need this: its menu pauses the video, which keeps the controls up.)
  useEffect(() => {
    if (!isDropdownOpen) return;
    const player = twitchPlayerAround(
      (dropdownTriggerRef.current?.getRootNode() as ShadowRoot | undefined)?.host
    );
    const popups = document.querySelector(TWITCH_POPUP_HOST_TAG);
    if (!player || !popups) return;
    const hovered = () => player.matches(':hover') || popups.matches(':hover');
    // Undo Twitch's leave in the same event dispatch, so its controls don't fade out and back.
    const onEnterMenu = () => showTwitchControls(player);
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    // Moving between the two isn't leaving. The short wait also covers the gap before the
    // language list.
    const onLeave = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (hovered()) return;
        setIsDropdownOpen(false);
        setOpenPopover(null);
        hideTwitchControls(player);
      }, 300);
    };
    // A mouse resting on the menu would otherwise hide the controls after 5 s.
    const keepAlive = setInterval(() => {
      if (hovered()) showTwitchControls(player);
    }, 1000);
    popups.addEventListener('mouseover', onEnterMenu);
    player.addEventListener('mouseleave', onLeave);
    popups.addEventListener('mouseleave', onLeave);
    return () => {
      popups.removeEventListener('mouseover', onEnterMenu);
      player.removeEventListener('mouseleave', onLeave);
      popups.removeEventListener('mouseleave', onLeave);
      clearInterval(keepAlive);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [isDropdownOpen]);

  // Speech recognition is running, or is how this mode would get captions once it can run.
  const usesSpeech = status.activeSource === 'stt' || controller.speechRelevant(sourceMode);
  const onDevice = status.onDeviceSpeech;

  // Whether recognition can run on this device for the stream's language (no audio leaves it).
  useEffect(() => {
    if (isDropdownOpen && usesSpeech) void controller.refreshOnDeviceSpeech();
  }, [controller, isDropdownOpen, usesSpeech]);

  const handleDropdownOpenChange = (open: boolean) => {
    if (!anyModelAvailable) {
      panelService.openPanel();
      return;
    }
    setIsDropdownOpen(open);
    if (!open) setOpenPopover(null);
    // Pausing a live stream would leave it behind live, so only VODs pause like YouTube.
    const video = document.querySelector('video');
    if (open && isTwitchVod() && video && !video.paused) video.pause();
  };

  const activate = (speechAllowed: boolean) => {
    setIsDropdownOpen(false);
    setOpenPopover(null);
    controller.activate({ ...settings, mode: sourceMode, speechAllowed });
    const video = document.querySelector('video');
    if (isTwitchVod() && video?.paused) void video.play();
  };

  const handleActivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    activate(consent);
  };

  const handleAgreeAndActivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    void setConsent(true);
    activate(true);
  };

  const handleDeactivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    controller.deactivate();
    setIsDropdownOpen(false);
  };

  const handleSelectSource = (value: string) => {
    const mode = value as TwitchCaptionSourceMode;
    void setSourceMode(mode);
    // Switching while captions are on takes effect right away.
    if (status.active) controller.activate({ ...settings, mode, speechAllowed: consent });
  };

  const handleSelectSpeechLanguage = (value: string) => {
    const login = controller.channelLogin;
    if (login) void setChannelLanguages({ ...channelLanguages, [login]: value });
    controller.setSpeechLanguage(value);
  };

  // The click on this button is the user activation that Chrome requires for the download.
  const handleInstallOnDevice = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    controller.downloadOnDeviceSpeech();
  };

  if (!showToggle || status.adPlaying || (!status.available.length && !status.active)) return null;

  const sourceOptions = [
    { value: 'auto', label: t('twitch.sourceAuto'), desc: t('twitch.sourceAuto') },
    ...status.available.map((source) => ({
      value: source,
      label: t(sourceLabelKey[source]),
      desc: t(sourceLabelKey[source]),
    })),
  ];
  const sourceValueLabel = (() => {
    if (status.activeSource === 'stt' && status.speechError) return t('twitch.speechStopped');
    // Auto mode still waiting for captions has no source to name yet.
    const current =
      status.active && status.activeSource && status.available.includes(status.activeSource)
        ? status.activeSource
        : null;
    if (sourceMode === 'auto') {
      return current ? `${t('twitch.sourceAuto')} · ${t(sourceLabelKey[current])}` : t('twitch.sourceAuto');
    }
    return t(sourceLabelKey[sourceMode]);
  })();

  // Speech recognition needs consent once; the activate button turns into the consent prompt.
  const needsConsent = !consent && controller.needsSpeech(sourceMode);
  const consentFooter = needsConsent ? (
    <div className="sz:flex sz:flex-col sz:gap-2 sz:p-2" style={{ maxWidth: 230 }}>
      <span className="sz:text-[12px] sz:text-gray-300 sz:whitespace-normal">
        {onDevice === 'available' ? t('twitch.speechConsentLocal') : t('twitch.speechConsent')}
      </span>
      {onDevice === 'downloadable' && (
        <Button size="small" type="link" className="sz:text-[12px] sz:p-0" onClick={handleInstallOnDevice}>
          {t('twitch.downloadLocalSpeech')}
        </Button>
      )}
      <Space className="sz:w-full sz:flex sz:flex-row sz:justify-center sz:items-center sz:gap-4">
        <Button type="primary" size="small" className="sz:w-full sz:text-[13px]" onClick={handleAgreeAndActivate}>
          {t('twitch.agreeAndActivate')}
        </Button>
        <Button type="dashed" size="small" className="sz:w-full sz:text-[13px]" onClick={handleDeactivate}>
          {t('youtube.deactivate')}
        </Button>
      </Space>
    </div>
  ) : undefined;

  return (
    <CaptionToggle
      className="
        sz-twitch-caption-toggle
        sz:flex
        sz:flex-col
        sz:justify-center
        sz:items-center
        sz:h-full
        sz:px-1
        sz:my-0
        sz:py-0
        sz:rounded-lg
        sz:font-youtube
      "
      triggerRef={dropdownTriggerRef}
      tooltip={t('youtube.aiCaption')}
      open={isDropdownOpen}
      onOpenChange={handleDropdownOpenChange}
      footer={consentFooter}
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
              onSelect={(value) => setTargetLanguage(value as typeof targetLanguage)}
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
        ...(usesSpeech
          ? [
              {
                key: 'speechLanguage',
                label: (
                  <CaptionMenuLanguageRow
                    label={t('twitch.streamLanguage')}
                    valueLabel={speechLanguageLabel(status.speechLanguage)}
                    options={SPEECH_LANGUAGES}
                    open={isDropdownOpen && openPopover === 'speech'}
                    onOpenChange={(open) => setOpenPopover(open ? 'speech' : null)}
                    onSelect={handleSelectSpeechLanguage}
                  />
                ),
              },
            ]
          : []),
        // Cloud recognition catches far fewer words, so keep offering the download after consent.
        ...(usesSpeech && !needsConsent && (onDevice === 'downloadable' || onDevice === 'downloading')
          ? [
              {
                key: 'onDeviceSpeech',
                label: (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="small"
                      type="link"
                      className="sz:text-[12px] sz:p-0"
                      loading={onDevice === 'downloading'}
                      onClick={handleInstallOnDevice}
                    >
                      {t('twitch.downloadLocalSpeech')}
                    </Button>
                  </div>
                ),
              },
            ]
          : []),
        {
          key: 'seeOriginal',
          label: (
            <CaptionMenuRow label={t('youtube.bilingual')}>
              <Switch size="small" checked={bilingual} onChange={setBilingual} />
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
                  if (value) setNumLines(value);
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
                  if (value) setCaptionSizeRatio(value / 100);
                }}
              />
            </CaptionMenuRow>
          ),
        },
      ]}
      activateLabel={t('youtube.activate')}
      deactivateLabel={t('youtube.deactivate')}
      onActivate={handleActivate}
      onDeactivate={handleDeactivate}
      isLoading={status.loading}
      isActivated={status.active}
    />
  );
};

export default TwitchCaptionToggle;
