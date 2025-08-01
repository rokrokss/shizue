import React, { createContext, useContext, useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { authStateAtom, userInfoAtom } from '@/hooks/global';
import { useAuth } from '@/hooks/useAuth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuth();
  const setAuthState = useSetAtom(authStateAtom);
  const setUserInfo = useSetAtom(userInfoAtom);

  // Sync auth state to atoms
  useEffect(() => {
    setAuthState({
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
    });
    setUserInfo(auth.user);
  }, [auth.isAuthenticated, auth.isLoading, auth.user, setAuthState, setUserInfo]);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
