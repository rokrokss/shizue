import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

test('panel loads only its selected locale and fallback, then loads language changes on demand', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('../.wxt/panel-locales-', import.meta.url)));
  try {
    const entry = fileURLToPath(new URL('../src/i18n/index.ts', import.meta.url));
    await build({ entryPoints: [entry], outdir: directory, bundle: true, splitting: true,
      platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const { default: i18n, initI18n } = await import(pathToFileURL(join(directory, 'index.js')).href);
    assert.equal(i18n.isInitialized, undefined);
    const ready = initI18n('ko');
    assert.equal(initI18n('ko'), ready, 'concurrent initialization must share one load');
    await ready;
    assert.deepEqual(Object.keys(i18n.services.resourceStore.data).sort(), ['en', 'ko']);
    const korean = JSON.parse(await readFile(new URL('../src/locales/ko.json', import.meta.url), 'utf8'));
    assert.equal(i18n.t('chat.greeting'), korean.chat.greeting);

    await i18n.changeLanguage('ja');
    assert.deepEqual(Object.keys(i18n.services.resourceStore.data).sort(), ['en', 'ja', 'ko']);
    const japanese = JSON.parse(await readFile(new URL('../src/locales/ja.json', import.meta.url), 'utf8'));
    assert.equal(i18n.t('chat.greeting'), japanese.chat.greeting);
    await i18n.changeLanguage('ko');
    assert.equal(i18n.t('chat.greeting'), korean.chat.greeting);
    assert.deepEqual(Object.keys(i18n.services.resourceStore.data).sort(), ['en', 'ja', 'ko']);
    for (const language of i18n.options.supportedLngs.filter(code => code !== 'cimode')) {
      await i18n.changeLanguage(language);
      assert.ok(i18n.hasResourceBundle(language, 'translation'), `${language} did not load`);
      const messages = JSON.parse(await readFile(new URL(`../src/locales/${language}.json`, import.meta.url), 'utf8'));
      assert.equal(i18n.t('chat.greeting'), messages.chat.greeting);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
