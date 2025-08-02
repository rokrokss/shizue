/**
 * Unified settings hook that uses SettingsService
 */

import { useEffect, useState, useCallback } from 'react';
import SettingsService from '@/services/settingsService';
import { UserSettings, UserSettingsUpdate } from '@/types/settings';
import { AuthService } from '@/services/authService';

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const settingsService = SettingsService.getInstance();

  // Load initial settings
  useEffect(() => {
    loadSettings();
    checkAuthStatus();

    // Listen for auth changes
    const handleAuthChange = () => {
      checkAuthStatus();
      loadSettings(); // Reload settings when auth status changes
    };

    // Listen for storage changes (for cross-tab sync)
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      // Reload settings if auth tokens change
      if ('AUTH_TOKEN' in changes || 'REFRESH_TOKEN' in changes) {
        handleAuthChange();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const checkAuthStatus = async () => {
    try {
      const status = await AuthService.getInstance().checkAuthStatus();
      setIsAuthenticated(status);
    } catch (error) {
      console.error('Failed to check auth status:', error);
      setIsAuthenticated(false);
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedSettings = await settingsService.loadSettings();
      setSettings(loadedSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = useCallback(async (update: UserSettingsUpdate) => {
    try {
      setError(null);
      const updatedSettings = await settingsService.updateSettings(update);
      setSettings(updatedSettings);
      return updatedSettings;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      console.error('Failed to update settings:', err);
      throw err;
    }
  }, []);

  const updateApiKey = useCallback(
    async (provider: 'openai' | 'gemini' | 'anthropic', key: string) => {
      try {
        setError(null);
        const result = await settingsService.updateApiKey(provider, key);

        // Reload settings to get updated state
        await loadSettings();

        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update API key');
        console.error('Failed to update API key:', err);
        throw err;
      }
    },
    []
  );

  const migrateSettings = useCallback(async () => {
    try {
      setError(null);
      await settingsService.migrateFromLocalStorage();
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to migrate settings');
      console.error('Failed to migrate settings:', err);
      throw err;
    }
  }, []);

  const processSyncQueue = useCallback(async () => {
    try {
      await settingsService.processSyncQueue();
    } catch (err) {
      console.error('Failed to process sync queue:', err);
    }
  }, []);

  return {
    settings,
    loading,
    error,
    isAuthenticated,
    updateSettings,
    updateApiKey,
    migrateSettings,
    processSyncQueue,
    reload: loadSettings,
  };
}

// Individual setting hooks that use the unified settings

export function useLanguage() {
  const { settings, updateSettings } = useSettings();

  const setLanguage = useCallback(
    async (language: string) => {
      await updateSettings({
        general: { language },
      });
    },
    [updateSettings]
  );

  return {
    language: settings?.general?.language || 'English',
    setLanguage,
  };
}

export function useTheme() {
  const { settings, updateSettings } = useSettings();

  const setTheme = useCallback(
    async (theme: string) => {
      await updateSettings({
        layout: { theme },
      });
    },
    [updateSettings]
  );

  return {
    theme: settings?.layout?.theme || 'light',
    setTheme,
  };
}

export function useChatModel() {
  const { settings, updateSettings } = useSettings();

  const setChatModel = useCallback(
    async (chatModel: string) => {
      await updateSettings({
        models: { chatModel },
      });
    },
    [updateSettings]
  );

  return {
    chatModel: settings?.models?.chatModel || 'gpt-4.1-mini',
    setChatModel,
  };
}

export function useTranslateModel() {
  const { settings, updateSettings } = useSettings();

  const setTranslateModel = useCallback(
    async (translateModel: string) => {
      await updateSettings({
        models: { translateModel },
      });
    },
    [updateSettings]
  );

  return {
    translateModel: settings?.models?.translateModel || 'gpt-4.1-mini',
    setTranslateModel,
  };
}

export function useApiKeys() {
  const { settings, updateApiKey } = useSettings();

  return {
    openaiKey: settings?.apiKeys?.openai,
    geminiKey: settings?.apiKeys?.gemini,
    anthropicKey: settings?.apiKeys?.anthropic,
    openaiValidated: settings?.apiKeys?.openaiValidated || false,
    geminiValidated: settings?.apiKeys?.geminiValidated || false,
    anthropicValidated: settings?.apiKeys?.anthropicValidated || false,
    updateApiKey,
  };
}
