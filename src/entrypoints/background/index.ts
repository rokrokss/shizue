import { languageListeners } from '@/entrypoints/background/language';
import { modelListeners } from '@/entrypoints/background/models';
import {
  sidebarToggleListners,
  sidepanelMessageListners,
} from '@/entrypoints/background/sidepanel';
import { backgroundLog } from '@/logs';

export default defineBackground(() => {
  backgroundLog();
  sidebarToggleListners();
  languageListeners();
  sidepanelMessageListners();
  modelListeners();
});
