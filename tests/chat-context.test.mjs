import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const temporary = fileURLToPath(new URL(`../.wxt/chat-context-${randomUUID()}.mjs`, import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../src/lib/prompts.ts', import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
after(() => rm(temporary, { force: true }));
const { getInitialSystemMessage } = await import(pathToFileURL(temporary).href);

const lang = 'Korean_한국어';
const base = getInitialSystemMessage(lang);

test('without custom instructions the system message is unchanged', () => {
  assert.equal(getInitialSystemMessage(lang, undefined), base);
  assert.equal(getInitialSystemMessage(lang, ''), base);
  assert.equal(getInitialSystemMessage(lang, ' \n\t '), base);
  assert.ok(!base.includes('custom instructions'));
});

test('custom instructions follow the default rules, trimmed and delimited', () => {
  const message = getInitialSystemMessage(lang, '\n  Always answer in English.\nKeep it under three lines.  \n');
  assert.ok(message.startsWith(`${base}\n5) `));
  assert.ok(message.endsWith(
    '===custom instructions===\nAlways answer in English.\nKeep it under three lines.\n===end of custom instructions==='
  ));
});

test('the current request still outranks custom instructions', () => {
  const message = getInitialSystemMessage(lang, 'Always answer in a table.');
  assert.match(message, /take precedence over rules 1-4, but not over the instructions of the current request/);
});
