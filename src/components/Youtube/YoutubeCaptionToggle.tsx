import useAdObserver from '@/lib/useAdObserver';
import { getVideoData, getVideoId, TranscriptMetadata } from '@/lib/youtube';
import { debugLog } from '@/logs';
import { LoadingOutlined, ReadFilled } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TooltipPos = { x: number; y: number } | null;

const YoutubeCaptionToggle = () => {
  const { t } = useTranslation();

  const [isCaptionAvailable, setIsCaptionAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcriptMetadata, setTranscriptMetadata] = useState<TranscriptMetadata[]>([]);
  const iconRef = useRef<HTMLDivElement | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>(null);

  const lastVideoIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const isAdPlaying = () => {
    const ad = document.querySelector<HTMLDivElement>('.ytp-ad-module');
    return !!ad && ((ad.textContent?.trim().length ?? 0) > 0 || ad.childElementCount > 0);
  };

  const refreshCaptionStatus = useCallback(async () => {
    if (inFlightRef.current) return;
    if (isAdPlaying()) {
      setIsCaptionAvailable(false);
      setTranscriptMetadata([]);
      debugLog('[Youtube] refreshCaptionStatus: ad is playing');
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
      inFlightRef.current = false;
    }
  }, []);

  const handleAdStart = useCallback(() => {
    debugLog('[Youtube] useAdObserver: ad is started');
    setIsCaptionAvailable(false);
    setTranscriptMetadata([]);
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
    };
  }, [refreshCaptionStatus]);

  const handleToggle = (checked: boolean) => {
    setIsLoading(checked);
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
                sz:h-[24px] sz:rounded-lg
                sz:bg-black sz:text-[#E8E9EA] sz:shadow-xl
                sz:z-[2147483647]
                sz:text-center
                sz:text-[13px]
                sz:leading-none
                sz:flex
                sz:items-center
                sz:justify-center
                sz:px-3
              "
              style={{ left: tooltipPos.x, top: tooltipPos.y }}
            >
              {t('youtube.aiCaption')}
            </div>
          )}
        </div>
      </div>
    )
  );
};

export default YoutubeCaptionToggle;
