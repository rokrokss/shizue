// How hard the chat model thinks before it answers, and the thinking it shows while it does.
// Pure: shared by the background, the side panel and their tests.

// 'medium' is each model's own default; 'low' its lowest setting and 'high' its highest common one.
export type ReasoningEffort = 'low' | 'medium' | 'high';
export const REASONING_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high'];
export const isReasoningEffort = (value: unknown): value is ReasoningEffort =>
  REASONING_EFFORTS.includes(value as ReasoningEffort);

type Block = { type?: unknown; text?: unknown; thinking?: unknown; reasoning?: unknown; thought?: unknown };
type Chunk = { content: unknown; text: string; additional_kwargs?: Record<string, unknown> };

// The answer's text and the model's thinking in one streamed chunk. Providers put the thinking in
// different places: Anthropic thinking blocks, Gemini thought parts, `reasoning_content` (DeepSeek,
// Ollama, LM Studio), and OpenRouter's `delta.reasoning`, read from the raw chunk.
export const chunkParts = (chunk: Chunk): { text: string; reasoning: string } => {
  let reasoning = '';
  const kwargs = chunk.additional_kwargs ?? {};
  if (typeof kwargs.reasoning_content === 'string') reasoning += kwargs.reasoning_content;
  const raw = (kwargs.__raw_response as { choices?: { delta?: { reasoning?: unknown } }[] } | undefined)
    ?.choices?.[0]?.delta?.reasoning;
  if (!reasoning && typeof raw === 'string') reasoning += raw;
  if (!Array.isArray(chunk.content)) return { text: chunk.text, reasoning };

  let thoughts = false;
  let text = '';
  for (const block of chunk.content as Block[]) {
    if (block?.type === 'thinking' && typeof block.thinking === 'string') reasoning += block.thinking;
    else if (block?.type === 'reasoning' && typeof block.reasoning === 'string') reasoning += block.reasoning;
    else if (block?.type === 'text' && typeof block.text === 'string') {
      if (block.thought) {
        thoughts = true;
        reasoning += block.text;
      } else text += block.text;
    }
  }
  return { text: thoughts ? text : chunk.text, reasoning };
};

const OPEN = '<think>';
const CLOSE = '</think>';

// The longest end of `text` that could be the start of `tag`, held back until the next delta.
const partialTagAt = (text: string, tag: string) => {
  for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
    if (tag.startsWith(text.slice(-n))) return text.length - n;
  }
  return text.length;
};

// Some local models write their thinking into the reply as a leading <think>…</think> block (qwen3.5
// on Ollama with thinking off still opens with an empty one). Returns a function that splits each
// streamed delta into the reply's text and that block's thinking, and drops the whitespace after it.
export const thinkTagSplitter = () => {
  let state: 'head' | 'inside' | 'after' | 'passing' = 'head';
  let pending = '';
  // After the block: the reply starts at its first non-space character.
  const textAfterBlock = () => {
    const text = pending.trimStart();
    pending = '';
    if (text) state = 'passing';
    return text;
  };
  return (delta: string): { text: string; reasoning: string } => {
    if (state === 'passing') return { text: delta, reasoning: '' };
    pending += delta;
    if (state === 'head') {
      const trimmed = pending.trimStart();
      if (!OPEN.startsWith(trimmed.slice(0, OPEN.length))) {
        state = 'passing';
        const text = pending;
        pending = '';
        return { text, reasoning: '' };
      }
      if (trimmed.length < OPEN.length) return { text: '', reasoning: '' };
      state = 'inside';
      pending = trimmed.slice(OPEN.length);
    }
    if (state === 'inside') {
      const end = pending.indexOf(CLOSE);
      if (end === -1) {
        const keep = partialTagAt(pending, CLOSE);
        const reasoning = pending.slice(0, keep);
        pending = pending.slice(keep);
        return { text: '', reasoning };
      }
      const reasoning = pending.slice(0, end);
      pending = pending.slice(end + CLOSE.length);
      state = 'after';
      return { text: textAfterBlock(), reasoning };
    }
    return { text: textAfterBlock(), reasoning: '' };
  };
};

// Whole seconds the model thought, at least one.
export const thinkingSeconds = (ms: number) => Math.max(1, Math.round(ms / 1000));
