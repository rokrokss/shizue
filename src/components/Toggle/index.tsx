import CharacterPickToggle, {
  characterCountChat,
} from '@/components/Character/CharacterPickToggle';
import OverlayMenuItems from '@/components/Toggle/OverlayMenuItems';
import { MESSAGE_SET_PANEL_OPEN_OR_NOT } from '@/config/constants';
import { debugLog } from '@/logs';
import { useState } from 'react';

const Toggle = () => {
  const [isHoveringCharacter, setIsHoveringCharacter] = useState(false);
  const [isHoveringMenu, setIsHoveringMenu] = useState(false);
  const [characterIndex, setCharacterIndex] = useState(0);

  const isVisible = isHoveringCharacter || isHoveringMenu;

  const width = 43;
  const height = 43;
  const widthFull = 55;

  useEffect(() => {
    const date = new Date();
    const charIndex = hashStringToIndex(
      date.toISOString().split('T')[0] + date.getHours(),
      null,
      characterCountChat
    );
    setCharacterIndex(charIndex);
  }, []);

  const setPanelOpenOrNot = () => {
    void chrome.runtime.sendMessage({ action: MESSAGE_SET_PANEL_OPEN_OR_NOT });
  };

  const handleClick = () => {
    debugLog('Toggle clicked');
    setPanelOpenOrNot();
  };

  return (
    <div className="sz:fixed sz:right-0 sz:bottom-[26px] sz:flex sz:flex-col sz:items-end sz:z-2147483647">
      <div
        onMouseEnter={() => setIsHoveringMenu(true)}
        onMouseLeave={() => setIsHoveringMenu(false)}
        className={`
          sz:flex sz:flex-col
          sz:items-center
          sz:shadow-md
          sz:pb-[8px]
          sz:pr-[8px]
          sz:transition-all sz:duration-300
          ${
            isVisible
              ? 'sz:opacity-100 sz:translate-x-0 sz:pointer-events-auto'
              : 'sz:opacity-0 sz:translate-x-[8px] sz:pointer-events-none'
          }
      `}
        style={{
          transition: 'opacity 0.3s ease-in-out, translate 0.3s ease-in-out',
        }}
      >
        <OverlayMenuItems />
      </div>
      <div
        onMouseEnter={() => setIsHoveringCharacter(true)}
        onMouseLeave={() => setIsHoveringCharacter(false)}
        className="sz:flex sz:items-center sz:justify-center sz:cursor-pointer sz:shadow-lg sz:shadow-cyan-400/20"
        onClick={handleClick}
        style={{
          width: isVisible ? `${widthFull}px` : `${width}px`,
          height: `${height}px`,
          transition: 'width 0.3s ease-in-out',
          background: 'linear-gradient( 135deg, #90F7EC 10%, #32CCBC 100%)',
          borderTopLeftRadius: '9999px',
          borderBottomLeftRadius: '9999px',
          borderTopRightRadius: '0',
          borderBottomRightRadius: '0',
        }}
      >
        <CharacterPickToggle index={characterIndex} />
      </div>
    </div>
  );
};

export default Toggle;
