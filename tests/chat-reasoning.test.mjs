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
const { getModelInstance, modelSupportsReasoningEffort } = await bundle('../src/lib/models.ts');

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
  assert.equal(modelSupportsReasoningEffort('claude-haiku'), false);
  assert.equal(modelSupportsReasoningEffort('gemma'), false);
  assert.equal(modelSupportsReasoningEffort('chatgpt:gpt-6.1-sol'), true);
  const server = { kind: 'ollama', baseUrl: 'http://localhost:11434', models: [
    { id: 'qwen3.5:9b', supportsImages: false, supportsThinking: true },
    { id: 'gemma4:12b', supportsImages: true, supportsThinking: false }] };
  assert.equal(modelSupportsReasoningEffort('local:qwen3.5:9b', server), true);
  assert.equal(modelSupportsReasoningEffort('local:gemma4:12b', server), false);
});
