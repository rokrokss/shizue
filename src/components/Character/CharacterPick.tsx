import BabyCowEating from '@/components/Character/BabyCowEating';
import BabyCowWalking from '@/components/Character/BabyCowWalking';
import BlueChickenWatch from '@/components/Character/BlueChickenWatch';
import CharacterForward from '@/components/Character/CharacterForward';
import Chicken from '@/components/Character/Chicken';
import CowEating from '@/components/Character/CowEating';

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
  ];

  return characters[index % characters.length];
};

export default CharacterPick;
