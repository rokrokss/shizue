import { sidebarToggleListners } from '@/entrypoints/background/sidepanel';
import { backgroundLog } from '@/logs';

export default defineBackground(() => {
  backgroundLog();
  sidebarToggleListners();
});
