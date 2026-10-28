import { PluginOption } from 'vite';

// KaTeX's stylesheet offers every font as woff2, woff and ttf, and Vite copies all three into the
// build. Chrome only ever loads the woff2, so the other two are taken out of the stylesheet first.
export default function katexWoff2Only(): PluginOption {
  return {
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!/[\\/]katex[\\/]dist[\\/]katex(\.min)?\.css$/.test(id)) return;
      return code.replace(
        /,url\([^)]+\.woff\) format\("woff"\),url\([^)]+\.ttf\) format\("truetype"\)/g,
        ''
      );
    },
  };
}
