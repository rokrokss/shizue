import { speechLanguageForCode } from '@/lib/liveCaption/speechLanguage';
import { debugLog } from '@/logs';

// YouTube reports no spoken language for a video without captions, so guess it from the title and
// description with Chrome's built-in language detector (Chrome 138+, desktop).
const MIN_CONFIDENCE = 0.5;
// create() stays pending when Chrome can't fetch the model.
const TIMEOUT_MS = 5000;

const withTimeout = <T,>(promise: Promise<T>) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS))]);

export const detectSpokenLanguage = async (text: string): Promise<string | null> => {
  const Detector = (self as any).LanguageDetector;
  if (!text.trim() || typeof Detector?.create !== 'function') return null;
  try {
    // A model still to download needs a recent click; the menu opening or "Activate" is one.
    if ((await Detector.availability?.()) === 'unavailable') return null;
    const detector = await withTimeout<any>(Detector.create());
    const [best] = await withTimeout<any[]>(detector.detect(text));
    debugLog('[YouTube] spoken language guess', best);
    return best && best.confidence >= MIN_CONFIDENCE ? speechLanguageForCode(best.detectedLanguage) : null;
  } catch (error) {
    debugLog('[YouTube] language detection failed', error);
    return null;
  }
};
