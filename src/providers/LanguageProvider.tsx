import { useAtomValue } from 'jotai';
import { ReactNode, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { languageAtom } from '@/atoms/language';
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
    if (!i18n.isInitialized) {
      initI18n(lang).then(() => {
        debugLog('i18n initialized');
        setReady(true);
        debugLog(`Language initialization took ${performance.now() - start}ms`);
      });
    } else {
      i18n.changeLanguage(lang);
      setReady(true);
    }
  }, [lang]);

  if (!ready) return loadingComponent;

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};

export default LanguageProvider;
