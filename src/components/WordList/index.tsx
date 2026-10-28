import Footer from '@/components/Footer';
import { useThemeValue } from '@/hooks/layout';
import { deleteWord, listWords, type SavedWord } from '@/lib/indexDB';
import { youtubeVideoId } from '@/lib/videoTranscript';
import { localDate, wordListCsv } from '@/lib/wordLookup';
import { debugLog } from '@/logs';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LinkOutlined,
  YoutubeOutlined,
} from '@ant-design/icons';
import { Input, Tooltip } from 'antd';
import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// The caption line with the saved word in bold.
const Sentence = ({ sentence, word }: { sentence: string; word: string }) => {
  const at = word ? sentence.indexOf(word) : -1;
  if (at === -1) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at)}
      <b>{word}</b>
      {sentence.slice(at + word.length)}
    </>
  );
};

// Words saved from the caption word popup (components/Youtube/WordPopup.tsx).
const WordList = () => {
  const theme = useThemeValue();
  const dark = theme === 'dark';
  const iconColor = dark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)';
  const { t } = useTranslation();
  const navigate = useNavigate();
  // null until the first load.
  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [search, setSearch] = useState('');

  // Follows words saved from a video while the list is open.
  useEffect(() => {
    const subscription = liveQuery(listWords).subscribe({
      next: setWords,
      error: (error) => {
        debugLog('WordList: Failed to load words:', error);
        setWords([]);
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!words || !query) return words ?? [];
    return words.filter((word) =>
      [word.word, word.lemma, word.reading, word.meaning, word.sentence, word.sentenceTranslation]
        .some((text) => text.toLowerCase().includes(query))
    );
  }, [words, search]);

  const exportCsv = () => {
    if (!words?.length) return;
    const url = URL.createObjectURL(new Blob([wordListCsv(words)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `shizue-words-${localDate(Date.now())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tooltip = (title: string) => (
    <div className={`sz:font-ycom ${dark ? 'sz:text-white' : 'sz:text-black'}`}>{title}</div>
  );
  const muted = dark ? 'sz:text-[#aaa]' : 'sz:text-gray-500';

  return (
    <div
      className={`sz-sidepanel sz:flex sz:flex-col sz:h-screen sz:font-ycom ${
        dark ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'
      }`}
    >
      <div className="sz:flex sz:flex-row sz:items-center sz:gap-2 sz:px-4 sz:pt-3">
        {/* Back to the chat this panel had open, if any: the word list leaves its thread as it was. */}
        <Tooltip
          title={tooltip(t('onboarding.back'))}
          color={dark ? '#505362' : 'white'}
          placement="bottomLeft"
          arrow={false}
        >
          <button
            aria-label={t('onboarding.back')}
            className="sz:p-[3px] sz:rounded sz:cursor-pointer sz:flex"
            onClick={() => navigate('/')}
          >
            <ArrowLeftOutlined style={{ fontSize: 20, color: iconColor }} />
          </button>
        </Tooltip>
        <div className={`sz:flex-1 sz:text-base sz:font-semibold ${dark ? 'sz:text-white' : 'sz:text-black'}`}>
          {t('words.title')}
          {words?.length ? <span className={`sz:pl-1 sz:font-normal ${muted}`}>{words.length}</span> : null}
        </div>
        <Tooltip
          title={tooltip(t('words.exportCsv'))}
          color={dark ? '#505362' : 'white'}
          placement="bottomRight"
          arrow={false}
        >
          <button
            className="sz:p-[3px] sz:rounded sz:cursor-pointer sz:flex sz:disabled:opacity-40 sz:disabled:cursor-default"
            disabled={!words?.length}
            onClick={exportCsv}
          >
            <DownloadOutlined style={{ fontSize: 20, color: iconColor }} />
          </button>
        </Tooltip>
      </div>

      <div className="sz:px-4 sz:pt-3 sz:pb-2">
        <Input
          placeholder={t('words.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`sz:font-ycom ${dark ? 'dark-input' : ''}`}
          allowClear
        />
      </div>

      <div className="sz:flex-1 sz:overflow-y-auto sz:px-4 sz:font-ddin">
        {words === null ? null : shown.length === 0 ? (
          <div className={`sz:pt-16 sz:px-6 sz:text-center sz:text-sm ${muted}`}>
            {words.length === 0 ? t('words.empty') : t('words.noResults')}
          </div>
        ) : (
          shown.map((word) => (
            <div
              key={word.id}
              className={`sz:group sz:py-3 sz:border-b ${dark ? 'sz:border-gray-700' : 'sz:border-gray-200'}`}
            >
              <div className="sz:flex sz:flex-row sz:items-baseline sz:gap-2">
                <span className={`sz:text-base sz:font-semibold ${dark ? 'sz:text-white' : 'sz:text-black'}`}>
                  {word.lemma || word.word}
                </span>
                {word.reading ? <span className={`sz:text-xs ${muted}`}>{word.reading}</span> : null}
                {word.partOfSpeech ? <span className={`sz:text-xs ${muted}`}>{word.partOfSpeech}</span> : null}
                <Tooltip title={tooltip(t('words.delete'))} color={dark ? '#505362' : 'white'} arrow={false}>
                  <button
                    aria-label={t('words.delete')}
                    onClick={() => void deleteWord(word.id)}
                    className="sz:ml-auto sz:cursor-pointer sz:text-gray-400 sz:hover:text-red-400 sz:invisible sz:group-hover:visible sz:focus:visible"
                  >
                    <DeleteOutlined />
                  </button>
                </Tooltip>
              </div>
              <div className={`sz:text-sm sz:pt-0.5 ${dark ? 'sz:text-white' : 'sz:text-black'}`}>
                {word.meaning}
              </div>
              <div className={`sz:text-sm sz:pt-1.5 ${dark ? 'sz:text-[#ddd]' : 'sz:text-gray-700'}`}>
                <Sentence sentence={word.sentence} word={word.word} />
              </div>
              {word.sentenceTranslation ? (
                <div className={`sz:text-xs sz:pt-0.5 ${muted}`}>{word.sentenceTranslation}</div>
              ) : null}
              <a
                href={word.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={word.sourceUrl}
                className={`sz:flex sz:flex-row sz:items-center sz:gap-1 sz:pt-1.5 sz:text-xs sz:min-w-0 ${muted}`}
              >
                {youtubeVideoId(word.sourceUrl) ? (
                  <YoutubeOutlined className="sz:shrink-0" />
                ) : (
                  <LinkOutlined className="sz:shrink-0" />
                )}
                <span className="sz:truncate">{word.sourceTitle}</span>
                <span className="sz:shrink-0">· {new Date(word.createdAt).toLocaleDateString()}</span>
              </a>
            </div>
          ))
        )}
      </div>
      <div className="sz-sidepanel-footer sz:h-6 sz:w-full sz:flex sz:items-center sz:justify-center">
        <Footer />
      </div>
    </div>
  );
};

export default WordList;
