# AGENTS.md

Shizue is a Chrome MV3 extension that brings LLMs into browsing: side panel chat, page and YouTube/Twitch caption translation, page summaries, image description and OCR, and memos. Users bring an OpenAI, Gemini, Anthropic or OpenRouter key, a local server (Ollama, LM Studio, llama.cpp), or Sign in with ChatGPT. Stack: WXT, React 19, TypeScript, Tailwind v4, antd, Jotai, Dexie, LangChain.

## Commands

```bash
pnpm dev                 # dev build with hot reload
pnpm build               # production build into dist/chrome-mv3/
pnpm compile             # type check (tsc --noEmit)
pnpm zip                 # store ZIP
pnpm test:models         # also test:chat, test:panel, test:chatgpt, test:plot-signin, test:live-caption, test:netflix
store/render.sh          # Chrome Web Store images, store/src → store/out
site/build.sh            # shizue.net landing page into _site/
```

- Tests are `node --test` files in `tests/`. Run the script for the area you changed, plus `pnpm compile`. There is no lint script.
- `pnpm test:panel` and `node scripts/check-panel-settings.mjs` (run after `pnpm build`) start a headless Chrome, so the memory rules below apply to them.
- `pnpm test:live-caption` replays recorded Twitch and YouTube live captions from `tests/fixtures/twitch/` and `tests/fixtures/youtube/`.

## Trying changes in a browser

- Manual: `pnpm build`, then chrome://extensions → Developer mode → Load unpacked → `dist/chrome-mv3/`. Inspect the service worker from chrome://extensions, the side panel with right-click → Inspect, and content scripts in the page's DevTools.
- Automated: branded Chrome 137+ ignores `--load-extension`. Use Chrome for Testing (Playwright's `chromium-*` download) with `--load-extension` and a temporary `--user-data-dir`.
- Start from a fresh profile after every rebuild. A reused profile keeps the old build's service worker while content scripts update, so new background message handlers silently don't exist.
- The maintainer's Mac is shared with heavy apps, and tests have run it out of memory twice. Check `memory_pressure` and `sysctl vm.swapusage` before a browser test, a build or a local model, and tell the maintainer instead of starting when swap is nearly full. Run one test browser at a time and never alongside a build. Use a small muted window at the lowest video quality, and kill the browser after each batch. Run one local LLM server at a time and unload its model afterwards (`ollama stop <model>`, `lms unload --all`).

## Repository conventions

- Commit subjects are `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` or `perf:` plus a Korean summary, e.g. `fix: 트위치 플레이어를 video-ref로도 찾기`. Work goes to `main`; there is no develop branch.
- UI strings live in `src/locales/*.json` (23 languages). Add a new key to every locale file; missing keys fall back to English.
- Formatting follows `.prettierrc`: single quotes, semicolons, 100 columns.
- `reports/` and `research_notes/` hold gitignored design notes and research. `.claude/` is gitignored too.

## Architecture

- `src/entrypoints/background/`: the service worker. It routes messages, owns context menus, opens and closes the side panel, and caches settings in `states/`.
- `src/services/background/`: what the router calls. `messageHandlers.ts` is the registry, `chatModelHandler.ts` streams chat, `translationHandler.ts` translates in batches, and `chatgpt.ts` runs ChatGPT sign-in.
- `src/entrypoints/sidepanel/`: the React app, with routes `/chat`, `/shizue-memo`, `/shizue-words` and `/onboarding`.
- `src/entrypoints/*.content*`: in-page toggle, YouTube captions, Twitch captions, the Twitch player bridge and player worker hook (MAIN world), the Stream Closed Captioner frame reader, and Netflix captions with their player bridge (MAIN world).
- `src/lib/`: shared logic. `src/hooks/`: Jotai atoms and hooks. `src/config/constants.ts`: every `MESSAGE_*`, `PORT_*` and `STORAGE_*` name.
- To add a message, add a `MESSAGE_*` constant, a handler, and its entry in the `messageHandlers.ts` registry. A `chrome.runtime.onMessage` listener that answers asynchronously returns `true`; otherwise the channel closes before `sendResponse` runs.
- Chat and translation stream over `chrome.runtime.connect` ports. The background posts `{ delta }`, `{ error }` and `{ done }` messages.

## Background service worker

- Chrome stops the worker after about 30 s idle, so its in-memory state is rebuilt on every start. `states/models` loads keys and model choices from `chrome.storage.local` asynchronously, and handlers `await whenBackgroundStateReady()` before reading them. The router and the chat port listener already do.
- `chrome.sidePanel.open()` works only synchronously inside the sender's user gesture, and any `await` before it loses the gesture. Call `open()` first; the router skips the ready wait for panel-opening messages for this reason.
- `togglePanel` (`background/sidepanel.ts`) keeps no open/closed flag, because a remembered flag read "closed" after a worker restart while the panel was open. It starts `chrome.runtime.getContexts({ contextTypes: [SIDE_PANEL] })`, calls `open()` at once (a no-op on an open panel), and closes every panel if one was open. Side panel contexts report `windowId: -1`, so the check can't be per window.
- When you cache a new setting in `states/models`, add its key to the initial `chrome.storage.local.get` in `modelListeners()` and handle it in the `onChanged` listener. An emptied key must clear the cached value.

## State and storage

- A setting is a `STORAGE_*` key in `constants.ts` plus an `atomWithChromeStorage(key, initial)` atom in `src/hooks/`. The atom holds a promise until `chrome.storage` first answers.
- Threads, messages, memos and token usage live in IndexedDB (`lib/indexDB.ts`, Dexie). A schema change adds a new `this.version(N)` that lists every table, and indexes only fields used to filter or sort.
- The open thread's messages load through the background (`MESSAGE_LOAD_THREAD`). Thread lists and counts use Dexie `liveQuery` atoms in `hooks/chat.ts`.

## Models and providers

- `lib/modelRegistry.ts` is pure data and safe to import anywhere. `lib/models.ts` is the LangChain factory; import it only from background code, because it pulls LangChain into any bundle that imports it.
- Settings store slot names (`'gpt'`, `'gpt-mini'`, `'gemini-flash'`, …), not API model IDs. `MODELS[slot]` holds the real ID, label, provider, `supportsTemperature` and `supportsImages`, so swapping a model means editing its entry. Pickers render from `useModelOptions()` in `hooks/models.ts`.
- A chat or translation model is a cloud slot, `local:<model id>` or `chatgpt:<model id>`. Where a model may be local, use `modelSupportsImages(model, localServer)` instead of `MODELS[slot]`.
- OpenRouter is a key type, not a model provider: its key reaches every slot. A model goes through its provider key or the OpenRouter key, whichever is set. When both are, `STORAGE_CONNECTION_MODE` decides, resolved per model by `getConnectionModeFor()`. Models without a `provider` (DeepSeek) are OpenRouter-only.
- Newer reasoning models reject non-default `temperature`; set `supportsTemperature: false` and the factory omits it. `supportsImages: false` disables image upload and the image context menu items for that model.
- `@langchain/openai` doesn't recognize gpt-6 as a reasoning model, so OpenAI-specific fields (`max_completion_tokens`, `reasoning_effort`) go through `modelKwargs`.
- Read streamed text with `chunk.text`, which skips thinking blocks. Combine chunks with `concat` before reading `usage_metadata`, because providers split usage across chunks.
- Validate API keys against the provider's API, never by prefix. Gemini keys changed from `AIza…` to `AQ.…` in 2026 and are sent in the `x-goog-api-key` header. OpenRouter keys are checked with `/api/v1/key`, because `/models` is public.
- A new provider needs a `ModelProvider` value and `MODELS` entries (`modelRegistry.ts`), a factory and a `getModelInstance()` branch (`models.ts`), key validation (`validateApiKey.ts`), and its key in the background cache.

### Local models

- The connected server and its chat models are one `LocalServerConfig` in `STORAGE_LOCAL_SERVER`. `resolveLocalModel(ref, server)` (the background uses `getLocalModelFor()`) combines it with a `local:` ref. A ref whose model is gone from the server is listed as unavailable and fails with a "connect it again" error.
- Ollama answers POSTs that carry an extension `Origin` with 403. `lib/localServer.ts` installs a DNR dynamic rule that sets `Origin` to the server's own origin, only for this extension's requests to that origin. The rule needs `declarativeNetRequestWithHostAccess` and host permissions for `localhost`/`127.0.0.1`; content script matches don't count for DNR.
- Ollama goes through `ChatOllama` with the same `numCtx` on every request (`localContextLength()`, capped at 32K), because a different `num_ctx` reloads the model. Ollama silently drops whatever doesn't fit, so `fitLocalContext()` in `chatModelHandler.ts` trims the longest human message and marks the reply `contextTruncated`. Other servers go through `ChatOpenAI` at the base URL plus `/v1` and get no fitting, since their context size isn't known.

### Sign in with ChatGPT

- `chatgpt:` refs use the user's ChatGPT plan through OpenAI's open-source OAuth flow, entirely inside the extension. `lib/chatgptAuth.ts` and `lib/chatgptResponses.ts` are pure; `services/background/chatgpt.ts` wires them to storage. Only the background reads `STORAGE_CHATGPT_CREDENTIALS`; the UI sees `STORAGE_CHATGPT_CONNECTION`.
- The flow requires the redirect `http://127.0.0.1:<port>/auth/callback`, where nothing listens. A DNR session rule redirects that navigation to the web-accessible `chatgpt-callback.html`, which hands the query to the background and closes its tab.
- Shizue Plot (`plot.shizue.net`) uses the same loopback trick through static rules in `public/plot-signin-rules.json`, and the extension only answers the site's presence ping. `PLOT_ORIGINS` in `lib/plotSignIn.ts`, `externally_connectable` in `wxt.config.ts` and the rule targets must list the same origins.

## Content script UI

- In-page UI renders inside shadow roots (`cssInjectionMode: 'ui'` + `createShadowRootUi`). CSS injected into pages once reordered a page's cascade layers, and page CSS restyled the toggle. The only CSS injected into pages is `public/fonts/fonts.css`, because shadow roots ignore `@font-face`.
- antd in a shadow root needs `StyleProvider container={shadowRoot} cache={createCache()}`, plus `getPopupContainer` and `createPortal` targets inside the root. `@ant-design/cssinjs` must resolve to the version antd itself uses, or `StyleProvider` silently does nothing.
- Listeners on `document` see the shadow host as the target. Read `e.composedPath()[0]` and hit-test with `shadowRoot.elementFromPoint`.
- Elements placed in the page's own DOM (such as the YouTube player-bar holder) can't use `sz:` classes; style them inline. Use px rather than rem, because rem follows the page's root font size (YouTube's is 10px).

## Store images, landing page and sprites

- `store/src/*.html` recreate the extension UI with styles from the components and strings from `src/locales/en.json`. When UI text, model names or the features they show change, update them and run `store/render.sh`. The landing page reuses `store/out`.
- `store/out/store-icon-128.png` (the store listing icon) and `github-social-1280x640.png` (the repo's social preview) are uploaded by hand. Neither is a manifest icon; those are in `src/public/icon/`.
- `site/index.html` is a template that `site/render.mjs` fills from `site/locales/<lang>.json` (English at `/`, other languages at `/<lang>/`). Strings are HTML fragments. Change copy in every locale file; the build fails when a locale misses a key or changes the tags of `en.json`. Asset paths in the template are root-absolute (`/img/...`).
- `/` redirects to the language last picked in the header menu, or else to the browser's language. To see `/` in English locally, pick English in the menu. `.github/workflows/pages.yml` deploys the site on push to `main`.
- The bunny sprite sheets in `src/assets/character/` have `*_dark.png` twins. Dark mode draws characters through `invert(1) hue-rotate(180deg)`, and the twins' cream body inverts to dark olive instead of black. Change a sheet and its twin together.

## Twitch live captions

Read `src/lib/twitch/AGENTS.md` before changing Twitch captions: `src/lib/twitch/`, `src/lib/liveCaption/`, the `twitch-*` entrypoints, `src/components/Twitch/`, and `src/components/Caption/CaptionToggle.tsx` (shared with YouTube).

## YouTube live captions

Live streams and videos without caption tracks use the Twitch live caption controller (`lib/liveCaption/liveCaptionController.tsx`) with `lib/youtubeCaption/youtubePlatform.ts`; videos with caption tracks keep `captionInjector`. `YoutubeCaptionToggle` creates the controller only when that path is used (a live stream, a video without captions, or speech recognition picked as the source) and disposes it when the viewer leaves the video or goes back to the caption track. Live captions are read from YouTube's own caption box (`#ytp-caption-window-container`, kept updating under `visibility: hidden`), with the CC button pressed and put back afterwards. Speech recognition here is on-device only (`allowCloudSpeech: false`).

Live captions are also read ahead, 12–21 s before they show: `youtube-player-hook.content` (MAIN world, `document_start`) wraps `fetch` and, only while the realtime path reads a live caption track (`hookProtocol.ts` turns it on and off), copies the player's SABR responses. `lib/youtubeCaption/sabr.ts` streams their UMP parts, skipping audio and video, and takes itag 386: 5 s fMP4 segments whose sample is srv3 XML (`<p t d>`, ms from the segment's MediaHeader start). `captionReadAhead.ts` feeds the cues to the shared read-ahead chunks (`lib/liveCaption/readAheadChunks.ts`, also behind Twitch's `captionPrefetch`), so the LLM translates a chunk before it shows and the screen commits it on match. YouTube's live recognition shows two-line blocks, not roll-up, so its segmenters use `blocks: true` (no search of earlier text, which matched a phrase said again). The first ~15 s after activating aren't read ahead: the player had already fetched them. The read-ahead is a bonus; the screen path works without it. The design is in the gitignored `reports/YouTube 라이브·무자막 자막 설계.md`. Read `src/lib/twitch/AGENTS.md` too: the controller is shared.

## Netflix captions

Read `src/lib/netflix/AGENTS.md` before changing Netflix captions: `src/lib/netflix/`, the `netflix-*` entrypoints and `src/components/Netflix/`.
