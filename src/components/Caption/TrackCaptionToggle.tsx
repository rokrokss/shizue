import {
  captionDisplayOptions,
  CaptionMenuLanguageRow,
  CaptionMenuRow,
  CaptionMenuTitle,
  captionStyleOptions,
  CaptionToggle,
} from '@/components/Caption/CaptionToggle';
import { useTranslateTargetLanguage } from '@/hooks/language';
import {
  CaptionDisplayMode,
  CaptionStyle,
  useCaptionDisplay,
  useCaptionStyle,
  useTwitchChromeTranslation,
  useYoutubeCaptionSizeRatio,
} from '@/hooks/layout';
import { useAnyModelAvailable } from '@/hooks/models';
import { languageOptions } from '@/lib/language';
import { isChromeTranslatorSupported } from '@/lib/liveCaption/chromeTranslator';
import type {
  CaptionSettings,
  TrackCaptionStatus,
  VideoCaptionController,
} from '@/lib/trackCaptions/trackCaptions';
import { panelService } from '@/services/panelService';
import { Switch } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// The same button and menu as on YouTube (CaptionToggle), over the player of `video`: the
// captions of a video on X, a lecture site or a streaming service (lib/trackCaptions). Subtitles
// translated as they show offer Chrome's on-device translator, Twitch's and YouTube live's setting.
const TrackCaptionToggle = ({
  controller,
  video,
}: {
  controller: VideoCaptionController;
  video: HTMLVideoElement | null;
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TrackCaptionStatus>({ video: null, loading: false });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openPopover, setOpenPopover] = useState<'target' | 'display' | 'style' | null>(null);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();
  const [captionDisplay, setCaptionDisplay] = useCaptionDisplay();
  const [captionStyle, setCaptionStyle] = useCaptionStyle();
  const [captionSizeRatio] = useYoutubeCaptionSizeRatio();
  const anyModelAvailable = useAnyModelAvailable();
  const [chromeTranslationOn, setChromeTranslationOn] = useTwitchChromeTranslation();
  const offersChrome = !!controller.translatesLive && isChromeTranslatorSupported();
  // Without a model, Chrome's translator is the only one.
  const chromeTranslation = offersChrome && (chromeTranslationOn || !anyModelAvailable);

  useEffect(() => controller.subscribe(setStatus), [controller]);

  const settings: CaptionSettings = {
    targetLanguage,
    numLines: 1,
    display: captionDisplay,
    captionStyle,
    captionSizeRatio,
    chromeTranslation,
    modelAvailable: anyModelAvailable,
    hint: t('caption.turnOnSiteCaptions'),
  };
  useEffect(() => {
    controller.updateSettings(settings);
  }, [controller, targetLanguage, captionDisplay, captionStyle, captionSizeRatio, chromeTranslation, anyModelAvailable]);

  const active = status.video !== null && status.video === video;

  const handleDropdownOpenChange = (open: boolean) => {
    if (open && !anyModelAvailable && !chromeTranslation) {
      panelService.openPanel();
      return;
    }
    setIsDropdownOpen(open);
    if (!open) setOpenPopover(null);
  };

  const handleActivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsDropdownOpen(false);
    setOpenPopover(null);
    if (!video) return;
    void controller.activate(video, settings);
    if (video.paused) void video.play().catch(() => {});
  };

  const handleDeactivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    controller.deactivate();
    setIsDropdownOpen(false);
  };

  if (!video) return null;

  return (
    <CaptionToggle
      className="
        sz:flex
        sz:flex-col
        sz:justify-center
        sz:items-center
        sz:h-full
        sz:rounded-full
        sz:font-youtube
      "
      triggerRef={dropdownTriggerRef}
      tooltip={t('youtube.aiCaption')}
      open={isDropdownOpen}
      onOpenChange={handleDropdownOpenChange}
      // The button sits at the player's top right, so lists open to the left.
      items={[
        {
          key: 'aiCaption',
          label: <CaptionMenuTitle label={t('youtube.aiCaption')} />,
        },
        {
          key: 'selectLanguage',
          label: (
            <CaptionMenuLanguageRow
              side="left"
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
          key: 'display',
          label: (
            <CaptionMenuLanguageRow
              side="left"
              label={t('caption.displayLabel')}
              valueLabel={t(`caption.display.${captionDisplay}`)}
              options={captionDisplayOptions(t)}
              open={isDropdownOpen && openPopover === 'display'}
              onOpenChange={(open) => setOpenPopover(open ? 'display' : null)}
              onSelect={(value) => void setCaptionDisplay(value as CaptionDisplayMode)}
            />
          ),
        },
        {
          key: 'captionStyle',
          label: (
            <CaptionMenuLanguageRow
              side="left"
              label={t('caption.styleLabel')}
              valueLabel={t(`caption.style.${captionStyle}`)}
              options={captionStyleOptions(t)}
              open={isDropdownOpen && openPopover === 'style'}
              onOpenChange={(open) => setOpenPopover(open ? 'style' : null)}
              onSelect={(value) => void setCaptionStyle(value as CaptionStyle)}
            />
          ),
        },
        ...(offersChrome
          ? [
              {
                key: 'chromeTranslation',
                label: (
                  <CaptionMenuRow label={t('twitch.chromeTranslation')}>
                    <Switch
                      size="small"
                      checked={chromeTranslation}
                      disabled={!anyModelAvailable}
                      onChange={(on) => void setChromeTranslationOn(on)}
                    />
                  </CaptionMenuRow>
                ),
              },
            ]
          : []),
      ]}
      activateLabel={t('youtube.activate')}
      deactivateLabel={t('youtube.deactivate')}
      onActivate={handleActivate}
      onDeactivate={handleDeactivate}
      isLoading={active && status.loading}
      isActivated={active}
      iconSize="20px"
    />
  );
};

export default TrackCaptionToggle;
