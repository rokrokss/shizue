import { storyboardFrame } from '@/lib/storyboard';
import { useState } from 'react';

// The video's frame at a section's time, cut from YouTube's storyboard sheet: the sheet is drawn
// `columns` times as wide as the box and moved so the frame fills it. Clicking plays from there.
const SceneThumbnail = ({
  storyboard,
  seconds,
  title,
  onClick,
}: {
  storyboard: string;
  seconds: number;
  title: string;
  onClick: () => void;
}) => {
  const [failed, setFailed] = useState(false);
  const frame = storyboardFrame(storyboard, seconds);
  if (!frame || failed) return null;
  return (
    <span
      role="button"
      title={title}
      onClick={onClick}
      className="sz:relative sz:block sz:w-full sz:max-w-[240px] sz:mt-1.5 sz:mb-1 sz:overflow-hidden sz:rounded-md sz:cursor-pointer sz:bg-black/5"
      style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
    >
      <img
        src={frame.url}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
        style={{
          position: 'absolute',
          width: `${frame.columns * 100}%`,
          maxWidth: 'none',
          height: 'auto',
          left: `${-frame.column * 100}%`,
          top: `${-frame.row * 100}%`,
        }}
      />
    </span>
  );
};

export default SceneThumbnail;
