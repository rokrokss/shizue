# Changelog

## v0.3.18

- Chat with a video: attach a YouTube tab and Shizue reads its captions, so answers can say what was said and when. Times like [12:34] in an answer are buttons that play the video from there. The chip shows "with captions", or "without captions" when a video's captions can't be read and its page text is sent instead
- Summaries of a YouTube page are made from its captions, with the times of each part
- Look up caption words: with bilingual captions on YouTube, Netflix or Twitch, click a word in the original line to see its part of speech, base form, reading (Japanese and Chinese) and meaning in that line, from your translation model. The video pauses while it's open (not on live streams) and plays again when you close it
- Word list: save a word from that popup with its line, the line's translation and a link to that moment in the video. The book icon in the side panel opens the list, where you can search, delete and export a CSV for Anki
- Smaller download: math fonts ship only as woff2

## v0.3.17

- Attach files to a chat: the paperclip button and drag-and-drop take text and code files as well as PDFs, and pasting more than 2,000 characters attaches the text as a "Pasted text" chip instead of filling the chat box. Pages, files and pasted text share the limit of 5
- Type @ in the chat box to pick open tabs to attach, searched by title or site. With the tab group permission, the list can also show your tab groups and attach a whole group at once
- Capture an area: from the paperclip button, drag over part of the current tab to send just that part as an image, for models that read images. Esc cancels
- ↑ in an empty chat box brings back this chat's earlier questions, and ↓ goes forward again. Pressing Enter while an answer is still coming stops it and sends your new question instead
- Math in answers is typeset, inline and as blocks, while prices like $5 stay plain text
- Charts: when numbers suit one, answers can draw a bar, line or area chart, with a button to see the same numbers as a table
- Web search: turn it on from the paperclip button and cloud models search the web while answering, with the sources listed under the answer. It stays on until you turn it off. Local models can't search the web
- Auto memory: in Settings → General, turn on "Remember from chats" and Shizue picks out lasting facts about you (your work, how you like answers) from each chat you leave and uses them in later chats. Every fact is listed there to delete one by one or all at once. Off by default
- Fix local model translations arriving all at once instead of streaming in

## v0.3.16

- Attach more to a chat: the paperclip button lists the web pages open in this window to tick on or off, attaches a PDF file from your computer, and captures what the current tab shows as an image for models that read images. Pages and files share the limit of 5
- PDFs: a PDF open in a tab or picked from your computer is read for its text, Korean, Japanese and Chinese included. A scanned PDF with no text isn't sent, with the reason shown
- Search your chats: a search box at the top of History finds conversations by what their messages say and marks the match
- Page translation keeps up with the page: text that appears after translation starts (late-loading paragraphs, infinite scroll, sections that open, a new page in a single-page site) is translated without scrolling, text the page changes is translated again, and text inside frames is translated too

## v0.3.15

- Custom instructions: in Settings → General, tell Shizue about yourself and how you want answers (up to 1,500 characters). Every side panel answer follows them: chat, page summaries, selection actions and image descriptions. Page and caption translation don't use them
- Attach pages to a chat: the tab you're viewing appears above the chat box; click it to send that page's text with your question. Switch tabs to attach up to 5 pages. Attached pages stay with the conversation for follow-up questions, and a page with almost no text or one Shizue can't read isn't sent, with the reason shown
- GPT-6.1 Terra joins the OpenAI and OpenRouter model lists. With Sign in with ChatGPT, GPT-5.6 Terra and GPT-5.6 Terra Pro are no longer offered
- The model list now updates from shizue.net about once a day, so new models can appear without an extension update, and a model you picked that is retired moves to its successor. The request carries no personal data; see the privacy policy

## v0.3.14

- YouTube captions work again on videos YouTube dubbed automatically: Shizue uses the original language's captions instead of a dub's machine-translated ones, and Auto-activate sees the language the video is really spoken in
- YouTube captions: when a video has its own captions in your target language, Bilingual shows the original language's captions with them
- Netflix: opening the caption menu pauses the video and Activate plays it, as on YouTube
- Twitch captions: the "Stream language" row is now "Spoken language", as on YouTube

## v0.3.13

- Bilingual captions on YouTube live streams and on videos without captions: Shizue reads a live stream's captions from YouTube's own, and uses on-device speech recognition when a video has none. The caption menu gains Caption source, Spoken language and Chrome built-in translation rows
- YouTube live captions are read 12–21 seconds ahead from what the player has already downloaded, so LLM translations are ready when a line appears
- YouTube captions: "Auto-activate" in the caption menu turns captions on by themselves for videos spoken in a language you pick, or in any language other than your target language. Deactivate keeps that video off
- The YouTube caption button comes back after a mid-roll ad
- Netflix: the caption button sits before the next-episode button, at the size of Netflix's own buttons, and closed-caption tracks are marked [CC] in the original subtitles list
- Caption menus always show the language list's scrollbar, so it's clear more languages follow

## v0.3.12

- Bilingual captions on Netflix: Shizue shows the title's subtitles in the language being spoken (closed captions first, also on a dub) together with your target language, and you can pick another original track from the caption menu
- When Netflix has subtitles in your target language, Shizue pairs them with the original lines, with no AI request and no API key. Otherwise your LLM translates ahead of playback, with the lines around each batch as context
- Netflix captions show the original right away and fill in translations as they arrive, carry on into the next episode, and work in fullscreen. Netflix has its own Bilingual switch, on by default
- Settings: hide the Netflix caption button
- YouTube captions: Traditional Chinese (zh-Hant) tracks are recognized as Traditional Chinese

## v0.3.11

- Chat replies stay in your chosen language, page summaries included, but when you ask for another language (say, an email draft in English) Shizue now writes it in that language instead of refusing

## v0.3.10

- Twitch captions: the caption menu's "Chrome built-in translation" switch (on by default) picks the translator. On, Chrome's on-device translator translates everything; off, your LLM does. A line's translation no longer changes after it appears
- With the streamer's own captions, Shizue reads them a few seconds ahead from video Twitch's player has already downloaded (up to about 30 seconds on VODs), so LLM translations are ready when a line appears and lines no longer wait for a pause

## v0.3.9

- Twitch live captions translate with Chrome's on-device translator by default and update the line being spoken every 0.3 s; turn on AI translation in the caption menu to use your LLM instead
- Twitch captions show one line at a time (about 80 characters), and each line disappears after 6 seconds
- Twitch auto captions use speech recognition only when on-device recognition is available; picking speech recognition downloads the on-device model right away, and consent is asked only for cloud recognition
- The Twitch caption menu keeps the player controls visible while open, closes when you leave the video and the menu, and opens its submenus to the left
- Twitch captions find the player more reliably
- Sign in with ChatGPT is translated into every supported language

## v0.3.8

- Bilingual captions on Twitch, like on YouTube, for live streams and VODs: Shizue translates the streamer's own captions or Stream Closed Captioner, and recognizes speech on streams without captions (on-device recognition is a one-time download from the caption menu)
- Twitch captions work in theatre mode and fullscreen, and pause while an ad plays

## v0.3.7

- Settings show the panel shortcut you actually have (or "Not set"), and "Change" opens Chrome's shortcut page with the new keys showing up in the panel as soon as you press them

## v0.3.6

- Sign in with ChatGPT now also works on the Shizue Plot website (plot.shizue.net): Shizue passes OpenAI's loopback sign-in callback on to the site, with no new permissions

## v0.3.5

- New look: the mascot and the extension icon are now a blue bunny

## v0.3.4

- Add ChatGPT sign-in and automatically restore disconnected page scripts
- GPT-6 Sol is updated to GPT-6.1 Sol
- Show page translation loaders only for batches currently being translated
- Fix a previous chat briefly appearing when opening a page summary; reopening the side panel starts a new chat while keeping saved history
- Speed up side panel startup and settings opening, and remove repeated loading when reopening settings
- Fix the white flash on dark-mode startup and dark-mode settings and memo icon colors
- Remove the extra Shizue label from the loading screen

## v0.3.3

- Fix Cmd/Ctrl+Shift+E and the in-page toggle not closing the side panel after the browser had been idle for a while

## v0.3.2

- Local models: the settings show what's connected, the server and its models, instead of an address form. When no server is running or it has no models yet, Shizue says what to do and connects on its own once you start the server or download a model. Enter an address only when you need a different one
- The Connect and Validate buttons no longer flash a spinner for checks that finish within a moment

## v0.3.1

- Chat history and the memo list no longer flash their empty message while loading, and the Connect and Validate buttons keep their size while they work
- Local models: clearer message when the connected server has no chat models

## v0.3.0

- Local models: in Settings → Models, choose "Use a Local Model" to use Ollama, LM Studio, or llama.cpp running on your computer, with no API key. Shizue finds the server at its default port, or you can enter its address. Chat and translation can use different local models
- Local models (Ollama): when a text is longer than the model can read at once, only its beginning is used, and a note under the reply says so
- Add Gemma 4 31B (Gemini key or OpenRouter)
- Page translation: fix translation failing while the side panel was open
- Page translation: the loader now shows on pages whose paragraphs keep their line breaks, and on paragraphs still waiting their turn

## v0.2.9

- License: Shizue is now MIT-licensed
- OpenRouter: requests carry `HTTP-Referer: https://shizue.net` and `X-OpenRouter-Title: Shizue`, so usage is counted under the Shizue app on OpenRouter. They identify the app, not you

## v0.2.8

- Context menu: right-click selected text to translate, explain, summarize, or fix its grammar. The answer opens in the side panel chat, quoting the selection and linking its page
- Translating a selection uses the Translate Target Language setting

## v0.2.7

- YouTube captions: fix AI captions not showing up after Activate on some videos
- YouTube captions: the subtitles (CC) button is no longer toggled on every video page load, only on Activate when needed
- YouTube captions: when the AI returns the wrong number of lines for a chunk, it's retried in smaller parts instead of leaving the whole chunk untranslated

## v0.2.6

- Add DeepSeek V4 Pro and DeepSeek V4.1 Flash (OpenRouter only)
- Image upload and the image context menu actions are disabled for models that don't accept images (DeepSeek V4 Pro); earlier images in a thread are left out for them

## v0.2.5

- Chat: tildes (e.g. "3~5") no longer render as strikethrough

## v0.2.4

- Onboarding: fix the provider dropdown showing OpenAI while OpenRouter was selected

## v0.2.3

- Onboarding: OpenRouter is now the first and default option in the provider list

## v0.2.2

- Fix the side panel not opening from the floating button (and its summarize, memo and image actions)
- Settings: OpenRouter is now the first option under AI Provider; the Connection setting is gone
- Each model uses whichever of its provider key and the OpenRouter key is registered; with both, the new "Prefer OpenRouter" checkbox decides

## v0.2.1

- Support OpenRouter: one OpenRouter API key for every model (Settings → Models → Connection)
- Add OpenRouter to the onboarding provider options

## v0.2.0

- Remove PDF translation (the translation server is shut down)
- Update models: GPT-6 Sol/Luna, Gemini 3.8 Flash/3.5 Flash-Lite, Claude Sonnet 5/Haiku 4.5
- Stop sending `temperature` to models that reject it; low-reasoning mode for translation
- Accept new Gemini API key format (`AQ.…`) and fix Anthropic key validation (CORS)
- Sanitize translated HTML before inserting it into pages
- Show provider error details in chat; recover when the stream connection drops
- Fix settings not loaded right after the service worker restarts
- Fix token usage provider/model attribution and streaming usage totals
- Fix page translation assigning translations to the wrong elements
- Limit page text sent for summaries
- Upgrade LangChain 1.x, WXT 0.21, Vite 7, and security patches

## v0.1.15

- Memo App Feature
- fix Chat duplicate issue

## v0.1.14

- Use images in chat
- describe image
- extract text from image
- use A/D key to navigate Youtube captions
- support Anthropic

## v0.1.13

- robust translate mode in chat

## v0.1.10

- limit number of pages in PDF translation

## v0.1.9

- increase PDF translation file limit to 40MB

## v0.1.8

- PDF Translation

## v0.1.7

- API Token Usage Monitoring
- Added ability to hide menu on specific websites

## v0.1.6

- Control Youtube caption size

## v0.1.5

- fix minor bugs

## v0.1.4

- Bilingual mode for Youtube Translation

## v0.1.3

- Support Gemini models
  - Gemini 2.5 Flash
  - Gemini 2.5 Flash Lite

## v0.1.2

- Support Youtube Caption Translation

## v0.1.1

- Support Dark Mode

## v0.1.0

- First Deployment
- Support OpenAI Models
- Side Panel Chat
- Bilingual Reading
- One Click Page Summary
