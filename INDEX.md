# Shizue Chrome Extension - Project Documentation Index

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Core Features](#core-features)
4. [Directory Structure](#directory-structure)
5. [Key Components](#key-components)
6. [Services & APIs](#services--apis)
7. [Development Guide](#development-guide)
8. [Configuration](#configuration)
9. [Internationalization](#internationalization)
10. [State Management](#state-management)

## 🎯 Project Overview

Shizue is a Chrome extension that integrates Large Language Models (LLMs) into web browsing, providing AI-powered features like translation, summarization, and chat capabilities.

### Tech Stack
- **Framework**: WXT (Web Extension Toolkit)
- **Frontend**: React 19, TypeScript
- **Styling**: Tailwind CSS v4, Ant Design
- **LLM Integration**: LangChain
- **State Management**: Jotai
- **Storage**: IndexedDB (Dexie), Chrome Storage API
- **Build Tool**: Vite

### Supported AI Models
- **OpenAI**: GPT-6 Sol, GPT-6 Luna
- **Google**: Gemini 3.8 Flash, Gemini 3.5 Flash-Lite
- **Anthropic**: Claude Sonnet 5, Claude Haiku 4.5
- **OpenRouter**: all of the above with a single API key

## 🏗️ Architecture

### Extension Components

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

### Communication Flow
- **Chrome Runtime Messages**: Coordinate between background, sidepanel, and content scripts
- **Port Connections**: Stream data for real-time features
- **Storage Events**: Sync settings and state across components

## 🌟 Core Features

### 1. AI Chat Sidebar
- **Location**: `src/components/Chat/`
- **Features**: Streaming responses, thread management, token tracking
- **Entry Point**: `/chat` route in sidepanel

### 2. Bilingual Translation
- **Component**: `src/components/Translation/ShizueTranslationOverlay.ts`
- **Features**: Side-by-side translation, preserves formatting
- **Activation**: Toggle button or context menu

### 3. YouTube Caption Translation
- **Component**: `src/components/Youtube/`
- **Features**: Real-time translation, keyboard navigation support
- **Content Script**: `youtube-caption-toggle.content`

### 4. Memo/Note System
- **Component**: `src/components/Memo/`
- **Storage**: IndexedDB via Dexie
- **Features**: Auto-save, pinning, search
- **Route**: `/shizue-memo`

### 5. Context Menu Actions
- **File**: `src/entrypoints/background/contextMenu.ts`
- **Actions**:
  - Translate page
  - Summarize page
  - Describe image
  - Extract text from image (OCR)

## 📁 Directory Structure

```
src/
├── components/          # React components
│   ├── Chat/           # Chat interface components
│   ├── Character/      # Animated characters/mascots
│   ├── Memo/          # Note-taking components
│   ├── Modal/         # Modal dialogs
│   ├── Onboarding/    # First-time user flow
│   ├── Setting/       # Settings interface
│   ├── Toggle/        # Floating toggle button
│   ├── Translation/   # Translation overlay
│   └── Youtube/       # YouTube caption components
├── config/            # Configuration constants
├── entrypoints/       # Extension entry points
│   ├── background/    # Service worker
│   ├── sidepanel/     # Side panel app
│   └── *.content/     # Content scripts
├── hooks/             # React hooks
├── lib/               # Utility functions
├── locales/           # i18n translations (23 languages)
├── providers/         # React context providers
└── services/          # Business logic
```

## 🧩 Key Components

### Background Service Worker
**File**: `src/entrypoints/background/index.ts`

**Responsibilities**:
- Message routing between extension components
- API key validation
- Context menu management
- State synchronization
- Side panel lifecycle management

### Side Panel Application
**Entry**: `src/entrypoints/sidepanel/main.tsx`

**Routes**:
- `/` - Redirects to `/chat`
- `/chat` - Chat interface
- `/shizue-memo` - Note-taking
- `/onboarding` - First-time setup

### Content Scripts

#### Toggle Button
**File**: `src/entrypoints/toggle.content/index.tsx`
- Floating button on web pages
- Opens side panel or shows overlay menu

#### YouTube Caption Toggle
**File**: `src/entrypoints/youtube-caption-toggle.content/index.tsx`
- Detects YouTube videos
- Injects translation controls
- Manages caption overlay

## 🔌 Services & APIs

### Chat Streaming
**File**: `src/services/background/chatModelHandler.ts`
- Streams LLM responses to the side panel over a port
- Records token usage per model

**Models**: `src/lib/modelRegistry.ts` (slot → model ID/label/capabilities) and `src/lib/models.ts` (LangChain factory)

### Translation Service
**File**: `src/services/translationService.ts`
- Batch translation processing
- Language detection
- Format preservation

### Panel Service
**File**: `src/services/panelService.ts`
- Side panel state management
- Communication with background script

### Usage Service
**File**: `src/services/usageService.ts`
- Token tracking
- Usage statistics
- Cost estimation

## 💻 Development Guide

### Prerequisites
- Node.js 18+
- pnpm package manager
- Chrome browser

### Setup
```bash
# Install dependencies
pnpm install

# Development mode
pnpm dev

# Production build
pnpm build

# Create distribution ZIP
pnpm zip
```

### Type Checking
```bash
pnpm compile
```

### Loading Extension
1. Build: `pnpm build`
2. Open: `chrome://extensions`
3. Enable: Developer mode
4. Load: `dist/chrome-mv3/`

## ⚙️ Configuration

### Storage Keys
**File**: `src/config/constants.ts`

Key storage items:
- `STORAGE_*_KEY` - API keys
- `STORAGE_*_MODEL` - Selected models
- `STORAGE_LANGUAGE` - UI language
- `STORAGE_THEME` - Light/dark theme
- `STORAGE_USER_MEMORY` - User preferences

### Message Actions
Communication between components via:
- `MESSAGE_SET_PANEL_OPEN_OR_NOT`
- `MESSAGE_TRANSLATE_HTML_TEXT_BATCH`
- `MESSAGE_CONTEXT_MENU_*`

## 🌍 Internationalization

**Supported Languages** (23 total):
- Arabic (ar)
- Bengali (bn)
- Chinese Simplified (zh_CN)
- Chinese Traditional (zh_TW)
- English (en)
- French (fr)
- German (de)
- Hindi (hi)
- Italian (it)
- Japanese (ja)
- Korean (ko)
- Portuguese (pt_BR, pt_PT)
- Russian (ru)
- Spanish (es)
- And more...

**Implementation**:
- Uses `@wxt-dev/i18n` module
- Translation files in `src/locales/`
- Dynamic language switching

## 📊 State Management

### Jotai Atoms
**Global State**: `src/hooks/global.ts`
- `threadIdAtom` - Current chat thread
- `sidebarOpenAtom` - Panel visibility

### Chrome Storage
- Persistent settings
- API keys (encrypted)
- User preferences

### IndexedDB (Dexie)
**File**: `src/lib/indexDB.ts`
- Chat threads
- Messages
- Memos/notes
- Usage statistics

## 🔒 Security Considerations

- API keys stored in Chrome storage
- Content Security Policy: `script-src 'self'; object-src 'self'`
- LLM-generated HTML is sanitized with DOMPurify before insertion into pages
- Isolated content script execution
- No external analytics or tracking

## 🚀 Build & Deployment

### Build Configuration
**File**: `wxt.config.ts`
- Vite bundler with Terser minification
- Tree-shaking enabled
- No source maps in production
- Bundle analysis: `dist/stats.html`

### Distribution
- Chrome Web Store deployment
- Manual installation via unpacked extension
- ZIP distribution for offline sharing

---

*This index provides a comprehensive overview of the Shizue Chrome extension project. For detailed implementation specifics, refer to the individual component files and inline documentation.*