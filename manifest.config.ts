import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from './package.json';
const { version, description } = packageJson;

const [major, minor, patch, label = '0'] = version.replace(/[^\d.-]+/g, '').split(/[.-]/);

export default defineManifest(async (env) => ({
  name: env.mode === 'staging' ? '[INTERNAL] Animalese GPT' : 'Animalese GPT',
  description: description,
  version: `${major}.${minor}.${patch}.${label}`,
  version_name: version,
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: 'icon.png',
  },
  externally_connectable: { ids: ['*'] },
  manifest_version: 3,
  icons: {
    '16': 'images/icon-16.png',
    '32': 'images/icon-32.png',
    '48': 'images/icon-48.png',
    '128': 'images/icon-128.png',
  },
  permissions: [
    'storage',
    'unlimitedStorage',
    'contextMenus',
    'tabs',
    'activeTab',
    'clipboardWrite',
  ],
  background: {
    service_worker: 'src/background.ts',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*', '<all_urls>'],
      js: ['src/content.ts'],
    },
  ],
}));
