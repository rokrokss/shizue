import Character from '@/components/Toggle/Character';
import { MESSAGE_ACTION_SET_PANEL_OPEN_OR_NOT } from '@/config';
import { debugLog } from '@/logs';
import { useEventEmitter } from '@/providers/EventEmitterProvider';
import { useEffect } from 'react';

const Toggle = () => {
  const eventEmitter = useEventEmitter();

  const width = 42;
  const height = 42;
  const widthFull = 54;

  useEffect(() => {
    const handleMessage = (message: any) => {
      debugLog('Toggle received message:', message);
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
    debugLog('Toggle clicked');
    setPanelOpenOrNot();
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.width = `${widthFull}px`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.width = `${width}px`;
      }}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        transition: 'width 0.3s ease-in-out',
        background: 'linear-gradient( 135deg, #90F7EC 10%, #32CCBC 100%)',
        position: 'fixed',
        bottom: '26px',
        right: '0',
        zIndex: 999999,
        cursor: 'pointer',
        borderTopLeftRadius: '9999px',
        borderBottomLeftRadius: '9999px',
        borderTopRightRadius: '0',
        borderBottomRightRadius: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Character scale={1.8} marginLeft={'6px'} />
    </div>
  );
};

export default Toggle;
