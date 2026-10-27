/* message */
export const MESSAGE_SET_PANEL_OPEN_OR_NOT = 'set_panel_open_or_not';
export const MESSAGE_OPEN_PANEL = 'action_open_panel';
export const MESSAGE_UPDATE_PANEL_INIT_DATA = 'update_panel_init_data';
export const MESSAGE_WAIT_PANEL_SUMMARY = 'wait_panel_summary';
export const MESSAGE_LOAD_THREAD = 'action_load_thread';
export const MESSAGE_RUN_GRAPH_STREAM = 'run_graph_stream';
export const MESSAGE_RETRY_GRAPH_STREAM = 'retry_graph_stream';
export const MESSAGE_CANCEL_NOT_STARTED_MESSAGE = 'cancel_not_started_message';
export const MESSAGE_TRANSLATE_HTML_TEXT_BATCH = 'translate_html_text_batch';
export const MESSAGE_TRANSLATE_YOUTUBE_CAPTION = 'translate_youtube_caption';
export const MESSAGE_TRANSLATE_LIVE_CAPTION = 'translate_live_caption';
export const MESSAGE_TRANSLATE_SUBTITLES = 'translate_subtitles';
export const MESSAGE_INJECT_TWITCH_BRIDGE = 'inject_twitch_bridge';
export const MESSAGE_SCC_CAPTION_SNAPSHOT = 'scc_caption_snapshot';
export const MESSAGE_SCC_SET_HIDDEN = 'scc_set_hidden';
export const MESSAGE_INJECT_NETFLIX_BRIDGE = 'inject_netflix_bridge';
export const MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE = 'context_menu_translate_page';
export const MESSAGE_TRANSLATE_FRAMES = 'translate_frames';
export const MESSAGE_FRAME_TRANSLATION_STATE = 'frame_translation_state';
export const MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE = 'context_menu_summarize_page';
export const MESSAGE_CONTEXT_MENU_DESCRIBE_IMAGE = 'context_menu_describe_image';
export const MESSAGE_CONTEXT_MENU_EXTRACT_IMAGE_TEXT = 'context_menu_extract_image_text';
export const MESSAGE_CONTEXT_MENU_SELECTION_ACTION = 'context_menu_selection_action';

/* port */
export const PORT_STREAM_MESSAGE = 'stream_message_key';

/* storage */
export const STORAGE_LANGUAGE = 'LANGUAGE';
export const STORAGE_TRANSLATE_TARGET_LANGUAGE = 'TRANSLATE_TARGET_LANGUAGE';
export const STORAGE_CURRENT_CHAT = 'CURRENT_CHAT';
export const STORAGE_CHAT_MODEL = 'CHAT_MODEL';
export const STORAGE_TRANSLATE_MODEL = 'TRANSLATE_MODEL';
export const STORAGE_PROVIDER_MODEL_PREFERENCES = 'PROVIDER_MODEL_PREFERENCES';
// The model list fetched from shizue.net (services/background/modelListSync.ts).
export const STORAGE_MODEL_LIST = 'MODEL_LIST';
export const STORAGE_OPENAI_KEY = 'OPENAI_KEY';
export const STORAGE_GEMINI_KEY = 'GEMINI_KEY';
export const STORAGE_ANTHROPIC_KEY = 'ANTHROPIC_KEY';
export const STORAGE_OPENROUTER_KEY = 'OPENROUTER_KEY';
export const STORAGE_OPENAI_VALIDATED = 'OPENAI_VALIDATED';
export const STORAGE_GEMINI_VALIDATED = 'GEMINI_VALIDATED';
export const STORAGE_ANTHROPIC_VALIDATED = 'ANTHROPIC_VALIDATED';
export const STORAGE_OPENROUTER_VALIDATED = 'OPENROUTER_VALIDATED';
export const STORAGE_CONNECTION_MODE = 'CONNECTION_MODE';
export const STORAGE_LOCAL_SERVER = 'LOCAL_SERVER';
export const STORAGE_CHATGPT_CONNECTION = 'CHATGPT_CONNECTION';
// OAuth tokens. Read only by the background (services/background/chatgpt.ts), never by the UI.
export const STORAGE_CHATGPT_CREDENTIALS = 'CHATGPT_CREDENTIALS';
export const STORAGE_USER_MEMORY = 'USER_MEMORY';
export const STORAGE_GLOBAL_STATE = 'GLOBAL_STATE';
export const STORAGE_THEME = 'THEME';
export const STORAGE_SHOW_TOGGLE = 'SHOW_TOGGLE';
export const STORAGE_TOGGLE_Y_POSITION = 'TOGGLE_Y_POSITION';
export const STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE = 'SHOW_YOUTUBE_CAPTION_TOGGLE';
export const STORAGE_SHOW_YOUTUBE_BILINGUAL_CAPTION = 'SHOW_YOUTUBE_BILINGUAL_CAPTION';
export const STORAGE_USE_YOUTUBE_KEYBOARD_NAVIGATE = 'USE_YOUTUBE_KEYBOARD_NAVIGATE';
export const STORAGE_YOUTUBE_CAPTION_SIZE_RATIO = 'YOUTUBE_CAPTION_SIZE_RATIO';
export const STORAGE_YOUTUBE_AUTO_ACTIVATE = 'YOUTUBE_AUTO_ACTIVATE';
export const STORAGE_SHOW_TWITCH_CAPTION_TOGGLE = 'SHOW_TWITCH_CAPTION_TOGGLE';
export const STORAGE_TWITCH_CAPTION_SOURCE = 'TWITCH_CAPTION_SOURCE';
export const STORAGE_TWITCH_CHANNEL_LANGUAGE = 'TWITCH_CHANNEL_LANGUAGE';
export const STORAGE_SPEECH_RECOGNITION_CONSENT = 'SPEECH_RECOGNITION_CONSENT';
export const STORAGE_TWITCH_CHROME_TRANSLATION = 'TWITCH_CHROME_TRANSLATION';
export const STORAGE_YOUTUBE_CHANNEL_LANGUAGE = 'YOUTUBE_CHANNEL_LANGUAGE';
export const STORAGE_SHOW_NETFLIX_CAPTION_TOGGLE = 'SHOW_NETFLIX_CAPTION_TOGGLE';
export const STORAGE_NETFLIX_BILINGUAL_CAPTION = 'NETFLIX_BILINGUAL_CAPTION';
export const STORAGE_TOGGLE_HIDDEN_SITE_LIST = 'TOGGLE_HIDDEN_SITE_LIST';

/* parameters */
export const STREAM_FLUSH_THRESHOLD_0 = 5;
export const STREAM_FLUSH_THRESHOLD_1 = 10;
// Page text is re-sent with every follow-up turn, so bound its size (~25-35K tokens).
export const SUMMARY_PAGE_TEXT_MAX_CHARS = 100_000;
// Custom instructions go with every chat request, so bound them too (up to ~1,500 tokens).
export const CUSTOM_INSTRUCTIONS_MAX_CHARS = 1_500;
// Tabs and PDF files attached to one chat message share SUMMARY_PAGE_TEXT_MAX_CHARS.
export const MAX_ATTACHED_TABS = 5;

/* selection actions: context menu item IDs, also used as ActionTypes */
export const SELECTION_ACTION_TYPES = [
  'translateSelection',
  'explainSelection',
  'summarizeSelection',
  'fixGrammarSelection',
] as const;

export type SelectionActionType = (typeof SELECTION_ACTION_TYPES)[number];

export const isSelectionActionType = (value: unknown): value is SelectionActionType =>
  SELECTION_ACTION_TYPES.includes(value as SelectionActionType);
