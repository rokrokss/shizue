import { useEffect, useState, useCallback } from 'react';
import {
  MESSAGE_AUTH_LOGIN,
  MESSAGE_AUTH_LOGOUT,
  MESSAGE_AUTH_CHECK_STATUS,
  MESSAGE_AUTH_GET_USER_INFO,
  STORAGE_USER_INFO,
} from '@/config/constants';
import type { UserInfo, AuthResponse } from '@/services/authService';

interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();

    // Listen for storage changes (e.g., login/logout from another tab)
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_USER_INFO]) {
        if (changes[STORAGE_USER_INFO].newValue) {
          setUser(changes[STORAGE_USER_INFO].newValue);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      setIsLoading(true);

      // Check auth status
      const statusResponse = await chrome.runtime.sendMessage({
        action: MESSAGE_AUTH_CHECK_STATUS,
      });

      if (statusResponse.error) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      setIsAuthenticated(statusResponse.isAuthenticated);

      // Get user info if authenticated
      if (statusResponse.isAuthenticated) {
        const userResponse = await chrome.runtime.sendMessage({
          action: MESSAGE_AUTH_GET_USER_INFO,
        });

        if (userResponse.userInfo) {
          setUser(userResponse.userInfo);
        }
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await chrome.runtime.sendMessage({
        action: MESSAGE_AUTH_LOGIN,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const authResponse = response as AuthResponse;
      setUser(authResponse.user);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);

      await chrome.runtime.sendMessage({
        action: MESSAGE_AUTH_LOGOUT,
      });

      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout failed:', error);
      // Even if logout fails on server, clear local state
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    checkAuthStatus,
  };
}
