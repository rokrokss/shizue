import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';
import { defineConfig, type UserManifest } from 'wxt';
import packageJson from './package.json';

const { description } = packageJson;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',
  publicDir: 'src/public',
  entrypointsDir: 'entrypoints',
  manifestVersion: 3,
  manifest: ({ browser, manifestVersion, mode, command }) => {
    const manifest: UserManifest = {
      name: 'Shizue',
      description: description,
      action: {
        default_title: 'Shizue',
      },
      author: { email: 'q0115643@gmail.com' },
      permissions: ['storage', 'tabs', 'sidePanel', 'activeTab'],
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
    plugins: [svgr(), tailwindcss()],
  }),
});
