export const getOS = () => {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('mac')) return 'mac';
  if (userAgent.includes('win')) return 'windows';
  if (userAgent.includes('linux')) return 'linux';

  return 'unknown';
};
