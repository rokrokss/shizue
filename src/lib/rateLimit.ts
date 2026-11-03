// Translation requests a provider turned away for coming too fast (HTTP 429). LangChain already
// waits out a Retry-After of up to a minute itself, but gives up at once on a 429 without one
// (OpenRouter's free models) and on Gemini's, whose message speaks of quota and billing even for a
// per-minute limit. Those are sent again after a wait; a daily quota or a longer wait is not.

const MAX_RETRIES = 3;
const MAX_WAIT_MS = 60_000;
// When the provider doesn't say how long to wait.
const BACKOFF_MS = [5_000, 15_000, 30_000];
// Past the provider's moment, so the request doesn't land just before its window resets.
const MARGIN_MS = 500;

type ErrorLike = {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
  headers?: unknown;
  response?: { status?: unknown; headers?: unknown };
  // The response body: Gemini's (@langchain/google) or OpenAI's and OpenRouter's (OpenAI SDK).
  data?: { error?: { details?: unknown } };
  error?: { code?: unknown; metadata?: { headers?: Record<string, unknown> } };
  // Set by LangChain when it retried this 429 itself.
  rateLimitType?: unknown;
};

const header = (headers: unknown, name: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry === undefined ? undefined : String(entry[1]);
};

// A number of milliseconds, seconds or minutes, by the unit's first letters.
const durationMs = (value: string, unit: string) => {
  const u = unit.toLowerCase();
  return Number(value) * (u === 'ms' || u.startsWith('milli') ? 1 : u.startsWith('m') ? 60_000 : 1000);
};

// How long the provider says to wait, if it says.
const hintMs = (error: ErrorLike): number | undefined => {
  // Gemini: a google.rpc.RetryInfo detail, e.g. { retryDelay: "45s" }.
  const details = error.data?.error?.details;
  if (Array.isArray(details)) {
    const retryDelay = details.find((detail) => typeof detail?.retryDelay === 'string')?.retryDelay;
    const match = retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
    if (match) return Number(match[1]) * 1000;
  }
  const headers = error.headers ?? error.response?.headers;
  const retryAfterMs = Number(header(headers, 'retry-after-ms') || NaN);
  if (retryAfterMs >= 0) return retryAfterMs;
  const retryAfter = header(headers, 'retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (seconds >= 0) return seconds * 1000;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  // OpenRouter: when the window resets, in ms since the epoch, in its headers or its body.
  const reset = Number(header(headers, 'x-ratelimit-reset') ?? header(error.error?.metadata?.headers, 'x-ratelimit-reset'));
  if (reset > 1e12) return Math.max(0, reset - Date.now());
  // "Please retry in 45.2s.", "Please try again in 20ms."
  const message = typeof error.message === 'string' ? error.message : '';
  const match = message.match(/(?:retry|try again) (?:in|after) (\d+(?:\.\d+)?) ?(milliseconds?|ms|seconds?|s|minutes?|m)\b/i);
  if (match) return durationMs(match[1], match[2]);
  return undefined;
};

// A daily limit or an account out of credit: waiting a minute won't help.
const quotaSpent = (error: ErrorLike) => {
  if (error.code === 'insufficient_quota' || error.error?.code === 'insufficient_quota') return true;
  const details = error.data?.error?.details;
  return (
    Array.isArray(details) &&
    details.some(
      (detail) =>
        Array.isArray(detail?.violations) &&
        detail.violations.some((violation: { quotaId?: unknown }) => /PerDay/i.test(String(violation?.quotaId)))
    )
  );
};

// How long to wait before sending a translation request again after this error, the request's
// `retry`th retry (from 0), or undefined when it shouldn't be sent again.
export const rateLimitWaitMs = (error: unknown, retry: number): number | undefined => {
  if (!error || typeof error !== 'object' || retry >= MAX_RETRIES) return undefined;
  const e = error as ErrorLike;
  const status = e.status ?? e.statusCode ?? e.response?.status;
  if (Number(status) !== 429 || e.rateLimitType === 'wait' || quotaSpent(e)) return undefined;
  const hint = hintMs(e);
  const wait = hint === undefined ? BACKOFF_MS[retry] : hint + MARGIN_MS;
  return wait <= MAX_WAIT_MS ? wait : undefined;
};
