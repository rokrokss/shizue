import {
  CaptionMenuLanguageRow,
  CaptionMenuRow,
  CaptionMenuTitle,
  CaptionToggle,
} from '@/components/Caption/CaptionToggle';
import { useTranslateTargetLanguage } from '@/hooks/language';
import {
  useNetflixBilingualCaption,
  useShowNetflixCaptionToggleValue,
  useYoutubeCaptionSizeRatio,
} from '@/hooks/layout';
import { useAnyModelAvailable } from '@/hooks/models';
import { languageOptions } from '@/lib/language';
import {
  CaptionSettings,
  getNetflixCaptions,
  NetflixCaptionStatus,
} from '@/lib/netflix/netflixCaptionController';
import { keepNetflixControlsShown } from '@/lib/netflix/playerControls';
import { panelService } from '@/services/panelService';
import { InputNumber, Switch } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const initialStatus: NetflixCaptionStatus = {
  available: false,
  tracks: [],
  originalTrackId: null,
  active: false,
  loading: false,
  failed: false,
  adPlaying: false,
};

// The same button and menu as the YouTube caption toggle (CaptionToggle). Netflix adds which of
// the title's subtitles are the original. The translation is Netflix's own subtitles in the target
// language when the title has them, otherwise the LLM's.
const NetflixCaptionToggle = () => {
  const { t } = useTranslation();
  const controller = getNetflixCaptions();
  const [status, setStatus] = useState<NetflixCaptionStatus>(initialStatus);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openPopover, setOpenPopover] = useState<'target' | 'original' | null>(null);
  const [numLines, setNumLines] = useState(1);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();
  const [bilingual, setBilingual] = useNetflixBilingualCaption();
  const [captionSizeRatio, setCaptionSizeRatio] = useYoutubeCaptionSizeRatio();
  const showToggle = useShowNetflixCaptionToggleValue();
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

  // Netflix would hide its controls, and this button with them, while the mouse rests on the menu.
  useEffect(() => {
    if (!isDropdownOpen) return;
    return keepNetflixControlsShown();
  }, [isDropdownOpen]);

  // The LLM is needed only when Netflix has no subtitles in the target language.
  const needsModel = !anyModelAvailable && controller.needsModel(targetLanguage);

  const handleDropdownOpenChange = (open: boolean) => {
    if (open && needsModel) {
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
    if (needsModel) {
      panelService.openPanel();
      return;
    }
    controller.activate(settings);
  };

  const handleDeactivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    controller.deactivate();
    setIsDropdownOpen(false);
  };

  if (!showToggle || status.adPlaying || (!status.available && !status.active)) return null;

  const originalOptions = status.tracks.map((track) => ({
    value: track.trackId,
    label: track.label,
    desc: track.label,
  }));
  const originalTrack = status.tracks.find((track) => track.trackId === status.originalTrackId);
  const originalValueLabel = status.failed ? t('netflix.loadFailed') : (originalTrack?.label ?? '');

  return (
    <CaptionToggle
      className="
        sz-netflix-caption-toggle
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
      // The button sits near the player's right edge, so lists open to the left.
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
          key: 'original',
          label: (
            <CaptionMenuLanguageRow
              side="left"
              label={t('netflix.originalSubtitles')}
              valueLabel={originalValueLabel}
              options={originalOptions}
              open={isDropdownOpen && openPopover === 'original'}
              onOpenChange={(open) => setOpenPopover(open ? 'original' : null)}
              onSelect={(value) => controller.setOriginalTrack(value)}
            />
          ),
        },
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

export default NetflixCaptionToggle;
