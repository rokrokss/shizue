import blueChickenWatch from '@/assets/character/blue_chicken_watch.png';
import { useEffect, useState } from 'react';

const BlueChickenWatch = ({ scale, marginLeft }: { scale: number; marginLeft: string }) => {
  const [frame, setFrame] = useState(0);

  const frameWidth = 11;
  const frameHeight = 12;
  const totalFrames = 8;
  const frameSpacing = (123 - totalFrames * frameWidth) / (totalFrames - 1);

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
        backgroundImage: `url(${blueChickenWatch})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${x * scale}px 0px`,
        backgroundSize: `auto ${frameHeight * scale}px`,
        imageRendering: 'pixelated',
        marginLeft: marginLeft,
      }}
    />
  );
};

export default BlueChickenWatch;
