import SceneThumbnail from '@/components/Chat/SceneThumbnail';
import { DotCycle } from '@/components/Loader/DotCycle';
import { useThemeValue } from '@/hooks/layout';
import { parseChartSpec } from '@/lib/chartSpec';
import { hasMath, prepareMath } from '@/lib/mathText';
import { linkPageLines, pageLines } from '@/lib/pageLines';
import { seekPageLine } from '@/lib/pageSeek';
import { splitResearch } from '@/lib/research';
import { seekVideo } from '@/lib/videoSeek';
import { formatVideoTime, linkVideoTimes } from '@/lib/videoTranscript';
import { AimOutlined, CaretRightOutlined, GlobalOutlined } from '@ant-design/icons';
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
// The video an answer's #t=<seconds> links play, as a videoKey (lib/videoTranscript.ts), and its
// storyboard for the scenes at #s=<seconds> (a section's start).
const VideoContext = createContext<{ key: string; storyboard?: string } | null>(null);
// The summarized page an answer's #p=<line> links point into, and the prompt whose numbered lines
// they refer to (lib/pageLines.ts).
const PageContext = createContext<{ url: string; prompt: string } | null>(null);

const chipClass = (theme: string) =>
  `sz:inline-flex sz:items-center sz:gap-0.5 sz:px-1.5 sz:rounded-full sz:text-xs sz:align-[1px] sz:cursor-pointer sz:border-0 ${
    theme == 'dark' ? 'sz:bg-[#32CCBC]/20 sz:text-[#7ee3d8]' : 'sz:bg-[#32CCBC]/15 sz:text-[#14806f]'
  }`;

// Defined once, so a re-render keeps a drawn chart (and its table toggle) instead of mounting a
// new one; whether the answer is still coming arrives through StreamingContext.
const components: Components = {
  a: function Link({ node: _node, href, children, ...props }) {
    const video = useContext(VideoContext);
    const page = useContext(PageContext);
    const theme = useThemeValue();
    const { t } = useTranslation();
    const [, kind, value] = href?.match(/^#([tsp])=(\d+)$/) ?? [];
    if (kind === 'p' && page) {
      const line = pageLines(page.prompt).get(Number(value));
      if (!line) return null;
      return (
        <button
          type="button"
          title={line.trim().slice(0, 200)}
          onClick={() => void seekPageLine(page.url, line).catch(() => {})}
          className={chipClass(theme)}
        >
          <AimOutlined />
          {t('chat.inPage')}
        </button>
      );
    }
    if ((kind !== 't' && kind !== 's') || !video) {
      return (
        <a href={href} {...props}>
          {children}
        </a>
      );
    }
    const seconds = Number(value);
    const title = t('chat.playFromTime', { time: formatVideoTime(seconds) });
    const play = () => void seekVideo(video.key, seconds).catch(() => {});
    return (
      <>
        <button type="button" title={title} onClick={play} className={chipClass(theme)}>
          <CaretRightOutlined />
          {children}
        </button>
        {kind === 's' && video.storyboard ? (
          <SceneThumbnail
            storyboard={video.storyboard}
            seconds={seconds}
            title={title}
            onClick={play}
          />
        ) : null}
      </>
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
// about a YouTube or Netflix `video`, [12:34] times play it from there, and a section's time shows
// its scene when the video has a `storyboard`. In an answer about a summarized `page`, [¶12] line
// numbers select that line in the page. A detailed summary's external research goes in its own box.
const MarkdownMessage = ({
  content,
  streaming = false,
  video = null,
  storyboard,
  page = null,
}: {
  content: string;
  streaming?: boolean;
  video?: string | null;
  storyboard?: string;
  page?: { url: string; prompt: string } | null;
}) => {
  const math = hasMath(content);
  const [, setMathLoaded] = useState(Boolean(mathPlugins));
  const theme = useThemeValue();
  const { t } = useTranslation();

  useEffect(() => {
    if (math && !mathPlugins) void loadMath().then(() => setMathLoaded(true));
  }, [math]);

  const withMath = math && mathPlugins;
  const linked = page ? linkPageLines(content) : content;
  const { body, research } = splitResearch(video ? linkVideoTimes(linked) : linked, streaming);
  const markdown = (text: string) => (
    <Markdown
      remarkPlugins={[remarkGfm, remarkNoStrikethrough, ...(withMath ? mathPlugins!.remark : [])]}
      rehypePlugins={withMath ? mathPlugins!.rehype : []}
      components={components}
    >
      {withMath ? prepareMath(text) : text}
    </Markdown>
  );
  return (
    <StreamingContext.Provider value={streaming}>
      <VideoContext.Provider value={video ? { key: video, storyboard } : null}>
        <PageContext.Provider value={page}>
          {markdown(body)}
          {research !== null ? (
            <div
              className={`sz-research sz:mt-3 sz:rounded-lg sz:border sz:px-3 sz:pt-2 sz:pb-1 ${
                theme == 'dark'
                  ? 'sz:border-[#32CCBC]/40 sz:bg-[#32CCBC]/10'
                  : 'sz:border-[#32CCBC]/50 sz:bg-[#32CCBC]/5'
              }`}
            >
              <div className="sz:flex sz:flex-row sz:items-center sz:gap-1 sz:font-bold">
                <GlobalOutlined />
                {t('chat.externalResearch')}
              </div>
              <div className="sz:text-xs sz:text-gray-500">{t('chat.externalResearchNote')}</div>
              {research ? markdown(research) : streaming ? <DotCycle /> : null}
            </div>
          ) : null}
        </PageContext.Provider>
      </VideoContext.Provider>
    </StreamingContext.Provider>
  );
};

export default MarkdownMessage;
