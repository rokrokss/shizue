import type { Message } from '@/lib/indexDB';

// Auto memory: facts about the user that the chat model picks out of a chat once the user moves on
// from it, and that go with every later chat request. Off until the user turns it on in settings.

export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
}

export interface AutoMemory {
  enabled: boolean;
  facts: MemoryFact[];
}

export const defaultAutoMemory: AutoMemory = { enabled: false, facts: [] };

// Every chat request carries the facts, so keep them few and short; the oldest go first.
export const AUTO_MEMORY_MAX_FACTS = 30;
const MAX_FACT_CHARS = 200;
// New facts one chat can add.
export const MAX_FACTS_PER_CHAT = 5;
// The newest questions read from one chat, each cut to this length.
const MAX_QUESTIONS = 20;
const MAX_QUESTION_CHARS = 1_000;

export const MEMORY_FACTS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    facts: { type: 'array', items: { type: 'string' }, maxItems: MAX_FACTS_PER_CHAT },
  },
  required: ['facts'],
};

// The questions the user typed in a chat after `readUpTo`. Facts about the user are in their own
// words; summaries, selection actions and the translate mode are left out.
export const questionsToRemember = (messages: Message[], readUpTo = 0) =>
  messages
    .filter(
      (m) =>
        m.role === 'human' &&
        m.actionType === 'chat' &&
        !m.translateMode &&
        m.createdAt > readUpTo &&
        m.content.trim()
    )
    .slice(-MAX_QUESTIONS);

export const questionText = (message: Message) =>
  message.content.trim().slice(0, MAX_QUESTION_CHARS);

// The model's {"facts": [...]}, or null when it isn't one. Some models wrap JSON in a code fence.
export const parseMemoryFacts = (raw: string): string[] | null => {
  const fenced = raw.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced ? fenced[1] : raw.trim());
  } catch {
    return null;
  }
  const facts = (parsed as { facts?: unknown } | null)?.facts;
  if (!Array.isArray(facts)) return null;
  return facts
    .flatMap((fact) =>
      typeof fact === 'string' && fact.trim() ? [fact.trim().slice(0, MAX_FACT_CHARS)] : []
    )
    .slice(0, MAX_FACTS_PER_CHAT);
};

const sameFact = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\s.。!]+/g, ' ')
    .trim();

// Adds new facts after the known ones, skipping repeats, and keeps the newest AUTO_MEMORY_MAX_FACTS.
export const mergeMemoryFacts = (facts: MemoryFact[], added: string[], now: number) => {
  const seen = new Set(facts.map((fact) => sameFact(fact.text)));
  const fresh = added.flatMap((text) => {
    const key = sameFact(text);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: crypto.randomUUID(), text, createdAt: now }];
  });
  return [...facts, ...fresh].slice(-AUTO_MEMORY_MAX_FACTS);
};
