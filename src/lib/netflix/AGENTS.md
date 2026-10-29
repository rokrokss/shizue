# Netflix captions

Netflix has full subtitle files for every title, so this works like YouTube: the original track is downloaded whole and translated ahead of playback. The research behind it is in the gitignored `reports/Netflix 이중자막 리서치.md`. Selectors and player internals here come from other tools' 2026 code, not from a live session; the report lists what still needs checking on a real account.

## Getting subtitles

- `netflix-player-bridge.content` (MAIN world) reads Netflix's player API: `netflix.appContext.state.playerApp.getAPI().videoPlayer`, the session whose ID starts with `watch` (previews have their own sessions), `getMovieId()`, `getAudioTrack().bcp47`, `getTimedTextTrackList()`. It posts a `state` message every 500 ms (`bridgeProtocol.ts`). If the bridge doesn't answer a ping, the caption script asks the background to inject it (`MESSAGE_INJECT_NETFLIX_BRIDGE`).
- A track's file link lives in the player's internal objects, `{ type: 'timedtext', trackId, urls: [{ url }] }` under `getState().videoPlayer.cadmiumPlayerRepository.playersById[sessionId]` (as asbplayer finds them). Netflix gives links for only some tracks. For the others the bridge switches the player to the track, waits up to 10 s for the link, and switches back. Netflix's own subtitles are hidden before that, so the switch doesn't show.
- No `JSON.parse`/`JSON.stringify` hook on the manifest, unlike Language Reactor and the subtitle downloaders: Netflix renamed the manifest keys in 2026-06 (`timedtexttracks` → `textTracks`, `ttDownloadables` → `downloadables`), and a hook only sees manifests fetched after it was installed.
- The files are IMSC 1.1 (TTML) by default; `subtitles.ts` also reads DFXP and WebVTT, ticks (`ttp:tickRate`, 10,000,000/s on Netflix), and drops Japanese ruby readings. Forced-narrative and image-based tracks are left out.

## Choosing the lines

- The original is the subtitle track in the language being spoken, closed captions before plain subtitles, on a dub too: CC transcribes what is said, while plain subtitles in a dub's language translate the original dialogue (`tracks.ts`). The target track is the other way round: plain subtitles first. The viewer can pick another in the menu; the pick is kept by language for later episodes.
- When the title has Netflix subtitles in the target language, those are the translation and no LLM request is made, so this works without a key. `alignCues` shows each target cue with every original cue it overlaps by at least half of the shorter one (else with the one it overlaps most), and a target cue that overlaps none (a sign) becomes a line of its own.
- The original shows as soon as it is loaded; the target track's link can take seconds more (the player switches to it), and its lines fill in when it arrives.
- Otherwise `cueTranslator.ts` translates 10 cues at a time through `MESSAGE_TRANSLATE_SUBTITLES`, starting at the playback position, following seeks, and at most 10 minutes ahead. Each request carries the 5 lines before it (with their translations) and the 3 after it as context. The handler shares Twitch's line translation (`translateLines`: JSON contract, halves retry).
- Target language and caption size are shared with YouTube and Twitch. The bilingual switch is Netflix's own (`STORAGE_NETFLIX_BILINGUAL_CAPTION`) and on by default: with official subtitles and bilingual off, the overlay would look just like Netflix's own subtitles.
- Cues are timed by `<video>.currentTime`. Never write it: seeking through the element makes Netflix stop with error M7375. That is why there is no A/D line navigation here.

## Page

- The button goes first in the right-hand group of the bottom control row (`[data-uia="controls-standard"]`), before "next episode" on a series. The groups are found by layout, split at the widest space between buttons (where the title is), because button names differ between films and series. The button copies the size and icon size of the button after it and Netflix's gap between buttons, and a ResizeObserver on the row refits it when the window resizes. Netflix removes the row while its controls are hidden; one persistent button is moved back in by a MutationObserver.
- Opening the menu pauses the `<video>` and Activate plays it, as on YouTube. Only writing `currentTime` is known to break the player; `pause()` and `play()` on the element haven't been checked on a real account.
- While the menu is open, a synthetic `mousemove` and `pointermove` on the player every second keep Netflix's controls (and the button) up. The button and menu stop click and key events from reaching Netflix, which would pause, seek or change the volume.
- The overlay sits in `.watch-video--player-view` and moves above the control row while it shows. Native subtitles are hidden with a `<style>` (`.player-timedtext` and the image subtitle classes).
- During an ad (`[data-uia="ads-info-container"]`, unverified) captions clear and the button hides. Whether the ad plan shifts `<video>.currentTime` is unknown.
- The next episode plays in the same page: a new `movieId` reloads the captions with the same settings.

## Chat

- Attaching a Netflix watch tab in the side panel's chat sends the original subtitles with their times, as YouTube's captions are sent (`netflixTranscript.ts` answers `MESSAGE_READ_VIDEO_TRANSCRIPT`). `readTranscript()` reuses the lines on screen while captions are on, and otherwise downloads the original track the same way, hiding Netflix's own subtitles while the bridge may switch tracks.
- An answer's [12:34] times seek the tab through the player API in the page's world (`seek(ms)` and `play()` on the watch session, `lib/videoSeek.ts`), never through `<video>.currentTime`. `seek` hasn't been checked on a real account; when no player answers, the tab opens `/watch/<id>?t=<seconds>` instead.
