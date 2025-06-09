import { useEffect } from 'react';

const useAdObserver = (onAdStart: () => void, onAdEnd: () => void) => {
  useEffect(() => {
    const adModule = document.querySelector<HTMLDivElement>('.ytp-ad-module');
    if (!adModule) return;

    const compute = () => {
      const playingNow =
        (adModule.textContent?.trim().length ?? 0) > 0 || adModule.childElementCount > 0;

      playingNow ? onAdStart() : onAdEnd();
    };

    compute();

    const moModule = new MutationObserver(compute);

    moModule.observe(adModule, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      moModule.disconnect();
    };
  }, [onAdStart, onAdEnd]);
};

export default useAdObserver;
