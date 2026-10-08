import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

// A signed-in account in chrome.storage.local, and OpenAI's model catalog and Responses stream.
async function withChatGPT(entry, { models, respond }, run) {
  const temporary = fileURLToPath(new URL(`../.wxt/chatgpt-adapter-${randomUUID()}.mjs`, import.meta.url));
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const items = { CHATGPT_CREDENTIALS: {
    hostId: 'urn:uuid:test', activeId: 'oaiapp_test',
    accounts: [{ clientId: 'oaiapp_test', subject: 'user', label: 'user@example.com', tokens: {
      accessToken: 'access', refreshToken: 'refresh', scope: 'chatgpt.tokens.use.direct', expiresAt: Date.now() + 3_600_000,
    } }],
  } };
  globalThis.chrome = { storage: { local: {
    get: async (key) => ({ [key]: structuredClone(items[key]) }),
    set: async (values) => { Object.assign(items, structuredClone(values)); },
  } } };
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer access');
    if (String(url) === 'https://api.openai.com/v1/models') {
      return Response.json({ models: models.map((slug) => ({ slug, display_name: slug, visibility: 'list' })) });
    }
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    const { events, close = true } = respond(JSON.parse(options.body), options.signal);
    const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      if (close) controller.close();
      options.signal.addEventListener('abort', () => controller.error(options.signal.reason));
    } }));
  };
  try {
    await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    await run(await import(pathToFileURL(temporary).href));
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
    await rm(temporary, { force: true });
  }
}

test('the existing model interface streams/invokes with usage, cancellation and late quota failure', async () => {
  const calls = [];
  let mode = 'success';
  let lastSignal;
  const respond = (body, signal) => {
    calls.push(body);
    lastSignal = signal;
    const hello = { type: 'response.output_text.delta', delta: 'Hello ' };
    if (mode === 'wait') return { events: [hello], close: false };
    if (mode === 'quota') return { events: [hello, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }] };
    return { events: [hello, { type: 'response.output_text.delta', delta: 'world' }, { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } }] };
  };
  await withChatGPT('../src/lib/chatgptModel.ts', { models: ['account-model'], respond }, async ({ ChatGPTPlanModel }) => {
    const model = new ChatGPTPlanModel('account-model', false);
    const reply = await model.invoke([new SystemMessage('Be helpful'), new HumanMessage('Hi')]);
    assert.equal(reply.text, 'Hello world');
    assert.equal(reply.usage_metadata.total_tokens, 12);
    assert.equal(calls[0].model, 'account-model');
    assert.equal(calls[0].instructions, 'Be helpful');
    assert.equal('temperature' in calls[0], false);
    let aggregate;
    for await (const chunk of await model.stream([new HumanMessage('Hi')])) aggregate = aggregate ? aggregate.concat(chunk) : chunk;
    assert.equal(aggregate.text, 'Hello world');
    assert.equal(aggregate.usage_metadata.input_tokens, 10);
    mode = 'quota';
    await assert.rejects(model.invoke([new HumanMessage('Hi')]), /ChatGPT plan usage limit.*settings\/usage/);
    mode = 'wait';
    const controller = new AbortController();
    const stream = await model.stream([new HumanMessage('Hi')], { signal: controller.signal });
    const consume = (async () => { for await (const _chunk of stream) controller.abort(); })();
    await assert.rejects(consume, /cancel|abort/i);
    assert.equal(lastSignal.aborted, true);
    // A model the account doesn't offer never reaches the Responses API.
    const requests = calls.length;
    await assert.rejects(new ChatGPTPlanModel('other-model', false).invoke([new HumanMessage('Hi')]), /unavailable/);
    assert.equal(calls.length, requests);
  });
});

test('ChatGPT translations carry model-specific effort through the factory and request body', async () => {
  const requests = [];
  const respond = (body) => {
    requests.push(body);
    return { events: [{ type: 'response.output_text.delta', delta: '{"translation":"안녕하세요"}' }, { type: 'response.completed', response: {} }] };
  };
  const models = ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra', 'unknown-account-model'];
  await withChatGPT('../src/lib/models.ts', { models, respond }, async ({ getModelInstance }) => {
    for (const [modelName, effort] of [
      ['chatgpt:gpt-6.1-sol', 'low'],
      ['chatgpt:gpt-6-luna', 'none'],
      ['chatgpt:gpt-6-astra', 'low'],
      ['chatgpt:unknown-account-model', undefined],
    ]) {
      // Both ordinary and JSON translations use the same fast setting. Provider preference
      // must not reroute a ChatGPT model through an API-key provider.
      for (const connectionMode of ['direct', 'openrouter']) {
        for (const fast of [true, false, undefined]) {
          for (const jsonSchema of [undefined, { type: 'object' }]) {
            const model = getModelInstance({ modelPreset: { modelName, connectionMode }, fast, jsonSchema, temperature: 0.3, maxTokens: 2000 });
            const reply = await model.invoke([new SystemMessage('Translate into Korean.'), new HumanMessage('Hello')]);
            assert.equal(reply.text, '{"translation":"안녕하세요"}');
            const request = requests.at(-1);
            assert.equal(request.model, modelName.slice('chatgpt:'.length));
            assert.deepEqual(request.reasoning, fast && effort ? { effort } : undefined);
            assert.equal(Object.hasOwn(request, 'reasoning'), Boolean(fast && effort));
            assert.equal(request.instructions.includes('JSON object'), Boolean(jsonSchema));
            assert.equal(Object.hasOwn(request, 'temperature'), false);
            assert.equal(Object.hasOwn(request, 'max_output_tokens'), false);
            assert.equal(request.store, false);
            assert.equal(request.stream, true);
          }
        }
      }
    }
  });
});
