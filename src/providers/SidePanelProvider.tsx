import {
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  PORT_LISTEN_PANEL_CLOSED_KEY,
} from '@/config/constants';
import { errorLog } from '@/logs';
import { ReactNode, useCallback, useEffect, useState } from 'react';

const SidePanelProvider = ({
  loadingComponent,
  children,
}: {
  loadingComponent: ReactNode;
  children: ReactNode;
}) => {
  const [panelInitialized, setPanelInitialized] = useState(false);

  const handleMessage = useCallback((request: any) => {
    if (request.action === MESSAGE_UPDATE_PANEL_INIT_DATA) {
      setPanelInitialized(true);
    }
  }, []);

  useEffect(() => {
    setPanelInitialized(true);

    chrome.runtime.onMessage.addListener(handleMessage);

    try {
      chrome.runtime.sendMessage({ action: MESSAGE_PANEL_OPENED_PING_FROM_PANEL });
      chrome.runtime.connect({ name: PORT_LISTEN_PANEL_CLOSED_KEY });
    } catch (error) {
      errorLog('connect backend port', error);
    }

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleMessage]);

  return <>{panelInitialized ? children : loadingComponent}</>;
};

export default SidePanelProvider;
