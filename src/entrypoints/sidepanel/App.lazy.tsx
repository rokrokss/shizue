import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

// Lazy load heavy components
export const ShizuePdfPageLazy = lazy(() => import('@/components/Pdf'));

export const ShizueMemoPageLazy = lazy(() => import('@/components/Memo'));

export const SettingModalContentNewLazy = lazy(
  () => import('@/components/Setting/SettingsModalContentNew')
);

// Loading component
export const LazyLoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" />
  </div>
);

// Wrapper component for lazy loading
export const LazyBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<LazyLoadingFallback />}>{children}</Suspense>
);
