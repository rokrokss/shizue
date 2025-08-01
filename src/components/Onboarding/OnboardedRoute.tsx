import { useAnthropicKeyValue, useGeminiKeyValue, useOpenAIKeyValue } from '@/hooks/settings';
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/components/Auth/AuthProvider';

export const OnboardedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthContext();
  const openAIKey = useOpenAIKeyValue();
  const geminiKey = useGeminiKeyValue();
  const anthropicKey = useAnthropicKeyValue();

  // Wait for auth check to complete
  if (isLoading) {
    return <div>Loading...</div>; // You can replace this with a proper loading component
  }

  // Check if user is authenticated and has at least one API key
  const hasApiKey = !!openAIKey || !!geminiKey || !!anthropicKey;
  const isOnboarded = isAuthenticated && hasApiKey;

  return isOnboarded ? children : <Navigate to="/onboarding" replace />;
};
