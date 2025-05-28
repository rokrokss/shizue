import BabyCowEating from '@/components/Character/BabyCowEating';
import BabyCowSniff from '@/components/Character/BabyCowSniff';
import BabyCowWalking from '@/components/Character/BabyCowWalking';
import BlueChickenWatch from '@/components/Character/BlueChickenWatch';
import CharacterForward from '@/components/Character/CharacterForward';
import CharacterStanding from '@/components/Character/CharacterStanding';
import Chicken from '@/components/Character/Chicken';
import ChickenEating from '@/components/Character/ChickenEating';

interface CharacterPickToggleProps {
  index: number;
}

export const characterCountChat = 8;

const CharacterPickToggle = ({ index }: CharacterPickToggleProps) => {
  const characters = [
    <CharacterForward key="0" scale={1.8} marginLeft={'6px'} />,
    <BabyCowEating key="2" scale={1.8} marginLeft={'6px'} />,
    <BabyCowWalking key="3" scale={1.75} marginLeft={'6px'} />,
    <BlueChickenWatch key="4" scale={2.2} marginLeft={'6px'} />,
    <Chicken key="5" scale={2.2} marginLeft={'6px'} />,
    <BabyCowSniff key="6" scale={1.9} marginLeft={'4.5px'} />,
    <ChickenEating key="7" scale={2.2} marginLeft={'6px'} />,
    <CharacterStanding key="8" scale={1.9} marginLeft={'6px'} />,
  ];

  return characters[index % characters.length];
};

export default CharacterPickToggle;
