// Long chats: once a request would fill most of the model's context, the older turns go as a
// summary in the system message and the latest turns as they are. The summary is kept with the
// thread and folded forward as the chat grows, so it is made again only when the chat outgrows it.
// Pure: shared by the background and its tests.

// Cloud models' windows aren't in the model list; every chat model has at least this many tokens.
export const CLOUD_CONTEXT_TOKENS = 128_000;
// Share of the context a request may fill before older turns are folded into the summary.
export const COMPACT_AT = 0.7;
// The latest messages always go as they are (three questions and their answers).
export const KEEP_RECENT_MESSAGES = 6;

// A summary of a thread's first `count` messages, the last of which was created at `until`.
export interface ContextSummary {
  text: string;
  until: number;
  count: number;
}

export interface CompactionPlan {
  // Messages before this index go as `summary`.
  keepFrom: number;
  summary?: string;
  // Messages [from, to) to fold into a new summary, after `summary`.
  fold?: { from: number; to: number };
  // The request's estimated tokens as planned, before any fold.
  tokens: number;
}

// A stored summary counts while the thread still starts with the messages it read: deleting
// messages it covers, or retrying an answer it covers, leaves it out.
const usableSummary = (history: { createdAt: number }[], stored?: ContextSummary) =>
  stored && stored.count > 0 && stored.count < history.length && history[stored.count - 1].createdAt === stored.until
    ? stored
    : undefined;

export const planCompaction = (
  history: { role: string; createdAt: number }[],
  messageTokens: number[],
  // The system message and anything else sent with every request.
  fixedTokens: number,
  stored: ContextSummary | undefined,
  budget: number,
  textTokens: (text: string) => number
): CompactionPlan => {
  const summary = usableSummary(history, stored);
  const keepFrom = summary?.count ?? 0;
  const tokens =
    fixedTokens +
    (summary ? textTokens(summary.text) : 0) +
    messageTokens.slice(keepFrom).reduce((sum, n) => sum + n, 0);
  const plan = { keepFrom, summary: summary?.text, tokens };
  if (tokens <= budget * COMPACT_AT) return plan;
  // The recent part starts with a question.
  let cut = Math.max(keepFrom, history.length - KEEP_RECENT_MESSAGES);
  while (cut > keepFrom && history[cut].role !== 'human') cut--;
  return cut > keepFrom ? { ...plan, fold: { from: keepFrom, to: cut } } : plan;
};
