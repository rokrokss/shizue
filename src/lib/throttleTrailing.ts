export const throttleTrailing = <T extends (...args: any[]) => void>(func: T, wait: number): T => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime = 0;
  let isThrottling = false;

  const invoke = (args: Parameters<T>) => {
    func(...args);
    lastCallTime = Date.now();
  };

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();

    if (!isThrottling || now - lastCallTime >= wait) {
      invoke(args);
      isThrottling = true;
    } else {
      lastArgs = args;
      if (timeout) clearTimeout(timeout);

      timeout = setTimeout(() => {
        if (lastArgs) invoke(lastArgs);
        lastArgs = null;
        isThrottling = false;
      }, wait - (now - lastCallTime));
    }
  };

  return throttled as T;
};
