import {
  CloseMode,
  OpenWord,
  stopPlayerEvents,
  WordLookup,
  WordPopup,
} from '@/components/Youtube/WordPopup';
import { captionPieces } from '@/lib/wordLookup';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

type CaptionDisplayProps = {
  lines: string[];
  originalLines: string[];
  bilingual: boolean;
  captionSizeRatio: number;
  // With it, the words of the original lines open their meaning.
  lookup?: WordLookup;
};

const POPUP_WIDTH = 300;
// The popup's distance from the video's sides.
const POPUP_EDGE = 8;

export const CaptionDisplay = ({
  lines,
  originalLines,
  bilingual,
  captionSizeRatio,
  lookup,
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
      if (width >= 1935) {
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
    if (!lookup) return original;
    return captionPieces(original).map((piece, i) =>
      piece.word ? (
        <span
          key={i}
          {...stopPlayerEvents}
          onClick={(e) => openWord(e, piece.text, index, i)}
          className={`sz:pointer-events-auto sz:cursor-pointer sz:rounded-[3px] ${
            open?.line === index && open.piece === i && open.sentence === original
              ? 'sz:underline sz:decoration-dotted sz:decoration-[#32CCBC] sz:decoration-[length:0.1em] sz:underline-offset-[0.2em]'
              : 'sz:hover:bg-white/25'
          }`}
        >
          {piece.text}
        </span>
      ) : (
        <Fragment key={i}>{piece.text}</Fragment>
      )
    );
  };

  return (
    <div ref={rootRef} className="sz:w-fit sz:relative" style={{ fontSize }}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {bilingual && originalLines[index] && (
            <div>
              <span className="sz:px-2 sz:py-1 sz:inline-block sz:bg-[rgba(8,8,8,0.75)] sz:text-white sz:fill-white">
                {originalLine(index)}
              </span>
            </div>
          )}
          <div>
            <span className="sz:px-2 sz:py-1 sz:inline-block sz:bg-[rgba(8,8,8,0.75)] sz:text-white sz:fill-white">
              {line}
            </span>
          </div>
        </Fragment>
      ))}
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
