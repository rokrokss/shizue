import chickenEating from '@/assets/character/chicken_eating.png';
import { useEffect, useState } from 'react';

const ChickenEating = ({ scale, marginLeft }: { scale: number; marginLeft: string }) => {
  const [frame, setFrame] = useState(0);

  const frameWidth = 14;
  const frameHeight = 12;
  const totalFrames = 6;
  const frameSpacing = 2;

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
      data-set-margin="true"
      className="sz:mr-[0px] sz:mb-[0px] sz:mt-[0px]"
      style={{
        width: `${frameWidth * scale}px`,
        height: `${frameHeight * scale}px`,
        backgroundImage: `url(${chickenEating})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${x * scale}px 0px`,
        backgroundSize: `auto ${frameHeight * scale}px`,
        imageRendering: 'pixelated',
        marginLeft: marginLeft,
      }}
    />
  );
};

export default ChickenEating;
