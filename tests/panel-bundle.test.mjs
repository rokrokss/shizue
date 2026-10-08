import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

test('opening a new chat does not eagerly load charts, secondary screens, Markdown or every locale', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { metafile } = await build({
    absWorkingDir: root,
    entryPoints: ['src/entrypoints/sidepanel/main.tsx'], outdir: '.wxt/panel-bundle-check',
    bundle: true, splitting: true, format: 'esm', platform: 'browser',
    write: false, metafile: true, logLevel: 'silent',
    loader: { '.png': 'dataurl', '.css': 'empty' },
    plugins: [{ name: 'svg-fixture', setup(builder) {
      builder.onLoad({ filter: /\.svg$/ }, () => ({ contents: 'export default () => null;' }));
    } }],
  });
  const outputs = metafile.outputs;
  const entry = Object.keys(outputs).find(path => outputs[path].entryPoint === 'src/entrypoints/sidepanel/main.tsx');
  assert.ok(entry);
  const eagerInputs = new Set(), visited = new Set();
  function walk(path) {
    if (visited.has(path)) return;
    visited.add(path);
    for (const input of Object.keys(outputs[path].inputs)) eagerInputs.add(input);
    for (const dependency of outputs[path].imports) {
      if (dependency.kind !== 'import-statement' || dependency.external) continue;
      walk(dependency.path in outputs ? dependency.path : join(dirname(path), dependency.path));
    }
  }
  walk(entry);
  const eager = [...eagerInputs].join('\n');
  assert.match(eager, /components\/Chat\/ChatInput\.tsx/);
  assert.match(eager, /components\/Chat\/ChatGreeting\.tsx/);
  assert.doesNotMatch(eager, /recharts|react-markdown|remark-gfm|src\/locales\//);
  for (const feature of ['TokenUsageModalContent', 'ThreadListModalContent', 'SettingsModalContent',
    'components/Memo/index.tsx', 'Onboarding/Onboarding.tsx']) {
    assert.ok(!eager.includes(feature), `${feature} is back in the initial chat bundle`);
    assert.ok(Object.keys(metafile.inputs).some(path => path.includes(feature)), `${feature} must remain available on demand`);
  }
});
