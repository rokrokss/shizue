import { useLocalModelValue } from '@/hooks/models';
import {
  useAnthropicKeyValue,
  useGeminiKeyValue,
  useOpenAIKeyValue,
  useOpenRouterKeyValue,
} from '@/hooks/settings';
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

export const OnboardedRoute = ({ children }: { children: ReactNode }) => {
  const openAIKey = useOpenAIKeyValue();
  const geminiKey = useGeminiKeyValue();
  const anthropicKey = useAnthropicKeyValue();
  const openRouterKey = useOpenRouterKeyValue();
  const localModel = useLocalModelValue();

  const isOnboarded =
    !!openAIKey || !!geminiKey || !!anthropicKey || !!openRouterKey || !!localModel;

  return isOnboarded ? children : <Navigate to="/onboarding" replace />;
};
