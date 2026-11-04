import { useThemeValue, useTranslationMaskPrivate } from '@/hooks/layout';
import { clearCachedTranslations, countCachedTranslations } from '@/lib/indexDB';
import { Button, Checkbox } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Page translation keeps emails, phone numbers, card numbers and API keys from the AI (on by
// default), and saves its translations for 30 days so a page read again costs nothing.
export default function TranslationSettings() {
  const { t, i18n } = useTranslation();
  const theme = useThemeValue();
  const [maskPrivate, setMaskPrivate] = useTranslationMaskPrivate();
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    countCachedTranslations()
      .then(setSaved)
      .catch(() => setSaved(null));
  }, []);

  const clear = () => void clearCachedTranslations().then(() => setSaved(0));

  return (
    <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
      <div className={`sz:text-base ${theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'}`}>
        {t('settings.pageTranslation')}
      </div>
      <div className="sz:w-68 sz:text-xs sz:text-center sz:text-gray-500 sz:break-keep sz:wrap-anywhere">
        {t('settings.maskPrivateDescription')}
      </div>
      <Checkbox
        checked={maskPrivate}
        onChange={(e) => void setMaskPrivate(e.target.checked)}
        className="sz:font-ycom"
      >
        {t('settings.maskPrivate')}
      </Checkbox>
      {saved !== null && saved > 0 && (
        <div className="sz:flex sz:flex-row sz:items-center sz:gap-1 sz:text-xs sz:text-gray-500">
          <span>{t('settings.savedTranslations', { number: saved.toLocaleString(i18n.language) })}</span>
          <Button type="text" size="small" className="sz:text-[12px] sz:font-ycom" onClick={clear}>
            {t('settings.savedTranslationsClear')}
          </Button>
        </div>
      )}
    </div>
  );
}
