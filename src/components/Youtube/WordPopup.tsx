import {
  MESSAGE_LOOKUP_WORD,
  MESSAGE_SAVE_WORD,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
} from '@/config/constants';
import type { Language } from '@/hooks/language';
import { initWordsPageContent } from '@/lib/initPanelData';
import { sourceLink, type WordMeaning } from '@/lib/wordLookup';
import { panelService } from '@/services/panelService';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// What the caption overlay knows about the video whose words can be looked up.
export type WordLookup = {
  video: HTMLVideoElement | null;
  // A live stream keeps playing while a word is open.
  live: boolean;
  title: string;
  targetLanguage: Language;
};

// The word whose popup is open.
export type OpenWord = {
  word: string;
  // Which piece of which line, to mark it.
  line: number;
  piece: number;
  sentence: string;
  translation: string;
  // From the caption box's center to the popup's, keeping it inside the video.
  offset: number;
  width: number;
};

// How a closed popup leaves the video: played again now, after the click that closed it (which may
// itself play the video), or as it is.
export type CloseMode = 'resume' | 'resumeAfterClick' | 'keep';

// One lookup per word in its line and language, for this page.
const meanings = new Map<string, Promise<WordMeaning | null>>();

const lookUp = (open: OpenWord, targetLanguage: Language) => {
  const key = JSON.stringify([targetLanguage, open.word, open.sentence]);
  let meaning = meanings.get(key);
  if (!meaning) {
    meaning = chrome.runtime
      .sendMessage({
        action: MESSAGE_LOOKUP_WORD,
        word: open.word,
        sentence: open.sentence,
        translation: open.translation,
        targetLanguage,
      })
      .then((response) => (typeof response?.meaning === 'string' ? (response as WordMeaning) : null))
      .catch(() => null);
    meanings.set(key, meaning);
    // A failed lookup is asked again the next time.
    void meaning.then((result) => {
      if (!result) meanings.delete(key);
    });
  }
  return meaning;
};

// Clicks on the popup and on caption words stay ours: the player under them would pause, play or
// go fullscreen.
export const stopPlayerEvents = {
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerUp: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseUp: (e: React.SyntheticEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.SyntheticEvent) => e.stopPropagation(),
};

// Sizes in px: YouTube's root font size is 10px, which shrinks rem.
export const WordPopup = ({
  open,
  lookup,
  onClose,
}: {
  open: OpenWord;
  lookup: WordLookup;
  onClose: (mode: CloseMode) => void;
}) => {
  const { t } = useTranslation();
  // undefined while it is being looked up.
  const [meaning, setMeaning] = useState<WordMeaning | null>();
  const [saved, setSaved] = useState<'no' | 'saving' | 'yes' | 'failed'>('no');
  const popupRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let current = true;
    void lookUp(open, lookup.targetLanguage).then((result) => {
      if (current) setMeaning(result);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    // The overlay is in a closed shadow root, so a click's path from here shows only its host.
    const host = (popupRef.current?.getRootNode() as ShadowRoot | undefined)?.host;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current('resume');
    };
    const onClick = (e: MouseEvent) => {
      if (!host || !e.composedPath().includes(host)) onCloseRef.current('resumeAfterClick');
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  const save = async () => {
    if (!meaning) return;
    setSaved('saving');
    // A couple of seconds back, so the link starts before the line is spoken.
    const time = lookup.live || !lookup.video ? null : lookup.video.currentTime - 2;
    const response = await chrome.runtime
      .sendMessage({
        action: MESSAGE_SAVE_WORD,
        word: {
          word: open.word,
          ...meaning,
          sentence: open.sentence,
          sentenceTranslation: open.translation,
          sourceTitle: lookup.title,
          sourceUrl: sourceLink(location.href, time),
        },
      })
      .catch(() => null);
    setSaved(response?.status === 'success' ? 'yes' : 'failed');
  };

  const openWordList = () => {
    // Opening the panel has to happen within the click.
    void panelService.openPanel();
    void initWordsPageContent()
      .then(() => chrome.runtime.sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA }))
      .catch(() => {});
    onClose('keep');
  };

  const muted = 'sz:text-[rgba(255,255,255,0.62)]';
  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={open.word}
      {...stopPlayerEvents}
      onClick={(e) => e.stopPropagation()}
      className="sz:absolute sz:z-10 sz:pointer-events-auto sz:cursor-auto sz:text-left sz:rounded-[10px] sz:bg-[rgba(22,22,26,0.96)] sz:text-white sz:px-[14px] sz:py-[12px] sz:text-[14px] sz:leading-[1.45] sz:shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
      style={{
        bottom: 'calc(100% + 8px)',
        left: `calc(50% + ${open.offset}px)`,
        transform: 'translateX(-50%)',
        width: open.width,
      }}
    >
      <div className="sz:flex sz:items-baseline sz:gap-[8px]">
        <span className="sz:text-[20px] sz:font-semibold sz:break-all">{meaning?.lemma || open.word}</span>
        {meaning?.reading ? <span className={`sz:text-[13px] ${muted}`}>{meaning.reading}</span> : null}
        <button
          type="button"
          aria-label={t('words.close')}
          onClick={() => onClose('resume')}
          className={`sz:ml-auto sz:self-start sz:border-0 sz:bg-transparent sz:cursor-pointer sz:text-[20px] sz:leading-none sz:p-[2px] ${muted} sz:hover:text-white`}
        >
          ×
        </button>
      </div>
      {meaning === undefined ? (
        <div className={`sz:pt-[6px] sz:animate-pulse ${muted}`}>···</div>
      ) : meaning === null ? (
        <div className={`sz:pt-[6px] ${muted}`}>{t('words.lookupFailed')}</div>
      ) : (
        <>
          {meaning.partOfSpeech ? (
            <div className={`sz:text-[12px] ${muted}`}>
              {meaning.partOfSpeech}
              {meaning.lemma && meaning.lemma !== open.word ? ` · ${open.word}` : ''}
            </div>
          ) : null}
          <div className="sz:pt-[6px] sz:text-[16px]">{meaning.meaning}</div>
          {meaning.note ? <div className={`sz:pt-[4px] sz:text-[13px] ${muted}`}>{meaning.note}</div> : null}
          <div className="sz:pt-[10px] sz:text-[13px]">
            {saved === 'yes' ? (
              <span className={muted}>
                {t('words.saved')} ·{' '}
                <button
                  type="button"
                  onClick={openWordList}
                  className="sz:border-0 sz:bg-transparent sz:p-0 sz:cursor-pointer sz:text-[13px] sz:text-[#7ee3d8] sz:hover:underline"
                >
                  {t('words.openList')}
                </button>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saved === 'saving'}
                  onClick={() => void save()}
                  className="sz:border-0 sz:rounded-[6px] sz:px-[10px] sz:py-[5px] sz:cursor-pointer sz:text-[13px] sz:font-semibold sz:bg-[#32CCBC] sz:text-[#0b2b27] sz:hover:bg-[#4fd8ca] sz:disabled:opacity-60"
                >
                  {t('words.save')}
                </button>
                {saved === 'failed' ? (
                  <span className={`sz:pl-[8px] ${muted}`}>{t('words.saveFailed')}</span>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
