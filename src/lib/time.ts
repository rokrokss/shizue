import { TFunction } from 'i18next';

export const getTimeString = (timestamp: number, t: TFunction) => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInMilliseconds = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));
  const diffInHours = Math.floor(diffInMilliseconds / (1000 * 60 * 60));

  if (diffInMinutes < 1) {
    return t('time.justNow');
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}${t('time.minutesAgo')}`;
  } else if (diffInHours < 24) {
    return `${diffInHours}${t('time.hoursAgo')}`;
  } else {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}.${month}.${day}`;
  }
};
