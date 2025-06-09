import YoutubeCaptionSettingModal from '@/components/Modal/YoutubeCaptionSettingModal';
import useAdObserver from '@/lib/useAdObserver';
import { getVideoData, getVideoId, TranscriptMetadata } from '@/lib/youtube';
import { debugLog } from '@/logs';
import { LoadingOutlined, ReadFilled } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ElementPos = { x: number; y: number } | null;

const YoutubeCaptionToggle = () => {
  const { t } = useTranslation();

  const [isCaptionAvailable, setIsCaptionAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcriptMetadata, setTranscriptMetadata] = useState<TranscriptMetadata[]>([]);
  const iconRef = useRef<HTMLDivElement | null>(null);
  const [tooltipPos, setTooltipPos] = useState<ElementPos>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingModalPos, setSettingModalPos] = useState<ElementPos>(null);

  const lastVideoIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const isAdPlaying = () => {
    const ad = document.querySelector<HTMLDivElement>('.ytp-ad-module');
    return !!ad && ((ad.textContent?.trim().length ?? 0) > 0 || ad.childElementCount > 0);
  };

  const refreshCaptionStatus = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!window.location.pathname.includes('watch') || isAdPlaying()) {
      setIsCaptionAvailable(false);
      setIsSettingsOpen(false);
      setTranscriptMetadata([]);
      return;
    }

    const vid = getVideoId();
    if (!vid || vid === lastVideoIdRef.current) return;

    inFlightRef.current = true;

    try {
      lastVideoIdRef.current = vid;
      debugLog('[YouTube] checking captions for', vid);

      const data = await getVideoData(vid);
      debugLog('[Youtube] videoData', data);

      if (data?.transcriptMetadata) {
        lastVideoIdRef.current = vid;
        setIsCaptionAvailable(true);
        setTranscriptMetadata(data.transcriptMetadata);
      } else {
        setIsCaptionAvailable(false);
        setTranscriptMetadata([]);
      }
    } finally {
      setIsSettingsOpen(false);
      inFlightRef.current = false;
    }
  }, []);

  const handleAdStart = useCallback(() => {
    debugLog('[Youtube] useAdObserver: ad is started');
    setIsCaptionAvailable(false);
    setIsSettingsOpen(false);
    setTranscriptMetadata([]);
  }, []);

  const handleAdEnd = useCallback(() => {
    debugLog('[Youtube] useAdObserver: ad is finished');
    refreshCaptionStatus();
  }, [refreshCaptionStatus]);

  const handleResize = useCallback(() => {
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
    }
  }, [isSettingsOpen, setIsSettingsOpen]);

  useAdObserver(handleAdStart, handleAdEnd);

  useEffect(() => {
    refreshCaptionStatus();

    window.addEventListener('yt-navigate-finish', refreshCaptionStatus, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('yt-navigate-finish', refreshCaptionStatus);
      window.removeEventListener('resize', handleResize);
    };
  }, [refreshCaptionStatus, handleResize]);

  const handleToggle = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!iconRef.current) return;
    if (isSettingsOpen) {
      setIsSettingsOpen(!isSettingsOpen);
    } else {
      const { left, top, width } = iconRef.current.getBoundingClientRect();
      setSettingModalPos({ x: left + width / 2 - 100, y: top - 85 });
      setIsSettingsOpen(!isSettingsOpen);
    }
  };

  const showTooltip = useCallback(() => {
    if (!iconRef.current) return;
    const { left, top, width } = iconRef.current.getBoundingClientRect();

    setTooltipPos({ x: left + width / 2, y: top - 53 });
  }, []);

  const hideTooltip = useCallback(() => setTooltipPos(null), []);

  return (
    isCaptionAvailable && (
      <div
        className="
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
      >
        <div
          className="
            sz:flex
            sz:justify-center
            sz:items-center
            sz:px-3
            sz:gap-2
            sz:cursor-pointer
          "
          ref={iconRef}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onClick={handleToggle}
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
          {tooltipPos && (
            <div
              className="
                sz-hover-ai-caption
                sz:fixed
                sz:-translate-x-1/2
                sz:h-[24px]
                sz:rounded-lg
                sz:bg-black/72
                sz:text-[#E8E9EA]
                sz:shadow-xl
                sz:z-[2147483647]
                sz:text-center
                sz:text-[13px]
                sz:leading-none
                sz:flex
                sz:items-center
                sz:justify-center
                sz:px-4
              "
              style={{ left: tooltipPos.x, top: tooltipPos.y }}
            >
              {t('youtube.aiCaption')}
            </div>
          )}
        </div>
        {isSettingsOpen && settingModalPos && (
          <YoutubeCaptionSettingModal
            onClose={() => setIsSettingsOpen(false)}
            content={<div className="sz:text-white">hello</div>}
            tooltipX={settingModalPos.x}
            tooltipY={settingModalPos.y}
          />
        )}
      </div>
    )
  );
};

export default YoutubeCaptionToggle;
