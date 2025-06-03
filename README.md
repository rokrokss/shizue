<div align="center">
  <img src="src/public/icon/128.png" alt="Shizue Logo" width="64" />
  <h1>Shizue</h1>
  <p>Supercharge your Browse experience with the power of LLMs</p>
</div>

# 👋 Intro

Shizue is a Chrome extension designed for integrating Large Language Models (LLMs) into the daily Browse workflow. The project aims to enhance browser interactions with LLM-driven features, conceptually similar to how tools like Cursor augment code editors.

Shizue provides a free, open-source alternative to commercial services (e.g., [Sider](https://sider.ai/pricing)) that **restricts access to newer models** behind paywalls. It enables users to utilize their own API keys for direct access to LLM functionalities, such as page summarization and bilingual webpage translation.

<br/>

# 🌟 Features

<br/>

| Features | Screenshot                                                                                         | 
| -------- |----------------------------------------------------------------------------------------------------| 
| Side Chat     | ![chat](doc/chat.gif)   | 
| Bilingual Reading  | ![translate](doc/translate.gif) | 
| One-Click Page Summaries     | ![summarize](doc/summarize.gif)                                       | 
| Dark Mode | ![darkMode](doc/darkmode.gif) |

<br/>

### 💬 AI Chat Sidebar:
  - Quickly launch the sidebar using a keyboard shortcut to interact with LLMs via a side panel for queries, brainstorming, or information retrieval without navigating away from the current page.
  
### 🌐 Bilingual Reading:
  - View web content in two languages side-by-side, aiding in language learning or comprehension of foreign-language texts.
  
### 📄 One-Click Page Summaries:
  - Generate concise summaries of web pages for quick content overview.
  
### 🔑 Use Your Own OpenAI API Key:
  - Supports personal OpenAI API keys for direct and potentially more cost-effective usage of models. Users are billed directly by OpenAI.
  
### 🎨 Color Themes:
  - Offers Light and Dark mode options for interface customization.
  
### 🛡️ Secure & Private:
  - API keys and user data are intended to be handled securely within the extension.
  
### 💖 Free & Open Source:
  - Licensed under the MIT License. The codebase is available for inspection, modification, and contribution.

<br/>

# 🐳 Installation

Deployment on the Chrome Web Store is currently under review. We'll update this section once Shizue is available there!

In the meantime, you can install Shizue manually from the source by following these steps:

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

<br/>

# 📄 License

Shizue is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
