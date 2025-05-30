import { useAtomValue } from 'jotai';
import { ReactNode, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { getI8NLanguage, languageAtom } from '@/hooks/language';
import i18n, { initI18n } from '@/i18n';
import { debugLog } from '@/logs';

const LanguageProvider = ({
  loadingComponent,
  children,
}: {
  loadingComponent: ReactNode;
  children: ReactNode;
}) => {
  const lang = useAtomValue(languageAtom);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const i8nLang = getI8NLanguage(lang);
    if (!i18n.isInitialized) {
      initI18n(i8nLang).then(() => {
        debugLog('i18n initialized');
        setReady(true);
        debugLog(`Language initialization took ${performance.now() - start}ms`);
      });
    } else {
      i18n.changeLanguage(i8nLang);
      setReady(true);
    }
  }, [lang]);

  if (!ready) return loadingComponent;

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};

export default LanguageProvider;
