import { useOpenAIKeyValue } from '@/hooks/settings';
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

export const OnboardedRoute = ({ children }: { children: ReactNode }) => {
  const openAIKey = useOpenAIKeyValue();

  const isOnboarded = !!openAIKey;

  return isOnboarded ? children : <Navigate to="/onboarding" replace />;
};
