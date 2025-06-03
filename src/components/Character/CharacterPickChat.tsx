import BabyCowEating from '@/components/Character/BabyCowEating';
import BabyCowSniff from '@/components/Character/BabyCowSniff';
import BabyCowWalking from '@/components/Character/BabyCowWalking';
import BlueChickenWatch from '@/components/Character/BlueChickenWatch';
import CharacterForward from '@/components/Character/CharacterForward';
import CharacterStanding from '@/components/Character/CharacterStanding';
import Chicken from '@/components/Character/Chicken';
import ChickenEating from '@/components/Character/ChickenEating';
import CowEating from '@/components/Character/CowEating';
import { useThemeValue } from '@/hooks/layout';

interface CharacterPickChatProps {
  index: number;
  scale: number;
  marginLeft: string;
}

export const characterCount = 9;

const CharacterPickChat = ({ index, scale, marginLeft }: CharacterPickChatProps) => {
  const theme = useThemeValue();

  const characters = [
    <CharacterForward key="0" scale={2 * scale} marginLeft={marginLeft} />,
    <CowEating key="1" scale={1.9 * scale} marginLeft={marginLeft} />,
    <BabyCowEating key="2" scale={2.15 * scale} marginLeft={marginLeft} />,
    <BabyCowWalking key="3" scale={2.1 * scale} marginLeft={marginLeft} />,
    <BlueChickenWatch key="4" scale={2.5 * scale} marginLeft={marginLeft} />,
    <Chicken key="5" scale={2.5 * scale} marginLeft={marginLeft} />,
    <BabyCowSniff key="6" scale={2.25 * scale} marginLeft={marginLeft} />,
    <ChickenEating key="7" scale={2.5 * scale} marginLeft={marginLeft} />,
    <CharacterStanding key="8" scale={2 * scale} marginLeft={marginLeft} />,
  ];

  return (
    <div style={{ filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none' }}>
      {characters[index % characters.length]}
    </div>
  );
};

export default CharacterPickChat;
