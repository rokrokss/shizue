import { DotCycle } from '@/components/Loader/DotCycle';
import { parseChartSpec } from '@/lib/chartSpec';
import { hasMath, prepareMath } from '@/lib/mathText';
import { createContext, lazy, Suspense, useContext, useEffect, useState } from 'react';
import Markdown, { type Components, type ExtraProps, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChartBlock = lazy(() => import('@/components/Chat/ChartBlock'));

// Keep GFM but drop strikethrough, so "3~5일" style tildes render as plain text.
function remarkNoStrikethrough(this: { data: () => object }) {
  const data = this.data() as { micromarkExtensions?: unknown[] };
  (data.micromarkExtensions ||= []).push({ disable: { null: ['strikethrough'] } });
}

// KaTeX and its fonts load with the first answer that has math in it, not with the side panel.
let mathPlugins: {
  remark: NonNullable<Options['remarkPlugins']>;
  rehype: NonNullable<Options['rehypePlugins']>;
} | null = null;
const loadMath = async () => {
  const [remarkMath, rehypeKatex] = await Promise.all([
    import('remark-math'),
    import('rehype-katex'),
    import('katex/dist/katex.min.css'),
  ]);
  mathPlugins = {
    remark: [remarkMath.default],
    rehype: [[rehypeKatex.default, { throwOnError: false, strict: false }]],
  };
};

// The source of a ```chart block, or null for any other <pre>.
const codeText = (node: ExtraProps['node']) => {
  const code = node?.children[0];
  if (code?.type !== 'element' || code.tagName !== 'code') return null;
  const classes = code.properties.className;
  if (!Array.isArray(classes) || !classes.includes('language-chart')) return null;
  return code.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
};

const StreamingContext = createContext(false);

// Defined once, so a re-render keeps a drawn chart (and its table toggle) instead of mounting a
// new one; whether the answer is still coming arrives through StreamingContext.
const components: Components = {
  pre: function Pre({ node, children, ...props }) {
    const streaming = useContext(StreamingContext);
    const source = codeText(node);
    if (source === null) return <pre {...props}>{children}</pre>;
    const spec = parseChartSpec(source);
    if (spec) {
      return (
        <Suspense fallback={<DotCycle />}>
          <ChartBlock spec={spec} />
        </Suspense>
      );
    }
    return streaming ? <DotCycle /> : <pre {...props}>{children}</pre>;
  },
};

// An answer's Markdown, with TeX math and ```chart blocks drawn. While the answer is still
// coming, an unfinished chart block shows as a loader instead of half-written JSON.
const MarkdownMessage = ({ content, streaming = false }: { content: string; streaming?: boolean }) => {
  const math = hasMath(content);
  const [, setMathLoaded] = useState(Boolean(mathPlugins));

  useEffect(() => {
    if (math && !mathPlugins) void loadMath().then(() => setMathLoaded(true));
  }, [math]);

  const withMath = math && mathPlugins;
  return (
    <StreamingContext.Provider value={streaming}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkNoStrikethrough, ...(withMath ? mathPlugins!.remark : [])]}
        rehypePlugins={withMath ? mathPlugins!.rehype : []}
        components={components}
      >
        {withMath ? prepareMath(content) : content}
      </Markdown>
    </StreamingContext.Provider>
  );
};

export default MarkdownMessage;
