import { OnboardedRoute } from '@/components/Onboarding/OnboardedRoute';
import SidePanel from '@/components/SidePanel';
import { lazy } from 'react';
import { Navigate, useRoutes } from 'react-router-dom';

const Memo = lazy(() => import('@/components/Memo'));
const Onboarding = lazy(() => import('@/components/Onboarding/Onboarding'));

export const SidePanelRoutes = () => {
  const routes = [
    { path: '/', element: <Navigate to={'/chat'} replace /> },
    {
      path: '/chat',
      element: (
        <OnboardedRoute>
          <SidePanel />
        </OnboardedRoute>
      ),
    },
    {
      path: '/shizue-memo',
      element: <Memo />,
    },
    {
      path: '/onboarding',
      element: <Onboarding />,
    },
  ];

  return useRoutes(routes);
};
