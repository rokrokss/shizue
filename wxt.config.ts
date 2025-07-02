import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import svgr from 'vite-plugin-svgr';
import { defineConfig, type UserManifest } from 'wxt';
import { viteStaticCopyPyodide } from './scripts/vite-plugin-pyodide-copy';
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
      author: { email: 'hello@shizue.ai' },
      permissions: ['storage', 'sidePanel', 'activeTab', 'contextMenus'],
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
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
      },
      web_accessible_resources: [
        {
          resources: ['pyodide/*', 'pyodide_packages/*'],
          matches: ['<all_urls>'],
        },
      ],
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
    optimizeDeps: {
      exclude: ['pyodide'],
    },
    plugins: [
      viteStaticCopyPyodide() as any,
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
  }),
  i18n: {
    localesDir: 'src/locales',
  },
});
