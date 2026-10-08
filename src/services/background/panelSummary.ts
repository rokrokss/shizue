import { openPanel } from '@/entrypoints/background/sidepanel';
import { recoverTabContentScripts } from '@/services/background/contentScriptRecovery';
import { requestPageSummary } from '@/services/pageSummary';

const pendingSummaries = new Set<Promise<void>>();

export function openPanelForSummary(tabId: number, windowId: number | undefined) {
  // Keep open() in the user gesture. The new panel waits for the summary handoff
  // before displaying its saved conversation, including during receiver recovery.
  const opened = openPanel(windowId);
  const summary = requestPageSummary(tabId, recoverTabContentScripts);
  pendingSummaries.add(summary);
  void summary.then(
    () => pendingSummaries.delete(summary),
    () => pendingSummaries.delete(summary)
  );
  return Promise.all([opened, summary]);
}

export async function waitForPanelSummary() {
  while (pendingSummaries.size > 0) {
    await Promise.allSettled([...pendingSummaries]);
  }
}
