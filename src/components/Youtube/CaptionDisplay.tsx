type CaptionDisplayProps = {
  lines: string[];
};

export const CaptionDisplay = ({ lines }: CaptionDisplayProps) => (
  <div className="sz:w-fit sz:text-[2.4vw] sz:min-[1015px]:text-[1.6vw] sz:min-[1935px]:text-[28px]">
    {lines.map((line, index) => (
      <div key={index}>
        <span className="sz:px-2 sz:py-1 sz:inline-block sz:bg-[rgba(8,8,8,0.75)] sz:text-white sz:fill-white">
          {line}
        </span>
      </div>
    ))}
  </div>
);
