# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shizue is a Chrome extension that integrates Large Language Models (LLMs) into web browsing. Free, open-source alternative to commercial services like Sider, enabling users to use their own API keys for OpenAI, Anthropic Claude, and Google Gemini, or a single OpenRouter key for all of them.

## Development Commands

```bash
pnpm dev              # Development mode with hot-reloading
pnpm build            # Production build
pnpm zip              # Create distribution ZIP
pnpm compile          # TypeScript type checking
store/render.sh       # Render Chrome Web Store images (store/src → store/out)
```

### Chrome Web Store Images
- `store/src/*.html` recreate the extension UI in HTML (styles and strings copied from the real components and `src/locales/en.json`); `store/render.sh` screenshots them with headless Chrome at exact store sizes. When UI text, model names, or features they show change, update the HTML and re-render.
- `store-icon-128.png` is the store listing icon (96px artwork + 16px transparent padding). It is uploaded separately and is not the manifest icon in `src/public/icon/`.
- `github-social-1280x640.png` is the GitHub social preview, not a store image. It is uploaded in the repo's Settings → General → Social preview.

### Landing Page (shizue.net)
- `site/index.html` is the landing page. `site/build.sh` assembles it into `_site/` with images copied from `store/out`, and `.github/workflows/pages.yml` deploys it to GitHub Pages on push to `develop`. Re-rendered store images update the site too.
- `site/index.html` is a template: `site/render.mjs` fills its `{{key}}` placeholders from each `site/locales/<lang>.json` (English at `/`, others at `/<lang>/`, with hreflang links and the header language menu). Strings are HTML fragments, and the build fails if a locale is missing a key or changes the tags of `en.json`. When page copy changes, update every locale file; asset paths in the template must be root-absolute (`/img/...`).

### Testing Extension
1. Build: `pnpm build`
2. Navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" → select `dist/chrome-mv3/`

### Debugging
- **Background Script**: chrome://extensions → Service Worker → Inspect
- **Side Panel**: Right-click panel → Inspect
- **Content Scripts**: Regular page DevTools

## Architecture

### High-Level Component Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                          │
├─────────────────────┬───────────────────┬───────────────────┤
│  Background Script  │    Side Panel     │  Content Scripts  │
│  (Service Worker)   │   (React App)     │  (Page Injection) │
├─────────────────────┼───────────────────┼───────────────────┤
│ • Message Router    │ • Chat UI         │ • Toggle Button   │
│ • API Management    │ • Memo/Notes      │ • YouTube Captions│
│ • Context Menus     │ • Settings        │ • Page Overlay    │
│ • State Sync        │                   │ • Translation UI  │
└─────────────────────┴───────────────────┴───────────────────┘
```

### Component Communication Flow
1. **Chrome Runtime Messages** coordinate between all components
2. **Port Connections** stream data for real-time features (chat, translation)
3. **Storage Events** sync settings across components
4. **Background Script** acts as central message router and state coordinator

### Key Technologies
- **WXT** - Web extension framework with hot reload
- **React 19** + TypeScript + Tailwind CSS v4 + Ant Design
- **LangChain** - Unified interface for OpenAI, Anthropic, Google models
- **Jotai** - Atomic state management
- **Dexie** - IndexedDB wrapper for threads, messages, memos

### Core Components & Responsibilities

**Background Service Worker** (`src/entrypoints/background/index.ts`)
- Central message router handling all inter-component communication
- Context menu management (translate, summarize, image OCR)
- API key validation and storage
- Side panel lifecycle control

**Side Panel React App** (`src/entrypoints/sidepanel/`)
- Routes: `/` (redirects to `/chat`), `/chat`, `/shizue-memo`, `/onboarding`
- Streaming chat with thread management
- Memo system with auto-save and pinning

**Content Scripts**
- `toggle.content` - Floating button + overlay menu
- `youtube-caption-toggle.content` - Real-time caption translation

### Critical Multi-File Patterns

**Message Flow Pattern**
```
User Action → Content Script → Background Script → Side Panel
                                    ↓
                              Chrome Storage
```

**Service Architecture**
- `services/chatService.ts` - Cancels a not-yet-started AI message (streaming lives in the background handlers)
- `services/translationService.ts` - Batch translation, format preservation
- `services/background/messageHandlers.ts` - Central message processing
- `services/background/chatModelHandler.ts` - Chat streaming via port, token usage tracking
- `services/background/translationHandler.ts` - Batch page/caption translation (JSON output)

**State Management Layers**
1. **Jotai Atoms** (`hooks/global.ts`) - UI state, current thread
2. **Chrome Storage** - API keys, settings, preferences
3. **IndexedDB** (`lib/indexDB.ts`) - Threads, messages, memos

## Key Message Types & Storage

### Critical Message Actions (`src/config/constants.ts`)
```typescript
MESSAGE_SET_PANEL_OPEN_OR_NOT    // Toggle side panel
MESSAGE_TRANSLATE_HTML_TEXT_BATCH // Batch translate with formatting
MESSAGE_CONTEXT_MENU_*           // Context menu actions:
  - TRANSLATE_PAGE               // Full page translation
  - SUMMARIZE_PAGE               // AI page summary
  - DESCRIBE_IMAGE               // Image description
  - EXTRACT_IMAGE_TEXT           // OCR text extraction
```

### Storage Keys Pattern
```typescript
STORAGE_*_KEY                    // API keys (OpenAI, Gemini, Anthropic, OpenRouter)
STORAGE_*_MODEL                  // Selected models
STORAGE_*_VALIDATED              // API key validation status
STORAGE_USER_MEMORY              // User context for AI (defined but not yet used in prompts)
```

## Core Features

### 1. AI Chat with Streaming
- **Models**: see `MODELS` in `lib/modelRegistry.ts` (GPT-6 Sol/Luna, Gemini 3.8 Flash/3.5 Flash-Lite, Gemma 4 31B, Claude Sonnet 5/Haiku 4.5, DeepSeek V4 Pro/V4.1 Flash via OpenRouter only), plus `local:<model id>` refs for models on the user's own server (Ollama, LM Studio, llama.cpp)
- **Streaming**: Via port connections with background script
- **Thread Management**: IndexedDB storage with Dexie

### 2. Bilingual Translation
- **Overlay**: Side-by-side translation preserving formatting
- **Batch Processing**: Efficient DOM manipulation
- **Context Menu**: Right-click to translate any page

### 3. YouTube Caption Translation
- **Real-time**: Translates as captions appear
- **Caching**: Reduces API calls for repeated content
- **Keyboard Navigation**: Optional YouTube shortcuts

### 4. Memo System
- **Features**: Auto-save, pinning, search
- **Storage**: IndexedDB only
- **Route**: `/shizue-memo` in side panel

### 5. Context Menu Actions
- Translate/Summarize pages
- Describe images with AI
- Extract text from images (OCR)

## Build & Performance

### Bundle Optimization
- **Visualization**: `pnpm build` → check `dist/stats.html`
- **Tree-shaking**: Enabled via Rollup
- **Minification**: Terser with comment removal
- **Source Maps**: Disabled in production

### Content Security Policy
```javascript
// wxt.config.ts
content_security_policy: {
  extension_pages: "script-src 'self'; object-src 'self'"
}
```

### Internationalization
- **Languages**: 23 supported (ar, bn, de, en, es, fr, ja, ko, zh_CN, etc.)
- **Module**: `@wxt-dev/i18n` with dynamic switching
- **Files**: `src/locales/*.json`

## Critical Architecture Patterns

### Message Handler Registry Pattern
**When adding new message types**, follow this pattern:
1. Define constant in `src/config/constants.ts`: `export const MESSAGE_NEW_ACTION = 'new-action'`
2. Create handler function: `async function handleNewAction(msg, sendResponse) { ... }`
3. Register in `services/background/messageHandlers.ts`: `[MESSAGE_NEW_ACTION]: handleNewAction`
4. Background script automatically routes based on message action

**Important**: Always `return true` from `chrome.runtime.onMessage.addListener` for async handlers to prevent "port closed" errors.

### Port-Based Streaming Architecture
**Real-time streaming** (chat, translation) uses Chrome Port connections:
- Side Panel creates port: `chrome.runtime.connect({ name: PORT_STREAM_MESSAGE })`
- Background listens: `port.onMessage.addListener((msg) => { ... })`
- Stream data: `port.postMessage({ delta, done, error })`
- Buffering optimization: Messages batched by `STREAM_FLUSH_THRESHOLD` to reduce UI updates
- Cancellation: AbortController passed through port messages

### State Management Hierarchy
Three-layer state system with different purposes:
1. **Jotai Atoms** (`hooks/global.ts`) - UI reactivity, temporary state
2. **Chrome Storage** - Cross-component sync, user preferences
3. **IndexedDB** (`lib/indexDB.ts`) - Persistent data (threads, messages, memos)

**Key Pattern**: `atomWithStorage(key, initialValue, chromeStorageBackend('local'))` bridges Jotai + Chrome Storage

### Background Service Worker State Caching
**Pattern**: `entrypoints/background/states/models/index.ts` maintains in-memory cache of API keys and model selections, synchronized via `chrome.storage.onChanged` listeners.

The cache is filled asynchronously after every service worker start, so handlers must `await whenBackgroundStateReady()` (`states/ready.ts`) before reading it. The message router and the chat port listener already do this. The router skips the wait for panel-opening messages: `chrome.sidePanel.open()` must be called synchronously within the sender's user gesture, and any `await` before it loses the gesture.

**When adding new LLM providers**:
1. Add cache variable: `let newProviderKey: string | undefined`
2. Add the key to the initial `chrome.storage.local.get([...])` in `modelListeners()`
3. Handle it in the `chrome.storage.onChanged` listener (an emptied key must clear the cache)

### IndexedDB Schema Migration (Dexie)
**Pattern**: `lib/indexDB.ts` uses incremental versioning:
```typescript
this.version(1).stores({ messages: 'id, threadId, createdAt' });
this.version(2).stores({ messages: '...', tokenUsage: 'id, date, model' });
```

**When adding new tables/fields**:
- Call new `version(N)` and list ALL tables (cumulative)
- Only index fields used for filtering/sorting
- Primary key (`id`) automatically indexed

### LLM Provider Factory Pattern
**Location**: `lib/modelRegistry.ts` (pure data, safe for UI/content scripts) + `lib/models.ts` (LangChain factory, background only)

- Settings store stable slot names (`'gpt'`, `'gpt-mini'`, `'gemini-flash'`, ...). `MODELS` maps each slot to the real API model ID, display label, provider, `supportsTemperature`, and `supportsImages`.
- To swap a model, change its `MODELS` entry. Settings and toggle UIs render from `MODEL_OPTIONS`.
- Newer reasoning models reject or ignore non-default `temperature`; set `supportsTemperature: false` and the factory omits it. `supportsImages: false` (text-only models) disables chat image upload and the image context menu items, and `formatImagesForMessage` replaces images in thread history with a text note. `fast: true` (translation) maps to OpenAI `reasoning_effort: 'none'`, Gemini `thinkingLevel: 'minimal'`, Anthropic `effort: 'low'`. Gemma gets `'minimal'` on every Gemini-key call: the Gemini API turns its thinking on, unlike the model's own default and OpenRouter.
- `@langchain/openai` does not recognize gpt-6 as a reasoning model, so OpenAI-specific fields go through `modelKwargs` (`max_completion_tokens`, `reasoning_effort`).
- Read streamed text with `chunk.text` (skips thinking blocks) and aggregate chunks with `concat` before reading `usage_metadata` (providers split usage across chunks).
- Never import `lib/models.ts` from UI or content scripts: it pulls LangChain into the bundle.
- **OpenRouter** is a key type, not a model's provider: its key reaches every slot. Each model goes through its provider's key or OpenRouter, whichever is set (models without a `provider`, such as DeepSeek, are OpenRouter-only); when both are, `STORAGE_CONNECTION_MODE` (`'direct'` | `'openrouter'`, the "Prefer OpenRouter" checkbox) decides. The background resolves this per model with `getConnectionModeFor()`, and `ModelPreset.connectionMode` holds the result. The OpenRouter path is `ChatOpenAI` with its `baseURL` using `MODELS[slot].openrouter.id`; `fastEffort` there comes from each model's `supported_efforts` in OpenRouter's `/api/v1/models`; `'off'` sends `reasoning.enabled: false` for models with a non-thinking mode but no `'none'` effort (DeepSeek: `effort: 'low'` still thinks). `defaultEffort` sends OpenRouter's `default_effort` on regular calls for models that list no `default_enabled`, since their providers disagree on whether to think (DeepSeek V4 Pro). OpenRouter takes the OpenAI `image_url` format for Claude too, and its key is validated with `/api/v1/key` (`/models` is public). UI checks model availability with `useModelOptions()` (`hooks/models.ts`): a cloud model is available through its provider key or an OpenRouter key.
- API keys are opaque: validate against the provider API, never by prefix (Gemini keys changed from `AIza…` to `AQ.…` in 2026 and must be sent in the `x-goog-api-key` header).
- **Local models**: `ChatModel = CloudModel | LocalModelRef`, where a `LocalModelRef` is `local:<model id>`, so chat and translation can pick different local models. `MODELS` covers cloud slots only. The connected server and its chat models are one `LocalServerConfig` in `STORAGE_LOCAL_SERVER` (server kind, base URL, optional key, and per model image/thinking support and context length). `resolveLocalModel(ref, server)` combines them into a `LocalModelConfig`; the background reads it with `getLocalModelFor()`. A ref whose model is no longer on the server is listed as unavailable and fails with a "connect it again" error.
  - Wherever a model may be local, use `modelSupportsImages(model, localServer)` instead of `MODELS[slot]`, and use `useModelOptions()` (`hooks/models.ts`) for pickers. It lists cloud slots with availability, the server's models, and any selected local ref that is gone. Token usage records local calls under the model ID with provider `'local'`.
  - `onInstalled` migrates the development-build `LOCAL_MODEL` + `'local'` slot to `LOCAL_SERVER` + `local:<id>`; `'local'` without a `LOCAL_MODEL` falls back to `gpt` / `gpt-mini`.
  - Ollama goes through `@langchain/ollama` (`ChatOllama`): `numCtx` is the model's maximum capped at 32K (`localContextLength()`) and the same on every request (a different `num_ctx` reloads the model), and `think: false` is sent when the model can think. Other servers go through `ChatOpenAI` with `baseURL` + `/v1` and a placeholder key; thinking can't be turned off there.
  - Ollama drops whatever doesn't fit `num_ctx` without saying so, so for Ollama `fitLocalContext()` (`chatModelHandler.ts`) estimates tokens and cuts the end of the longest human message to fit `numCtx` minus 4096 reply tokens. Hangul/CJK/kana count as 1 token per character (Llama-family tokenizers), other text as characters / 4, and images as 1000. A cut sets `contextTruncated` on the AI message (port message + IndexedDB), and `ChatContainer` shows `chat.contextTruncated` under the reply. Other servers get no fitting or notice, because their loaded context size isn't known.
  - `lib/localServer.ts` (UI side) finds servers at the default ports, tells Ollama apart by `/api/version` (LM Studio answers it with 200 and an error body), and lists chat models. Ollama: `/api/show` capabilities. LM Studio: `/api/v0/models`, where type `vlm` takes images and `embeddings` is skipped. Others: `/v1/models`, images off and embedding models skipped by name. Settings re-probe the saved server on open and save it when it lists models; onboarding's picker sets both chat and translation. Ollama answers POSTs carrying an extension Origin with 403, so it installs a DNR dynamic rule that sets `Origin` to the server's own origin, only for this extension's requests to that exact origin. The rule needs `declarativeNetRequestWithHostAccess` plus host permissions for `localhost`/`127.0.0.1`; the `<all_urls>` content scripts give fetch access but don't count for DNR. Ollama doesn't enforce `minItems`/`maxItems`.
  - Translation with a local model sends 4 snippets per request (at 8, qwen3.5:9b put translations in the wrong slots), retries a broken or miscounted request one snippet at a time, and streams so the first token arrives before MV3's 30-second fetch limit. Chat drops the greeting AI turn (Gemma templates in LM Studio reject an assistant turn first) and a leading `<think></think>` block that qwen3.5 emits as text even with thinking off.

**When adding new LLM provider**:
1. Extend `ModelProvider` and add entries to `MODELS` in `lib/modelRegistry.ts`
2. Create `createNewProvider()` in `lib/models.ts` (LangChain wrapper)
3. Add a branch to `getModelInstance()`
4. Add key validation in `lib/validateApiKey.ts`

### ActionType-Based Feature Routing
**Pattern**: `hooks/global.ts` defines `ActionType` enum that determines:
- Temperature settings (e.g., `askForSummary`: 0.3, `chat`: 0.7)
- System prompts (`lib/prompts.ts`)
- Side Panel routes
- Streaming behavior

**When adding new feature**:
1. Add to `ActionType` union type
2. Create route in `sidepanel/routes.tsx`
3. Define prompt in `lib/prompts.ts`
4. Handle in `services/background/chatModelHandler.ts`

### Live Query Pattern for Real-Time UI
**Pattern**: `hooks/chat.ts` uses Dexie's `liveQuery` + Jotai's `atomWithObservable` (e.g. `initialMessagesForAllThreadsAtom`, `createThreadMessageCountAtom`):
```typescript
export const initialMessagesForAllThreadsAtom = atomWithObservable(() =>
  liveQuery(() => getInitialMessagesForAllThreads())
);
```

**Purpose**: Automatically re-render components when IndexedDB data changes (no manual refresh needed)

### Context Menu Integration
**Pattern**: `entrypoints/background/contextMenu.ts` creates menus → sends messages to content scripts on click:
```typescript
chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.tabs.sendMessage(tab.id, { action: MESSAGE_CONTEXT_MENU_* });
});
```

Content scripts then communicate with Side Panel to perform actions.

### Content Script UI Isolation (Shadow DOM)
In-page UI (toggle, YouTube caption toggle, caption overlay) renders inside shadow roots so CSS doesn't leak in either direction. CSS injected into a page once took over the page's cascade layer order (a page's `@layer reset` ended up above its own utilities), and page CSS restyled the toggle.
- UI entrypoints use `cssInjectionMode: 'ui'` + `createShadowRootUi`. The only CSS injected into pages is `public/fonts/fonts.css` (declared in `wxt.config.ts`), because shadow roots ignore `@font-face`. They ignore `@property` too, so WXT moves Tailwind's `@property` rules into a small `<style>` in the page head.
- antd: `StyleProvider container={shadowRoot} cache={createCache()}`, plus `ConfigProvider getPopupContainer` and `createPortal` targets inside the shadow root. `@ant-design/cssinjs` must resolve to the version antd itself uses, or `StyleProvider` silently does nothing.
- Listeners on `document` see the shadow host as the event target: read `e.composedPath()[0]`, and hit-test with `shadowRoot.elementFromPoint`.
- Elements placed in the page's own DOM (e.g. the YouTube player-bar holder) can't use `sz:` classes; style them inline.
- `rem` still follows the page's root font size (YouTube's is 10px, and the YouTube UI is tuned to it), so prefer px values in new content-script UI.

## Storage Architecture

This project uses **three distinct storage layers** with different purposes:

### 1. Chrome Storage (chrome.storage.local)
**Purpose**: Cross-component synchronization of settings, API keys, and user preferences
**Location**: [src/lib/storageBackend.ts](src/lib/storageBackend.ts)

#### chromeStorageBackend Implementation
```typescript
// Unified interface for Jotai atoms
export const chromeStorageBackend = <T>(area: 'local' | 'sync' | 'session' = 'local') => ({
  async getItem(key: string, initialValue: T): Promise<T>
  async setItem(key: string, value: T): Promise<void>
  async removeItem(key: string): Promise<void>
  subscribe(key: string, callback: (val: T) => void, initialValue: T)
})
```

**Key Pattern**: All storage keys defined in [config/constants.ts](src/config/constants.ts) with `STORAGE_*` prefix:

| Category | Keys | Purpose |
|----------|------|---------|
| **API Keys** | `STORAGE_OPENAI_KEY`, `STORAGE_GEMINI_KEY`, `STORAGE_ANTHROPIC_KEY`, `STORAGE_OPENROUTER_KEY` | LLM provider credentials |
| **API Validation** | `STORAGE_OPENAI_VALIDATED`, `STORAGE_GEMINI_VALIDATED`, `STORAGE_ANTHROPIC_VALIDATED`, `STORAGE_OPENROUTER_VALIDATED` | API key validation status |
| **Model Selection** | `STORAGE_CHAT_MODEL`, `STORAGE_TRANSLATE_MODEL` | Selected LLM models |
| **Connection** | `STORAGE_CONNECTION_MODE` | Preference when a model's provider key and the OpenRouter key are both set: `'direct'` or `'openrouter'` |
| **Local model** | `STORAGE_LOCAL_SERVER` | `LocalServerConfig` (the connected server and its chat models) that `local:<id>` refs resolve against, or null |
| **Languages** | `STORAGE_LANGUAGE`, `STORAGE_TRANSLATE_TARGET_LANGUAGE` | UI language and translation target |
| **Global State** | `STORAGE_GLOBAL_STATE` | Side panel current state (actionType, threadId, etc.) |
| **UI Settings** | `STORAGE_THEME`, `STORAGE_SHOW_TOGGLE`, `STORAGE_TOGGLE_Y_POSITION`, `STORAGE_TOGGLE_HIDDEN_SITE_LIST` | Theme, toggle button visibility/position, hidden sites |
| **YouTube** | `STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE`, `STORAGE_SHOW_YOUTUBE_BILINGUAL_CAPTION`, `STORAGE_USE_YOUTUBE_KEYBOARD_NAVIGATE`, `STORAGE_YOUTUBE_CAPTION_SIZE_RATIO` | YouTube-specific settings |
| **User Context** | `STORAGE_USER_MEMORY` | User information for LLM context |

#### Direct Chrome Storage Access Pattern
```typescript
// Utility functions (lib/storageBackend.ts:33-58)
export async function readStorage<T>(key: string, area: 'local' | 'sync' | 'session' = 'local'): Promise<T | undefined>
export async function setStorage<T>(key: string, value: T, area: 'local' | 'sync' | 'session' = 'local'): Promise<boolean>

// Usage example
const apiKey = await readStorage<string>(STORAGE_OPENAI_KEY);
await setStorage(STORAGE_OPENAI_KEY, 'sk-...');
```

#### Background State Caching Pattern
**Location**: [entrypoints/background/states/models/index.ts](src/entrypoints/background/states/models/index.ts)

Background service worker maintains in-memory cache of frequently accessed values:
```typescript
// Cache variables (model values are registry slot names, not API model IDs)
let currentChatModel: ChatModel = 'gpt';
let currentTranslateModel: TranslateModel = 'gpt-mini';
let openaiKey: string | undefined;
let geminiKey: string | undefined;
let anthropicKey: string | undefined;
let openrouterKey: string | undefined;
let connectionMode: ConnectionMode = 'direct';

// Initial load is a promise; handlers await whenBackgroundStateReady() before reading
modelStateReady = chrome.storage.local.get([STORAGE_CHAT_MODEL, ...]).then((res) => { ... });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.CHAT_MODEL) {
    const newChatModel = changes.CHAT_MODEL.newValue;
    if (isChatModel(newChatModel)) changeChatModel(newChatModel);
  }
});
```

**When to add new cached values**:
1. Add cache variable
2. Add getter function: `export const getCurrentXXX = () => xxx;`
3. Add setter function: `export const changeXXX = (val) => { xxx = val; };`
4. Add initial load in `modelListeners()`: `chrome.storage.local.get(...)`
5. Add listener in `modelListeners()`: handle `changes.XXX`

---

### 2. Jotai Atoms with Chrome Storage Backend
**Purpose**: Reactive UI state management with persistence
**Pattern**: `atomWithStorage(key, initialValue, chromeStorageBackend('local'), options)`

#### All atomWithStorage Definitions (23 atoms total)

| Atom | Type | Storage Key | Default | getOnInit | Purpose | Location |
|------|------|-------------|---------|-----------|---------|----------|
| **Global State** |
| `globalStateAtom` | `GlobalState` | `STORAGE_GLOBAL_STATE` | `{actionType: 'chat'}` | false | Side panel state (actionType, threadId, summaryText, imageBase64, etc.) | [hooks/global.ts:32](src/hooks/global.ts#L32) |
| **API Keys** |
| `openAIKeyAtom` | `string` | `STORAGE_OPENAI_KEY` | `''` | true | OpenAI API key | [hooks/settings.ts:16](src/hooks/settings.ts#L16) |
| `geminiKeyAtom` | `string` | `STORAGE_GEMINI_KEY` | `''` | true | Google Gemini API key | [hooks/settings.ts:23](src/hooks/settings.ts#L23) |
| `anthropicKeyAtom` | `string` | `STORAGE_ANTHROPIC_KEY` | `''` | true | Anthropic Claude API key | [hooks/settings.ts:30](src/hooks/settings.ts#L30) |
| `openRouterKeyAtom` | `string` | `STORAGE_OPENROUTER_KEY` | `''` | true | OpenRouter API key | [hooks/settings.ts:37](src/hooks/settings.ts#L37) |
| **Models** |
| `chatModelAtom` | `ChatModel` | `STORAGE_CHAT_MODEL` | `'gpt'` | true | Chat LLM model selection | [hooks/models.ts:43](src/hooks/models.ts#L43) |
| `translateModelAtom` | `TranslateModel` | `STORAGE_TRANSLATE_MODEL` | `'gpt-mini'` | true | Translation LLM model | [hooks/models.ts:49](src/hooks/models.ts#L49) |
| `openAIValidatedAtom` | `boolean \| undefined` | `STORAGE_OPENAI_VALIDATED` | `undefined` | true | OpenAI key validation status | [hooks/models.ts:56](src/hooks/models.ts#L56) |
| `geminiValidatedAtom` | `boolean \| undefined` | `STORAGE_GEMINI_VALIDATED` | `undefined` | true | Gemini key validation status | [hooks/models.ts:62](src/hooks/models.ts#L62) |
| `anthropicValidatedAtom` | `boolean \| undefined` | `STORAGE_ANTHROPIC_VALIDATED` | `undefined` | true | Anthropic key validation status | [hooks/models.ts:69](src/hooks/models.ts#L69) |
| `openRouterValidatedAtom` | `boolean \| undefined` | `STORAGE_OPENROUTER_VALIDATED` | `undefined` | true | OpenRouter key validation status | [hooks/models.ts:76](src/hooks/models.ts#L76) |
| `connectionModeAtom` | `ConnectionMode` | `STORAGE_CONNECTION_MODE` | `'direct'` | true Prefer OpenRouter over provider keys when both are set | [hooks/models.ts:83](src/hooks/models.ts#L83) |
| `localServerAtom` | `LocalServerConfig \| null` | `STORAGE_LOCAL_SERVER` | `null` | true | The connected local server and its chat models | [hooks/models.ts](src/hooks/models.ts) |
| **Languages** |
| `languageAtom` | `Language` | `STORAGE_LANGUAGE` | `fallbackLanguage` | true | App UI language (23 languages) | [hooks/language.ts:38](src/hooks/language.ts#L38) |
| `targetLanguageAtom` | `Language` | `STORAGE_TRANSLATE_TARGET_LANGUAGE` | `fallbackLanguage` | true | Translation target language | [hooks/language.ts:45](src/hooks/language.ts#L45) |
| **Layout/UI** |
| `themeAtom` | `'light' \| 'dark'` | `STORAGE_THEME` | `'light'` | false | Theme mode | [hooks/layout.ts:26](src/hooks/layout.ts#L26) |
| `showToggleAtom` | `boolean` | `STORAGE_SHOW_TOGGLE` | `true` | true | Show floating toggle button | [hooks/layout.ts:33](src/hooks/layout.ts#L33) |
| `toggleYPositionAtom` | `number` | `STORAGE_TOGGLE_Y_POSITION` | `-18` | true | Toggle button Y position | [hooks/layout.ts:40](src/hooks/layout.ts#L40) |
| `toggleHiddenSiteListAtom` | `string[]` | `STORAGE_TOGGLE_HIDDEN_SITE_LIST` | `[]` | true | Sites where toggle is hidden | [hooks/layout.ts:47](src/hooks/layout.ts#L47) |
| `youtubeShowCaptionToggleAtom` | `boolean` | `STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE` | `true` | true | Show YouTube caption toggle | [hooks/layout.ts:54](src/hooks/layout.ts#L54) |
| `youtubeShowBilingualCaptionAtom` | `boolean` | `STORAGE_SHOW_YOUTUBE_BILINGUAL_CAPTION` | `false` | true | Show bilingual captions | [hooks/layout.ts:61](src/hooks/layout.ts#L61) |
| `useYoutubeKeyboardNavigateAtom` | `boolean` | `STORAGE_USE_YOUTUBE_KEYBOARD_NAVIGATE` | `true` | true | Enable YouTube keyboard shortcuts | [hooks/layout.ts:68](src/hooks/layout.ts#L68) |
| `youtubeCaptionSizeRatioAtom` | `number` | `STORAGE_YOUTUBE_CAPTION_SIZE_RATIO` | `1.0` | true | Caption size multiplier | [hooks/layout.ts:75](src/hooks/layout.ts#L75) |
| **User Context** |
| `userMemoryAtom` | `UserMemory` | `STORAGE_USER_MEMORY` | `{text: ''}` | true | User information for LLM prompts | [hooks/userMemory.ts:17](src/hooks/userMemory.ts#L17) |

#### getOnInit Option Pattern
- **`getOnInit: true` (21 atoms)**: Load from storage immediately on initialization
  - Use for: Settings, API keys, user preferences that must be correct from startup
- **`getOnInit: false` (2 atoms)**: Manual hydration via `useHydrateAtoms` hook
  - Use for: Large objects or state that can tolerate brief incorrect values during initial render
  - Examples: `globalStateAtom` (manual hydration in SidePanelProvider), `themeAtom` (minimize flash)

#### Safe Atom Pattern (for undefined handling)
```typescript
// Storage atom (can be undefined) - hooks/models.ts:56
export const openAIValidatedAtom = atomWithStorage<boolean | undefined>(
  STORAGE_OPENAI_VALIDATED,
  undefined,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

// Safe derived atom (fallback to API key existence check) - hooks/models.ts:101
// The storage atoms hold a promise until chrome.storage first resolves; validatedOrHasKey unwraps
// it before falling back, so the result is a promise only while storage is still loading.
export const openAIValidatedSafeAtom = atom(
  (get) => validatedOrHasKey(get(openAIValidatedAtom), get(openAIKeyAtom)),
  (_, set, value: boolean) => set(openAIValidatedAtom, value)
);
```

#### Custom Hook Patterns
```typescript
// Full access (read + write)
export const useOpenAIKey = () => useAtom(openAIKeyAtom);

// Read-only access
export const useOpenAIKeyValue = () => useAtomValue(openAIKeyAtom);

// Write-only access
export const useSetOpenAIKey = () => useSetAtom(openAIKeyAtom);
```

**When adding new atomWithStorage**:
1. Define storage key in [config/constants.ts](src/config/constants.ts): `export const STORAGE_NEW_KEY = 'NEW_KEY'`
2. Create atom in appropriate hooks file: `hooks/{feature}.ts`
3. Choose `getOnInit` based on hydration strategy (usually `true`)
4. Create custom hooks for clean API
5. Add to background cache if needed frequently

---

### 3. IndexedDB (Dexie)
**Purpose**: Large-scale persistent data (threads, messages, memos, token usage)
**Location**: [src/lib/indexDB.ts](src/lib/indexDB.ts)

#### Database Schema (Version 5 - Current)
```typescript
// lib/indexDB.ts:48-86
class DB extends Dexie {
  messages!: Table<Message, string>;
  threads!: Table<ThreadMeta, string>;
  tokenUsage!: Table<TokenUsage, string>;
  memos!: Table<Memo, string>;

  constructor() {
    super('ShizueDB');
    this.version(5).stores({
      messages: 'id, threadId, createdAt',
      threads: 'id, updatedAt',
      tokenUsage: 'id, date, model, provider, createdAt',
      memos: 'id, folder, isPinned, createdAt, updatedAt',
    });
  }
}
```

#### Table Structures

**Messages** ([Message](src/lib/indexDB.ts#L4) interface):
- `id`: UUID primary key
- `threadId`: Foreign key to threads
- `role`: 'human' | 'system' | 'ai'
- `actionType`: ActionType (chat, askForSummary, describeImage, etc.)
- `content`: Message text
- `images`: Optional base64 image array
- `createdAt`: Timestamp
- `done`, `onInterrupt`, `stopped`: Streaming state flags
- `errorMessage`: Provider error text shown when a stream fails (optional)
- `contextTruncated`: A long message was cut to fit a local model's context before this reply (optional)

**Threads** ([ThreadMeta](src/lib/indexDB.ts#L20) interface):
- `id`: UUID primary key
- `title`: Thread display name
- `updatedAt`: Last activity timestamp (sorted index)

**TokenUsage** ([TokenUsage](src/lib/indexDB.ts#L26) interface):
- `id`: UUID primary key
- `date`: 'YYYY-MM-DD' format (indexed for date range queries)
- `model`: Model name string
- `provider`: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'local'
- `inputTokens`, `outputTokens`, `totalTokens`: Usage metrics
- `requestCount`: Number of API calls
- `createdAt`: Timestamp

**Memos** ([Memo](src/lib/indexDB.ts#L38) interface):
- `id`: UUID primary key
- `title`: Memo title
- `content`: Memo body (markdown supported)
- `folder`: Optional folder name
- `isPinned`: Pin to top flag
- `createdAt`, `updatedAt`: Timestamps

#### CRUD Function Library

**Threads**:
```typescript
export const createThread = async (title = 'NEW_CHAT') => string      // lib/indexDB.ts:106 - Returns new thread ID
export const listThreads = () => Promise<ThreadMeta[]>                 // lib/indexDB.ts:102 - Sorted by updatedAt desc
export const touchThread = async (id: string) => void                  // lib/indexDB.ts:103 - Update timestamp
export const deleteThread = async (id: string) => void                 // lib/indexDB.ts:111 - Cascade delete messages
export const getInitialMessagesForAllThreads = async () => Promise<ThreadWithInitialMessages[]>  // lib/indexDB.ts:119
```

**Messages**:
```typescript
export const addMessage = (m: Message) => Promise<string>              // lib/indexDB.ts:99
export const loadThread = (id: string) => Promise<Message[]>           // lib/indexDB.ts:100 - Sorted by createdAt
export const getLatestMessageForThread = async (threadId: string) => Promise<Message | undefined>  // lib/indexDB.ts:115
```

**Token Usage**:
```typescript
export const recordTokenUsage = async (usage: Omit<TokenUsage, 'id'>) => void  // lib/indexDB.ts:144
export const getTokenUsageByDate = async (date: string) => Promise<TokenUsage[]>  // lib/indexDB.ts:156
export const getTokenUsageByDateRange = async (startDate: string, endDate: string) => Promise<TokenUsage[]>  // lib/indexDB.ts:149
export const getTotalTokenUsage = async () => Promise<{totalInputTokens, totalOutputTokens, totalTokens, totalRequests}>  // lib/indexDB.ts:160
```

**Memos**:
```typescript
export const createMemo = async (title: string, content?: string, folder?: string) => string  // lib/indexDB.ts:222
export const addMemo = (memo: Memo) => Promise<string>                 // lib/indexDB.ts:179
export const updateMemo = async (id: string, updates: Partial<Memo>) => void  // lib/indexDB.ts:181 - Auto-updates updatedAt
export const deleteMemo = async (id: string) => void                   // lib/indexDB.ts:185
export const getMemo = (id: string) => Promise<Memo | undefined>       // lib/indexDB.ts:189
export const listMemos = async (folder?: string) => Promise<Memo[]>    // lib/indexDB.ts:191 - Sorted by updatedAt desc
export const searchMemos = async (searchTerm: string) => Promise<Memo[]>  // lib/indexDB.ts:202 - Case-insensitive title + content search
export const toggleMemoPinned = async (id: string) => void             // lib/indexDB.ts:215
```

#### Live Query Pattern (Real-time UI Updates)
**Pattern**: `hooks/chat.ts` uses Dexie's `liveQuery` + Jotai's `atomWithObservable`:
```typescript
import { liveQuery } from 'dexie';
import { atomWithObservable } from 'jotai/utils';

// Automatically re-renders components when IndexedDB data changes. null (not []) until the first
// query returns, so a list doesn't flash its empty message while loading.
export const initialMessagesForAllThreadsAtom = atomWithObservable(
  () => liveQuery(() => getInitialMessagesForAllThreads()),
  { initialValue: null }
);

// Per-thread message count (used to detect new messages)
export const createThreadMessageCountAtom = (threadId) =>
  atomWithObservable(() => liveQuery(() => db.messages.where('threadId').equals(threadId).count()));
```

The open thread's messages themselves are loaded through the background (`MESSAGE_LOAD_THREAD`), not a live query.

**Purpose**: No manual refresh needed - UI reacts to direct database operations like `addMessage()`, `createThread()`, etc.

#### Schema Migration Pattern
**Cumulative Version System** - each version must list ALL tables:
```typescript
// Version 1: Initial schema (lib/indexDB.ts:56-60)
this.version(1).stores({
  messages: 'id, threadId, createdAt',
  threads: 'id, updatedAt',
});

// Version 2: Add tokenUsage table (must still list old tables!) (lib/indexDB.ts:61-66)
this.version(2).stores({
  messages: 'id, threadId, createdAt',
  threads: 'id, updatedAt',
  tokenUsage: 'id, date, model, provider, createdAt',
});

// Version 5: Add memos table (lib/indexDB.ts:79-85)
this.version(5).stores({
  messages: 'id, threadId, createdAt',
  threads: 'id, updatedAt',
  tokenUsage: 'id, date, model, provider, createdAt',
  memos: 'id, folder, isPinned, createdAt, updatedAt',
});
```

**When adding new table/indexes**:
1. Increment version number
2. List ALL existing tables (copy previous version)
3. Add new table or modify indexes
4. Only index fields used for filtering/sorting (primary key auto-indexed)
5. Test migration by opening extension in browser with old database

---

### Storage Layer Selection Guide

| Use Case | Storage Layer | Reason |
|----------|--------------|---------|
| Settings, API keys, preferences | Chrome Storage + Jotai | Cross-component sync, reactive UI |
| Frequently accessed values in background | In-memory cache (background/states/models) | Performance (avoid repeated async reads) |
| Chat threads, messages | IndexedDB | Large data, complex queries, liveQuery support |
| Temporary UI state (doesn't need persistence) | Plain Jotai atoms | No storage overhead |
| Search/filter operations | IndexedDB | Compound indexes, efficient queries |
| Large media (images > 1MB) | IndexedDB or external storage | Chrome Storage quota limits |

**Key Trade-offs**:
- **Chrome Storage**: 10MB quota, simple key-value, automatic sync across extension components
- **IndexedDB**: Unlimited quota (user approval for > 50MB), complex queries, manual sync management
- **In-memory cache**: Fastest access, lost on service worker restart, needs explicit sync

---

## Common Development Workflows

### Adding a New Content Script
1. Create `src/entrypoints/name.content.ts`
2. Export `defineContentScript({ matches: ['<all_urls>'], ... })`
3. WXT auto-registers in manifest
4. UI: mount it with `createShadowRootUi` and `cssInjectionMode: 'ui'` (see Content Script UI Isolation)
5. Test: Reload extension → check chrome://extensions → Inspect content script

### Adding a New Side Panel Route
1. Define route in `sidepanel/routes.tsx`: `{ path: '/new-feature', element: <NewFeature /> }`
2. Add navigation: `navigate('/new-feature')` or `<Link to="/new-feature" />`
3. Update `ActionType` if feature needs LLM integration
4. Test: Open side panel → navigate to route

### Adding Chrome Storage Values
1. Define key in `config/constants.ts`: `export const STORAGE_NEW_KEY = 'new-key'`
2. Add type to storage interfaces if using TypeScript
3. Add listener in background script if background needs to react
4. Use `chrome.storage.local.get([STORAGE_NEW_KEY])` or Jotai's `atomWithStorage`

### Debugging Tips
- **Background errors**: chrome://extensions → Service Worker → Inspect
- **Port closed errors**: Check `return true` in message listeners
- **State not syncing**: Verify Chrome Storage listeners are registered
- **IndexedDB issues**: Open DevTools → Application → IndexedDB → ShizueDB
- **Streaming stops**: Check AbortController not prematurely triggered