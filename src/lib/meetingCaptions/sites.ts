// Where each meeting site shows its live captions, and how its caption blocks read: one block per
// turn, the speaker's name and what they said, the newest last and still growing. The selectors
// come from TranscripTonic (MIT, 2026), not from a meeting of our own; none of these sites can be
// opened without an account.

export type MeetingBlock = {
  // The block's element: a new one means a new turn, even from the same speaker.
  key: Element;
  speaker: string;
  text: string;
};

export type MeetingSite = {
  name: 'meet' | 'teams' | 'zoom';
  // The caption box while captions are on, or null.
  region: (doc: Document) => HTMLElement | null;
  blocks: (region: HTMLElement) => MeetingBlock[];
  // The meeting's name, for the LLM.
  title: (doc: Document) => string;
};

const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

// A name is a line of its own, short and without a sentence in it.
const looksLikeName = (value: string) => value.length > 0 && value.length <= 60 && !/[.?!。？！]$/.test(value);

// Google Meet: the captions region holds a block per turn, [speaker, text]; its last children
// aren't captions. Its classes change with every release, so blocks are found by that shape.
const meet: MeetingSite = {
  name: 'meet',
  region: (doc) => doc.querySelector<HTMLElement>('div[role="region"][tabindex="0"]'),
  blocks: (region) => {
    const blocks: MeetingBlock[] = [];
    for (const block of Array.from(region.querySelectorAll('div'))) {
      if (block.childElementCount !== 2) continue;
      const [name, words] = [block.firstElementChild!, block.lastElementChild!];
      const speaker = text(name);
      const said = text(words);
      if (!said || !looksLikeName(speaker) || words.querySelector('div > div')) continue;
      // The innermost pair: elements come before the ones inside them, and a pair inside a pair
      // that also fits is the real block.
      if (blocks.length && blocks[blocks.length - 1].key.contains(block)) blocks.pop();
      blocks.push({ key: block, speaker, text: said });
    }
    return blocks;
  },
  title: (doc) => doc.title.replace(/^Meet\s*[-–]\s*/i, '').trim(),
};

// Microsoft Teams (new Teams on the web): each caption line names its author.
const teams: MeetingSite = {
  name: 'teams',
  region: (doc) =>
    doc.querySelector<HTMLElement>('[data-tid="closed-caption-v2-virtual-list-content"]') ??
    doc.querySelector<HTMLElement>('[data-tid="closed-caption-renderer-wrapper"]'),
  blocks: (region) =>
    Array.from(region.querySelectorAll('[data-tid="closed-caption-text"]')).flatMap((words) => {
      const item = words.parentElement;
      const author = item?.parentElement?.querySelector('[data-tid="author"]') ?? item?.previousElementSibling;
      const said = text(words);
      return said && item ? [{ key: item, speaker: text(author), text: said }] : [];
    }),
  title: (doc) => doc.title.replace(/\s*\|\s*Microsoft Teams\s*$/i, '').trim(),
};

// Zoom's web client (in its #webclient frame): each line is the speaker's avatar, then the text.
const zoom: MeetingSite = {
  name: 'zoom',
  region: (doc) => doc.querySelector<HTMLElement>('.live-transcription-subtitle__box'),
  blocks: (region) =>
    Array.from(region.querySelectorAll('img + *')).flatMap((words) => {
      const said = text(words);
      const avatar = words.previousElementSibling as HTMLImageElement | null;
      return said ? [{ key: words, speaker: avatar?.alt?.trim() ?? '', text: said }] : [];
    }),
  title: (doc) => doc.title.trim(),
};

export const meetingSiteFor = (hostname: string, pathname: string): MeetingSite | null => {
  if (hostname === 'meet.google.com') return meet;
  if (
    hostname === 'teams.microsoft.com' ||
    hostname === 'teams.live.com' ||
    hostname === 'teams.cloud.microsoft'
  )
    return teams;
  if ((hostname === 'zoom.us' || hostname.endsWith('.zoom.us')) && pathname.startsWith('/wc/')) return zoom;
  return null;
};
