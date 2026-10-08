# Shizue ChatGPT helper

This native messaging host implements OpenAI's [open-source Sign in with ChatGPT flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). Chrome launches it automatically. The extension receives account labels, models, response text, and token counts; OAuth credentials never cross the native messaging port.

From the repository root, with Node.js 22.18+ and pnpm installed:

```sh
pnpm install
pnpm build
pnpm chatgpt:install --extension-id YOUR_EXTENSION_ID
```

Use the ID from `chrome://extensions`, or the command shown in Shizue's **AI provider → Sign in with ChatGPT** settings. For development, load `dist/chrome-mv3` as an unpacked extension after building. The current installer supports macOS and Linux, including Chrome, Chrome for Testing, Chromium, Edge, and Brave. Windows needs a separate native host installer and is not supported by this script.

The installer bundles the helper and its JOSE verifier into `~/.shizue/chatgpt-host`, registers only the specified extension IDs with each browser, and pins the Node executable used at installation. Re-run it after moving Node or changing extension IDs. Multiple extension IDs can be supplied in one command. No daemon or background service needs to be installed.

In Shizue, select **Sign in with ChatGPT**, click **Continue with ChatGPT**, complete OpenAI's login and consent, and return to Shizue. The account's available models appear in the existing chat and translation model pickers. Settings show only the current account’s email and **Sign out**. After signing out, only the login button remains. An expired session offers sign-in again, and a temporary connection failure offers a connection check.

Credentials live in `~/.shizue/chatgpt/credentials.json` (directory `0700`, file `0600`). Each installation has a persistent host ID; each registration retains its issued client ID and validated subject. Sign-out revokes the refresh token and removes local tokens, retaining the registration for reconnection. If remote revocation fails, the UI directs the user to disconnect in ChatGPT settings. Refresh token rotation is serialized across helper processes.

Shizue supports one ChatGPT connection. Sign-in automatically reuses its issued client ID, including after sign-out; there is no account picker, Add account, or Remove connection flow. The first successful sign-in shows the plan-usage notice inline. Confirming it completes onboarding, or returns to the account details when signing in from settings.

For older installations with multiple registrations, the current active registration takes priority. Sign-out remembers that registration for the next login. If there is no active or remembered registration, the most recently saved registration is reused only after explicit sign-in. Legacy records remain private in the vault for compatibility; only the chosen registration is exposed to the extension, and inference cannot use an inactive registration. Records and tokens are never merged by email or copied between client IDs. Concurrent first sign-ins cannot save a second registration, even for a different user; the losing attempt revokes only its new session and reports an unconfirmed revocation when necessary.

Every inference request goes to `https://api.openai.com/v1/responses` with `store: false` and `stream: true`. All chat history is supplied explicitly. System instructions are separated from input. Requests succeed only on `response.completed`; interrupted streams, incomplete responses, and late plan usage errors remain failures. Unsupported API-key options are omitted. JSON translations use the existing prompts and response validation.

Translation requests set `reasoning.effort` to `low` for GPT-6.1 Sol and GPT-6 Astra, and `none` for GPT-6 Luna. Ordinary chat and unknown account models keep the server's default effort. Re-run the helper installer after updating helper code, then reload the extension to reconnect to the new helper.

Plan usage counts toward the user's ChatGPT Work/Codex limits; users can review it or configure app limits at [Manage usage](https://chatgpt.com/settings/usage). Shizue's local token chart is not an authoritative subscription balance.

Run `pnpm test:chatgpt`, `pnpm compile`, and `pnpm build` to validate changes. Live consent and inference require a ChatGPT account eligible for plan sharing; automated tests use synthetic credentials and local callback/network fixtures.
