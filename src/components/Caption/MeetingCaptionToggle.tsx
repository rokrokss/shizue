import {
  captionDisplayOptions,
  CaptionMenuLanguageRow,
  CaptionMenuRow,
  CaptionMenuTitle,
  CaptionToggle,
} from '@/components/Caption/CaptionToggle';
import { useTranslateTargetLanguage } from '@/hooks/language';
import {
  CaptionDisplayMode,
  useCaptionDisplay,
  useTwitchChromeTranslation,
  useYoutubeCaptionSizeRatio,
} from '@/hooks/layout';
import { useAnyModelAvailable } from '@/hooks/models';
import { languageOptions } from '@/lib/language';
import { isChromeTranslatorSupported } from '@/lib/liveCaption/chromeTranslator';
import type {
  MeetingCaptionController,
  MeetingCaptionSettings,
  MeetingCaptionStatus,
} from '@/lib/meetingCaptions/meetingCaptions';
import { panelService } from '@/services/panelService';
import { Switch } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// The caption button and menu of the other sites (CaptionToggle), floating over a meeting while
// its captions are on. The translator is Twitch's and YouTube live's setting: Chrome's on-device
// one, or the chat model.
const MeetingCaptionToggle = ({ controller }: { controller: MeetingCaptionController }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<MeetingCaptionStatus>({ captionsOn: false, active: false });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openPopover, setOpenPopover] = useState<'target' | 'display' | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();
  const [captionDisplay, setCaptionDisplay] = useCaptionDisplay();
  const [sizeRatio] = useYoutubeCaptionSizeRatio();
  const [chromeTranslationOn, setChromeTranslationOn] = useTwitchChromeTranslation();
  const anyModelAvailable = useAnyModelAvailable();
  // Without a model, Chrome's translator is the only one.
  const chromeTranslation = isChromeTranslatorSupported() && (chromeTranslationOn || !anyModelAvailable);

  useEffect(() => controller.subscribe(setStatus), [controller]);

  const settings: MeetingCaptionSettings = {
    targetLanguage,
    display: captionDisplay,
    sizeRatio,
    chromeTranslation,
    modelAvailable: anyModelAvailable,
  };
  useEffect(() => {
    controller.updateSettings(settings);
  }, [controller, targetLanguage, captionDisplay, sizeRatio, chromeTranslation, anyModelAvailable]);

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
    controller.activate(settings, {
      waiting: t('meeting.waiting'),
      turnOnCaptions: t('meeting.turnOnCaptions'),
      unreadable: t('meeting.unreadable'),
      preparing: t('meeting.preparing'),
    });
  };

  const handleDeactivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    controller.deactivate();
    setIsDropdownOpen(false);
  };

  return (
    <CaptionToggle
      className="sz:flex sz:flex-col sz:justify-center sz:items-center sz:h-full sz:rounded-full sz:font-youtube"
      triggerRef={triggerRef}
      tooltip={t('meeting.liveTranslation')}
      open={isDropdownOpen}
      onOpenChange={handleDropdownOpenChange}
      items={[
        { key: 'title', label: <CaptionMenuTitle label={t('meeting.liveTranslation')} /> },
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
          key: 'display',
          label: (
            <CaptionMenuLanguageRow
              label={t('caption.displayLabel')}
              valueLabel={t(`caption.display.${captionDisplay}`)}
              options={captionDisplayOptions(t)}
              open={isDropdownOpen && openPopover === 'display'}
              onOpenChange={(open) => setOpenPopover(open ? 'display' : null)}
              onSelect={(value) => void setCaptionDisplay(value as CaptionDisplayMode)}
            />
          ),
        },
        ...(isChromeTranslatorSupported()
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
      isLoading={false}
      isActivated={status.active}
      iconSize="20px"
    />
  );
};

export default MeetingCaptionToggle;
