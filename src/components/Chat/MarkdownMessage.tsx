import { DotCycle } from '@/components/Loader/DotCycle';
import { useThemeValue } from '@/hooks/layout';
import { parseChartSpec } from '@/lib/chartSpec';
import { hasMath, prepareMath } from '@/lib/mathText';
import { seekVideo } from '@/lib/videoSeek';
import { formatVideoTime, linkVideoTimes } from '@/lib/videoTranscript';
import { CaretRightOutlined } from '@ant-design/icons';
import { createContext, lazy, Suspense, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
// The YouTube video an answer's #t=<seconds> links play.
const VideoContext = createContext<string | null>(null);

// Defined once, so a re-render keeps a drawn chart (and its table toggle) instead of mounting a
// new one; whether the answer is still coming arrives through StreamingContext.
const components: Components = {
  a: function Link({ node: _node, href, children, ...props }) {
    const video = useContext(VideoContext);
    const theme = useThemeValue();
    const { t } = useTranslation();
    const seconds = href?.startsWith('#t=') ? Number(href.slice(3)) : NaN;
    if (!video || !Number.isFinite(seconds)) {
      return (
        <a href={href} {...props}>
          {children}
        </a>
      );
    }
    return (
      <button
        type="button"
        title={t('chat.playFromTime', { time: formatVideoTime(seconds) })}
        onClick={() => void seekVideo(video, seconds).catch(() => {})}
        className={`sz:inline-flex sz:items-center sz:gap-0.5 sz:px-1.5 sz:rounded-full sz:text-xs sz:align-[1px] sz:cursor-pointer sz:border-0 ${
          theme == 'dark'
            ? 'sz:bg-[#32CCBC]/20 sz:text-[#7ee3d8]'
            : 'sz:bg-[#32CCBC]/15 sz:text-[#14806f]'
        }`}
      >
        <CaretRightOutlined />
        {children}
      </button>
    );
  },
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
// coming, an unfinished chart block shows as a loader instead of half-written JSON. In an answer
// about a YouTube `video`, [12:34] times play it from there.
const MarkdownMessage = ({
  content,
  streaming = false,
  video = null,
}: {
  content: string;
  streaming?: boolean;
  video?: string | null;
}) => {
  const math = hasMath(content);
  const [, setMathLoaded] = useState(Boolean(mathPlugins));

  useEffect(() => {
    if (math && !mathPlugins) void loadMath().then(() => setMathLoaded(true));
  }, [math]);

  const withMath = math && mathPlugins;
  const text = video ? linkVideoTimes(content) : content;
  return (
    <StreamingContext.Provider value={streaming}>
      <VideoContext.Provider value={video}>
        <Markdown
          remarkPlugins={[remarkGfm, remarkNoStrikethrough, ...(withMath ? mathPlugins!.remark : [])]}
          rehypePlugins={withMath ? mathPlugins!.rehype : []}
          components={components}
        >
          {withMath ? prepareMath(text) : text}
        </Markdown>
      </VideoContext.Provider>
    </StreamingContext.Provider>
  );
};

export default MarkdownMessage;
