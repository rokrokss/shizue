import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Animal Crossing GPT',
  version: '0.0.1',
  description:
    'A simple Chrome extension featuring Animal Crossing characters for ChatGPT interactions.',
  action: {
    default_popup: 'index.html',
    default_icon: 'icon.png',
  },
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content.js'],
    },
  ],
  permissions: ['storage', 'tabs'],
});
