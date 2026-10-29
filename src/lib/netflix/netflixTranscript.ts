import { MESSAGE_READ_VIDEO_TRANSCRIPT } from '@/config/constants';
import type { VideoTranscript } from '@/lib/videoTranscript';

// Runs in a Netflix tab: answers the side panel's request (lib/tabText.ts) for the title's original
// subtitles, which the caption controller reads (readTranscript in netflixCaptionController.tsx).
export const registerNetflixTranscriptListener = (read: () => Promise<VideoTranscript | null>) => {
  const listener = (
    message: any,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: VideoTranscript | null) => void
  ) => {
    if (message?.action !== MESSAGE_READ_VIDEO_TRANSCRIPT) return false;
    void read().then(sendResponse, () => sendResponse(null));
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
