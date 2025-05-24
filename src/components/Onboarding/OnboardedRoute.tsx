import { isOnboardedAtom } from '@/atoms/settings';
import { useAtomValue } from 'jotai';
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

export const OnboardedRoute = ({ children }: { children: ReactNode }) => {
  const isOnboarded = useAtomValue(isOnboardedAtom);

  return isOnboarded ? children : <Navigate to="/onboarding" replace />;
};
