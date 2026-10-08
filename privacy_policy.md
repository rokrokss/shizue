# Shizue Privacy Policy (개인정보처리방침)

**Last Updated: [2026-10-08]**

Shizue is a Chrome extension designed to enhance your Browse experience by integrating Large Language Models (LLMs).

**Data Collection and Usage**

Shizue's developers **do not operate any server that receives your data, and do not collect, store, or sell personal user data or Browse activity.**

* **User API Keys:** Your OpenAI, Google Gemini, Anthropic, and OpenRouter API keys are stored **only on your local device** (using Chrome's local storage). Each key is sent only to its own provider's API. It is never sent to Shizue's developers or any other third party. An optional key for a local model server is stored the same way and sent only to that server.
* **Sign in with ChatGPT:** The optional local helper handles OpenAI sign-in through a temporary loopback callback (`127.0.0.1`). Access, refresh, and ID tokens are saved in a user-only file on your computer, outside Chrome storage. Chrome stores only account labels, connection status, and available models. When you choose a ChatGPT model, the helper sends the feature's content directly to OpenAI's Responses API with `store: false` and streams the response back to the extension. Requests count toward your ChatGPT plan's Work/Codex usage. Signing out removes local credentials and attempts to revoke access with OpenAI; the UI reports when remote revocation could not be confirmed. No credentials or content are sent to Shizue's developers.
* **Content Sent to AI Providers:** When you use a feature, the content that feature needs is sent **directly from your browser to the AI provider you selected** (OpenAI, Google, or Anthropic), using your API key. If you chose OpenRouter as your connection, it is sent to OpenRouter, which forwards it to the model's provider. Requests to OpenRouter also carry two headers, `HTTP-Referer: https://shizue.net` and `X-OpenRouter-Title: Shizue`, so OpenRouter can count usage under the Shizue app; they identify the app, not you, and nothing is sent to shizue.net:
  * Chat: the messages and images in the conversation.
  * Page summary: the page title and page text.
  * Page translation: the text of the page elements being translated.
  * YouTube caption translation: the caption text and the video's details (title, description, channel, keywords, duration).
  * Image description and text extraction: the selected image.

  This content is handled under the provider's own terms and privacy policy ([OpenAI](https://openai.com/policies/privacy-policy), [Google](https://policies.google.com/privacy), [Anthropic](https://www.anthropic.com/legal/privacy), [OpenRouter](https://openrouter.ai/privacy)). Nothing is sent until you use a feature.
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

**최종 업데이트: [2026-10-08]**

Shizue는 대규모 언어 모델(LLM)을 통합하여 여러분의 브라우징 경험을 향상시키기 위해 설계된 크롬 확장 프로그램입니다.

**데이터 수집 및 사용**

Shizue 개발자는 **여러분의 데이터를 받는 서버를 운영하지 않으며, 개인 사용자 데이터나 브라우징 활동을 수집·저장·판매하지 않습니다.**

* **사용자 API 키:** 여러분의 OpenAI, Google Gemini, Anthropic, OpenRouter API 키는 **오직 로컬 기기(크롬의 로컬 저장소 사용)에만 저장**됩니다. 각 키는 해당 제공사의 API로만 전송되며, Shizue 개발자나 그 밖의 제3자에게 절대 전송되지 않습니다. 로컬 모델 서버용 키(선택 사항)도 같은 방식으로 저장되며 그 서버로만 전송됩니다.
* **Sign in with ChatGPT:** 선택 사항인 로컬 연결 프로그램은 임시 루프백 콜백(`127.0.0.1`)으로 OpenAI 로그인을 처리합니다. 액세스·갱신·ID 토큰은 크롬 저장소 밖, 기기의 사용자 전용 파일에 저장합니다. 크롬에는 계정 표시 이름, 연결 상태, 모델 목록만 저장합니다. ChatGPT 모델을 선택하면 연결 프로그램이 기능에 필요한 콘텐츠를 `store: false`로 OpenAI Responses API에 직접 보내고 응답을 확장으로 스트리밍합니다. 요청은 ChatGPT 구독의 Work/Codex 사용량에 포함됩니다. 로그아웃하면 기기의 인증 정보를 삭제하고 OpenAI에 연결 해제를 요청하며, 원격 해제를 확인하지 못한 경우 화면에 안내합니다. 인증 정보나 콘텐츠는 Shizue 개발자에게 전송되지 않습니다.
* **AI 제공사로 전송되는 콘텐츠:** 기능을 사용하면 그 기능에 필요한 콘텐츠가 여러분의 API 키로 **여러분이 선택한 AI 제공사(OpenAI, Google, Anthropic)에 브라우저에서 직접 전송**됩니다. 연결 방식으로 OpenRouter를 선택했다면 OpenRouter로 전송되며, OpenRouter가 이를 해당 모델의 제공사로 전달합니다. OpenRouter로 가는 요청에는 OpenRouter가 사용량을 Shizue 앱으로 집계할 수 있도록 `HTTP-Referer: https://shizue.net`, `X-OpenRouter-Title: Shizue` 두 헤더가 붙습니다. 이 헤더는 사용자가 아니라 앱을 식별하며, shizue.net으로는 아무것도 전송되지 않습니다.
  * 채팅: 대화의 메시지와 이미지
  * 페이지 요약: 페이지 제목과 본문 텍스트
  * 페이지 번역: 번역 대상 요소의 텍스트
  * 유튜브 자막 번역: 자막 텍스트와 영상 정보(제목, 설명, 채널, 키워드, 길이)
  * 이미지 설명 및 텍스트 추출: 선택한 이미지

  이 콘텐츠는 각 제공사의 약관과 개인정보처리방침([OpenAI](https://openai.com/policies/privacy-policy), [Google](https://policies.google.com/privacy), [Anthropic](https://www.anthropic.com/legal/privacy), [OpenRouter](https://openrouter.ai/privacy))에 따라 처리됩니다. 기능을 사용하기 전에는 아무것도 전송되지 않습니다.
* **로컬 모델:** 로컬 모델을 선택하면 같은 콘텐츠가 AI 제공사 대신 여러분이 설정한 주소의 모델 서버(예: 내 컴퓨터의 Ollama나 LM Studio)로 전송됩니다. 그 서버가 내 컴퓨터에서 실행 중이라면 콘텐츠는 기기 밖으로 나가지 않습니다. Ollama는 브라우저 확장 프로그램의 요청을 거부하므로, Shizue는 내 컴퓨터의 Ollama 서버로 보내는 자신의 요청에 한해 `Origin` 헤더를 그 서버의 주소로 바꿉니다. 다른 요청은 바꾸지 않습니다.
* **대화 기록, 메모 및 설정:** 대화 기록, 메모, 토큰 사용량 통계, 확장 프로그램 설정(예: 색상 테마, 언어 기본 설정)은 **오직 로컬 기기에만 저장**됩니다. 이 데이터는 수집되거나 전송되지 않습니다.

**분석 및 추적 없음**

우리는 사용자 정보를 처리하는 어떠한 분석, 추적 또는 데이터 수집 서비스도 사용하지 않습니다.

**개인정보처리방침 변경**

저희는 개인정보처리방침을 수시로 업데이트할 수 있습니다. 변경 사항이 있을 경우, 본 개인정보처리방침 상단의 "최종 업데이트" 날짜를 수정하여 알려드릴 것입니다. 변경 사항이 있는지 주기적으로 본 개인정보처리방침을 검토해 주시기 바랍니다.

**문의**

본 개인정보처리방침에 대해 궁금한 점이 있으시면 이메일([q0115643@gmail.com](mailto:q0115643@gmail.com)) 또는 Discord 서버를 통해 문의해 주십시오: [https://discord.gg/ukfPmxsyEy](https://discord.gg/ukfPmxsyEy)
