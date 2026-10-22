import type { Language } from '@/hooks/language';
import { debugLog } from '@/logs';

// Chrome's built-in Translator API (Chrome 138+): an on-device model per language pair. Once the
// model is on the device a caption line takes 4–19 ms, against seconds for an LLM (Chrome 155,
// en→ko; the first download took about 25 s). It translates each line alone, without the context
// an LLM gets, and drops clauses more often.

type ChromeTranslator = { translate: (text: string) => Promise<string> };
type TranslatorStatic = {
  create: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<ChromeTranslator>;
};

// Looked up on each call, like the speech recognizer: tests install a stand-in after this loads.
const translatorClass = () => ((self as any).Translator ?? null) as TranslatorStatic | null;

export const isChromeTranslatorSupported = () => typeof translatorClass()?.create === 'function';

// The app's target languages as BCP 47 tags.
const LANGUAGE_TAGS: Record<Language, string> = {
  English: 'en',
  Korean_한국어: 'ko',
  ChineseSimplified_简体中文: 'zh',
  ChineseTraditional_繁體中文: 'zh-Hant',
  Japanese_日本語: 'ja',
  Spanish_Español: 'es',
  French_Français: 'fr',
  PortugueseBR_Português: 'pt',
  PortuguesePT_Português: 'pt',
  Russian_Русский: 'ru',
  Hindi_हिंदी: 'hi',
  Italian_Italiano: 'it',
  German_Deutsch: 'de',
  Polish_Polski: 'pl',
  Turkish_Türkçe: 'tr',
  Arabic_العربية: 'ar',
  Filipino_Tagalog: 'fil',
  Bengali_বাংলা: 'bn',
  Urdu_اردو: 'ur',
  Swahili_Kiswahili: 'sw',
  'Vietnamese_Tiếng Việt': 'vi',
  Persian_فارسی: 'fa',
  Thai_ภาษาไทย: 'th',
};

// The stream's language, a speech recognition tag ('en-US', 'cmn-Hans-CN'), as BCP 47.
const sourceTag = (speechLanguage: string) => {
  if (speechLanguage.startsWith('cmn-Hans')) return 'zh';
  if (speechLanguage.startsWith('cmn-Hant')) return 'zh-Hant';
  return speechLanguage.split('-')[0];
};

// When Chrome can't fetch the model (no network for its components, an unsupported build),
// create() stays pending instead of failing.
const CREATE_TIMEOUT_MS = 90_000;
// A model already on the device is ready in milliseconds; this long is worth waiting for one.
const READY_WAIT_MS = 300;

const ready = new Map<string, ChromeTranslator>();
const pending = new Map<string, Promise<void>>();
const failed = new Set<string>();

const pairOf = (speechLanguage: string, target: Language) => {
  const source = sourceTag(speechLanguage);
  const targetTag = LANGUAGE_TAGS[target];
  return { source, target: targetTag, key: `${source}>${targetTag}` };
};

// Downloading a model needs a recent click, so call this from one (activating, or changing the
// language or engine). A pair that failed is tried again.
export const prepareChromeTranslator = (speechLanguage: string, target: Language): Promise<void> => {
  const pair = pairOf(speechLanguage, target);
  if (pair.source === pair.target || ready.has(pair.key)) return Promise.resolve();
  const running = pending.get(pair.key);
  if (running) return running;
  failed.delete(pair.key);
  const Translator = translatorClass();
  if (!Translator) {
    failed.add(pair.key);
    return Promise.resolve();
  }
  const done = Promise.race([
    Translator.create({ sourceLanguage: pair.source, targetLanguage: pair.target }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), CREATE_TIMEOUT_MS)),
  ])
    .then((translator) => {
      if (translator) ready.set(pair.key, translator);
      else failed.add(pair.key);
    })
    .catch((error) => {
      debugLog('[LiveCaption] Chrome translator unavailable for', pair.key, error);
      failed.add(pair.key);
    })
    .finally(() => pending.delete(pair.key));
  pending.set(pair.key, done);
  return done;
};

// The pair's model is still being prepared (downloading).
export const isChromeTranslatorPending = (speechLanguage: string, target: Language) =>
  pending.has(pairOf(speechLanguage, target).key);

// Translates each line on the device. Resolves to null while the model is still downloading, and
// to undefined when this device can't translate the pair.
export const translateOnDevice = async (
  speechLanguage: string,
  target: Language,
  texts: string[]
): Promise<string[] | null | undefined> => {
  const pair = pairOf(speechLanguage, target);
  if (pair.source === pair.target) return texts;
  // The model may already be on the device, which needs no click.
  if (!ready.has(pair.key) && !failed.has(pair.key)) {
    const preparing = prepareChromeTranslator(speechLanguage, target);
    await Promise.race([preparing, new Promise((resolve) => setTimeout(resolve, READY_WAIT_MS))]);
  }
  const translator = ready.get(pair.key);
  if (translator) return Promise.all(texts.map((text) => translator.translate(text)));
  return failed.has(pair.key) ? undefined : null;
};
