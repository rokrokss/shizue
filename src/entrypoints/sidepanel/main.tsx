import '@/assets/tailwind.css';
import EmptyPage from '@/components/Loader/EmptyPage';
import { SidePanelRoutes } from '@/entrypoints/sidepanel/routes';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import SidePanelProvider from '@/providers/SidePanelProvider';
import { Provider as JotaiProvider } from 'jotai';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanelProvider loadingComponent={<EmptyPage />}>
      <JotaiProvider>
        <LanguageProvider loadingComponent={<EmptyPage />}>
          <AntdProvider>
            <HashRouter>
              <SidePanelRoutes />
            </HashRouter>
          </AntdProvider>
        </LanguageProvider>
      </JotaiProvider>
    </SidePanelProvider>
  </React.StrictMode>
);
