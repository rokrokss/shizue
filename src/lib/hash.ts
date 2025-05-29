export const hashStringToIndex = (str: string, avoid: number | null, mod: number): number => {
  let hash = 0;
  const seedString = str.length > 100 ? str.slice(0, 200) : str;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  let index = Math.abs(hash) % mod;
  if (index === avoid) {
    index = (index + 1) % mod;
  }
  return index;
};
