type CaptionDisplayProps = {
  lines: string[];
  originalLines: string[];
  bilingual: boolean;
};

export const CaptionDisplay = ({ lines, originalLines, bilingual }: CaptionDisplayProps) => (
  <div className="sz:w-fit sz:text-[2.4vw] sz:min-[1015px]:text-[1.6vw] sz:min-[1935px]:text-[28px]">
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
