import { build } from 'esbuild';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ids = process.argv.slice(2).filter((arg) => arg !== '--extension-id');
if (!ids.length || ids.some((id) => !/^[a-p]{32}$/.test(id))) {
  console.error('Usage: pnpm chatgpt:install --extension-id <ID from chrome://extensions> [other IDs]');
  process.exit(1);
}
if (!['darwin', 'linux'].includes(platform())) {
  console.error('The ChatGPT helper installer currently supports macOS and Linux.');
  process.exit(1);
}
const name = 'net.shizue.chatgpt';
const installation = join(homedir(), '.shizue', 'chatgpt-host');
await mkdir(installation, { recursive: true, mode: 0o700 });
await chmod(installation, 0o700);
const host = join(installation, 'host.mjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({ entryPoints: [join(root, 'native/chatgpt/host.mjs')], outfile: host, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
await chmod(host, 0o600);
const launcher = join(installation, 'launch');
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(host)} "$@"\n`, { mode: 0o700 });
await chmod(launcher, 0o700);
const profiles = platform() === 'darwin'
  ? ['Google/Chrome', 'Google/Chrome Beta', 'Google/Chrome Canary', 'Google/ChromeForTesting', 'Chromium', 'Microsoft Edge', 'BraveSoftware/Brave-Browser'].map((path) => join(homedir(), 'Library/Application Support', path))
  : ['google-chrome', 'google-chrome-beta', 'google-chrome-for-testing', 'chromium', 'microsoft-edge', 'BraveSoftware/Brave-Browser'].map((path) => join(homedir(), '.config', path));
const manifest = { name, description: 'Shizue Sign in with ChatGPT', path: launcher, type: 'stdio', allowed_origins: [...new Set(ids)].map((id) => `chrome-extension://${id}/`) };
for (const profile of profiles) {
  const directory = join(profile, 'NativeMessagingHosts');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${name}.json`), JSON.stringify(manifest, null, 2));
}
console.log(`ChatGPT helper installed for ${ids.join(', ')}. In Shizue, choose Sign in with ChatGPT and retry the connection.`);
