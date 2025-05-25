import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

export const OnboardedRoute = ({ children }: { children: ReactNode }) => {
  const [settings, _] = useSettings();

  const isOnboarded = !!settings.openAIKey;

  return isOnboarded ? children : <Navigate to="/onboarding" replace />;
};
