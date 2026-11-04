import type { CaptionDisplayMode } from '@/hooks/layout';

export type MeetingCardRow = {
  id: string;
  speaker: string;
  original: string;
  // undefined while it is translated, null when there is none (shown as the original).
  translation: string | null | undefined;
  // The words still being said.
  interim?: boolean;
};

// The translated captions of a meeting, over the site's own caption box (lib/meetingCaptions):
// the last few lines, each under its speaker, in the caption display mode the viewer picked.
const MeetingCaptionCard = ({
  rows,
  display,
  sizeRatio,
  notice,
}: {
  rows: MeetingCardRow[];
  display: CaptionDisplayMode;
  sizeRatio: number;
  // Shown instead of lines while there are none: waiting for captions, or why they can't be read.
  notice: string | null;
}) => {
  const main = Math.round(17 * sizeRatio);
  const small = Math.round(13 * sizeRatio);
  return (
    <div
      className="sz:font-ycom sz:flex sz:flex-col sz:gap-2 sz:rounded-xl sz:bg-black/75 sz:px-4 sz:py-2.5 sz:text-white sz:shadow-lg sz:ring-1 sz:ring-white/10 sz:backdrop-blur-md"
      style={{ maxHeight: `${main * 9}px`, overflow: 'hidden' }}
    >
      {rows.length === 0 && notice ? (
        <div className="sz:flex sz:items-center sz:gap-2 sz:text-white/70" style={{ fontSize: `${small}px` }}>
          <span className="sz-meeting-pulse sz:inline-block sz:h-1.5 sz:w-1.5 sz:shrink-0 sz:rounded-full sz:bg-[#32CCBC]" />
          {notice}
        </div>
      ) : null}
      {rows.map((row, index) => {
        const translated = row.translation ?? null;
        const pending = row.translation === undefined;
        const showOriginal = display === 'bilingual' || display === 'translationFirst' || display === 'original';
        const showTranslation = display !== 'original';
        // Until its translation arrives, a line shows its original, dimmed.
        const primary = showTranslation ? translated ?? row.original : row.original;
        const secondary = showTranslation && showOriginal && translated ? row.original : null;
        const sameSpeaker = index > 0 && rows[index - 1].speaker === row.speaker;
        const primaryLine = (
          <div
            dir="auto"
            className={`sz:leading-snug sz:break-words sz:transition-opacity sz:duration-300 ${
              pending || row.interim ? 'sz:opacity-60' : 'sz:opacity-100'
            }`}
            style={{ fontSize: `${main}px` }}
          >
            {primary}
            {row.interim ? <span className="sz-meeting-caret sz:ml-0.5 sz:text-[#32CCBC]">▍</span> : null}
          </div>
        );
        const secondaryLine = secondary ? (
          <div dir="auto" className="sz:leading-snug sz:break-words sz:text-white/55" style={{ fontSize: `${small}px` }}>
            {secondary}
          </div>
        ) : null;
        return (
          <div key={row.id} className="sz-meeting-row sz:flex sz:flex-col sz:gap-0.5">
            {row.speaker && !sameSpeaker ? (
              <div
                className="sz:font-semibold sz:text-[#32CCBC] sz:truncate"
                style={{ fontSize: `${Math.max(11, small - 1)}px` }}
              >
                {row.speaker}
              </div>
            ) : null}
            {display === 'bilingual' ? (
              <>
                {secondaryLine}
                {primaryLine}
              </>
            ) : (
              <>
                {primaryLine}
                {secondaryLine}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

// The card's animations: its shadow root has Tailwind only.
export const MEETING_CARD_CSS = `
.sz-meeting-row { animation: sz-meeting-in 220ms ease-out; }
.sz-meeting-pulse { animation: sz-meeting-pulse 1.4s ease-in-out infinite; }
.sz-meeting-caret { animation: sz-meeting-pulse 1s steps(2, start) infinite; }
@keyframes sz-meeting-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes sz-meeting-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) {
  .sz-meeting-row, .sz-meeting-pulse, .sz-meeting-caret { animation: none; }
}
`;

export default MeetingCaptionCard;
