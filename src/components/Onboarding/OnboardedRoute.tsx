import { useGeminiKeyValue, useOpenAIKeyValue } from '@/hooks/settings';
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

export const OnboardedRoute = ({ children }: { children: ReactNode }) => {
  const openAIKey = useOpenAIKeyValue();
  const geminiKey = useGeminiKeyValue();

  const isOnboarded = !!openAIKey || !!geminiKey;

  return isOnboarded ? children : <Navigate to="/onboarding" replace />;
};
