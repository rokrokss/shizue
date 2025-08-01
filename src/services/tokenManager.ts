import {
  STORAGE_AUTH_TOKEN,
  STORAGE_REFRESH_TOKEN,
  STORAGE_AUTH_EXPIRY,
  MESSAGE_AUTH_REFRESH_TOKEN,
} from '@/config/constants';

interface TokenInfo {
  token: string;
  expiry: number;
}

export class TokenManager {
  private static instance: TokenManager;
  private tokenCache: Map<string, TokenInfo> = new Map();
  private refreshPromise: Promise<string> | null = null;
  private readonly API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.shizue.ai';
  private readonly REFRESH_BUFFER_TIME = 5 * 60 * 1000; // 5 minutes
  private refreshTimer: number | null = null;

  private constructor() {
    // Schedule token refresh check when instance is created
    this.scheduleTokenRefreshCheck();
  }

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  async getValidToken(): Promise<string> {
    try {
      // 1. Check memory cache first
      const cached = this.tokenCache.get('access_token');
      if (cached && !this.isExpiringSoon(cached)) {
        return cached.token;
      }

      // 2. Check Chrome Storage
      const stored = await this.getStoredToken();
      if (stored && !this.isExpiringSoon(stored)) {
        this.cacheToken(stored);
        return stored.token;
      }

      // 3. Token needs refresh
      return await this.refreshToken();
    } catch (error) {
      console.error('Failed to get valid token:', error);
      throw error;
    }
  }

  private async getStoredToken(): Promise<TokenInfo | null> {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_AUTH_TOKEN,
        STORAGE_AUTH_EXPIRY,
      ]);

      if (result[STORAGE_AUTH_TOKEN] && result[STORAGE_AUTH_EXPIRY]) {
        return {
          token: result[STORAGE_AUTH_TOKEN],
          expiry: result[STORAGE_AUTH_EXPIRY],
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get stored token:', error);
      return null;
    }
  }

  private isExpiringSoon(tokenInfo: TokenInfo): boolean {
    return tokenInfo.expiry < Date.now() + this.REFRESH_BUFFER_TIME;
  }

  private cacheToken(tokenInfo: TokenInfo): void {
    this.tokenCache.set('access_token', tokenInfo);
    
    // Schedule automatic refresh before expiry
    this.scheduleTokenRefresh(tokenInfo.expiry);
  }

  private async refreshToken(): Promise<string> {
    // Prevent concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    
    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<string> {
    try {
      const { [STORAGE_REFRESH_TOKEN]: refresh_token } = await chrome.storage.local.get(STORAGE_REFRESH_TOKEN);
      
      if (!refresh_token) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${this.API_BASE_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${refresh_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Refresh token is invalid, need to re-login
          await this.clearTokens();
          throw new Error('Authentication required');
        }
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const { access_token, expires_in } = await response.json();
      const expiry = Date.now() + (expires_in * 1000);

      // Save new token
      await chrome.storage.local.set({
        [STORAGE_AUTH_TOKEN]: access_token,
        [STORAGE_AUTH_EXPIRY]: expiry,
      });

      // Update cache
      const tokenInfo = { token: access_token, expiry };
      this.cacheToken(tokenInfo);

      return access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  private scheduleTokenRefresh(expiry: number): void {
    // Clear any existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Calculate when to refresh (5 minutes before expiry)
    const refreshTime = expiry - this.REFRESH_BUFFER_TIME;
    const delay = refreshTime - Date.now();

    if (delay > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken().catch(error => {
          console.error('Scheduled token refresh failed:', error);
        });
      }, delay) as unknown as number;
    }
  }

  private scheduleTokenRefreshCheck(): void {
    // Check token status every minute
    setInterval(async () => {
      try {
        const stored = await this.getStoredToken();
        if (stored && this.isExpiringSoon(stored)) {
          await this.refreshToken();
        }
      } catch (error) {
        console.error('Token refresh check failed:', error);
      }
    }, 60 * 1000); // 1 minute
  }

  async clearTokens(): Promise<void> {
    this.tokenCache.clear();
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    await chrome.storage.local.remove([
      STORAGE_AUTH_TOKEN,
      STORAGE_REFRESH_TOKEN,
      STORAGE_AUTH_EXPIRY,
    ]);
  }

  // For background script message handling
  static async handleRefreshMessage(): Promise<any> {
    const tokenManager = TokenManager.getInstance();
    
    try {
      const token = await tokenManager.refreshToken();
      return { success: true, token };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}