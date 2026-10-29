// A page summary's [¶12] buttons: show the summarized page and select that line in it.

const withoutHash = (url: string) => url.split('#')[0];

// Runs in the page. Finds `line` (the page's innerText at summary time) in its text nodes, ignoring
// spaces and case: innerText adds or drops spaces between elements, and CSS may change case. Long
// lines are matched by their start, shortened when a page changed slightly since.
const selectLine = (line: string) => {
  const fold = (char: string) => {
    const lower = char.toLowerCase();
    return lower.length === 1 ? lower : char;
  };
  let needle = '';
  for (const char of line) if (!/\s/.test(char)) needle += fold(char);
  if (!needle) return false;

  let text = '';
  const nodes: Text[] = [];
  const offsets: number[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!node.parentElement || node.parentElement.closest('script, style, noscript, template')) {
      continue;
    }
    const value = node.nodeValue ?? '';
    for (let i = 0; i < value.length; i++) {
      if (/\s/.test(value[i])) continue;
      text += fold(value[i]);
      nodes.push(node);
      offsets.push(i);
    }
  }

  for (const length of [100, 50, 25]) {
    const part = needle.slice(0, length);
    // The first visible match, else the first match.
    let found = -1;
    for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1)) {
      if (nodes[at].parentElement!.checkVisibility()) {
        found = at;
        break;
      }
      if (found === -1) found = at;
    }
    if (found === -1) continue;
    const end = found + part.length - 1;
    const range = document.createRange();
    range.setStart(nodes[found], offsets[found]);
    range.setEnd(nodes[end], offsets[end] + 1);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    nodes[found].parentElement!.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  }
  return false;
};

// A text fragment escapes - , and & as well, which mark its own parts.
const fragmentText = (text: string) =>
  encodeURIComponent(text).replace(/-/g, '%2D');

// The tab showing `url` (this window's first), or a new one. A new tab is opened with a text
// fragment, which Chrome scrolls to and highlights once the page loads.
export const seekPageLine = async (url: string, line: string) => {
  const tabs = await chrome.tabs.query({});
  const current = await chrome.windows.getCurrent().catch(() => null);
  const tab = tabs
    .filter((t) => t.url && withoutHash(t.url) === withoutHash(url))
    .sort((a, b) => Number(b.windowId === current?.id) - Number(a.windowId === current?.id))[0];
  if (tab?.id === undefined) {
    const start = line.trim().split(/\s+/).slice(0, 8).join(' ');
    await chrome.tabs.create({
      url: `${url}${url.includes('#') ? '' : '#'}:~:text=${fragmentText(start)}`,
    });
    return;
  }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    func: selectLine,
    args: [line],
  });
};
