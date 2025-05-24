import { ConfigProvider } from 'antd';
import { ReactNode } from 'react';

const AntdProvider = ({ children }: { children: ReactNode }) => (
  <ConfigProvider
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
