# Twitch live captions

Twitch has no caption track or caption API, so captions are translated as they appear instead of being prepared ahead like YouTube's. The design and its research are in the gitignored `reports/Twitch 이중자막 설계.md`.

## UI

- It looks and works like the YouTube feature. The button and menu are `components/Caption/CaptionToggle.tsx`, shared with `YoutubeCaptionToggle`. Target language, bilingual and caption size are shared with YouTube; `STORAGE_SHOW_TWITCH_CAPTION_TOGGLE` is Twitch's own.
- `twitch-caption.content` puts the button at the front of the `.player-controls__right-control-group` next to the `<video>` (Twitch also renders a second, hidden set of controls). It re-attaches every second, because navigation and theatre mode rebuild the controls.
- The menu's lists open to the left (`side="left"`), over the video, because the button sits at the player's right edge next to the chat. The menu popups live in their own shadow host, which moves into `document.fullscreenElement` on `fullscreenchange`, because fullscreen draws only that element.
- Live streams keep playing while the menu is open, since pausing would put them behind live. VODs pause, as on YouTube.
- The open menu counts as part of the player (`playerControls.ts`). Twitch's `[data-a-target="video-ref"]` shows its controls on `mouseenter` and mouse moves and hides them on `mouseleave` or after about 5 s without a move. The menu lives outside the player, so `TwitchCaptionToggle` sends `video-ref` a `mouseenter` while the mouse is over the player or the menu, and closes the menu and sends `mouseleave` 300 ms after it leaves both.
- During ads (`[data-a-target="video-ad-label"]` or `video-ad-countdown`) captions clear, speech recognition pauses so it doesn't transcribe the ad, and the button hides. These selectors come from Purple-adblock's 2026-10 findings and haven't been seen on a real ad here yet.

## Sources

`'auto'` (`STORAGE_TWITCH_CAPTION_SOURCE`) prefers them in this order, because captions the streamer makes from a clean microphone beat recognizing game audio.

1. **Broadcaster CEA-608.** The IVS player sends `PlayerTextCue` events carrying the whole roll-up window (lines joined by `\r\n`), even with native CC off and on VODs after a seek. The player object is reachable only through React props (`mediaPlayerInstance` above `[data-a-target="player-overlay-click-handler"]`, or about 30 fibers above `video-ref`; an offline channel has only the latter). The isolated world can't see React props, so `twitch-player-bridge.content` (MAIN world) relays events as `CustomEvent`s with a JSON-string `detail` (`bridgeProtocol.ts`). If the bridge doesn't answer a ping, as in tabs opened before an install or update, the isolated script asks the background to inject it (`MESSAGE_INJECT_TWITCH_BRIDGE`).
2. **Stream Closed Captioner (SCC)**, a Twitch extension. Its socket needs the JWT Twitch issues to that extension, so its captions are read from its page, a frame inside Twitch's `supervisor.ext-twitch.tv` frame. `twitch-scc.content` (`allFrames`) finds the caption box (a `<main class="caption-styles__Captions-…">` made only of `span`s, or any element of that shape) and sends its text through the background (`MESSAGE_SCC_CAPTION_SNAPSHOT`) to the top frame. While SCC is the source, `MESSAGE_SCC_SET_HIDDEN` hides SCC's overlay view. Tabs open before an install get no frame script until they reload. SCC rewrites words when its recognizer finalizes them, so the segmenter waits 3 s of stillness for SCC instead of 1.5 s.
3. **Speech recognition** (`webSpeechSource.ts`). Audio comes from `<video>.captureStream()` into `SpeechRecognition.start(track)`: a button inside the player doesn't count as invoking the extension for `tabCapture`, and `captureStream` keeps working while the viewer mutes. Keep one recognizer per page, because two starved each other of audio. Always take the newest live audio track, because a channel switch adds a track and the old one stays `live` but silent. Pause on the player's paused state, not the `<video>` `pause` event, which also fires while buffering.
   - The language comes from Twitch's GQL `broadcastSettings.language` (tags are unreliable). A per-channel pick in the menu (`STORAGE_TWITCH_CHANNEL_LANGUAGE`) wins.
   - On-device recognition is far better than cloud (on one English stream: 99 words in 90 s against 11 words in 60 s). Auto mode uses speech recognition only when the stream's language is installed on the device; otherwise it waits for captions. Activating Twitch captions (a click, which `install()` requires) starts the ~60 MB download when speech recognition is how captions would come, and the button spins until it finishes.
   - Cloud recognition runs only when the viewer picks speech recognition and the language isn't on the device. Only that asks for consent (`STORAGE_SPEECH_RECOGNITION_CONSENT`), because it sends the audio to Google.
   - In auto mode, two caption updates within 10 s from a caption source replace speech recognition.

## Splitting into sentences

`lib/liveCaption/segmenter.ts` turns snapshots into sentences.

- It aligns each snapshot against the text so far using only the snapshot's last 60 tokens. SCC's paragraph can be far longer than the 80 committed tokens kept for alignment, and aligning the whole paragraph re-committed it forever.
- The uncommitted tail takes the newest wording, because 608 erases and redraws words (`16 Dam` → `16` → `16 damage`). Words that scroll off before their sentence ends are kept.
- It commits at punctuation followed by more words, after 1.5 s without change, or when the pending text passes 80 columns (CJK characters count two) or 35 tokens, at a comma in the second half when there is one. Most caption and speech text has no punctuation, and a speaker who didn't pause used to fill the screen.
- Run `pnpm test:live-caption` after changing it; it replays recorded captions from `tests/fixtures/twitch/`.

## Translation

`lib/liveCaption/translationQueue.ts` sends 1–3 sentences at a time.

- There is no choice of translator. Chrome's on-device Translator API (`chromeTranslator.ts`) translates every line first: it takes milliseconds and needs no API key, so the Twitch menu opens without one. With a model set up, the LLM's translation, which has context, then replaces each committed line (`Line.llm`); a failed or dropped LLM request keeps Chrome's.
- Line IDs are the controller's own (`l1`, `l2`, …), because each new segmenter numbers its sentences from 1 and late translations would land on the wrong line.
- A model download needs a recent click: activating and picking a language prepare the language pair. `create()` stays pending when Chrome can't fetch the model, so it times out after 90 s. Lines show their original until a translation arrives. `Translator` is looked up at call time so tests can install a stand-in.
- The words still being spoken are translated by Chrome too, at most every 300 ms, and show as the newest line. The LLM doesn't do this, because it would be a request every 300 ms.
- The LLM path is `MESSAGE_TRANSLATE_LIVE_CAPTION`, with the same JSON contract and halves retry as YouTube, the last 3 translated pairs as context, and at most 2 requests in flight. Sentences still waiting after 15 s are dropped.

## Overlay

- `liveCaptionController.tsx` renders `CaptionDisplay` in a closed shadow root inside `.video-player__container`, which stays visible in fullscreen and theatre mode.
- Native captions are hidden with a `<style>` in `<head>`, not inline, because Twitch recreates the caption box between cues.
- A line waiting for its translation shows its original. Each line leaves 6 s after it last changed.
- It resets on seek and on channel change. It polls `location.pathname`, because Twitch keeps the same `<video>` and player across channels.
