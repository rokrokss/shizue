import SidePanel from '@/components/SidePanel';
import SidePanelProvider from '@/providers/SidePanelProvider';
import React from 'react';
import ReactDOM from 'react-dom/client';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanelProvider>
      <SidePanel />
    </SidePanelProvider>
  </React.StrictMode>
);
