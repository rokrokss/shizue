// Speech recognition needs the spoken language up front. Twitch reports a channel's broadcast
// language as a code (broadcastSettings.language, e.g. "EN", "PT"); the viewer can also pick one.
export type SpeechLanguageOption = { value: string; label: string; desc: string };

export const SPEECH_LANGUAGES: SpeechLanguageOption[] = [
  { value: 'en-US', label: 'English', desc: 'English' },
  { value: 'ko-KR', label: '한국어', desc: 'Korean' },
  { value: 'ja-JP', label: '日本語', desc: 'Japanese' },
  { value: 'cmn-Hans-CN', label: '简体中文', desc: 'Chinese (Simplified)' },
  { value: 'cmn-Hant-TW', label: '繁體中文', desc: 'Chinese (Traditional)' },
  { value: 'es-ES', label: 'Español', desc: 'Spanish' },
  { value: 'pt-BR', label: 'Português', desc: 'Portuguese' },
  { value: 'fr-FR', label: 'Français', desc: 'French' },
  { value: 'de-DE', label: 'Deutsch', desc: 'German' },
  { value: 'it-IT', label: 'Italiano', desc: 'Italian' },
  { value: 'ru-RU', label: 'Русский', desc: 'Russian' },
  { value: 'pl-PL', label: 'Polski', desc: 'Polish' },
  { value: 'tr-TR', label: 'Türkçe', desc: 'Turkish' },
  { value: 'th-TH', label: 'ภาษาไทย', desc: 'Thai' },
  { value: 'vi-VN', label: 'Tiếng Việt', desc: 'Vietnamese' },
  { value: 'id-ID', label: 'Bahasa Indonesia', desc: 'Indonesian' },
  { value: 'ar-SA', label: 'العربية', desc: 'Arabic' },
  { value: 'hi-IN', label: 'हिंदी', desc: 'Hindi' },
  { value: 'nl-NL', label: 'Nederlands', desc: 'Dutch' },
  { value: 'sv-SE', label: 'Svenska', desc: 'Swedish' },
  { value: 'uk-UA', label: 'Українська', desc: 'Ukrainian' },
];

const TWITCH_CODE_TO_SPEECH: Record<string, string> = {
  EN: 'en-US',
  KO: 'ko-KR',
  JA: 'ja-JP',
  ZH: 'cmn-Hans-CN',
  'ZH-HK': 'cmn-Hant-TW',
  ES: 'es-ES',
  PT: 'pt-BR',
  FR: 'fr-FR',
  DE: 'de-DE',
  IT: 'it-IT',
  RU: 'ru-RU',
  PL: 'pl-PL',
  TR: 'tr-TR',
  TH: 'th-TH',
  VI: 'vi-VN',
  ID: 'id-ID',
  AR: 'ar-SA',
  HI: 'hi-IN',
  NL: 'nl-NL',
  SV: 'sv-SE',
  UK: 'uk-UA',
};

export const speechLanguageForTwitchCode = (code: string | null | undefined) =>
  code ? (TWITCH_CODE_TO_SPEECH[code.toUpperCase()] ?? null) : null;

export const speechLanguageLabel = (value: string | null | undefined) =>
  SPEECH_LANGUAGES.find((option) => option.value === value)?.label ?? value ?? '';
