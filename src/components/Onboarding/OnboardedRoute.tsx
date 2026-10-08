import { useRegisteredAIProviders, useChatGPTConnectionValue } from '@/hooks/models';
import { ReactNode, useEffect } from 'react';
import { chatGPTSettings } from '@/lib/chatgpt';
import { Navigate } from 'react-router-dom';

export const OnboardedRoute = ({ children }: { children: ReactNode }) => {
  const registered = useRegisteredAIProviders();
  const chatGPT = useChatGPTConnectionValue();
  useEffect(() => { if (chatGPT.installed) void chatGPTSettings('status').catch(() => {}); }, []);

  // A retained OAuth registration is not a signed-in session. Expired active
  // sessions may still open settings to reconnect, but explicit logout cannot.
  const isOnboarded = registered.length > 0 || Boolean(chatGPT.activeId);

  return isOnboarded ? children : <Navigate to="/onboarding" replace />;
};
