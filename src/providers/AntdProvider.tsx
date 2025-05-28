import { ConfigProvider } from 'antd';
import { ReactNode } from 'react';

const AntdProvider = ({ children }: { children: ReactNode }) => (
  <ConfigProvider
    prefixCls="sz-ant-"
    iconPrefixCls="sz-ant-icon-"
    theme={{
      token: {
        colorPrimary: '#32CCBC',
      },
    }}
  >
    {children}
  </ConfigProvider>
);

export default AntdProvider;
