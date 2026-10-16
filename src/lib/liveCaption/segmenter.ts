import type { Sentence, SourceUpdate } from '@/lib/liveCaption/types';

// Live captions arrive as a moving window of text with no cue boundaries: CEA-608 roll-up adds a
// word at a time and drops its top line, the Stream Closed Captioner frame grows, and a speech
// recognizer rewrites its interim hypothesis. Each snapshot is aligned against the text received
// so far, so words that scroll out of the window before their sentence ends are kept, and the
// uncommitted tail takes the newest wording. Committed text never changes.

type Token = { text: string; key: string; cjk: boolean };

export type SegmenterOptions = {
  // Commit what is pending after this long without a change (the speaker paused).
  pauseMs?: number;
  // A sentence ending in punctuation is committed once it has at least this many tokens;
  // a shorter one waits and joins the next sentence.
  minTokens?: number;
  // Never let the pending text grow past this many tokens, or wider than this many columns
  // (about a caption line or two; Japanese, Chinese and Korean characters count as two). Live
  // captions often have no punctuation, and a speaker who doesn't pause would otherwise fill the
  // screen with one sentence.
  maxTokens?: number;
  maxWidth?: number;
  onInterim?: (text: string) => void;
  onSentence?: (sentence: Sentence) => void;
};

// Japanese and Chinese have no spaces, so each character is a token. Hangul uses spaces.
const CJK_CHAR = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/u;
const SENTENCE_END = /[.?!…。？！]["'”’)\]」』]*$/u;
// Where a sentence cut at the length limit would rather end.
const SOFT_BREAK = /[,;:、，；：]["'”’)\]」』]*$/u;
const WIDE_CHAR = /[ᄀ-ᇿ　-〿぀-ヿㄱ-ㆎ㐀-䶿一-鿿가-힣豈-﫿＀-｠￠-￦]/u;
const EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
// Only the end of a snapshot can hold new words. Stream Closed Captioner shows a paragraph of
// up to 30 finished segments; aligning all of it against the trimmed committed text would fail and
// commit the whole paragraph again.
const MAX_SNAPSHOT_TOKENS = 60;
// Keep more committed text than a snapshot covers, so a snapshot always finds where it continues.
const KEEP_COMMITTED_TOKENS = 80;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const push = (value: string, cjk: boolean) => {
    const key = value.toLowerCase().replace(EDGE_PUNCTUATION, '') || value;
    tokens.push({ text: value, key, cjk });
  };
  for (const chunk of text.split(/\s+/u)) {
    if (!chunk) continue;
    if (!CJK_CHAR.test(chunk)) {
      push(chunk, false);
      continue;
    }
    let run = '';
    for (const char of chunk) {
      if (CJK_CHAR.test(char)) {
        if (run) push(run, false);
        run = '';
        push(char, true);
      } else {
        run += char;
      }
    }
    if (run) push(run, false);
  }
  return tokens;
}

export function joinTokens(tokens: { text: string; cjk: boolean }[]): string {
  let text = '';
  tokens.forEach((token, index) => {
    if (index > 0 && !(token.cjk && tokens[index - 1].cjk)) text += ' ';
    text += token.text;
  });
  return text;
}

// How wide the text is on screen, in columns.
export function textWidth(tokens: { text: string; cjk: boolean }[]): number {
  let width = 0;
  tokens.forEach((token, index) => {
    if (index > 0 && !(token.cjk && tokens[index - 1].cjk)) width += 1;
    for (const char of token.text) width += WIDE_CHAR.test(char) ? 2 : 1;
  });
  return width;
}

export function createSegmenter(options: SegmenterOptions = {}) {
  const pauseMs = options.pauseMs ?? 1500;
  const minTokens = options.minTokens ?? 4;
  const maxTokens = options.maxTokens ?? 35;
  const maxWidth = options.maxWidth ?? 80;

  let received: Token[] = [];
  let committed = 0;
  // Where the previous snapshot started inside `received`.
  let windowStart = 0;
  let pendingSince = 0;
  let lastChangeAt = 0;
  let lastInterim = '';
  let sequence = 0;

  const pending = () => received.slice(committed);

  const emitInterim = () => {
    const text = joinTokens(pending());
    if (text === lastInterim) return;
    lastInterim = text;
    options.onInterim?.(text);
  };

  const commit = (count: number, at: number) => {
    if (count <= 0) return;
    const tokens = received.slice(committed, committed + count);
    committed += count;
    options.onSentence?.({
      id: `s${++sequence}`,
      text: joinTokens(tokens),
      startedAt: pendingSince || at,
      committedAt: at,
      endedAt: lastChangeAt || at,
    });
    pendingSince = committed < received.length ? at : 0;
    if (committed > KEEP_COMMITTED_TOKENS) {
      const drop = committed - KEEP_COMMITTED_TOKENS;
      received = received.slice(drop);
      committed -= drop;
      windowStart = Math.max(0, windowStart - drop);
    }
  };

  // How many pending tokens to commit when they are over the length caps: as many as fit, ending
  // at a comma when one falls in the second half.
  const overLimit = (tokens: Token[]) => {
    if (tokens.length <= maxTokens && textWidth(tokens) <= maxWidth) return 0;
    let fit = 1;
    while (fit < tokens.length && fit < maxTokens && textWidth(tokens.slice(0, fit + 1)) <= maxWidth) fit++;
    for (let end = fit; end > fit / 2; end--) {
      if (SOFT_BREAK.test(tokens[end - 1].text)) return end;
    }
    return fit;
  };

  // Commits finished sentences: ones that end in punctuation and that the speaker has already
  // moved past, plus anything over the length caps.
  const commitFinished = (at: number) => {
    for (;;) {
      const tokens = pending();
      let end = -1;
      for (let index = minTokens - 1; index < tokens.length - 1; index++) {
        if (SENTENCE_END.test(tokens[index].text)) {
          end = index;
          break;
        }
      }
      if (end >= 0) {
        commit(end + 1, at);
        continue;
      }
      const cut = overLimit(tokens);
      if (cut) {
        commit(cut, at);
        continue;
      }
      return;
    }
  };

  // Finds where the snapshot starts inside the received text. A caption window only moves
  // forward, so positions from the previous window's start are tried first. A match counts when
  // it runs to the end of what was received (the snapshot continues it), when it covers the whole
  // snapshot (the source erased its last characters), or when it is at least `anchor` tokens long
  // (the tail was reworded).
  const align = (snapshot: Token[]) => {
    const anchor = snapshot.some((t) => t.cjk) ? 3 : 2;
    const lengthAt = (position: number) => {
      let length = 0;
      while (
        position + length < received.length &&
        length < snapshot.length &&
        received[position + length].key === snapshot[length].key
      ) {
        length++;
      }
      return length;
    };
    // A match that reaches the end of the received text or covers the whole snapshot beats a
    // longer partial one: after a line scrolls off, the new first words can also appear earlier.
    let partial: { position: number; length: number } | null = null;
    for (let position = windowStart; position < received.length; position++) {
      const length = lengthAt(position);
      if (!length) continue;
      if (position + length === received.length || length === snapshot.length) {
        return { position, length };
      }
      if (length >= anchor && (!partial || length > partial.length)) partial = { position, length };
    }
    if (partial) return partial;
    for (let position = Math.min(windowStart, received.length) - 1; position >= 0; position--) {
      const length = lengthAt(position);
      if (length >= anchor) return { position, length };
    }
    return null;
  };

  const snapshot = (text: string, at: number) => {
    const tokens = tokenize(text).slice(-MAX_SNAPSHOT_TOKENS);
    if (!tokens.length) return;
    const before = joinTokens(pending());
    const match = received.length ? align(tokens) : null;
    if (match) {
      // Keep committed tokens; take the snapshot's wording for everything after them, which also
      // picks up punctuation the source adds once a sentence ends.
      const keep = Math.max(match.position, committed);
      received = received.slice(0, keep).concat(tokens.slice(keep - match.position));
      windowStart = match.position;
    } else {
      // Nothing in common: whatever was pending is finished, and this is new text.
      commit(received.length - committed, at);
      windowStart = received.length;
      received = received.concat(tokens);
    }
    if (committed < received.length && !pendingSince) pendingSince = at;
    if (joinTokens(pending()) !== before) lastChangeAt = at;
    commitFinished(at);
    emitInterim();
  };

  return {
    push(update: SourceUpdate) {
      if (update.kind === 'break') {
        commit(received.length - committed, update.at);
        received = [];
        committed = 0;
        windowStart = 0;
        emitInterim();
        return;
      }
      snapshot(update.text, update.at);
    },
    // Commits what is pending now, when the speaker is known to have moved on. Unlike a break, it
    // keeps the received text, which a roll-up window still shows, for aligning what comes next.
    commitPending(at: number) {
      if (committed < received.length) {
        commit(received.length - committed, at);
        emitInterim();
      }
    },
    // Called on a timer: commits what is pending once the source has been still for `pauseMs`.
    tick(now: number) {
      if (committed < received.length && now - lastChangeAt >= pauseMs) {
        commit(received.length - committed, now);
        emitInterim();
      }
    },
    reset() {
      received = [];
      committed = 0;
      windowStart = 0;
      pendingSince = 0;
      lastChangeAt = 0;
      emitInterim();
    },
  };
}

export type Segmenter = ReturnType<typeof createSegmenter>;
