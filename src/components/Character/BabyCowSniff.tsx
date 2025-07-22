import babyCowSniff from '@/assets/character/baby_cow_sniff.png';
import { useEffect, useState } from 'react';

const BabyCowSniff = ({ scale, marginLeft }: { scale: number; marginLeft: string }) => {
  const [frame, setFrame] = useState(0);

  const frameWidth = 21;
  const frameHeight = 13;
  const totalFrames = 8;
  const frameSpacing = 11;

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
        backgroundImage: `url(${babyCowSniff})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${x * scale}px 0px`,
        backgroundSize: `auto ${frameHeight * scale}px`,
        imageRendering: 'pixelated',
        marginLeft: marginLeft,
      }}
    />
  );
};

export default BabyCowSniff;
