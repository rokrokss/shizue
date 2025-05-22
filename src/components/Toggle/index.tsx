import { MESSAGE_ACTION_SET_PANEL_OPEN_OR_NOT } from '@/config';
import { useEventEmitter } from '@/providers/EventEmitterProvider';
import { useEffect } from 'react';

const Toggle = () => {
  const eventEmitter = useEventEmitter();

  useEffect(() => {
    const handleMessage = (message: any) => {
      console.log('[ROKROKSS] Toggle received message:', message);
    };

    const unsubscribe = eventEmitter.subscribe(handleMessage);

    return () => {
      unsubscribe();
    };
  }, [eventEmitter]);

  const setPanelOpenOrNot = () => {
    void chrome.runtime.sendMessage({ action: MESSAGE_ACTION_SET_PANEL_OPEN_OR_NOT });
  };

  const handleClick = () => {
    console.log('[ROKROKSS] Toggle clicked');
    setPanelOpenOrNot();
  };

  return (
    <div>
      <button
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 999999,
          padding: '10px 14px',
          borderRadius: '8px',
          background: '#1e1e2f',
          color: '#fff',
          border: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          cursor: 'pointer',
          fontSize: '14px',
        }}
        onClick={handleClick}
      >
        Toggle
      </button>
    </div>
  );
};

export default Toggle;
