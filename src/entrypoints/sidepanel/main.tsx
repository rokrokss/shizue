import '@/assets/global.css';
import '@/assets/tailwindPreflight.css';
import EmptyPage from '@/components/Loader/EmptyPage';
import { SidePanelRoutes } from '@/entrypoints/sidepanel/routes';
import AntdProvider from '@/providers/AntdProvider';
import LanguageProvider from '@/providers/LanguageProvider';
import SidePanelProvider from '@/providers/SidePanelProvider';
import '@ant-design/v5-patch-for-react-19';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JotaiProvider>
      <HashRouter>
        <SidePanelProvider loadingComponent={<EmptyPage />}>
          <LanguageProvider loadingComponent={<EmptyPage />}>
            <AntdProvider>
              <SidePanelRoutes />
            </AntdProvider>
          </LanguageProvider>
        </SidePanelProvider>
      </HashRouter>
    </JotaiProvider>
  </StrictMode>
);
