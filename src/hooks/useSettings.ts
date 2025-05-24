import { settingsAtom } from '@/atoms/settings';
import { useAtom } from 'jotai';

export const useSettings = () => useAtom(settingsAtom);
