import { MESSAGE_ACTION_SET_PANEL_OPEN_OR_NOT } from '@/config';
import React, { createContext, useCallback, useEffect } from 'react';

interface ShortcutContextType {
  // TODO: add shortcut state management later
}

const ShortcutContext = createContext<ShortcutContextType>({});

export default function CommonShortcutProvider({ children }: { children: React.ReactNode }) {
  const handleShortcut = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      e.stopPropagation();
      void chrome.runtime.sendMessage({ action: MESSAGE_ACTION_SET_PANEL_OPEN_OR_NOT });
    }
  }, []);

  useEffect(() => {
    document.body.addEventListener('keydown', handleShortcut);
    return () => {
      document.body.removeEventListener('keydown', handleShortcut);
    };
  }, [handleShortcut]);

  return <ShortcutContext.Provider value={{}}>{children}</ShortcutContext.Provider>;
}
