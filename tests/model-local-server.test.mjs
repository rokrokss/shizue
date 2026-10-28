import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const temporary = fileURLToPath(new URL(`../.wxt/local-server-${randomUUID()}.mjs`, import.meta.url));
await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/localServer.ts', import.meta.url))],
  outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
});
after(() => rm(temporary, { force: true }));

// Safari: every request carries the extension's origin, which Ollama refuses unless a dynamic rule
// rewrites it for that server.
const EXTENSION_HOST = '8A1F2C3D-0000-4E5F-9A8B-1234567890AB';
let rules = [];
const ruleWrites = [];
globalThis.chrome = {
  runtime: { getURL: (path) => `safari-web-extension://${EXTENSION_HOST}${path}` },
  declarativeNetRequest: {
    updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => {
      ruleWrites.push(...addRules.map((rule) => rule.condition.urlFilter));
      rules = [...rules.filter((rule) => !removeRuleIds.includes(rule.id)), ...addRules];
    },
  },
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const requests = [];
globalThis.fetch = async (url) => {
  const { origin, pathname } = new URL(url);
  requests.push(`${origin}${pathname}`);
  if (origin === 'http://localhost:11434') {
    // Rule domains are matched in lowercase, so Safari's uppercase UUID has to be written lowercased.
    const rewritten = rules.some((rule) => rule.condition.urlFilter === `|${origin}/` &&
      rule.condition.initiatorDomains.includes(EXTENSION_HOST.toLowerCase()) && rule.action.requestHeaders[0].value === origin);
    if (!rewritten) return new Response('', { status: 403 });
    if (pathname === '/api/version') return json({ version: '0.30.10' });
    if (pathname === '/api/tags') return json({ models: [{ name: 'gemma4:12b' }] });
    if (pathname === '/api/show') return json({ capabilities: ['completion'], model_info: { 'gemma4.context_length': 8192 } });
  }
  if (origin === 'http://localhost:8080') {
    if (pathname === '/v1/models') return json({ data: [{ id: 'qwen3' }] });
    return json({ error: 'not found' }, 404);
  }
  throw new TypeError('Failed to fetch');
};
const { probeLocalServer, detectLocalServer } = await import(pathToFileURL(temporary).href);

test('an Ollama that refuses the extension origin on its version check is still found', async () => {
  const server = await probeLocalServer('http://localhost:11434');
  assert.equal(server.kind, 'ollama');
  assert.deepEqual(server.models.map((model) => model.id), ['gemma4:12b']);
  assert.deepEqual(rules.map((rule) => rule.condition.urlFilter), ['|http://localhost:11434/']);
});

test('probing every default address at once leaves the rule on the Ollama server', async () => {
  const server = await detectLocalServer();
  assert.equal(server.baseUrl, 'http://localhost:11434');
  // The OpenAI-compatible server answered its version check, so it never took the rule.
  assert.ok(requests.includes('http://localhost:8080/v1/models'));
  assert.deepEqual([...new Set(ruleWrites)], ['|http://localhost:11434/']);
  assert.deepEqual(rules.map((rule) => rule.condition.urlFilter), ['|http://localhost:11434/']);
});
