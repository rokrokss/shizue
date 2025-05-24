import { useEffect, useState } from 'react';

const TypingText = ({
  text,
  speed = 100,
  onComplete,
}: {
  text: string;
  speed?: number;
  onComplete?: () => void;
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false);

  useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
    setHasCompletedOnce(false);
  }, [text]);

  useEffect(() => {
    if (hasCompletedOnce || !text) {
      return;
    }
    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText((prevText) => prevText + text[currentIndex]);
        setCurrentIndex((prevIndex) => prevIndex + 1);
      }, speed);

      return () => clearTimeout(timer);
    } else if (currentIndex === text.length && text.length > 0 && !hasCompletedOnce) {
      setHasCompletedOnce(true);
      if (onComplete) {
        onComplete();
      }
    }
  }, [currentIndex, text, speed, onComplete, hasCompletedOnce]);

  return <div>{displayedText}</div>;
};

export default TypingText;
