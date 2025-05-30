import { useEffect, useState } from 'react';

export const DotCycle = () => {
  const [dots, setDots] = useState('.');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '.' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return <span className="sz-loading-dots">{dots}</span>;
};
