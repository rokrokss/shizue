import standing from '@/assets/character/standing.png';
import { useEffect, useState } from 'react';

const CharacterStanding = ({ scale, marginLeft }: { scale: number; marginLeft: string }) => {
  const [frame, setFrame] = useState(0);

  const frameWidth = 14;
  const frameHeight = 17;
  const frameSpacing = 34;
  const totalFrames = 8;

  const x = -(frameWidth + frameSpacing) * frame;

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % totalFrames);
    }, 110);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      style={{
        width: `${frameWidth * scale}px`,
        height: `${frameHeight * scale}px`,
        backgroundImage: `url(${standing})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${x * scale}px 0px`,
        backgroundSize: `auto ${frameHeight * scale}px`,
        imageRendering: 'pixelated',
        marginLeft: marginLeft,
      }}
    />
  );
};

export default CharacterStanding;
