import { useThemeValue } from '@/hooks/layout';
import { Button } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const TOGGLE_COMMAND = 'toggle-sidepanel';

// '' when no shortcut is assigned: the user removed it, or another extension already had the
// suggested keys when Shizue was installed.
const readShortcut = () =>
  chrome.commands
    .getAll()
    .then((commands) => commands.find((command) => command.name === TOGGLE_COMMAND)?.shortcut ?? '');

// Chrome writes macOS shortcuts as symbols without separators ("⇧⌘E", "⌃⇧Space") and other
// platforms' as "Ctrl+Shift+E".
const shortcutKeys = (shortcut: string) => {
  if (shortcut.includes('+')) return shortcut.split('+');
  const modifiers = shortcut.match(/^[⌃⌥⇧⌘]*/)![0];
  return [...modifiers, shortcut.slice(modifiers.length)];
};

// Chrome lets only the user change an extension's shortcuts, on chrome://extensions/shortcuts.
// "Change" opens that page beside the panel, and since Chrome reports no change event, the panel
// polls until the keys change so the new ones show up as soon as they are pressed.
export default function ShortcutSettings() {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [shortcut, setShortcut] = useState<string>();
  const [waiting, setWaiting] = useState(false);
  const [saved, setSaved] = useState(false);
  const shortcutBeforeChange = useRef<string | undefined>(undefined);
  const shortcutsTabId = useRef<number | undefined>(undefined);

  const refresh = useCallback(() => {
    void readShortcut().then((next) => {
      setShortcut(next);
      if (shortcutBeforeChange.current === undefined || next === shortcutBeforeChange.current) return;
      shortcutBeforeChange.current = undefined;
      setWaiting(false);
      setSaved(true);
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(refresh, 1000);
    // The hint is about the tab that was opened, so closing it without a change ends the wait.
    const onRemoved = (tabId: number) => {
      if (tabId !== shortcutsTabId.current) return;
      shortcutBeforeChange.current = undefined;
      setWaiting(false);
      refresh();
    };
    chrome.tabs.onRemoved.addListener(onRemoved);
    return () => {
      clearInterval(timer);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };
  }, [waiting, refresh]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  const openShortcutsPage = () => {
    shortcutBeforeChange.current = shortcut ?? '';
    setSaved(false);
    setWaiting(true);
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).then((tab) => {
      shortcutsTabId.current = tab.id;
    });
  };

  const keyColor = saved
    ? 'sz:border-green-500'
    : theme == 'dark'
      ? 'sz:border-gray-600'
      : 'sz:border-gray-300';

  return (
    <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
      <div className={`sz:text-base ${theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'}`}>
        {t('settings.shortcut')}
      </div>
      <div className="sz:w-60 sz:min-h-8 sz:flex sz:items-center sz:justify-between sz:gap-2">
        {/* Windows and Linux name keys in the browser language ("Strg+Umschalt+…"), so long names wrap. */}
        <div className="sz:flex sz:flex-wrap sz:items-center sz:gap-1">
          {shortcut === '' && (
            <span className="sz:text-sm sz:text-gray-500">{t('settings.shortcutNotSet')}</span>
          )}
          {shortcut &&
            shortcutKeys(shortcut).map((key, index) => (
              <kbd
                key={index}
                className={`sz:min-w-7 sz:h-7 sz:px-1.5 sz:inline-flex sz:items-center sz:justify-center sz:rounded-md sz:border sz:border-b-2 sz:whitespace-nowrap sz:text-sm sz:font-ycom sz:transition-colors ${keyColor} ${
                  theme == 'dark' ? 'sz:bg-gray-800 sz:text-gray-100' : 'sz:bg-white sz:text-gray-800'
                }`}
              >
                {key}
              </kbd>
            ))}
        </div>
        <Button className="sz:font-ycom sz:shrink-0" onClick={openShortcutsPage}>
          {t('settings.shortcutChange')}
        </Button>
      </div>
      {waiting && (
        <div className="sz:w-60 sz:text-xs sz:text-center sz:text-gray-500 sz:break-keep sz:wrap-anywhere">
          {t('settings.shortcutHint', { command: chrome.i18n.getMessage('toggle_description') })}
        </div>
      )}
      {saved && <div className="sz:text-xs sz:text-green-600">✓ {t('settings.shortcutSaved')}</div>}
    </div>
  );
}
