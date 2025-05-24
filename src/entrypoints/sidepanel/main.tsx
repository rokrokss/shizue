import '@/assets/tailwind.css';
import { SidePanelRoutes } from '@/entrypoints/sidepanel/routes';
import SidePanelProvider from '@/providers/SidePanelProvider';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanelProvider>
      <HashRouter>
        <SidePanelRoutes />
      </HashRouter>
    </SidePanelProvider>
  </React.StrictMode>
);
