import { getVideoData, getVideoId } from '@/lib/youtube';
import { debugLog } from '@/logs';
import { LoadingOutlined, SmileOutlined } from '@ant-design/icons';
import { Switch } from 'antd';
import { useEffect } from 'react';

const YoutubeCaptionToggle = () => {
  const [lastVideoId, setLastVideoId] = useState<string | null>(null);
  const [isCaptionAvailable, setIsCaptionAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleNewVideo = async () => {
    setIsCaptionAvailable(false);
    const vid = getVideoId();
    debugLog('[Youtube] handleNewVideo: vid', vid);

    if (!vid) {
      debugLog('[Youtube] handleNewVideo: No videoId found');
      return;
    }

    if (lastVideoId && vid === lastVideoId) {
      debugLog('[Youtube] handleNewVideo: lastVideoId is the same');
      return;
    }

    setLastVideoId(vid);

    const videoData = await getVideoData(vid);
    debugLog('[Youtube] videoData', videoData);

    if (videoData?.transcript) {
      setIsCaptionAvailable(true);
    }
  };

  useEffect(() => {
    if (!lastVideoId) {
      handleNewVideo();
    }
    window.addEventListener('yt-navigate-finish', handleNewVideo);

    return () => {
      window.removeEventListener('yt-navigate-finish', handleNewVideo);
    };
  }, []);

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
