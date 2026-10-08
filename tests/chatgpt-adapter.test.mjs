import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { responseRequestBody } from '../native/chatgpt/responses.mjs';

test('the existing model interface streams/invokes with usage, cancellation and late quota failure', async () => {
  const temporary = fileURLToPath(new URL(`../.wxt/chatgpt-adapter-${randomUUID()}.mjs`, import.meta.url));
  const originalChrome = globalThis.chrome;
  const listeners = [];
  const calls = [];
  let mode = 'success';
  const port = {
    onMessage: { addListener: (listener) => listeners.push(listener) },
    onDisconnect: { addListener: () => {} },
    postMessage: (request) => {
      calls.push(request);
      if (request.operation === 'cancel') return;
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({ id: request.id, event: { delta: 'Hello ' } });
          if (mode === 'wait') continue;
          if (mode === 'quota') {
            listener({ id: request.id, error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'quota' } });
          } else {
            listener({ id: request.id, event: { delta: 'world' } });
            listener({ id: request.id, event: { usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } });
            listener({ id: request.id, result: { completed: true } });
          }
        }
      });
    },
  };
  globalThis.chrome = { runtime: { connectNative: () => port }, storage: { local: { set: async () => {} } } };
  try {
    await build({ entryPoints: [fileURLToPath(new URL('../src/lib/chatgptModel.ts', import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const { ChatGPTPlanModel } = await import(pathToFileURL(temporary).href);
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
    assert.equal(calls.at(-1).operation, 'cancel');
  } finally { globalThis.chrome = originalChrome; await rm(temporary, { force: true }); }
});

test('ChatGPT translations carry model-specific effort through the factory and native request body', async () => {
  const temporary = fileURLToPath(new URL(`../.wxt/chatgpt-effort-${randomUUID()}.mjs`, import.meta.url));
  const originalChrome = globalThis.chrome;
  const listeners = [];
  const requests = [];
  globalThis.chrome = { runtime: { connectNative: () => ({
    onMessage: { addListener: (listener) => listeners.push(listener) },
    onDisconnect: { addListener() {} },
    postMessage(request) {
      if (request.operation === 'cancel') return;
      requests.push(responseRequestBody(request));
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({ id: request.id, event: { delta: '{"translation":"안녕하세요"}' } });
          listener({ id: request.id, result: { completed: true } });
        }
      });
    },
  }) } };
  try {
    await build({ entryPoints: [fileURLToPath(new URL('../src/lib/models.ts', import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const { getModelInstance } = await import(pathToFileURL(temporary).href);
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
  } finally { globalThis.chrome = originalChrome; await rm(temporary, { force: true }); }
});
