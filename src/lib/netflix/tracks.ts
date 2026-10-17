import type { Language } from '@/hooks/language';
import { languageCodeToLanguage } from '@/lib/language';
import type { NetflixTrack } from '@/lib/netflix/bridgeProtocol';

const primary = (tag: string) => tag.toLowerCase().split('-')[0];

const first = (tracks: NetflixTrack[], captionsFirst: boolean) =>
  [...tracks].sort((a, b) =>
    captionsFirst
      ? Number(b.closedCaptions) - Number(a.closedCaptions)
      : Number(a.closedCaptions) - Number(b.closedCaptions)
  )[0] ?? null;

// The original: subtitles in the language being spoken (the same tag, else the same language),
// else English, else the first track. Closed captions come first, on a dub too: they transcribe
// what is said, while plain subtitles in a dub's language translate the original dialogue.
export const pickOriginalTrack = (tracks: NetflixTrack[], audioLanguage: string | null): NetflixTrack | null => {
  if (audioLanguage) {
    const exact = tracks.filter((track) => track.language.toLowerCase() === audioLanguage.toLowerCase());
    if (exact.length) return first(exact, true);
    const same = tracks.filter((track) => primary(track.language) === primary(audioLanguage));
    if (same.length) return first(same, true);
  }
  const english = tracks.filter((track) => primary(track.language) === 'en');
  return first(english, true) ?? tracks[0] ?? null;
};

export const isTrackIn = (track: NetflixTrack, language: Language) =>
  languageCodeToLanguage(track.language) === language;

// Netflix's own subtitles in the target language, used instead of an LLM translation. Plain
// subtitles come first here: they translate the original dialogue, without sound descriptions.
export const pickTargetTrack = (tracks: NetflixTrack[], target: Language): NetflixTrack | null =>
  first(
    tracks.filter((track) => isTrackIn(track, target)),
    false
  );
