import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const bundle = async (entry) => {
  const outfile = fileURLToPath(new URL(`../.wxt/chat-reasoning-${randomUUID()}.mjs`, import.meta.url));
  await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], outfile, bundle: true,
    platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
  after(() => rm(outfile, { force: true }));
  return import(pathToFileURL(outfile).href);
};

const { chunkParts, thinkTagSplitter, thinkingSeconds } = await bundle('../src/lib/reasoning.ts');
const { effortWithin } = await bundle('../src/lib/reasoning.ts');
const { getModelInstance, modelSupportsReasoningEffort, defaultThinkingFor, reasoningEffortsFor } = await bundle('../src/lib/models.ts');

test('Thinking is read from where each provider puts it, apart from the answer', () => {
  // Anthropic thinking blocks.
  assert.deepEqual(chunkParts({ content: [{ type: 'thinking', thinking: 'Weighing it.' }], text: '' }),
    { text: '', reasoning: 'Weighing it.' });
  // Gemini thought parts are text blocks marked as thoughts.
  assert.deepEqual(chunkParts({ content: [{ type: 'text', text: 'Plan.', thought: true }, { type: 'text', text: 'Answer' }], text: 'Plan.Answer' }),
    { text: 'Answer', reasoning: 'Plan.' });
  // DeepSeek, Ollama and LM Studio.
  assert.deepEqual(chunkParts({ content: '', text: '', additional_kwargs: { reasoning_content: 'Hmm.' } }),
    { text: '', reasoning: 'Hmm.' });
  // OpenRouter's raw chunk.
  assert.deepEqual(chunkParts({ content: 'Hi', text: 'Hi', additional_kwargs: { __raw_response: { choices: [{ delta: { reasoning: 'Greet.' } }] } } }),
    { text: 'Hi', reasoning: 'Greet.' });
  // Plain answers are left as they were.
  assert.deepEqual(chunkParts({ content: [{ type: 'text', text: 'Hello' }], text: 'Hello' }), { text: 'Hello', reasoning: '' });
});

test('A leading <think> block becomes thinking, even split across deltas', () => {
  const split = thinkTagSplitter();
  const parts = ['  <thi', 'nk>Let me ', 'see.</th', 'ink>\n\n', 'Hello', ' there'].map(split);
  assert.equal(parts.map((p) => p.reasoning).join(''), 'Let me see.');
  assert.equal(parts.map((p) => p.text).join(''), 'Hello there');

  const empty = thinkTagSplitter();
  assert.equal(['<think></think>', '\n', 'Answer'].map(empty).map((p) => p.text).join(''), 'Answer');

  const plain = thinkTagSplitter();
  assert.equal(['No think ', 'here <think>'].map(plain).map((p) => p.text).join(''), 'No think here <think>');
  assert.equal(thinkingSeconds(200), 1);
  assert.equal(thinkingSeconds(12_400), 12);
});

test('The thinking effort maps onto each provider, and models without one take none', () => {
  const keys = { openaiKey: 'k', openrouterKey: 'k', anthropicKey: 'k', geminiKey: 'k' };
  const params = (modelName, reasoningEffort, connectionMode = 'direct') =>
    getModelInstance({ modelPreset: { modelName, connectionMode, ...keys }, streaming: true, reasoningEffort }).invocationParams();

  assert.equal(params('gpt', 'low').reasoning_effort, 'low');
  assert.equal(params('gpt-mini', 'low').reasoning_effort, 'none');
  assert.equal(params('gpt', 'high').reasoning_effort, 'high');
  assert.equal(params('gpt', undefined).reasoning_effort, undefined);

  assert.equal(params('gpt', 'high', 'openrouter').reasoning.effort, 'high');
  assert.equal(params('deepseek-flash', 'low', 'openrouter').reasoning.enabled, false);
  assert.equal(params('deepseek-pro', undefined, 'openrouter').reasoning.effort, 'high');

  const high = params('claude-sonnet', 'high');
  assert.deepEqual(high.thinking, { type: 'adaptive', display: 'summarized' });
  assert.equal(high.output_config?.effort ?? high.outputConfig?.effort, 'high');
  assert.equal(high.max_tokens, 32_000);
  const low = params('claude-sonnet', 'low');
  assert.equal(low.output_config?.effort ?? low.outputConfig?.effort, 'low');
  assert.ok(!low.thinking || low.thinking.type === 'disabled', JSON.stringify(low.thinking));

  assert.equal(modelSupportsReasoningEffort('gpt'), true);
  assert.equal(modelSupportsReasoningEffort('claude-haiku'), true);
  assert.equal(modelSupportsReasoningEffort('gemma'), false);
  assert.equal(modelSupportsReasoningEffort('chatgpt:gpt-6.1-sol'), true);
  const server = { kind: 'ollama', baseUrl: 'http://localhost:11434', models: [
    { id: 'qwen3.5:9b', supportsImages: false, supportsThinking: true },
    { id: 'gemma4:12b', supportsImages: true, supportsThinking: false }] };
  assert.equal(modelSupportsReasoningEffort('local:qwen3.5:9b', server), true);
  assert.equal(modelSupportsReasoningEffort('local:gemma4:12b', server), false);
});

test('Models the list sets to think by default think at the medium effort, with the thinking shown', () => {
  const keys = { openaiKey: 'k', openrouterKey: 'k', anthropicKey: 'k', geminiKey: 'k' };
  const params = (modelName, options, connectionMode = 'direct') =>
    getModelInstance({ modelPreset: { modelName, connectionMode, ...keys }, streaming: true, ...options }).invocationParams({});

  // A ChatGPT account model follows the OpenAI slot with the same model.
  const models = ['gpt', 'gpt-astra', 'chatgpt:gpt-6.1-sol', 'chatgpt:gpt-6-astra', 'gemini-argon', 'claude-opus', 'claude-fable', 'deepseek-pro',
    'gpt-terra', 'claude-sonnet', 'gemini-flash', 'chatgpt:gpt-6.1-terra', 'chatgpt:unknown', 'local:qwen3.5:9b'];
  assert.deepEqual(models.map(defaultThinkingFor), ['medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'high', 'high',
    undefined, undefined, undefined, undefined, undefined, undefined]);

  // What each provider is sent at those efforts.
  assert.equal(params('gpt-astra', { reasoningEffort: 'medium' }).reasoning_effort, 'medium');
  assert.equal(params('gemini-argon', { reasoningEffort: 'medium' }, 'openrouter').reasoning.effort, 'medium');
  assert.equal(params('claude-opus', { reasoningEffort: 'high' }, 'openrouter').reasoning.effort, 'high');
  const fable = params('claude-fable', { reasoningEffort: 'high' });
  assert.deepEqual(fable.thinking, { type: 'adaptive', display: 'summarized' });
  // Opus 5.5's own default is medium: it thinks there, and the thinking is shown.
  const opus = params('claude-opus', { reasoningEffort: 'medium' });
  assert.deepEqual([opus.output_config?.effort ?? opus.outputConfig?.effort, opus.thinking, opus.max_tokens],
    ['medium', { type: 'adaptive', display: 'summarized' }, 32_000]);
  assert.deepEqual(params('gemini-argon', { reasoningEffort: 'medium' }).generationConfig.thinkingConfig, { includeThoughts: true, thinkingLevel: 'MEDIUM' });

  // Argon and 3.8 Flash have no 'minimal': their fast calls think at low, with no thoughts mixed into the text.
  assert.deepEqual(params('gemini-argon', { fast: true, streaming: false }).generationConfig.thinkingConfig, { includeThoughts: false, thinkingLevel: 'LOW' });
  assert.deepEqual(params('gemini-flash', { fast: true, streaming: false }).generationConfig.thinkingConfig, { includeThoughts: false, thinkingLevel: 'LOW' });
  assert.deepEqual(params('gemini-flash-lite', { fast: true, streaming: false }).generationConfig.thinkingConfig, { includeThoughts: false, thinkingLevel: 'MINIMAL' });
  assert.deepEqual(params('gemma', { streaming: false }).generationConfig.thinkingConfig, { includeThoughts: false, thinkingLevel: 'MINIMAL' });
});

test('Extra and Max are offered only for the models that take them, and a choice above a model runs at its highest', () => {
  const keys = { openaiKey: 'k', openrouterKey: 'k', anthropicKey: 'k', geminiKey: 'k' };
  const params = (modelName, reasoningEffort, connectionMode = 'direct') =>
    getModelInstance({ modelPreset: { modelName, connectionMode, ...keys }, streaming: true, reasoningEffort }).invocationParams({});
  const all = ['low', 'medium', 'high', 'xhigh', 'max'];
  const base = ['low', 'medium', 'high'];
  const server = { kind: 'ollama', baseUrl: 'http://localhost:11434', models: [{ id: 'qwen3.5:9b', supportsImages: false, supportsThinking: true }] };
  for (const [model, efforts] of [
    ['gpt', all], ['gpt-astra', all], ['gpt-terra', all], ['gpt-mini', all],
    ['claude-fable', all], ['claude-opus', all], ['claude-sonnet', all], ['claude-haiku', all],
    ['chatgpt:gpt-6.1-sol', all], ['chatgpt:unknown', base],
    ['deepseek-pro', ['low', 'medium', 'high', 'max']], ['deepseek-flash', ['low', 'medium', 'high', 'max']],
    ['gemini-argon', base], ['gemini-flash', base], ['gemini-flash-lite', base], ['gemma', []],
    ['local:qwen3.5:9b', base],
  ]) assert.deepEqual(reasoningEffortsFor(model, server), efforts, model);

  // The choice stays; each model runs at the highest of its efforts at or below it.
  assert.equal(effortWithin('max', all), 'max');
  assert.equal(effortWithin('max', base), 'high');
  assert.equal(effortWithin('xhigh', ['low', 'medium', 'high', 'max']), 'high');
  assert.equal(effortWithin('medium', base), 'medium');

  // What each provider is sent.
  assert.equal(params('gpt', 'xhigh').reasoning_effort, 'xhigh');
  assert.equal(params('gpt-mini', 'max').reasoning_effort, 'max');
  assert.equal(params('claude-opus', 'max', 'openrouter').reasoning.effort, 'max');
  assert.equal(params('deepseek-pro', 'max', 'openrouter').reasoning.effort, 'max');
  const max = params('claude-sonnet', 'max');
  assert.deepEqual([max.output_config?.effort ?? max.outputConfig?.effort, max.thinking, max.max_tokens],
    ['max', { type: 'adaptive', display: 'summarized' }, 64_000]);
  const xhigh = params('claude-haiku', 'xhigh');
  assert.deepEqual([xhigh.output_config?.effort ?? xhigh.outputConfig?.effort, xhigh.max_tokens], ['xhigh', 64_000]);
});
