import { MESSAGE_READ_YOUTUBE_TRANSCRIPT } from '@/config/constants';
import type { VideoTranscript } from '@/lib/videoTranscript';
import { fetchCaptionTrack, getVideoData, getVideoId, isYoutubeAdPlaying } from '@/lib/youtube';

// Runs in a YouTube tab. Captions are fetched the way bilingual captions fetch them: with the
// player's own caption request, which the player makes once its CC button is pressed and put back
// (see getCaptionUrl in lib/youtube.ts).

// An ad plays in the video's own player, and its caption request is the ad's. Captions are read
// once the ad ends, waiting at most this long.
const AD_WAIT_MS = 60_000;

const adEnded = async () => {
  for (let waited = 0; isYoutubeAdPlaying() && waited < AD_WAIT_MS; waited += 500) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

const read = async (videoId: string): Promise<VideoTranscript> => {
  await adEnded();
  const data = await getVideoData(videoId);
  const transcript: VideoTranscript = {
    videoId,
    title: data.metadata?.title ?? document.title,
    author: data.metadata?.author ?? '',
    description: data.metadata?.shortDescription ?? '',
    captions: null,
  };
  // The original language's captions, as bilingual captions show them. A live stream has none to
  // download.
  const track = data.live?.isLive ? undefined : data.originalTrack ?? data.transcriptMetadata?.[0];
  if (!track) return transcript;
  const captions = await fetchCaptionTrack(track);
  return { ...transcript, captions: captions?.length ? captions : null };
};

// One read per video at a time, so the CC button isn't pressed twice over.
const reading = new Map<string, Promise<VideoTranscript>>();

// The video this tab shows, or null when it isn't a watch page.
export const readYoutubeTranscript = async (): Promise<VideoTranscript | null> => {
  const videoId = location.pathname === '/watch' ? getVideoId() : null;
  if (!videoId) return null;
  let pending = reading.get(videoId);
  if (!pending) {
    pending = read(videoId).finally(() => reading.delete(videoId));
    reading.set(videoId, pending);
  }
  return pending;
};

export const registerYoutubeTranscriptListener = () => {
  const listener = (
    message: any,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: VideoTranscript | null) => void
  ) => {
    if (message?.action !== MESSAGE_READ_YOUTUBE_TRANSCRIPT) return false;
    void readYoutubeTranscript().then(sendResponse, () => sendResponse(null));
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch {
      // Invalidated by an update.
    }
  };
};
