import EmptyPage from '@/components/Loader/EmptyPage';
import { OnboardedRoute } from '@/components/Onboarding/OnboardedRoute';
import Onboarding from '@/components/Onboarding/Onboarding';
import SidePanel from '@/components/SidePanel';
import { Suspense } from 'react';
import { Navigate, useRoutes } from 'react-router-dom';

export const SidePanelRoutes = () => {
  const routes = [
    { path: '/', element: <Navigate to={'/default'} replace /> },
    {
      path: '/default',
      element: (
        <Suspense fallback={<EmptyPage />}>
          <OnboardedRoute>
            <SidePanel />
          </OnboardedRoute>
        </Suspense>
      ),
    },
    {
      path: '/chat',
      element: (
        <Suspense fallback={<EmptyPage />}>
          <OnboardedRoute>
            <SidePanel />
          </OnboardedRoute>
        </Suspense>
      ),
    },
    {
      path: '/onboarding',
      element: <Onboarding />,
    },
  ];

  return useRoutes(routes);
};
