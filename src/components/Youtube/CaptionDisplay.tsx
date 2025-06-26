import { useEffect, useState } from 'react';

type CaptionDisplayProps = {
  lines: string[];
  originalLines: string[];
  bilingual: boolean;
  captionSizeRatio: number;
};

export const CaptionDisplay = ({
  lines,
  originalLines,
  bilingual,
  captionSizeRatio,
}: CaptionDisplayProps) => {
  const [fontSize, setFontSize] = useState(`${2.4 * captionSizeRatio}vw`);

  useEffect(() => {
    const updateFontSize = () => {
      const width = window.innerWidth;
      if (width >= 1935) {
        setFontSize(`${28 * captionSizeRatio}px`);
      } else if (width >= 1015) {
        setFontSize(`${1.6 * captionSizeRatio}vw`);
      } else {
        setFontSize(`${2.4 * captionSizeRatio}vw`);
      }
    };

    updateFontSize();
    window.addEventListener('resize', updateFontSize);
    return () => window.removeEventListener('resize', updateFontSize);
  }, [captionSizeRatio]);

  return (
    <div className="sz:w-fit" style={{ fontSize }}>
      {lines.map((line, index) => (
        <>
          {bilingual && (
            <div key={`${index}-og`}>
              <span className="sz:px-2 sz:py-1 sz:inline-block sz:bg-[rgba(8,8,8,0.75)] sz:text-white sz:fill-white">
                {originalLines[index]}
              </span>
            </div>
          )}
          <div key={index}>
            <span className="sz:px-2 sz:py-1 sz:inline-block sz:bg-[rgba(8,8,8,0.75)] sz:text-white sz:fill-white">
              {line}
            </span>
          </div>
        </>
      ))}
    </div>
  );
};
