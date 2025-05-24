import '@/assets/tailwind.css';
import { SidePanelRoutes } from '@/entrypoints/sidepanel/routes';
import ShortcutProvider from '@/providers/ShortcutProvider';
import SidePanelProvider from '@/providers/SidePanelProvider';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ShortcutProvider>
      <SidePanelProvider>
        <HashRouter>
          <SidePanelRoutes />
        </HashRouter>
      </SidePanelProvider>
    </ShortcutProvider>
  </React.StrictMode>
);
