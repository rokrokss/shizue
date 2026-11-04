import type { Language } from '@/hooks/language';
import { getI8NLanguage } from '@/lib/language';

// Whether a paragraph is already in the language it would be translated into, told on the device
// so it isn't sent at all. Scripts settle it for Korean, Japanese, Chinese, Thai and Bengali; the
// rest need Chrome's LanguageDetector (138+) when it is on the device. When neither can tell,
// the paragraph is sent and the model leaves it untranslated as before.

const SCRIPTS = {
  hangul: /[\p{Script=Hangul}]/u,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  han: /[\p{Script=Han}]/u,
  latin: /[\p{Script=Latin}]/u,
  cyrillic: /[\p{Script=Cyrillic}]/u,
  arabic: /[\p{Script=Arabic}]/u,
  devanagari: /[\p{Script=Devanagari}]/u,
  bengali: /[\p{Script=Bengali}]/u,
  thai: /[\p{Script=Thai}]/u,
};
type Script = keyof typeof SCRIPTS;

const scriptShares = (text: string): Record<Script, number> | null => {
  const counts = Object.fromEntries(Object.keys(SCRIPTS).map((s) => [s, 0])) as Record<Script, number>;
  let letters = 0;
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    letters++;
    for (const script of Object.keys(SCRIPTS) as Script[]) {
      if (SCRIPTS[script].test(char)) {
        counts[script]++;
        break;
      }
    }
  }
  if (letters === 0) return null;
  for (const script of Object.keys(counts) as Script[]) counts[script] /= letters;
  return counts;
};

// The script each language is written in.
const LANGUAGE_SCRIPT: Partial<Record<string, Script>> = {
  ko: 'hangul',
  ja: 'kana',
  zh: 'han',
  th: 'thai',
  bn: 'bengali',
  hi: 'devanagari',
  ru: 'cyrillic',
  ar: 'arabic',
  fa: 'arabic',
  ur: 'arabic',
};

// true or false when the script settles it; undefined when another language shares the script.
export const scriptVerdict = (text: string, language: Language): boolean | undefined => {
  const shares = scriptShares(text);
  if (!shares) return undefined;
  const code = getI8NLanguage(language).split('_')[0];
  const script = LANGUAGE_SCRIPT[code] ?? 'latin';
  switch (code) {
    case 'ko':
      return shares.hangul >= 0.5;
    case 'ja':
      // Japanese mixes kana into its kanji; Chinese has none.
      return shares.kana >= 0.1 && shares.kana + shares.han >= 0.5;
    case 'zh':
      return shares.han >= 0.5 && shares.kana === 0 && shares.hangul === 0;
    case 'th':
    case 'bn':
      return shares[script] >= 0.5;
    default:
      // Mostly another script: not this language. Mostly this script: a language that shares it.
      return shares[script] < 0.5 ? false : undefined;
  }
};

type Detector = { detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> };
let detector: Promise<Detector | null> | undefined;

// Only a model already on the device: downloading one needs a click on the page.
const languageDetector = (): Promise<Detector | null> => {
  detector ??= (async () => {
    const api = (globalThis as { LanguageDetector?: any }).LanguageDetector;
    if (!api) return null;
    try {
      if ((await api.availability()) !== 'available') return null;
      return (await api.create()) as Detector;
    } catch {
      return null;
    }
  })();
  return detector;
};

// Short texts are guesses for any detector.
const MIN_DETECT_LENGTH = 20;

export const isInLanguage = async (text: string, language: Language): Promise<boolean> => {
  const verdict = scriptVerdict(text, language);
  if (verdict !== undefined) return verdict;
  if (text.length < MIN_DETECT_LENGTH) return false;
  const api = await languageDetector();
  if (!api) return false;
  try {
    const [best] = await api.detect(text);
    const code = getI8NLanguage(language).split('_')[0];
    return !!best && best.confidence >= 0.7 && best.detectedLanguage.split('-')[0] === code;
  } catch {
    return false;
  }
};

// The language a text is in, as a BCP 47 tag, when the script or the on-device detector can tell
// (meeting captions, for Chrome's translator); null otherwise.
export const detectLanguage = async (text: string): Promise<string | null> => {
  const shares = scriptShares(text);
  if (!shares) return null;
  if (shares.hangul >= 0.5) return 'ko';
  if (shares.kana >= 0.1 && shares.kana + shares.han >= 0.5) return 'ja';
  if (shares.han >= 0.5 && shares.kana === 0) return 'zh';
  if (shares.thai >= 0.5) return 'th';
  if (shares.bengali >= 0.5) return 'bn';
  if (text.length < MIN_DETECT_LENGTH) return null;
  const api = await languageDetector();
  if (!api) return null;
  try {
    const [best] = await api.detect(text);
    return best && best.confidence >= 0.6 && best.detectedLanguage !== 'und' ? best.detectedLanguage : null;
  } catch {
    return null;
  }
};
