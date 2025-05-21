import './hot-reload';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed!');
});
