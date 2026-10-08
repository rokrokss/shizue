// Classic, parser-blocking script: apply the last panel theme before React/CSS
// loads. Keep it external because extension CSP does not allow inline scripts.
(() => {
  const cacheKey = 'shizue.panel.theme';
  const isTheme = (value) => value === 'dark' || value === 'light';
  const apply = (theme) => {
    const root = document.documentElement;
    root.style.colorScheme = theme;
    root.style.setProperty('--sz-panel-background', theme === 'dark' ? '#1c1d26' : '#ffffff');
    try { localStorage.setItem(cacheKey, theme); } catch { /* Storage can be unavailable. */ }
  };

  let cached;
  try { cached = localStorage.getItem(cacheKey); } catch { /* Use the dark loading background. */ }
  // An uncached first open stays dark until the saved preference is known.
  // This is a loading color only; the default app preference remains light.
  apply(isTheme(cached) ? cached : 'dark');

  let revision = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.THEME) return;
    revision++;
    apply(isTheme(changes.THEME.newValue) ? changes.THEME.newValue : 'light');
  });
  const initialRevision = revision;
  chrome.storage.local.get('THEME').then((stored) => {
    if (revision === initialRevision) apply(isTheme(stored.THEME) ? stored.THEME : 'light');
  }).catch(() => { /* Keep the cached background if the storage read fails. */ });
})();
