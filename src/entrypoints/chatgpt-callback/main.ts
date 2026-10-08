// A redirect rule (services/background/chatgpt.ts) sends OpenAI's loopback callback here.
import { i18n } from '#i18n';
import { CHATGPT_CALLBACK_MESSAGE } from '@/lib/chatgpt';

const status = document.getElementById('status')!;
status.textContent = i18n.t('chatgpt.callbackWorking');
const search = location.search;
// Drop the authorization code from the address bar and history.
history.replaceState(null, '', location.pathname);

const accepted = await chrome.runtime.sendMessage({ action: CHATGPT_CALLBACK_MESSAGE, search }).catch(() => false);
if (accepted) {
  // Shizue's settings show the result, so return the user to where they were.
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
} else {
  status.textContent = i18n.t('chatgpt.callbackExpired');
}
