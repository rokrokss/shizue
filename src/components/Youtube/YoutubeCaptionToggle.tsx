import useAdObserver from '@/lib/useAdObserver';
import { getVideoData, getVideoId } from '@/lib/youtube';
import { debugLog } from '@/logs';
import { LoadingOutlined, SmileOutlined } from '@ant-design/icons';
import { Switch } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

const YoutubeCaptionToggle = () => {
  const [isCaptionAvailable, setIsCaptionAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

      setIsCaptionAvailable(!!data?.transcript);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useAdObserver(
    () => {
      debugLog('[Youtube] useAdObserver: ad is started');
      setIsCaptionAvailable(false);
    },
    () => {
      debugLog('[Youtube] useAdObserver: ad is finished');
      refreshCaptionStatus();
    }
  );

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
        sz:py-[2px]
        sz:rounded-lg
        sz:font-youtube
      "
      >
        <div
          className="sz:flex sz:justify-center sz:items-center sz:rounded-lg sz:h-11 sz:px-3 sz:gap-2"
          style={{
            backgroundImage:
              'radial-gradient(60% 80% at 50% 100%, rgba(153, 153, 153, 0.8) 0%, rgba(102, 102, 102, 0.8) 100%)',
          }}
        >
          {isLoading ? (
            <LoadingOutlined
              style={{
                fontSize: '16px',
                color: '#fff',
              }}
            />
          ) : (
            <SmileOutlined
              style={{
                fontSize: '16px',
                color: '#fff',
              }}
            />
          )}
          <div className="sz:text-[13px] sz:text-white sz:flex sz:items-center sz:font-normal">
            AI 자막
            <Switch onChange={handleToggle} />
          </div>
          <Switch onChange={handleToggle} />
        </div>
      </div>
    )
  );
};

export default YoutubeCaptionToggle;
