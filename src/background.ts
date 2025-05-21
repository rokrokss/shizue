import './hot-reload';

console.log('[ENV MODE]', __MODE__);

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed!');
});

if (__MODE__ === 'development') {
  self.addEventListener('unhandledrejection', (e) => {
    if (e.reason?.message?.includes('Extension context invalidated')) {
      console.warn('[worker] Suppressed unhandled rejection:', e.reason);
      e.preventDefault();
    }
  });
}
