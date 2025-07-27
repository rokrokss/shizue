# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shizue is a Chrome extension that integrates Large Language Models (LLMs) into web browsing. Built with WXT (Web Extension Toolkit), React, TypeScript, and Tailwind CSS.

## Development Commands

### Local Development
```bash
pnpm dev              # Development mode with hot-reloading
```

### Building
```bash
pnpm build            # Production build
pnpm zip              # Create distribution ZIP
```

### Code Quality
```bash
pnpm compile          # TypeScript type checking
```

### Installation for Testing
1. Build the extension: `pnpm build`
2. Go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select `dist/chrome-mv3/`

## Architecture

### Directory Structure
- **src/entrypoints/** - Extension entry points
  - `background/` - Service worker (background script) handling core extension logic
  - `sidepanel/` - React app for the sidebar UI
  - `*.content/` - Content scripts injected into web pages
- **src/components/** - React components organized by feature
- **src/services/** - Business logic and API integrations
- **src/hooks/** - Custom React hooks for state management
- **src/lib/** - Utility functions and helpers
- **src/providers/** - React context providers
- **src/locales/** - i18n translation files

### Key Technologies
- **WXT** - Modern web extension framework
- **React 19** with TypeScript
- **Tailwind CSS v4** - Styling
- **Ant Design (antd)** - UI component library
- **LangChain** - LLM integration (OpenAI, Anthropic, Google)
- **Jotai** - State management
- **Dexie** - IndexedDB wrapper for local storage

### Extension Architecture
1. **Background Script** (`src/entrypoints/background/index.ts`) - Manages:
   - Message passing between components
   - Context menu creation
   - State synchronization
   - API key validation

2. **Side Panel** - Main UI for chat, PDF translation, and settings
   - Routes: `/chat`, `/shizue-pdf`, `/shizue-memo`, `/onboarding`
   - Uses React Router for navigation

3. **Content Scripts**:
   - `toggle.content` - Floating toggle button on web pages
   - `youtube-caption-toggle.content` - YouTube caption translation

4. **Message Passing** - Chrome runtime messages coordinate between:
   - Background script (service worker)
   - Side panel
   - Content scripts
   - Popup/toggle components

### State Management
- **Jotai** atoms for local state
- **Chrome Storage API** for persistent settings
- **IndexedDB** (via Dexie) for chat history and large data

### LLM Integration
- Supports OpenAI, Anthropic Claude, and Google Gemini
- API keys stored in Chrome storage
- LangChain for unified LLM interface
- Token usage tracking in `src/lib/tokenUsageTracker.ts`

### Key Features Implementation
- **Bilingual Translation**: `src/components/Translation/ShizueTranslationOverlay.ts`
- **PDF Translation**: `src/components/Pdf/` with pdf-lib
- **YouTube Captions**: `src/components/Youtube/` with custom caption injection
- **Chat Interface**: `src/components/Chat/` with streaming responses

### Build Configuration
- **Vite** for bundling with Terser minification
- **PostCSS** with Tailwind CSS
- **TypeScript** with strict checking
- **WXT** manages manifest generation and browser compatibility

## Message Communication

### Message Actions (from `src/config/constants.ts`)
Key message types for inter-component communication:
- `MESSAGE_SET_PANEL_OPEN_OR_NOT` - Toggle side panel visibility
- `MESSAGE_OPEN_PANEL` - Open the side panel
- `MESSAGE_LOAD_THREAD` - Load chat thread from IndexedDB
- `MESSAGE_TRANSLATE_HTML_TEXT_BATCH` - Batch translate HTML text
- `MESSAGE_TRANSLATE_YOUTUBE_CAPTION` - Translate YouTube captions
- `MESSAGE_CONTEXT_MENU_*` - Context menu actions (translate, summarize, etc.)

### Storage Keys
Chrome storage keys for persistent data:
- `STORAGE_*_KEY` - API keys (OpenAI, Gemini, Anthropic)
- `STORAGE_*_MODEL` - Selected models for chat/translation
- `STORAGE_LANGUAGE` - UI language
- `STORAGE_TRANSLATE_TARGET_LANGUAGE` - Translation target language
- `STORAGE_USER_MEMORY` - User preferences/memory
- `STORAGE_THEME` - Light/dark theme

## Supported Models

### Chat Models
- OpenAI: `gpt-4.1`, `gpt-4.1-mini`
- Google: `gemini-2.5-flash`, `gemini-2.5-flash-lite-preview-06-17`
- Anthropic: `claude-sonnet-4-20250514`, `claude-3-5-haiku-20241022`

### Model Integration
- Models are created via LangChain wrappers in `src/lib/models.ts`
- API key validation in `src/lib/validateApiKey.ts`
- Token tracking in `src/lib/tokenUsageTracker.ts`

## Testing & Debugging

### Chrome Extension Development
1. Load unpacked extension from `dist/chrome-mv3/`
2. Use Chrome DevTools for debugging:
   - Background script: chrome://extensions → Service Worker
   - Side panel: Right-click panel → Inspect
   - Content scripts: Regular page DevTools

### Keyboard Shortcuts
- Default toggle: `Ctrl+Shift+E` (Windows/Linux) or `Cmd+Shift+E` (Mac)

## Important Implementation Details

### Content Security Policy
- Configured in `wxt.config.ts` to allow WASM for PDF processing
- `script-src 'self' 'wasm-unsafe-eval'`

### Internationalization
- 24 supported languages in `src/locales/`
- Uses `@wxt-dev/i18n` module
- Default locale: English

### PDF Translation
- Uses `pdf-lib` for PDF manipulation
- Preserves original layout and formatting
- Accessible via `/shizue-pdf` route

### YouTube Caption Translation
- Custom caption injection system
- Real-time translation with caching
- Keyboard navigation support option

### Performance Considerations
- Bundle visualization available at `dist/stats.html` after build
- Tree-shaking enabled with Rollup
- Minification with Terser
- No source maps in production builds