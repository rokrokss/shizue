import { animate } from 'framer-motion';
import { useEffect, useState } from 'react';

const useStreamText = (
  text: string,
  options?: { delimiter?: string; duration?: number; handleOnComplete?: () => void }
) => {
  const { delimiter = '', duration = 1.15, handleOnComplete = () => {} } = options || {};
  const [cursor, setCursor] = useState(0);
  const [startingCursor, setStartingCursor] = useState(0);
  const [prevText, setPrevText] = useState(text);

  if (prevText !== text) {
    setPrevText(text);
    setStartingCursor(text.startsWith(prevText) ? cursor : 0);
  }

  useEffect(() => {
    const controls = animate(startingCursor, text.split(delimiter).length, {
      duration: duration,
      ease: 'easeOut',
      onUpdate(latest) {
        setCursor(Math.floor(latest));
      },
      onComplete: handleOnComplete,
    });

    return () => controls.stop();
  }, [startingCursor, text]);

  return text.split(delimiter).slice(0, cursor).join(delimiter);
};

export default useStreamText;
