import { whenLanguageStateReady } from '@/entrypoints/background/states/language';
import { whenModelStateReady } from '@/entrypoints/background/states/models';

export const whenBackgroundStateReady = () =>
  Promise.all([whenModelStateReady(), whenLanguageStateReady()]);
