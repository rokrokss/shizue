import { languageListeners } from '@/entrypoints/background/language';
import { modelListeners } from '@/entrypoints/background/models';
import {
  sidebarToggleListeners,
  sidepanelMessageListeners,
} from '@/entrypoints/background/sidepanel';
import { backgroundLog } from '@/logs';

export default defineBackground(() => {
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidepanelMessageListeners();
  modelListeners();
});
