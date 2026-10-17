// The caption menu and its popups open in this host on <body> (or the fullscreen element), outside
// the player.
export const NETFLIX_POPUP_HOST_TAG = 'shizue-netflix-caption-popups';

// Netflix shows its controls while the mouse moves over the player and removes them a few seconds
// after it stops. The menu lives outside the player, so resting the mouse on it would take the
// button away mid-choice: while it is open, this moves a (synthetic) mouse over the player.
export const keepNetflixControlsShown = (): (() => void) => {
  let step = 0;
  const nudge = () => {
    const player =
      document.querySelector<HTMLElement>('.watch-video--player-view') ??
      document.querySelector<HTMLElement>('[data-uia="player"]');
    if (!player) return;
    const rect = player.getBoundingClientRect();
    step = 1 - step;
    const init = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2 + step,
      clientY: rect.top + rect.height / 2,
    };
    // Which of the two Netflix listens to isn't known.
    player.dispatchEvent(new MouseEvent('mousemove', init));
    player.dispatchEvent(new PointerEvent('pointermove', init));
  };
  nudge();
  const timer = setInterval(nudge, 1000);
  return () => clearInterval(timer);
};
