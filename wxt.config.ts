import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import svgr from 'vite-plugin-svgr';
import { defineConfig, type UserManifest } from 'wxt';
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
      // the Origin header that Ollama rejects; such rules need host access to localhost. The
      // <all_urls> content scripts already put every site under the install warning, so these add
      // none.
      permissions: [
        'storage',
        'scripting',
        'nativeMessaging',
        'sidePanel',
        'activeTab',
        'contextMenus',
        'declarativeNetRequestWithHostAccess',
      ],
      // Reconnect the same web pages our declarative content scripts already run on.
      // This also covers the local model endpoints.
      host_permissions: ['http://*/*', 'https://*/*'],
      default_locale: 'en',
      side_panel: {
        default_path: 'sidepanel.html',
      },
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
      web_accessible_resources: [{ resources: ['fonts/*.woff2'], matches: ['<all_urls>'] }],
    };
    return manifest;
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.mode === 'development') {
        manifest.action.default_title += ' [DEV]';
      }
    },
  },
  vite: () => ({
    plugins: [
      svgr(),
      tailwindcss(),
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
});
