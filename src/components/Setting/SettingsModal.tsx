import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import { DotCycle } from '@/components/Loader/DotCycle';
import { useEffect, useState, type ComponentType } from 'react';

let loadedContent: ComponentType | undefined;
let loading: Promise<typeof import('./SettingsModalContent')> | undefined;

function loadSettings() {
  return loading ??= import('./SettingsModalContent').then((module) => {
    loadedContent = module.default;
    return module;
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
}

// Preparing the module does not mount it or start connection checks/polling.
export function preloadSettings() {
  void loadSettings().catch(() => { /* Opening settings can retry a failed preload. */ });
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [Content, setContent] = useState(() => loadedContent);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (Content) return;
    let active = true;
    loadSettings().then((module) => {
      if (active) setContent(() => module.default);
    }, (reason) => {
      if (active) setError(reason);
    });
    return () => { active = false; };
  }, [Content]);
  if (error) throw error;

  // Render as soon as the import resolves, including an early click before
  // preload. React.lazy would add a Suspense fallback delay to this code load.
  return <SidePanelFullModal onClose={onClose} size="base" minHeight="374px" content={
    Content ? <Content /> : <div aria-busy="true"><DotCycle /></div>
  } />;
}
