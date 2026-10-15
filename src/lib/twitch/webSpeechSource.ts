import { debugLog } from '@/logs';

// Speech recognition on the stream's own audio, for streams without captions. The audio comes
// from the <video> element (captureStream), not tabCapture: a button inside the player cannot
// count as invoking the extension, and captureStream keeps working when the viewer mutes.

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start: (track?: MediaStreamTrack) => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionStatic = {
  new (): SpeechRecognitionLike;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (options: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

export type SpeechAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export type WebSpeechCallbacks = {
  // Everything recognized in the current session (finals, then the interim hypothesis).
  onSnapshot: (text: string, at: number) => void;
  // A new recognition session starts; its text does not continue the previous one.
  onBreak: (at: number) => void;
  onError: (error: string) => void;
};

const recognitionClass = (): SpeechRecognitionStatic | null =>
  ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null) as
    | SpeechRecognitionStatic
    | null;

export const isSpeechRecognitionSupported = () => {
  const Recognition = recognitionClass();
  // start(track) shipped in Chrome 135; available() arrived with it.
  return !!Recognition && typeof Recognition.available === 'function';
};

export const speechAvailability = async (
  lang: string,
  processLocally: boolean
): Promise<SpeechAvailability> => {
  try {
    const result = await recognitionClass()?.available?.({ langs: [lang], processLocally });
    return (result as SpeechAvailability) ?? 'unavailable';
  } catch {
    return 'unavailable';
  }
};

// Needs a user click (transient activation); downloads about 60 MB per language.
export const installOnDeviceSpeech = async (lang: string) => {
  try {
    return (await recognitionClass()?.install?.({ langs: [lang], processLocally: true })) === true;
  } catch (error) {
    debugLog('[Twitch] on-device speech install failed', error);
    return false;
  }
};

// Errors that restarting will not fix.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
// A cloud session can stop returning results without ending; restart it after this long.
const STALL_MS = 20_000;
// Keep the snapshot short: the segmenter only needs the part that is still changing.
const MAX_SNAPSHOT_CHARS = 400;

const findVideo = () =>
  document.querySelector<HTMLVideoElement>('.video-player__container video') ??
  document.querySelector<HTMLVideoElement>('video');

class WebSpeechSource {
  private callbacks: WebSpeechCallbacks | null = null;
  private lang = 'en-US';
  private processLocally = false;
  private recognition: SpeechRecognitionLike | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private running = false;
  private paused = false;
  private lastResultAt = 0;
  private failures = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  async start(lang: string, callbacks: WebSpeechCallbacks) {
    this.stop();
    this.callbacks = callbacks;
    this.lang = lang;
    this.processLocally = (await speechAvailability(lang, true)) === 'available';
    this.running = true;
    this.paused = false;
    this.failures = 0;
    this.watchdog = setInterval(() => this.checkStall(), 2000);
    this.startSession();
  }

  stop() {
    this.running = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.restartTimer = null;
    this.watchdog = null;
    this.endSession();
    this.callbacks = null;
  }

  // The stream was paused or an ad started: stop listening without forgetting the settings.
  setPaused(paused: boolean) {
    if (!this.running || paused === this.paused) return;
    this.paused = paused;
    if (paused) this.endSession();
    else this.startSession();
  }

  private endSession() {
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    recognition.onresult = recognition.onerror = recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // Already stopped.
    }
  }

  // One capture per <video>. When Twitch switches channels it keeps the element but adds a new
  // audio track; the old one stays "live" and goes silent, so always take the newest live track.
  private currentTrack(): MediaStreamTrack | null {
    const video = findVideo();
    if (!video) return null;
    if (video !== this.video) {
      this.video = video;
      this.stream = (video as any).captureStream() as MediaStream;
      this.stream.addEventListener('addtrack', () => {
        if (this.running && !this.paused) this.restartSession();
      });
    }
    const tracks = this.stream?.getAudioTracks().filter((t) => t.readyState === 'live') ?? [];
    return tracks[tracks.length - 1] ?? null;
  }

  private startSession() {
    if (!this.running || this.paused || this.recognition) return;
    const Recognition = recognitionClass();
    const track = this.currentTrack();
    if (!Recognition || !track) {
      // The stream has not started yet (or is between channels); try again shortly.
      this.scheduleRestart(1000);
      return;
    }
    this.track = track;
    const recognition = new Recognition();
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    if ('processLocally' in recognition) recognition.processLocally = this.processLocally;
    recognition.onresult = (event) => {
      this.lastResultAt = Date.now();
      this.failures = 0;
      let text = '';
      for (let index = 0; index < event.results.length; index++) {
        text += ` ${event.results[index][0].transcript}`;
      }
      text = text.replace(/\s+/g, ' ').trim();
      if (text.length > MAX_SNAPSHOT_CHARS) {
        const cut = text.indexOf(' ', text.length - MAX_SNAPSHOT_CHARS);
        text = text.slice(cut > 0 ? cut + 1 : text.length - MAX_SNAPSHOT_CHARS);
      }
      this.callbacks?.onSnapshot(text, this.lastResultAt);
    };
    recognition.onerror = (event) => {
      const error = String(event?.error ?? 'unknown');
      debugLog('[Twitch] speech recognition error', error);
      if (FATAL_ERRORS.has(error)) {
        this.callbacks?.onError(error);
        this.stop();
        return;
      }
      if (error !== 'no-speech' && error !== 'aborted') this.failures++;
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      // Back off when the service keeps failing (network errors), up to 30 s.
      this.scheduleRestart(this.failures ? Math.min(30_000, 1000 * 2 ** (this.failures - 1)) : 100);
    };
    this.recognition = recognition;
    this.lastResultAt = Date.now();
    this.callbacks?.onBreak(this.lastResultAt);
    try {
      recognition.start(track);
    } catch (error) {
      debugLog('[Twitch] speech recognition could not start', error);
      this.recognition = null;
      this.scheduleRestart(2000);
    }
  }

  private restartSession() {
    this.endSession();
    this.startSession();
  }

  private scheduleRestart(delayMs: number) {
    if (!this.running || this.paused || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startSession();
    }, delayMs);
  }

  private checkStall() {
    if (!this.running || this.paused || !this.recognition) return;
    const trackChanged = this.track && this.track !== this.currentTrack();
    if (trackChanged || Date.now() - this.lastResultAt > STALL_MS) {
      debugLog('[Twitch] restarting speech recognition:', trackChanged ? 'new track' : 'stalled');
      this.restartSession();
    }
  }
}

// One recognizer per page: two at once starved each other of audio in testing.
let instance: WebSpeechSource | null = null;
export const getWebSpeechSource = () => {
  instance ??= new WebSpeechSource();
  return instance;
};
