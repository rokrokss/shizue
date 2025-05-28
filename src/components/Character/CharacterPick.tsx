import BabyCowEating from '@/components/Character/BabyCowEating';
import BabyCowSniff from '@/components/Character/BabyCowSniff';
import BabyCowWalking from '@/components/Character/BabyCowWalking';
import BlueChickenWatch from '@/components/Character/BlueChickenWatch';
import CharacterForward from '@/components/Character/CharacterForward';
import Chicken from '@/components/Character/Chicken';
import CowEating from '@/components/Character/CowEating';
import ChickenEating from './ChickenEating';

interface CharacterPickProps {
  index: number;
  marginLeft: string;
}

const CharacterPick = ({ index, marginLeft }: CharacterPickProps) => {
  const characters = [
    <CharacterForward key="0" scale={2} marginLeft={marginLeft} />,
    <CowEating key="1" scale={1.9} marginLeft={marginLeft} />,
    <BabyCowEating key="2" scale={2} marginLeft={marginLeft} />,
    <BabyCowWalking key="3" scale={2} marginLeft={marginLeft} />,
    <BlueChickenWatch key="4" scale={2.5} marginLeft={marginLeft} />,
    <Chicken key="5" scale={2.5} marginLeft={marginLeft} />,
    <BabyCowSniff key="6" scale={2.5} marginLeft={marginLeft} />,
    <ChickenEating key="7" scale={2.5} marginLeft="0.25rem" />,
    <BabyCowSniff key="8" scale={2} marginLeft="0.25rem" />,
  ];

  return characters[index % characters.length];
};

export default CharacterPick;
