# Changelog

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
