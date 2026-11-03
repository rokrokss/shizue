import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const temporary = fileURLToPath(new URL(`../.wxt/rate-limit-${randomUUID()}.mjs`, import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../src/lib/rateLimit.ts', import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
after(() => rm(temporary, { force: true }));
const { rateLimitWaitMs } = await import(pathToFileURL(temporary).href);

// Shaped like the errors LangChain rethrows: @langchain/google's RequestError and the OpenAI SDK's APIError.
const geminiError = (quotaId, retryDelay) => Object.assign(new Error(
  'You exceeded your current quota, please check your plan and billing details. ' +
  `* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests\nPlease retry in ${retryDelay}.`
), {
  name: 'RateLimitQuotaExhaustedError',
  statusCode: 429,
  rateLimitType: 'stop',
  headers: {},
  data: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
  ] } },
});
const apiError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, headers: new Headers(extra.headers ?? {}), ...extra.fields });

test('Gemini per-minute 429s wait for the delay they give, daily ones are not retried', () => {
  assert.equal(rateLimitWaitMs(geminiError('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '45s'), 0), 45_500);
  assert.equal(rateLimitWaitMs(geminiError('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '30s'), 0), undefined);
});

test('a 429 without a hint backs off three times, then gives up', () => {
  const error = apiError(429, '429 Rate limit exceeded: free-models-per-min.');
  assert.deepEqual([0, 1, 2, 3].map((retry) => rateLimitWaitMs(error, retry)), [5_000, 15_000, 30_000, undefined]);
});

test('hints in headers, OpenRouter metadata and messages are followed', () => {
  assert.equal(rateLimitWaitMs(apiError(429, 'slow down', { headers: { 'retry-after': '12' } }), 0), 12_500);
  assert.equal(rateLimitWaitMs(apiError(429, 'slow down', { headers: { 'retry-after-ms': '800' } }), 0), 1_300);
  assert.equal(rateLimitWaitMs(apiError(429, 'Rate limit reached. Please try again in 20ms.'), 0), 520);
  const reset = Date.now() + 20_000;
  const wait = rateLimitWaitMs(apiError(429, 'Rate limit exceeded', {
    fields: { error: { code: 429, metadata: { headers: { 'X-RateLimit-Reset': String(reset) } } } },
  }), 0);
  assert.ok(wait > 19_000 && wait <= 20_500, String(wait));
});

test('spent quotas, long waits, LangChain\'s own retries and other errors are not retried', () => {
  assert.equal(rateLimitWaitMs(apiError(429, 'You exceeded your current quota', { fields: { code: 'insufficient_quota' } }), 0), undefined);
  assert.equal(rateLimitWaitMs(apiError(429, 'slow down', { headers: { 'retry-after': '120' } }), 0), undefined);
  assert.equal(rateLimitWaitMs(apiError(429, 'slow down', { headers: { 'retry-after': '5' }, fields: { rateLimitType: 'wait' } }), 0), undefined);
  assert.equal(rateLimitWaitMs(apiError(500, 'Internal error'), 0), undefined);
  assert.equal(rateLimitWaitMs(new Error('Failed to fetch'), 0), undefined);
  assert.equal(rateLimitWaitMs(undefined, 0), undefined);
});
