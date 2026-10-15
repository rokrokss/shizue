// The caption menu and its popups open in this host on <body> (or the fullscreen element), outside
// the player.
export const TWITCH_POPUP_HOST_TAG = 'shizue-twitch-caption-popups';

// Twitch's player tracks the mouse on this element. It shows the controls on `mouseenter` and
// while the mouse moves, and hides them on `mouseleave` or after about 5 s without a move.
export const twitchPlayerAround = (el: Element | null | undefined) =>
  el?.closest('[data-a-target="video-ref"]') ?? null;

// Marks the mouse inside the player and restarts its hide timer.
export const showTwitchControls = (player: Element) => {
  player.dispatchEvent(new MouseEvent('mouseenter'));
};

// Marks the mouse outside the player, which hides the controls right away.
export const hideTwitchControls = (player: Element) => {
  player.dispatchEvent(new MouseEvent('mouseleave'));
};
