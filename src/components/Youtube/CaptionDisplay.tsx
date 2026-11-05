import {
  CloseMode,
  OpenWord,
  stopPlayerEvents,
  WordLookup,
  WordPopup,
} from '@/components/Youtube/WordPopup';
import type { Language } from '@/hooks/language';
import type { CaptionDisplayMode, CaptionStyle } from '@/hooks/layout';
import { translationAttributes } from '@/lib/language';
import { captionPieces } from '@/lib/wordLookup';
import { isYoutubeEmbed } from '@/lib/youtube';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

type CaptionDisplayProps = {
  lines: string[];
  // A line's original, or '' when the line is the only text (its translation hasn't come yet).
  originalLines: string[];
  display: CaptionDisplayMode;
  // The translations' language, for their lang and dir.
  targetLanguage: Language;
  captionStyle: CaptionStyle;
  captionSizeRatio: number;
  // In place of the size the window gives, e.g. one from the player's own height.
  fontSize?: string;
  // With it, the words of the original lines open their meaning.
  lookup?: WordLookup;
  // The word being said: characters start to end of originalLines[line].
  spoken?: { line: number; start: number; end: number } | null;
};

// The word being said, in the brand's teal over the caption's white.
const SPOKEN = { color: '#32CCBC' };

const POPUP_WIDTH = 300;
// The popup's distance from the video's sides.
const POPUP_EDGE = 8;

const BOX_CLASS = 'sz:px-2 sz:py-1 sz:inline-block sz:fill-white';
const BOX = { backgroundColor: 'rgba(8, 8, 8, 0.75)', color: '#fff' };
// The box of each line, and the translation's own look on top of it.
const CAPTION_STYLES: Record<CaptionStyle, { box: React.CSSProperties; translation?: React.CSSProperties }> = {
  default: { box: BOX },
  translucent: { box: { ...BOX, backgroundColor: 'rgba(8, 8, 8, 0.4)' } },
  outline: {
    box: { color: '#fff', textShadow: '0 0 0.08em #000, 0 0 0.08em #000, 0 0 0.12em #000, 0 0 0.12em #000' },
  },
  yellow: { box: BOX, translation: { color: '#ffe14d' } },
};

export const CaptionDisplay = ({
  lines,
  originalLines,
  display,
  targetLanguage,
  captionStyle,
  captionSizeRatio,
  fontSize: fixedFontSize,
  lookup,
  spoken,
}: CaptionDisplayProps) => {
  const [fontSize, setFontSize] = useState(`${2.4 * captionSizeRatio}vw`);
  const [open, setOpen] = useState<OpenWord | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Whether the open word paused the video, so closing it plays the video again.
  const pausedRef = useRef(false);
  const video = lookup?.video ?? null;

  useEffect(() => {
    const updateFontSize = () => {
      const width = window.innerWidth;
      if (isYoutubeEmbed()) {
        // An embed's window is its player: YouTube's own captions are 1/22.5 of a 16:9 video's height.
        setFontSize(`${(Math.min((width * 9) / 16, window.innerHeight) / 22.5) * captionSizeRatio}px`);
      } else if (width >= 1935) {
        setFontSize(`${28 * captionSizeRatio}px`);
      } else if (width >= 1015) {
        setFontSize(`${1.6 * captionSizeRatio}vw`);
      } else {
        setFontSize(`${2.4 * captionSizeRatio}vw`);
      }
    };

    updateFontSize();
    window.addEventListener('resize', updateFontSize);
    return () => window.removeEventListener('resize', updateFontSize);
  }, [captionSizeRatio]);

  // The viewer played the video again: the word is done with.
  useEffect(() => {
    if (!open || !video) return;
    const onPlay = () => {
      pausedRef.current = false;
      setOpen(null);
    };
    video.addEventListener('play', onPlay);
    return () => video.removeEventListener('play', onPlay);
  }, [open !== null, video]);

  const openWord = (
    e: React.MouseEvent<HTMLSpanElement>,
    word: string,
    line: number,
    piece: number
  ) => {
    e.stopPropagation();
    if (!lookup || !rootRef.current) return;
    // Over the word, kept inside the video (and the screen).
    const wordRect = e.currentTarget.getBoundingClientRect();
    const rootRect = rootRef.current.getBoundingClientRect();
    const videoRect = video?.getBoundingClientRect();
    const left = Math.max(0, videoRect?.left ?? 0) + POPUP_EDGE;
    const right = Math.min(window.innerWidth, videoRect?.right ?? window.innerWidth) - POPUP_EDGE;
    const width = Math.max(160, Math.min(POPUP_WIDTH, right - left));
    const center = Math.min(
      Math.max(wordRect.left + wordRect.width / 2, left + width / 2),
      right - width / 2
    );
    if (!lookup.live && video && !video.paused) {
      video.pause();
      pausedRef.current = true;
    }
    setOpen({
      word,
      line,
      piece,
      sentence: originalLines[line],
      translation: lines[line],
      offset: center - (rootRect.left + rootRect.width / 2),
      width,
    });
  };

  const close = useCallback(
    (mode: CloseMode) => {
      setOpen(null);
      const paused = pausedRef.current;
      pausedRef.current = false;
      if (!paused || mode === 'keep' || !video) return;
      // A click on the picture plays the video by itself on YouTube; playing it again would pause it.
      setTimeout(() => {
        if (video.paused) void video.play().catch(() => {});
      }, mode === 'resumeAfterClick' ? 300 : 0);
    },
    [video]
  );

  const originalLine = (index: number) => {
    const original = originalLines[index];
    const said = spoken?.line === index ? spoken : null;
    if (!lookup && !said) return original;
    let offset = 0;
    return captionPieces(original).map((piece, i) => {
      const start = offset;
      offset += piece.text.length;
      const style = said && piece.word && start < said.end && offset > said.start ? SPOKEN : undefined;
      if (!lookup || !piece.word) {
        return style ? <span key={i} style={style}>{piece.text}</span> : <Fragment key={i}>{piece.text}</Fragment>;
      }
      return (
        <span
          key={i}
          {...stopPlayerEvents}
          onClick={(e) => openWord(e, piece.text, index, i)}
          style={style}
          className={`sz:pointer-events-auto sz:cursor-pointer sz:rounded-[3px] ${
            open?.line === index && open.piece === i && open.sentence === original
              ? 'sz:underline sz:decoration-dotted sz:decoration-[#32CCBC] sz:decoration-[length:0.1em] sz:underline-offset-[0.2em]'
              : 'sz:hover:bg-white/25'
          }`}
        >
          {piece.text}
        </span>
      );
    });
  };

  return (
    <div ref={rootRef} className="sz:w-fit sz:relative" style={{ fontSize: fixedFontSize ?? fontSize }}>
      {lines.map((line, index) => {
        const look = CAPTION_STYLES[captionStyle] ?? CAPTION_STYLES.default;
        // The original's language isn't known, so the browser reads its direction from the text.
        const original = originalLines[index] ? (
          <div>
            <span className={BOX_CLASS} style={look.box} dir="auto">
              {originalLine(index)}
            </span>
          </div>
        ) : null;
        const translation = (
          <div>
            <span
              className={BOX_CLASS}
              style={original ? { ...look.box, ...look.translation } : look.box}
              {...(original ? translationAttributes(targetLanguage) : { dir: 'auto' })}
            >
              {line}
            </span>
          </div>
        );
        return (
          <Fragment key={index}>
            {display === 'original'
              ? original ?? translation
              : display === 'translation'
                ? translation
                : display === 'translationFirst'
                  ? <>{translation}{original}</>
                  : <>{original}{translation}</>}
          </Fragment>
        );
      })}
      {open && lookup ? (
        <WordPopup
          key={`${open.sentence}\n${open.line}\n${open.piece}`}
          open={open}
          lookup={lookup}
          onClose={close}
        />
      ) : null}
    </div>
  );
};
