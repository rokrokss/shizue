// The parts of YouTube's player the live captions rely on, in one place for when YouTube changes them.
export const PLAYER = '#movie_player';
export const VIDEO = '#movie_player video.html5-main-video';
// YouTube's own caption box (an id; our overlay reuses its class so YouTube's CSS lifts it over the
// controls, as captionInjector does).
export const NATIVE_CAPTIONS = '#ytp-caption-window-container';
export const CAPTION_LINE = '.caption-visual-line';
// The CC button, the same in every UI language. aria-pressed says whether captions are on.
export const SUBTITLES_BUTTON = '.ytp-subtitles-button';
