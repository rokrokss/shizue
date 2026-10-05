<div align="center">
  <img src="store/out/promo-marquee-1400x560.png" alt="Shizue: your AI sidekick on every page" width="100%" />
  <h1>Shizue</h1>
  <p>Supercharge your Browse experience with the power of LLMs</p>


  <p>
    <a style="font-size: 28px" href="https://chromewebstore.google.com/detail/mpcbgfkoholfgapcgcmfjobnfcbnfanm?utm_source=item-share-cb">
      Download Shizue from Chrome Web Store
    </a>
  </p>
</div>

# 👋 Intro

Shizue is a Chrome extension designed for integrating Large Language Models (LLMs) into the daily Browse workflow. The project aims to enhance browser interactions with LLM-driven features, conceptually similar to how tools like Cursor augment code editors.

Shizue provides a free, open-source alternative to commercial services (e.g., [Sider](https://sider.ai/pricing)) that **restricts access to newer models or handy services** behind additional paywalls. Shizue enables users to utilize their own API keys for direct access to rich LLM functionalities, such as page summarization and bilingual webpage translation.

<br/>

# 🌟 Features


### 💬 AI Chat Sidebar:
  - Quickly launch the sidebar using a keyboard shortcut (default: Ctrl/Cmd+Shift+E) to interact with LLMs via a side panel for queries, brainstorming, or information retrieval without navigating away from the current page.

<p align="center">
  <img src="store/out/screenshot-1-hero.png" alt="Summarizing a page in the Shizue side panel" width="640" />
</p>

### 🌐 Bilingual Reading:
  - View web content in two languages side-by-side, aiding in language learning or comprehension of foreign-language texts.

<p align="center">
  <img src="store/out/screenshot-2-translate.png" alt="Bilingual page translation" width="640" />
</p>

### 📺 LLM Translations for Youtube Captions:
  - Generate LLM based translations for Youtube captions in realtime.

<p align="center">
  <img src="store/out/screenshot-3-youtube.png" alt="Bilingual YouTube captions" width="640" />
</p>

### 📝 Memo & Note-taking:
  - Create, edit, and manage personal notes directly within the extension. Features auto-save, pinning important memos, and organized note management.

### 📄 One-Click Page Summaries:
  - Generate concise summaries of web pages for quick content overview.

### 🖱️ Context Menu Actions:
  - Right-click on any page to translate or summarize it instantly
  - Right-click on images to describe their content or extract text (OCR) using AI

<p align="center">
  <img src="store/out/screenshot-4-context-menu.png" alt="Extracting text from an image via the context menu" width="640" />
</p>

### 🌍 Multi-language Support:
  - Available in 23 languages including English, Spanish, French, German, Japanese, Chinese, Korean, Arabic, Hindi, and more.

### 🤖 Multiple AI Model Support:
  - **OpenAI**: GPT-6 Sol, GPT-6 Luna
  - **Google**: Gemini 3.8 Flash, Gemini 3.5 Flash-Lite
  - **Anthropic**: Claude Sonnet 5, Claude Haiku 4.5
  - **DeepSeek** (OpenRouter only): DeepSeek V4 Pro, DeepSeek V4.1 Flash
  - **OpenRouter**: all of the above with a single API key

### 🔑 Use Your Own API Keys:
  - Supports personal OpenAI/Gemini/Anthropic API keys for direct and the most cost-effective usage of models. Users are billed directly by those vendors.
  - Or use one OpenRouter API key for every model, billed by OpenRouter.

<p align="center">
  <img src="store/out/screenshot-5-models.png" alt="Model selection, token usage, and local storage" width="640" />
</p>

### 🎨 Color Themes:
  - Offers Light and Dark mode options for interface customization.

### 🛡️ Secure & Private:
  - API keys, chat history, and memos are stored only in your browser. Page content is sent only to the AI provider you choose, when you use a feature.

<br/>

# 🐳 Installation

- You can install Shizue from [Chrome Web Store](https://chromewebstore.google.com/detail/mpcbgfkoholfgapcgcmfjobnfcbnfanm?utm_source=item-share-cb),
- or you can install Shizue manually from the source by following these steps:

### Manual Install (for Developers):

1.  **Clone & Setup:**
    ```bash
    # Ensure pnpm is installed (npm i -g pnpm)
    git clone https://github.com/rokrokss/shizue && cd shizue
    pnpm install
    ```

2.  **Build:**
    ```bash
    pnpm build # For production build
    # Or use `pnpm dev` for development with hot-reloading
    ```

3.  **Load in Chrome:**
    * Go to `chrome://extensions`.
    * Enable "Developer mode".
    * Click "Load unpacked" and select the build output directory (`dist/chrome-mv3/`).

<br/>

# 💬 Community & Feedback

For suggestions, feedback, or discussions, join me on [Discord](https://discord.gg/ukfPmxsyEy).
