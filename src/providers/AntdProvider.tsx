import { useThemeValue } from '@/hooks/layout';
import { debugLog } from '@/logs';
import { ConfigProvider, theme } from 'antd';
import { ReactNode, useEffect } from 'react';

const AntdProvider = ({ children }: { children: ReactNode }) => {
  const themeValue = useThemeValue();

  useEffect(() => {
    debugLog('theme: ', themeValue);
  }, [themeValue]);

  return (
    <ConfigProvider
      prefixCls="sz-ant-"
      iconPrefixCls="sz-ant-icon-"
      theme={{
        token: {
          colorPrimary: '#32CCBC',
        },
        algorithm: themeValue == 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      {children}
    </ConfigProvider>
  );
};

export default AntdProvider;
