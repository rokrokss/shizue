// Private values page translation keeps from the AI: each goes as a {{n}} placeholder, like code,
// and the translation shows it as it was. A false match costs nothing but a placeholder, so the
// patterns lean towards matching.

const API_KEY = [
  // OpenAI, Anthropic and OpenRouter (sk-proj-…, sk-ant-…, sk-or-v1-…).
  /\bsk-[A-Za-z0-9_-]{20,}/,
  // GitHub tokens.
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/,
  // AWS access key IDs.
  /\bAKIA[0-9A-Z]{16}\b/,
  // Google API keys, old and 2026 format.
  /\bAIza[0-9A-Za-z_-]{35}/,
  /\bAQ\.[A-Za-z0-9_-]{30,}/,
  // Slack tokens.
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  // JSON Web Tokens.
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
].map((re) => re.source);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/.source;

const PHONE = [
  // +82 10-1234-5678, +1 (415) 555-0100, +44 20 7946 0958
  /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}/,
  // (415) 555-0100
  /\(\d{3}\)\s?\d{3}[\s.-]\d{4}\b/,
  // 010-1234-5678, 02-123-4567, 415-555-0100. Dates (2026-11-04) don't fit these group sizes.
  /\b0\d{1,2}[-.]\d{3,4}[-.]\d{4}\b/,
  /\b\d{3}[-.]\d{3}[-.]\d{4}\b/,
].map((re) => re.source);

// Korean resident registration numbers.
const RRN = /\b\d{6}-[1-8]\d{6}\b/.source;

// 13 to 19 digits, maybe in groups: kept only when the Luhn check passes.
const CARD = /\b\d(?:[ -]?\d){12,18}\b/.source;

const SENSITIVE_RE = new RegExp(
  [...[...API_KEY, EMAIL, ...PHONE, RRN].map((s) => `(?:${s})`), `(?<card>${CARD})`].join('|'),
  'g'
);

const luhn = (digits: string): boolean => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

const isPrivate = (match: RegExpMatchArray): boolean => {
  if (!match.groups?.card) return true;
  const digits = match[0].replace(/\D/g, '');
  return !/^(\d)\1+$/.test(digits) && luhn(digits);
};

// The text split into plain parts and private values: parts at even indices, values at odd ones.
export const splitSensitive = (text: string): string[] => {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(SENSITIVE_RE)) {
    if (!isPrivate(match)) continue;
    parts.push(text.slice(last, match.index), match[0]);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
};
