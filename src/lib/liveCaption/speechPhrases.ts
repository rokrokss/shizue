// Names and terms the stream is about, from its title, channel and category, handed to on-device
// speech recognition as phrases to listen for (SpeechRecognition.phrases), so "Elden Ring" isn't
// heard as "elder ring". Cloud recognition takes none.

const MAX_PHRASES = 20;
const MAX_LENGTH = 50;
// Runs of capitalized words ("Elden Ring", "McDonald's"), hashtags, and katakana or Han runs.
const CAPITALIZED_RUN = /\b\p{Lu}[\p{L}\p{N}'’.&-]*(?:\s+\p{Lu}[\p{L}\p{N}'’.&-]*)*/gu;
const HASHTAG = /#([\p{L}\p{N}_]{2,})/gu;
const KATAKANA_OR_HAN = /[\p{Script=Katakana}ー]{3,}|\p{Script=Han}{2,}/gu;
// Capitalized because they start a sentence or shout, not because they name something.
const COMMON = new Set(
  'The A An I And Or But Of In On At To For With From By Is Are Was Be My Our Your His Her Its Their This That These Those We You He She It They Me Us Them Not No Yes All Live Stream Streaming Today Day Night New Part Ep Episode Vs Day Chill Playing Play Game Games Just Let Lets Let\'s First Last Final Full Video Official'
    .toLowerCase()
    .split(/\s+/)
);

const usable = (phrase: string) => {
  const text = phrase.trim().replace(/\s+/g, ' ');
  if (text.length < 2 || text.length > MAX_LENGTH) return null;
  const words = text.split(' ');
  if (words.every((word) => COMMON.has(word.toLowerCase().replace(/[.'’]/g, '')))) return null;
  // ALL CAPS shouting is no name; an acronym of up to 5 letters may be.
  if (/^[\p{Lu}\s\p{N}!?]+$/u.test(text) && text.replace(/\s/g, '').length > 5) return null;
  return text;
};

export const speechPhrases = ({ title, channel, category }: { title?: string; channel?: string; category?: string }) => {
  const found: string[] = [];
  const add = (phrase: string | undefined) => {
    const text = phrase && usable(phrase);
    if (text) found.push(text);
  };
  add(channel);
  add(category);
  for (const match of (title ?? '').matchAll(HASHTAG)) add(match[1]);
  const plain = (title ?? '').replace(HASHTAG, ' ');
  for (const match of plain.matchAll(CAPITALIZED_RUN)) {
    // "The Witcher": a common word leading a run is left out.
    const words = match[0].split(/\s+/);
    while (words.length && COMMON.has(words[0].toLowerCase())) words.shift();
    add(words.join(' '));
  }
  for (const match of plain.matchAll(KATAKANA_OR_HAN)) add(match[0]);

  const seen = new Set<string>();
  return found
    .filter((phrase) => {
      const key = phrase.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PHRASES);
};
