# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shizue is a Chrome extension that integrates Large Language Models (LLMs) into web browsing. Free, open-source alternative to commercial services like Sider, enabling users to use their own API keys for OpenAI, Anthropic Claude, and Google Gemini.

## Development Commands

```bash
pnpm dev              # Development mode with hot-reloading
pnpm build            # Production build
pnpm zip              # Create distribution ZIP
pnpm compile          # TypeScript type checking
```

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
│ • API Management    │ • PDF Translator  │ • YouTube Captions│
│ • Context Menus     │ • Memo/Notes      │ • Page Overlay    │
│ • State Sync        │ • Settings        │ • Translation UI  │
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
- Routes: `/` (chat), `/shizue-pdf`, `/shizue-memo`, `/onboarding`
- Streaming chat with thread management
- PDF translation preserving layout
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
- `services/chatService.ts` - LLM streaming, thread management
- `services/translationService.ts` - Batch translation, format preservation
- `services/background/messageHandlers.ts` - Central message processing
- `services/background/chatModelHandler.ts` - Model creation, streaming

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
STORAGE_*_KEY                    // API keys (OpenAI, Gemini, Anthropic)
STORAGE_*_MODEL                  // Selected models
STORAGE_*_VALIDATED              // API key validation status
STORAGE_USER_MEMORY              // User context for AI
STORAGE_PDF_TRANSLATE_TASK_INFO  // PDF translation state
```

## Core Features

### 1. AI Chat with Streaming
- **Models**: GPT-4.1, Gemini 2.5 Flash, Claude Sonnet 4
- **Streaming**: Via port connections with background script
- **Thread Management**: IndexedDB storage with Dexie

### 2. Bilingual Translation
- **Overlay**: Side-by-side translation preserving formatting
- **Batch Processing**: Efficient DOM manipulation
- **Context Menu**: Right-click to translate any page

### 3. PDF Translation
- **Library**: pdf-lib for structure preservation
- **WASM Support**: Enabled in CSP for performance
- **Route**: `/shizue-pdf` in side panel

### 4. YouTube Caption Translation
- **Real-time**: Translates as captions appear
- **Caching**: Reduces API calls for repeated content
- **Keyboard Navigation**: Optional YouTube shortcuts

### 5. Memo System
- **Features**: Auto-save, pinning, search
- **Storage**: IndexedDB with sync to Chrome storage
- **Route**: `/shizue-memo` in side panel

### 6. Context Menu Actions
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
  extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
}
```

### Internationalization
- **Languages**: 23 supported (ar, bn, de, en, es, fr, ja, ko, zh_CN, etc.)
- **Module**: `@wxt-dev/i18n` with dynamic switching
- **Files**: `src/locales/*.json`