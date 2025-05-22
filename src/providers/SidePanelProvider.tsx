import {
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  PORT_LISTEN_PANEL_CLOSED_KEY,
} from '@/config';
import { errorLog } from '@/logs';
import { type ReactNode, useEffect, useState } from 'react';

const SidePanelProvider = ({ children }: { children: ReactNode }) => {
  const [panelInitialized, setPanelInitialized] = useState(false);

  useEffect(() => {
    setPanelInitialized(true);
    chrome.runtime.onMessage.addListener(function (request) {
      if (request.action === MESSAGE_UPDATE_PANEL_INIT_DATA) {
        setPanelInitialized(true);
      }
    });

    try {
      chrome.runtime.sendMessage({ action: MESSAGE_PANEL_OPENED_PING_FROM_PANEL });
      chrome.runtime.connect({ name: PORT_LISTEN_PANEL_CLOSED_KEY });
    } catch (error) {
      errorLog('connect backend port', error);
    }
  }, []);

  return <>{panelInitialized ? children : null}</>;
};

export default SidePanelProvider;
