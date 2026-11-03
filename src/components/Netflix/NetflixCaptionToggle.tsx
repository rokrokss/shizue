import {
  autoActivateLabel,
  autoActivateOptions,
  autoActivates,
  captionDisplayOptions,
  CaptionMenuLanguageRow,
  CaptionMenuRow,
  CaptionMenuTitle,
  captionStyleOptions,
  CaptionToggle,
} from '@/components/Caption/CaptionToggle';
import { useTranslateTargetLanguage } from '@/hooks/language';
import {
  CaptionAutoActivate,
  CaptionDisplayMode,
  CaptionStyle,
  useCaptionStyle,
  useNetflixAutoActivate,
  useNetflixCaptionDisplay,
  useShowNetflixCaptionToggleValue,
  useYoutubeCaptionSizeRatio,
} from '@/hooks/layout';
import { useAnyModelAvailable } from '@/hooks/models';
import { languageOptions } from '@/lib/language';
import type { NetflixTrack } from '@/lib/netflix/bridgeProtocol';
import {
  CaptionSettings,
  getNetflixCaptions,
  NetflixCaptionStatus,
  playerVideo,
} from '@/lib/netflix/netflixCaptionController';
import { keepNetflixControlsShown } from '@/lib/netflix/playerControls';
import { panelService } from '@/services/panelService';
import { InputNumber } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const initialStatus: NetflixCaptionStatus = {
  available: false,
  movieId: null,
  tracks: [],
  originalTrackId: null,
  active: false,
  loading: false,
  failed: false,
  adPlaying: false,
};

// The content script sets this to the size of Netflix's own icons.
const ICON_SIZE = 'var(--sz-netflix-icon-size, 24px)';

// Netflix names closed captions and plain subtitles in one language alike; its own menu marks CC.
const trackLabel = (track: NetflixTrack) => (track.closedCaptions ? `${track.label} [CC]` : track.label);

// The language's own name, shown in gray beside the label as in the target language list.
const nativeName = (tag: string) => {
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
};

// The same button and menu as the YouTube caption toggle (CaptionToggle). Netflix adds which of
// the title's subtitles are the original. The translation is Netflix's own subtitles in the target
// language when the title has them, otherwise the LLM's.
const NetflixCaptionToggle = () => {
  const { t } = useTranslation();
  const controller = getNetflixCaptions();
  const [status, setStatus] = useState<NetflixCaptionStatus>(initialStatus);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openPopover, setOpenPopover] = useState<
    'target' | 'original' | 'display' | 'style' | 'autoActivate' | null
  >(null);
  const [numLines, setNumLines] = useState(1);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();
  const [captionDisplay, setCaptionDisplay] = useNetflixCaptionDisplay();
  const [captionStyle, setCaptionStyle] = useCaptionStyle();
  const [captionSizeRatio, setCaptionSizeRatio] = useYoutubeCaptionSizeRatio();
  const showToggle = useShowNetflixCaptionToggleValue();
  const anyModelAvailable = useAnyModelAvailable();
  const [autoActivate, setAutoActivate] = useNetflixAutoActivate();
  // The title whose captions were turned on, by a click or by auto-activate. Auto-activate starts a
  // title once, so Deactivate keeps it off; the next episode starts again.
  const startedMovieRef = useRef<number | null>(null);

  useEffect(() => controller.subscribe(setStatus), [controller]);

  const settings: CaptionSettings = {
    targetLanguage,
    numLines,
    display: captionDisplay,
    captionStyle,
    captionSizeRatio,
  };
  useEffect(() => {
    controller.updateSettings(settings);
  }, [controller, targetLanguage, numLines, captionDisplay, captionStyle, captionSizeRatio]);

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
  // The spoken language, as the original subtitles tell it.
  const originalLanguage =
    status.tracks.find((track) => track.trackId === status.originalTrackId)?.language ?? null;

  // As on YouTube, a title starts once it plays, so a tab opened in the background waits until it's
  // watched.
  useEffect(() => {
    const movieId = status.movieId;
    const video = playerVideo();
    if (!movieId || !video || !showToggle || !status.available || status.active || needsModel) return;
    if (!autoActivates(autoActivate, originalLanguage, targetLanguage)) return;
    const start = () => {
      if (startedMovieRef.current === movieId || video.paused) return;
      startedMovieRef.current = movieId;
      controller.activate(settings);
    };
    start();
    video.addEventListener('playing', start);
    return () => video.removeEventListener('playing', start);
  }, [
    controller,
    status.movieId,
    status.available,
    status.active,
    showToggle,
    needsModel,
    autoActivate,
    originalLanguage,
    targetLanguage,
    numLines,
    captionDisplay,
    captionStyle,
    captionSizeRatio,
  ]);

  const handleDropdownOpenChange = (open: boolean) => {
    if (open && needsModel) {
      panelService.openPanel();
      return;
    }
    setIsDropdownOpen(open);
    if (!open) setOpenPopover(null);
    // The video waits while the menu is open and plays on Activate, as on YouTube.
    const video = playerVideo();
    if (open && video && !video.paused) video.pause();
  };

  const activate = () => {
    setIsDropdownOpen(false);
    setOpenPopover(null);
    if (needsModel) {
      panelService.openPanel();
      return;
    }
    startedMovieRef.current = status.movieId;
    controller.activate(settings);
    const video = playerVideo();
    if (video?.paused) void video.play();
  };

  const handleActivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    activate();
  };

  // Picking a choice this title falls under turns its captions on now, as Activate does.
  const handleSelectAutoActivate = (value: string) => {
    const rule = value as CaptionAutoActivate;
    void setAutoActivate(rule);
    if (!status.active && autoActivates(rule, originalLanguage, targetLanguage)) activate();
  };

  const handleDeactivate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    controller.deactivate();
    setIsDropdownOpen(false);
  };

  if (!showToggle || status.adPlaying || (!status.available && !status.active)) return null;

  const originalOptions = status.tracks.map((track) => {
    const label = trackLabel(track);
    const native = nativeName(track.language);
    // LanguageOptionItem leaves out a gray name equal to the label, e.g. 한국어 in Korean.
    return { value: track.trackId, label, desc: native === track.label ? label : native };
  });
  const originalTrack = status.tracks.find((track) => track.trackId === status.originalTrackId);
  const originalValueLabel = status.failed
    ? t('netflix.loadFailed')
    : originalTrack
      ? trackLabel(originalTrack)
      : '';

  return (
    <CaptionToggle
      className="
        sz-netflix-caption-toggle
        sz:flex
        sz:flex-col
        sz:justify-center
        sz:items-center
        sz:h-full
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
        {
          key: 'autoActivate',
          label: (
            <CaptionMenuLanguageRow
              side="left"
              label={t('youtube.autoActivate')}
              valueLabel={autoActivateLabel(t, autoActivate)}
              options={autoActivateOptions(t, targetLanguage)}
              open={isDropdownOpen && openPopover === 'autoActivate'}
              onOpenChange={(open) => setOpenPopover(open ? 'autoActivate' : null)}
              onSelect={handleSelectAutoActivate}
            />
          ),
        },
      ]}
      activateLabel={t('youtube.activate')}
      deactivateLabel={t('youtube.deactivate')}
      onActivate={handleActivate}
      onDeactivate={handleDeactivate}
      isLoading={status.loading}
      isActivated={status.active}
      iconSize={ICON_SIZE}
      // Netflix's buttons are about as tall as their icons, so the bar goes below the icon: the book's
      // glyph ends 0.39em below its middle, and the bar starts a quarter em lower, as on YouTube.
      underlineTop={`calc(50% + ${ICON_SIZE} * 0.64)`}
    />
  );
};

export default NetflixCaptionToggle;
