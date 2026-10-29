import tailwindcss from '@tailwindcss/vite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';
import svgr from 'vite-plugin-svgr';
import { defineConfig, type UserManifest } from 'wxt';
import katexWoff2Only from './scripts/vite-plugin-katex-woff2';
import resizeObserverGlobalThis from './scripts/vite-plugin-resize-observer-global';
import toUtf8 from './scripts/vite-plugin-to-utf8';

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  srcDir: 'src',
  outDir: 'dist',
  publicDir: 'src/public',
  entrypointsDir: 'entrypoints',
  manifestVersion: 3,
  manifest: ({ browser, manifestVersion, mode, command }) => {
    const manifest: UserManifest = {
      name: '__MSG_extension_name__',
      description: '__MSG_extension_description__',
      action: {
        default_title: 'Shizue',
      },
      author: { email: 'q0115643@gmail.com' },
      // declarativeNetRequestWithHostAccess (no install warning) lets src/lib/localServer.ts rewrite
      // the Origin header that Ollama rejects, services/background/chatgpt.ts catch the ChatGPT
      // sign-in callback on 127.0.0.1, and plot-signin-rules.json pass Shizue Plot's callback on to
      // its site; such rules need host access to those addresses. The <all_urls> content scripts
      // already put every site under the install warning, so these add none.
      // WXT adds side_panel and the sidePanel permission for Chromium builds, and sidebar_action for
      // Firefox, from the sidepanel entrypoint.
      permissions: [
        'storage',
        'scripting',
        'activeTab',
        'contextMenus',
        'declarativeNetRequestWithHostAccess',
      ],
      // Asked for when the user first lists tab groups in the chat box's @ list, so the install
      // and update prompts stay as they are.
      optional_permissions: ['tabGroups'],
      // Reconnect the same web pages our declarative content scripts already run on.
      // This also covers the local model endpoints. chrome.tabs.captureVisibleTab needs <all_urls>
      // itself rather than http and https; the content scripts' <all_urls> already warns of it.
      host_permissions: ['<all_urls>'],
      default_locale: 'en',
      commands: {
        'toggle-sidepanel': {
          suggested_key: {
            default: 'Ctrl+Shift+E',
            mac: 'Command+Shift+E',
          },
          description: '__MSG_toggle_description__',
        },
      },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self'",
      },
      // Content scripts keep their CSS in shadow roots (cssInjectionMode: 'ui'). The only CSS
      // injected into pages is this @font-face file, since shadow roots ignore @font-face.
      content_scripts: [{ matches: ['<all_urls>'], css: ['fonts/fonts.css'] }],
      // Shizue Plot's sign-in (src/lib/plotSignIn.ts): static rules send OpenAI's loopback callback
      // for the site's port (47811, and 47801 for local development) on to the site, and the site
      // may ask whether Shizue is installed. Neither adds an install warning.
      declarative_net_request: {
        rule_resources: [{ id: 'plot_signin', enabled: true, path: 'plot-signin-rules.json' }],
      },
      externally_connectable: {
        matches: ['https://plot.shizue.net/*', 'http://localhost/*'],
      },
      web_accessible_resources: [
        { resources: ['fonts/*.woff2'], matches: ['<all_urls>'] },
        // A session rule redirects ChatGPT's loopback sign-in callback here, and redirects may only
        // target web-accessible pages. The page does nothing without the sign-in's state value.
        { resources: ['chatgpt-callback.html'], matches: ['<all_urls>'] },
      ],
    };
    if (browser === 'firefox') {
      // addons.mozilla.org keeps the extension under this ID for good. Firefox asks for the data
      // permissions at install, from 140 on desktop and 142 on Android, hence the minimum versions:
      // page text, its address and the chat go to the AI provider the user picks.
      manifest.browser_specific_settings = {
        gecko: {
          id: 'shizue@shizue.net',
          strict_min_version: '140.0',
          data_collection_permissions: {
            required: ['websiteContent', 'browsingActivity', 'personalCommunications'],
          },
        },
        gecko_android: { strict_min_version: '142.0' },
      } as UserManifest['browser_specific_settings'];
      // Firefox takes only a name here, and addons.mozilla.org shows the account's instead.
      delete manifest.author;
    }
    return manifest;
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.mode === 'development') {
        manifest.action.default_title += ' [DEV]';
      }
      // WXT treats Safari like Chromium here, but Safari has no side panel: the panel opens in a tab.
      if (wxt.config.browser === 'safari') {
        delete manifest.side_panel;
        manifest.permissions = manifest.permissions?.filter((permission) => permission !== 'sidePanel');
      }
    },
    // The character maps pdf.js needs for CJK PDFs whose fonts don't embed them (src/lib/pdfText.ts).
    'build:publicAssets': (wxt, files) => {
      const cmaps = resolve(wxt.config.root, 'node_modules/pdfjs-dist/cmaps');
      for (const name of readdirSync(cmaps)) {
        files.push({ absoluteSrc: resolve(cmaps, name), relativeDest: `pdfjs/cmaps/${name}` });
      }
      // fonts.css names its font by the extension's URL, whose scheme is Chrome's in the source.
      const scheme = ({ firefox: 'moz-extension', safari: 'safari-web-extension' } as Record<string, string>)[
        wxt.config.browser
      ];
      const fonts = files.find((file) => file.relativeDest === 'fonts/fonts.css');
      if (scheme && fonts && 'absoluteSrc' in fonts) {
        files[files.indexOf(fonts)] = {
          relativeDest: fonts.relativeDest,
          contents: readFileSync(fonts.absoluteSrc, 'utf8').replace(/url\('chrome-extension:\/\//g, `url('${scheme}://`),
        };
      }
    },
  },
  vite: () => ({
    plugins: [
      svgr(),
      tailwindcss(),
      katexWoff2Only(),
      resizeObserverGlobalThis(),
      visualizer({
        filename: './dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
      toUtf8(),
    ],
    build: {
      emptyOutDir: true,
      minify: 'terser',
      terserOptions: {
        format: {
          comments: false,
        },
      },
      rollupOptions: {
        treeshake: 'recommended',
        cache: true,
      },
      sourcemap: false,
    },
  }),
  i18n: {
    localesDir: 'src/locales',
  },
  // The sources zip that addons.mozilla.org asks for, whose build must match ours file for file.
  // Tailwind scans every file .gitignore leaves in, so without it a rebuild took classes from dist/.
  // doc/ holds only the README's GIFs (~97 MB).
  zip: {
    includeSources: ['**/*', '.gitignore'],
    excludeSources: ['doc/**'],
  },
});
