import './hot-reload';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed!');
});

self.addEventListener('error', (e) => {
  if (e.message.includes('Extension context invalidated')) {
    e.preventDefault();
  }
});
