import BabyCowEating from '@/components/Character/BabyCowEating';
import BabyCowSniff from '@/components/Character/BabyCowSniff';
import BabyCowWalking from '@/components/Character/BabyCowWalking';
import BlueChickenWatch from '@/components/Character/BlueChickenWatch';
import CharacterForward from '@/components/Character/CharacterForward';
import CharacterStanding from '@/components/Character/CharacterStanding';
import Chicken from '@/components/Character/Chicken';
import ChickenEating from '@/components/Character/ChickenEating';
import CowEating from '@/components/Character/CowEating';

interface CharacterPickProps {
  index: number;
  marginLeft: string;
}

export const characterCount = 10;

const CharacterPick = ({ index, marginLeft }: CharacterPickProps) => {
  const characters = [
    <CharacterForward key="0" scale={2} marginLeft={marginLeft} />,
    <CowEating key="1" scale={1.9} marginLeft={marginLeft} />,
    <BabyCowEating key="2" scale={2} marginLeft={marginLeft} />,
    <BabyCowWalking key="3" scale={2} marginLeft={marginLeft} />,
    <BlueChickenWatch key="4" scale={2.5} marginLeft={marginLeft} />,
    <Chicken key="5" scale={2.5} marginLeft={marginLeft} />,
    <BabyCowSniff key="6" scale={2.5} marginLeft={marginLeft} />,
    <ChickenEating key="7" scale={2.5} marginLeft={marginLeft} />,
    <BabyCowSniff key="8" scale={2} marginLeft={marginLeft} />,
    <CharacterStanding key="9" scale={2} marginLeft={marginLeft} />,
  ];

  return characters[index % characters.length];
};

export default CharacterPick;
