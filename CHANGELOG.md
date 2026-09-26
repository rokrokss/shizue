# Changelog

## Unreleased

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
