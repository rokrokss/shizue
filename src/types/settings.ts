/**
 * User settings types that match the backend schema
 */

export interface GeneralSettings {
  language?: string;
  translateTargetLanguage?: string;
  userMemory?: string;
}

export interface ModelSettings {
  // Legacy: actual model IDs (auto-selected based on size preference)
  chatModel?: string;
  translateModel?: string;

  // New: size preferences
  chatSize?: 'large' | 'small';
  translateSize?: 'large' | 'small';
  providerPreference?: 'openai' | 'gemini' | 'anthropic';
}

export interface LayoutSettings {
  theme?: string;
  showToggle?: boolean;
  toggleYPosition?: number;
  showYoutubeCaptionToggle?: boolean;
  showYoutubeBilingualCaption?: boolean;
  useYoutubeKeyboardNavigate?: boolean;
  youtubeCaptionSizeRatio?: number;
  toggleHiddenSiteList?: string[];
}

export interface ApiKeySettings {
  openai?: string;
  gemini?: string;
  anthropic?: string;
  openaiValidated?: boolean;
  geminiValidated?: boolean;
  anthropicValidated?: boolean;
}

export interface UserSettings {
  general: GeneralSettings;
  models: ModelSettings;
  layout: LayoutSettings;
  apiKeys: ApiKeySettings;
  apiMode?: string;
  apiModePreference?: string;
  pdfTranslateNoDual?: boolean;
}

export interface UserSettingsUpdate {
  general?: GeneralSettings;
  models?: ModelSettings;
  layout?: LayoutSettings;
  apiKeys?: ApiKeySettings;
  apiMode?: string;
  apiModePreference?: string;
  pdfTranslateNoDual?: boolean;
}

export interface ApiKeyRequest {
  provider: 'openai' | 'gemini' | 'anthropic';
  key: string;
}

export interface ApiKeyResponse {
  provider: string;
  maskedKey: string;
  validated: boolean;
}

// Model mapping types
export interface ModelInfo {
  id: string;
  name: string;
  provider: 'openai' | 'gemini' | 'anthropic';
  size: 'large' | 'small';
  version: string;
  active: boolean;
  deprecated: boolean;
  successorId?: string;
}

export interface AvailableModelsResponse {
  models: Record<string, ModelInfo>;
  availableProviders: string[];
}

// Storage key mapping from old localStorage keys to new settings structure
export const STORAGE_KEY_MAPPING = {
  // General settings
  LANGUAGE: 'general.language',
  TRANSLATE_TARGET_LANGUAGE: 'general.translateTargetLanguage',
  USER_MEMORY: 'general.userMemory',

  // Model settings
  CHAT_MODEL: 'models.chatModel',
  TRANSLATE_MODEL: 'models.translateModel',

  // Layout settings
  THEME: 'layout.theme',
  SHOW_TOGGLE: 'layout.showToggle',
  TOGGLE_Y_POSITION: 'layout.toggleYPosition',
  SHOW_YOUTUBE_CAPTION_TOGGLE: 'layout.showYoutubeCaptionToggle',
  SHOW_YOUTUBE_BILINGUAL_CAPTION: 'layout.showYoutubeBilingualCaption',
  USE_YOUTUBE_KEYBOARD_NAVIGATE: 'layout.useYoutubeKeyboardNavigate',
  YOUTUBE_CAPTION_SIZE_RATIO: 'layout.youtubeCaptionSizeRatio',
  TOGGLE_HIDDEN_SITE_LIST: 'layout.toggleHiddenSiteList',

  // API keys
  OPENAI_KEY: 'apiKeys.openai',
  GEMINI_KEY: 'apiKeys.gemini',
  ANTHROPIC_KEY: 'apiKeys.anthropic',
  OPENAI_VALIDATED: 'apiKeys.openaiValidated',
  GEMINI_VALIDATED: 'apiKeys.geminiValidated',
  ANTHROPIC_VALIDATED: 'apiKeys.anthropicValidated',

  // Other settings
  API_MODE: 'apiMode',
  API_MODE_PREFERENCE: 'apiModePreference',
  PDF_TRANSLATE_NO_DUAL: 'pdfTranslateNoDual',
} as const;
