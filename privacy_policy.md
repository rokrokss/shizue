# Shizue Privacy Policy (개인정보처리방침)

**Last Updated: [2026-10-22]**

Shizue is a Chrome extension designed to enhance your Browse experience by integrating Large Language Models (LLMs).

**Data Collection and Usage**

Shizue's developers **do not operate any server that receives your data from Shizue's features, and do not collect, store, or sell personal user data or Browse activity.** The only exception is Shizue Plot sign-in below, and only if you sign in on that website.

* **User API Keys:** Your OpenAI, Google Gemini, Anthropic, and OpenRouter API keys are stored **only on your local device** (using Chrome's local storage). Each key is sent only to its own provider's API. It is never sent to Shizue's developers or any other third party. An optional key for a local model server is stored the same way and sent only to that server.
* **Sign in with ChatGPT:** OpenAI's sign-in returns to a loopback address (`127.0.0.1`), which Shizue catches inside the browser; nothing listens on your computer. Access, refresh, and ID tokens are stored **only on your local device** in Chrome's local extension storage, like API keys, and are sent only to OpenAI. When you choose a ChatGPT model, Shizue sends the feature's content directly from your browser to OpenAI's Responses API with `store: false` and streams the response back to the extension. Requests count toward your ChatGPT plan's Work/Codex usage. Signing out removes local credentials and attempts to revoke access with OpenAI; the UI reports when remote revocation could not be confirmed. No credentials or content are sent to Shizue's developers.
* **Shizue Plot sign-in:** Shizue Plot (`plot.shizue.net`) is a separate website run by Shizue's developer. When you choose Sign in with ChatGPT on that website, OpenAI returns to a loopback address that a website cannot receive, so a rule built into Shizue sends that one browser navigation on to the website. The rule covers only the two addresses OpenAI uses for Shizue Plot: `127.0.0.1` port 47811 goes to `plot.shizue.net`, and port 47801 goes to `localhost:13000`, where a Shizue Plot development server runs. Shizue does not read, store, or send the sign-in code itself; the website receives it with the navigation. Pages on `plot.shizue.net` and `localhost` can ask whether Shizue is installed, and the answer contains only Shizue's version and the name of this feature. Nothing changes for Shizue's own features.
* **Content Sent to AI Providers:** When you use a feature, the content that feature needs is sent **directly from your browser to the AI provider you selected** (OpenAI, Google, or Anthropic), using your API key. If you chose OpenRouter as your connection, it is sent to OpenRouter, which forwards it to the model's provider. Requests to OpenRouter also carry two headers, `HTTP-Referer: https://shizue.net` and `X-OpenRouter-Title: Shizue`, so OpenRouter can count usage under the Shizue app; they identify the app, not you, and nothing is sent to shizue.net:
  * Chat: the messages and images in the conversation.
  * Page summary: the page title and page text.
  * Page translation: the text of the page elements being translated.
  * YouTube caption translation: the caption text and the video's details (title, description, channel, keywords, duration). On a live stream or a video without captions, captions are translated as they appear, as on Twitch below: by default only by Chrome's built-in on-device translator, so the text stays on your device; with that switch off, the caption text, the last few caption lines and their translations as context, and the video's title and channel are sent to your AI provider; on a live stream this includes captions Shizue reads up to about 20 seconds ahead from the stream data YouTube's player has already downloaded. Shizue reads these captions from the live captions YouTube shows on the video, or from on-device speech recognition (below).
  * Twitch caption translation: the caption text, the last few caption lines and their translations as context, and the stream's title, category, and channel. By default ("Chrome built-in translation" on in the caption menu), Twitch captions are translated only by Chrome's built-in on-device translator (the Translator API), and the text stays on your device (Chrome downloads its translation model for the language pair from Google). With that switch off, they are sent to your AI provider as above; for the broadcaster's own captions this includes captions Shizue reads a few seconds ahead from video Twitch's player has already buffered. Shizue reads the captions from Twitch's player, from the Stream Closed Captioner extension on that page, or from speech recognition (below).
  * Netflix caption translation: the subtitle lines being translated, with a few lines before and after them (and the earlier ones' translations) as context, read from Netflix's own subtitles through its player, and the title's name. When Netflix has its own subtitles in your target language, Shizue shows those instead and sends nothing.
  * Image description and text extraction: the selected image.

  This content is handled under the provider's own terms and privacy policy ([OpenAI](https://openai.com/policies/privacy-policy), [Google](https://policies.google.com/privacy), [Anthropic](https://www.anthropic.com/legal/privacy), [OpenRouter](https://openrouter.ai/privacy)). Nothing is sent until you use a feature.
* **Speech Recognition on Twitch and YouTube:** On a Twitch stream, or a YouTube live stream or video without captions, Shizue can recognize the speech from that tab's audio with Chrome's built-in speech recognition (the Web Speech API). By default this runs on your device: when you turn on captions, Chrome downloads its on-device recognition model for the spoken language from Google (about 60 MB), and the audio stays on your device. On YouTube, Shizue only uses on-device recognition. Only if you choose speech recognition as the caption source on Twitch for a language your device can't recognize yet, Shizue asks for your consent first, and Chrome then sends that audio to Google's speech recognition service, under [Google's privacy policy](https://policies.google.com/privacy). The recognized text is then translated like captions above. Audio is only captured while the feature is on, and is never sent to Shizue's developers. You can withdraw consent in Settings.
* **Local Models:** If you choose a local model, the same content is sent to the model server at the address you set (for example, Ollama or LM Studio on your computer) instead of an AI provider. When that server runs on your computer, the content does not leave your device. Shizue sets the `Origin` header of its own requests to an Ollama server on your computer to that server's address, because Ollama rejects browser extensions otherwise; no other requests are changed.
* **Chat History, Memos & Settings:** Chat history, memos, token usage statistics, and your extension settings (e.g., color themes, language preferences) are stored **only on your local device.** This data is not collected or transmitted.

**No Analytics or Tracking**

We do not use any analytics, tracking, or data collection services that process user information.

**Changes to This Privacy Policy**

We may update our Privacy Policy from time to time. We will notify you of any changes by updating the "Last Updated" date at the top of this Privacy Policy. You are advised to review this Privacy Policy periodically for any changes.

**Contact Us**

If you have any questions about this Privacy Policy, please contact us by email at [q0115643@gmail.com](mailto:q0115643@gmail.com) or via our Discord server: [https://discord.gg/ukfPmxsyEy](https://discord.gg/ukfPmxsyEy)

---

**한국어 번역 (Korean Translation)**

# Shizue 개인정보처리방침

**최종 업데이트: [2026-10-22]**

Shizue는 대규모 언어 모델(LLM)을 통합하여 여러분의 브라우징 경험을 향상시키기 위해 설계된 크롬 확장 프로그램입니다.

**데이터 수집 및 사용**

Shizue 개발자는 **Shizue의 기능으로 여러분의 데이터를 받는 서버를 운영하지 않으며, 개인 사용자 데이터나 브라우징 활동을 수집·저장·판매하지 않습니다.** 예외는 아래 Shizue Plot 로그인뿐이며, 그 웹사이트에서 직접 로그인할 때만 해당합니다.

* **사용자 API 키:** 여러분의 OpenAI, Google Gemini, Anthropic, OpenRouter API 키는 **오직 로컬 기기(크롬의 로컬 저장소 사용)에만 저장**됩니다. 각 키는 해당 제공사의 API로만 전송되며, Shizue 개발자나 그 밖의 제3자에게 절대 전송되지 않습니다. 로컬 모델 서버용 키(선택 사항)도 같은 방식으로 저장되며 그 서버로만 전송됩니다.
* **Sign in with ChatGPT:** OpenAI 로그인은 루프백 주소(`127.0.0.1`)로 돌아오며, Shizue가 이 주소를 브라우저 안에서 받아 처리합니다. 기기에서 대기하는 프로그램은 없습니다. 액세스·갱신·ID 토큰은 API 키와 마찬가지로 **오직 로컬 기기**의 크롬 확장 로컬 저장소에 저장되며 OpenAI로만 전송됩니다. ChatGPT 모델을 선택하면 Shizue가 기능에 필요한 콘텐츠를 `store: false`로 브라우저에서 OpenAI Responses API에 직접 보내고 응답을 확장으로 스트리밍합니다. 요청은 ChatGPT 구독의 Work/Codex 사용량에 포함됩니다. 로그아웃하면 기기의 인증 정보를 삭제하고 OpenAI에 연결 해제를 요청하며, 원격 해제를 확인하지 못한 경우 화면에 안내합니다. 인증 정보나 콘텐츠는 Shizue 개발자에게 전송되지 않습니다.
* **Shizue Plot 로그인:** Shizue Plot(`plot.shizue.net`)은 Shizue 개발자가 운영하는 별도의 웹사이트입니다. 그 사이트에서 ChatGPT로 로그인하면 OpenAI가 웹사이트는 받을 수 없는 루프백 주소로 돌아오는데, Shizue에 내장된 규칙이 이 브라우저 이동 한 번만 그 웹사이트로 넘겨 줍니다. 규칙은 OpenAI가 Shizue Plot용으로 쓰는 두 주소에만 적용됩니다. `127.0.0.1` 포트 47811은 `plot.shizue.net`으로, 포트 47801은 Shizue Plot 개발 서버가 도는 `localhost:13000`으로 넘어갑니다. Shizue는 로그인 코드를 읽거나 저장하거나 전송하지 않으며, 코드는 이동과 함께 웹사이트가 받습니다. `plot.shizue.net`과 `localhost`의 페이지는 Shizue 설치 여부를 물을 수 있고, 그 답에는 Shizue의 버전과 이 기능의 이름만 담깁니다. Shizue 자체 기능에는 달라지는 것이 없습니다.
* **AI 제공사로 전송되는 콘텐츠:** 기능을 사용하면 그 기능에 필요한 콘텐츠가 여러분의 API 키로 **여러분이 선택한 AI 제공사(OpenAI, Google, Anthropic)에 브라우저에서 직접 전송**됩니다. 연결 방식으로 OpenRouter를 선택했다면 OpenRouter로 전송되며, OpenRouter가 이를 해당 모델의 제공사로 전달합니다. OpenRouter로 가는 요청에는 OpenRouter가 사용량을 Shizue 앱으로 집계할 수 있도록 `HTTP-Referer: https://shizue.net`, `X-OpenRouter-Title: Shizue` 두 헤더가 붙습니다. 이 헤더는 사용자가 아니라 앱을 식별하며, shizue.net으로는 아무것도 전송되지 않습니다.
  * 채팅: 대화의 메시지와 이미지
  * 페이지 요약: 페이지 제목과 본문 텍스트
  * 페이지 번역: 번역 대상 요소의 텍스트
  * 유튜브 자막 번역: 자막 텍스트와 영상 정보(제목, 설명, 채널, 키워드, 길이). 라이브 방송이나 자막이 없는 영상에서는 아래 트위치처럼 자막이 나타나는 대로 번역하며, 기본적으로 크롬 내장 기기 내 번역기만 번역하므로 텍스트가 기기 밖으로 나가지 않습니다. 이 스위치를 끄면 자막 텍스트, 문맥으로 쓰는 직전 자막 몇 줄과 그 번역, 영상 제목과 채널이 AI 제공사로 전송되며, 라이브 방송에서는 유튜브 플레이어가 이미 받아 둔 방송 데이터에서 최대 약 20초 앞서 읽은 자막도 포함됩니다. Shizue는 이 자막을 유튜브가 영상 위에 보여 주는 라이브 자막, 또는 아래의 기기 내 음성 인식에서 읽습니다.
  * 트위치 자막 번역: 자막 텍스트, 문맥으로 쓰는 직전 자막 몇 줄과 그 번역, 방송 정보(제목, 카테고리, 채널). 기본적으로(자막 메뉴의 "크롬 내장 번역" 켜짐) 트위치 자막은 크롬 내장 기기 내 번역기(Translator API)만 번역하며, 텍스트는 기기 밖으로 나가지 않습니다(크롬이 언어 쌍의 번역 모델을 Google에서 내려받습니다). 이 스위치를 끄면 자막은 위와 같이 AI 제공사로 전송되며, 스트리머가 넣은 자막의 경우 트위치 플레이어가 이미 받아 둔 영상에서 몇 초 앞서 읽은 자막도 포함됩니다. Shizue는 자막을 트위치 플레이어, 그 페이지의 Stream Closed Captioner 확장, 또는 아래의 음성 인식에서 읽습니다.
  * 넷플릭스 자막 번역: 번역할 자막 줄과 문맥으로 쓰는 앞뒤 몇 줄(앞 줄은 그 번역 포함). 자막은 넷플릭스 플레이어를 통해 넷플릭스 자체 자막에서 읽으며, 작품 제목도 함께 보냅니다. 넷플릭스에 대상 언어 자막이 있으면 그 자막을 대신 보여 주며 아무것도 전송하지 않습니다.
  * 이미지 설명 및 텍스트 추출: 선택한 이미지

  이 콘텐츠는 각 제공사의 약관과 개인정보처리방침([OpenAI](https://openai.com/policies/privacy-policy), [Google](https://policies.google.com/privacy), [Anthropic](https://www.anthropic.com/legal/privacy), [OpenRouter](https://openrouter.ai/privacy))에 따라 처리됩니다. 기능을 사용하기 전에는 아무것도 전송되지 않습니다.
* **트위치·유튜브 음성 인식:** 자막이 없는 트위치 방송, 또는 자막이 없는 유튜브 라이브 방송이나 영상에서는 그 탭의 소리를 크롬 내장 음성 인식(Web Speech API)으로 받아 적을 수 있습니다. 기본적으로 이 인식은 기기 안에서 이루어집니다. 자막을 켜면 크롬이 말하는 언어의 기기 내 인식 모델(약 60MB)을 Google에서 내려받으며, 소리는 기기 밖으로 나가지 않습니다. 유튜브에서는 기기 내 인식만 사용합니다. 트위치에서 아직 기기에서 인식할 수 없는 언어에 대해 자막 출처를 음성 인식으로 직접 고른 경우에만 Shizue가 먼저 동의를 받고, 그 뒤 크롬이 이 소리를 Google 음성 인식 서비스로 보내며, [Google 개인정보처리방침](https://policies.google.com/privacy)에 따라 처리됩니다. 인식된 텍스트는 위의 자막과 같은 방식으로 번역됩니다. 소리는 이 기능이 켜져 있는 동안에만 사용되며, Shizue 개발자에게는 전송되지 않습니다. 동의는 설정에서 취소할 수 있습니다.
* **로컬 모델:** 로컬 모델을 선택하면 같은 콘텐츠가 AI 제공사 대신 여러분이 설정한 주소의 모델 서버(예: 내 컴퓨터의 Ollama나 LM Studio)로 전송됩니다. 그 서버가 내 컴퓨터에서 실행 중이라면 콘텐츠는 기기 밖으로 나가지 않습니다. Ollama는 브라우저 확장 프로그램의 요청을 거부하므로, Shizue는 내 컴퓨터의 Ollama 서버로 보내는 자신의 요청에 한해 `Origin` 헤더를 그 서버의 주소로 바꿉니다. 다른 요청은 바꾸지 않습니다.
* **대화 기록, 메모 및 설정:** 대화 기록, 메모, 토큰 사용량 통계, 확장 프로그램 설정(예: 색상 테마, 언어 기본 설정)은 **오직 로컬 기기에만 저장**됩니다. 이 데이터는 수집되거나 전송되지 않습니다.

**분석 및 추적 없음**

우리는 사용자 정보를 처리하는 어떠한 분석, 추적 또는 데이터 수집 서비스도 사용하지 않습니다.

**개인정보처리방침 변경**

저희는 개인정보처리방침을 수시로 업데이트할 수 있습니다. 변경 사항이 있을 경우, 본 개인정보처리방침 상단의 "최종 업데이트" 날짜를 수정하여 알려드릴 것입니다. 변경 사항이 있는지 주기적으로 본 개인정보처리방침을 검토해 주시기 바랍니다.

**문의**

본 개인정보처리방침에 대해 궁금한 점이 있으시면 이메일([q0115643@gmail.com](mailto:q0115643@gmail.com)) 또는 Discord 서버를 통해 문의해 주십시오: [https://discord.gg/ukfPmxsyEy](https://discord.gg/ukfPmxsyEy)
