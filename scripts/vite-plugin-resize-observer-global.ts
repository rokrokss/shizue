import { PluginOption } from 'vite';

// resize-observer-polyfill (under antd) finds the global object by checking self.Math === Math and
// otherwise calls Function('return this')(). In a Firefox content script self is the page's window,
// whose Math is not the script's own, so it gets to Function(), which the extension's CSP blocks,
// and every content script with antd in it stops at load. globalThis is the same object anywhere.
export default function resizeObserverGlobalThis(): PluginOption {
  return {
    name: 'resize-observer-global-this',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!/[\\/]resize-observer-polyfill[\\/]dist[\\/]ResizeObserver(\.es)?\.js$/.test(id)) return;
      return code.replace("Function('return this')()", 'globalThis');
    },
  };
}
