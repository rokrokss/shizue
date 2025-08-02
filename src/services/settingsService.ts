/**
 * Settings Service for managing user settings
 * Handles both server sync and local storage with offline support
 */

import { TokenManager } from './tokenManager';
import { AuthService } from './authService';
import {
  UserSettings,
  UserSettingsUpdate,
  ApiKeyRequest,
  ApiKeyResponse,
  STORAGE_KEY_MAPPING,
  AvailableModelsResponse,
} from '@/types/settings';
import * as constants from '@/config/constants';

interface SyncQueueItem {
  type: 'update' | 'patch';
  data: UserSettings | UserSettingsUpdate;
  timestamp: number;
}

class SettingsService {
  private static instance: SettingsService;
  private cache: UserSettings | null = null;
  private syncQueue: SyncQueueItem[] = [];
  private isSyncing = false;
  private readonly API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.shizue.ai';
  private readonly CACHE_KEY = 'SETTINGS_CACHE';
  private readonly SYNC_QUEUE_KEY = 'SETTINGS_SYNC_QUEUE';
  private readonly MIGRATED_KEY = 'SETTINGS_MIGRATED';

  private constructor() {
    this.loadCacheFromLocal();
    this.loadSyncQueue();
    // Try to process sync queue on initialization
    this.processSyncQueue();
  }

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * Load settings from server or local cache
   */
  async loadSettings(): Promise<UserSettings> {
    // Check if user is authenticated
    const isAuthenticated = await AuthService.getInstance().checkAuthStatus();

    if (!isAuthenticated) {
      // Not authenticated, use local storage
      return this.loadFromLocalStorage();
    }

    try {
      // Try to fetch from server
      const settings = await this.fetchFromServer();
      this.cache = settings;
      this.saveCacheToLocal();

      // Migrate local settings if not done yet
      const migrated = await chrome.storage.local.get(this.MIGRATED_KEY);
      if (!migrated[this.MIGRATED_KEY]) {
        await this.migrateFromLocalStorage();
      }

      return settings;
    } catch (error) {
      console.error('Failed to fetch settings from server:', error);
      // Fall back to cache
      if (this.cache) {
        return this.cache;
      }
      // Fall back to local storage
      return this.loadFromLocalStorage();
    }
  }

  /**
   * Get a specific setting value
   */
  async getSetting<T = any>(path: string): Promise<T | undefined> {
    const settings = await this.loadSettings();
    return this.getNestedValue(settings, path);
  }

  /**
   * Update settings (with offline support)
   */
  async updateSettings(update: UserSettingsUpdate): Promise<UserSettings> {
    // Update cache immediately for responsiveness
    if (this.cache) {
      this.mergeSettings(this.cache, update);
      this.saveCacheToLocal();
    }

    const isAuthenticated = await AuthService.getInstance().checkAuthStatus();

    if (!isAuthenticated) {
      // Not authenticated, save to local storage
      return this.saveToLocalStorage(update);
    }

    try {
      // Try to sync with server
      const settings = await this.patchToServer(update);
      this.cache = settings;
      this.saveCacheToLocal();
      return settings;
    } catch (error) {
      console.error('Failed to update settings on server:', error);
      // Queue for later sync
      this.addToSyncQueue('patch', update);
      // Return cached version
      return this.cache || this.getDefaultSettings();
    }
  }

  /**
   * Update a specific API key
   */
  async updateApiKey(
    provider: 'openai' | 'gemini' | 'anthropic',
    key: string
  ): Promise<ApiKeyResponse> {
    const isAuthenticated = await AuthService.getInstance().checkAuthStatus();

    if (!isAuthenticated) {
      // Save to local storage
      const storageKey = `${provider.toUpperCase()}_KEY` as keyof typeof constants;
      await chrome.storage.local.set({ [constants[storageKey]]: key });

      return {
        provider,
        maskedKey: this.maskApiKey(key),
        validated: false,
      };
    }

    try {
      const token = await TokenManager.getInstance().getValidToken();
      const response = await fetch(`${this.API_BASE_URL}/v1/settings/api-keys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, key } as ApiKeyRequest),
      });

      if (!response.ok) {
        throw new Error(`Failed to update API key: ${response.statusText}`);
      }

      const result: ApiKeyResponse = await response.json();

      // Update cache
      if (this.cache) {
        this.cache.apiKeys[provider] = result.maskedKey;
        this.cache.apiKeys[`${provider}Validated`] = result.validated;
        this.saveCacheToLocal();
      }

      return result;
    } catch (error) {
      console.error('Failed to update API key:', error);
      throw error;
    }
  }

  /**
   * Migrate settings from localStorage to server
   */
  async migrateFromLocalStorage(): Promise<void> {
    const localSettings: Record<string, any> = {};

    // Collect all settings from localStorage
    for (const [oldKey] of Object.entries(STORAGE_KEY_MAPPING)) {
      const storageKey = constants[oldKey as keyof typeof constants];
      if (storageKey) {
        const result = await chrome.storage.local.get(storageKey);
        if (result[storageKey] !== undefined) {
          localSettings[oldKey] = result[storageKey];
        }
      }
    }

    if (Object.keys(localSettings).length === 0) {
      // No settings to migrate
      await chrome.storage.local.set({ [this.MIGRATED_KEY]: true });
      return;
    }

    try {
      const token = await TokenManager.getInstance().getValidToken();
      const response = await fetch(`${this.API_BASE_URL}/v1/settings/migrate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(localSettings),
      });

      if (!response.ok) {
        throw new Error(`Migration failed: ${response.statusText}`);
      }

      const settings: UserSettings = await response.json();
      this.cache = settings;
      this.saveCacheToLocal();

      // Mark as migrated
      await chrome.storage.local.set({ [this.MIGRATED_KEY]: true });

      console.info('Settings migrated successfully');
    } catch (error) {
      console.error('Failed to migrate settings:', error);
    }
  }

  /**
   * Process offline sync queue
   */
  async processSyncQueue(): Promise<void> {
    if (this.isSyncing || this.syncQueue.length === 0) {
      return;
    }

    const isAuthenticated = await AuthService.getInstance().checkAuthStatus();
    if (!isAuthenticated) {
      return;
    }

    this.isSyncing = true;

    try {
      while (this.syncQueue.length > 0) {
        const item = this.syncQueue[0];

        if (item.type === 'patch') {
          await this.patchToServer(item.data as UserSettingsUpdate);
        } else {
          await this.updateToServer(item.data as UserSettings);
        }

        // Remove processed item
        this.syncQueue.shift();
        this.saveSyncQueue();
      }
    } catch (error) {
      console.error('Failed to process sync queue:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  // Private helper methods

  private async fetchFromServer(): Promise<UserSettings> {
    const token = await TokenManager.getInstance().getValidToken();
    const response = await fetch(`${this.API_BASE_URL}/v1/settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.statusText}`);
    }

    return response.json();
  }

  private async updateToServer(settings: UserSettings): Promise<UserSettings> {
    const token = await TokenManager.getInstance().getValidToken();
    const response = await fetch(`${this.API_BASE_URL}/v1/settings`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      throw new Error(`Failed to update settings: ${response.statusText}`);
    }

    return response.json();
  }

  private async patchToServer(update: UserSettingsUpdate): Promise<UserSettings> {
    const token = await TokenManager.getInstance().getValidToken();
    const response = await fetch(`${this.API_BASE_URL}/v1/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(update),
    });

    if (!response.ok) {
      throw new Error(`Failed to patch settings: ${response.statusText}`);
    }

    return response.json();
  }

  private loadFromLocalStorage(): UserSettings {
    const settings = this.getDefaultSettings();

    // Load each setting from chrome.storage.local synchronously would be complex,
    // so we'll use the cache if available
    if (this.cache) {
      return this.cache;
    }

    return settings;
  }

  private async saveToLocalStorage(update: UserSettingsUpdate): Promise<UserSettings> {
    const settings = this.cache || this.getDefaultSettings();
    this.mergeSettings(settings, update);

    // Save individual settings to chrome.storage.local
    const updates: Record<string, any> = {};

    for (const [oldKey, newPath] of Object.entries(STORAGE_KEY_MAPPING)) {
      const value = this.getNestedValue(settings, newPath);
      if (value !== undefined) {
        const storageKey = constants[oldKey as keyof typeof constants];
        if (storageKey) {
          updates[storageKey] = value;
        }
      }
    }

    await chrome.storage.local.set(updates);

    this.cache = settings;
    this.saveCacheToLocal();

    return settings;
  }

  private loadCacheFromLocal(): void {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        this.cache = JSON.parse(cached);
      }
    } catch (error) {
      console.error('Failed to load cache:', error);
    }
  }

  private saveCacheToLocal(): void {
    try {
      if (this.cache) {
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.cache));
      }
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }

  private loadSyncQueue(): void {
    try {
      const queue = localStorage.getItem(this.SYNC_QUEUE_KEY);
      if (queue) {
        this.syncQueue = JSON.parse(queue);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  }

  private saveSyncQueue(): void {
    try {
      localStorage.setItem(this.SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  private addToSyncQueue(type: 'update' | 'patch', data: UserSettings | UserSettingsUpdate): void {
    this.syncQueue.push({
      type,
      data,
      timestamp: Date.now(),
    });
    this.saveSyncQueue();
  }

  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  private mergeSettings(target: UserSettings, update: UserSettingsUpdate): void {
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          // Merge nested objects
          if (!target[key as keyof UserSettings]) {
            (target as any)[key] = {};
          }
          Object.assign(target[key as keyof UserSettings] as any, value);
        } else {
          // Direct assignment
          (target as any)[key] = value;
        }
      }
    }
  }

  /**
   * Get available models based on user's API keys
   */
  async getAvailableModels(
    size?: 'large' | 'small',
    provider?: 'openai' | 'gemini' | 'anthropic'
  ): Promise<AvailableModelsResponse> {
    const isAuthenticated = await AuthService.getInstance().checkAuthStatus();

    if (!isAuthenticated) {
      // Return empty response for unauthenticated users
      return { models: {}, availableProviders: [] };
    }

    try {
      const token = await TokenManager.getInstance().getValidToken();
      const params = new URLSearchParams();
      if (size) params.append('size', size);
      if (provider) params.append('provider', provider);

      const response = await fetch(`${this.API_BASE_URL}/v1/settings/models?${params}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get available models: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get available models:', error);
      return { models: {}, availableProviders: [] };
    }
  }

  private maskApiKey(key: string): string {
    if (!key || key.length < 8) {
      return '****';
    }
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  private getDefaultSettings(): UserSettings {
    return {
      general: {
        language: 'English',
        translateTargetLanguage: 'English',
        userMemory: '',
      },
      models: {
        chatModel: 'gpt-4.1-mini',
        translateModel: 'gpt-4.1-mini',
      },
      layout: {
        theme: 'light',
        showToggle: true,
        toggleYPosition: 50,
        showYoutubeCaptionToggle: true,
        showYoutubeBilingualCaption: true,
        useYoutubeKeyboardNavigate: false,
        youtubeCaptionSizeRatio: 1.0,
        toggleHiddenSiteList: [],
      },
      apiKeys: {
        openai: undefined,
        gemini: undefined,
        anthropic: undefined,
        openaiValidated: false,
        geminiValidated: false,
        anthropicValidated: false,
      },
      apiMode: 'keys',
      apiModePreference: 'keys',
      pdfTranslateNoDual: false,
    };
  }

  /**
   * Clear all cached settings (useful for logout)
   */
  clearCache(): void {
    this.cache = null;
    localStorage.removeItem(this.CACHE_KEY);
    localStorage.removeItem(this.SYNC_QUEUE_KEY);
    chrome.storage.local.remove(this.MIGRATED_KEY);
  }
}

export default SettingsService;
