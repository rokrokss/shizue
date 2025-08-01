import {
  STORAGE_AUTH_TOKEN,
  STORAGE_REFRESH_TOKEN,
  STORAGE_USER_INFO,
  STORAGE_AUTH_EXPIRY,
  MESSAGE_AUTH_LOGIN,
  MESSAGE_AUTH_LOGOUT,
  MESSAGE_AUTH_CHECK_STATUS,
  MESSAGE_AUTH_GET_USER_INFO,
} from '@/config/constants';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  profile_picture?: string;
}

export interface AuthResponse extends AuthTokens {
  user: UserInfo;
}

export class AuthService {
  private static instance: AuthService;
  private authTabId: number | null = null;
  private readonly API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.shizue.ai';
  private readonly AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://shizue.ai/auth';

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async login(): Promise<AuthResponse> {
    try {
      // 1. Get OAuth authorization URL from backend
      const authUrlResponse = await fetch(`${this.API_BASE_URL}/v1/auth/google/authorize`);
      if (!authUrlResponse.ok) {
        throw new Error('Failed to get authorization URL');
      }
      
      const { authorization_url } = await authUrlResponse.json();
      
      // 2. Open new tab with OAuth flow
      const tab = await chrome.tabs.create({ url: authorization_url });
      this.authTabId = tab.id!;
      
      // 3. Wait for OAuth callback
      const tokens = await this.waitForAuthCallback();
      
      // 4. Store tokens and user info
      await this.saveAuthData(tokens);
      
      return tokens;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  private waitForAuthCallback(): Promise<AuthResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.authTabId) {
          chrome.tabs.remove(this.authTabId);
        }
        reject(new Error('Authentication timeout'));
      }, 60000); // 1 minute timeout

      const handleTabUpdate = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
        if (tabId === this.authTabId && changeInfo.url) {
          const url = new URL(changeInfo.url);
          
          // Check for success callback
          if (url.pathname === '/auth/success') {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(handleTabUpdate);
            
            const authResponse: AuthResponse = {
              access_token: url.searchParams.get('access_token') || '',
              refresh_token: url.searchParams.get('refresh_token') || '',
              expires_in: parseInt(url.searchParams.get('expires_in') || '3600'),
              user: {
                id: url.searchParams.get('user_id') || '',
                email: url.searchParams.get('email') || '',
                name: url.searchParams.get('name') || '',
                profile_picture: url.searchParams.get('profile_picture') || undefined,
              }
            };
            
            // Close the auth tab
            chrome.tabs.remove(tabId);
            this.authTabId = null;
            
            resolve(authResponse);
          }
          
          // Check for error callback
          if (url.pathname === '/auth/error') {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(handleTabUpdate);
            chrome.tabs.remove(tabId);
            this.authTabId = null;
            
            const error = url.searchParams.get('error') || 'Authentication failed';
            reject(new Error(error));
          }
        }
      };

      chrome.tabs.onUpdated.addListener(handleTabUpdate);
    });
  }

  async logout(): Promise<void> {
    try {
      const { [STORAGE_AUTH_TOKEN]: access_token } = await chrome.storage.local.get(STORAGE_AUTH_TOKEN);
      
      if (access_token) {
        // Call backend logout endpoint
        await fetch(`${this.API_BASE_URL}/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local storage
      await this.clearAuthData();
    }
  }

  async checkAuthStatus(): Promise<boolean> {
    try {
      const { 
        [STORAGE_AUTH_TOKEN]: access_token,
        [STORAGE_AUTH_EXPIRY]: expiry 
      } = await chrome.storage.local.get([STORAGE_AUTH_TOKEN, STORAGE_AUTH_EXPIRY]);
      
      if (!access_token || !expiry) {
        return false;
      }
      
      // Check if token is expired (with 5 minute buffer)
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      if (expiry < Date.now() + bufferTime) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Auth status check failed:', error);
      return false;
    }
  }

  async getUserInfo(): Promise<UserInfo | null> {
    try {
      const { [STORAGE_USER_INFO]: userInfo } = await chrome.storage.local.get(STORAGE_USER_INFO);
      return userInfo || null;
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  }

  async getAccessToken(): Promise<string | null> {
    try {
      const { [STORAGE_AUTH_TOKEN]: access_token } = await chrome.storage.local.get(STORAGE_AUTH_TOKEN);
      return access_token || null;
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  private async saveAuthData(authResponse: AuthResponse): Promise<void> {
    const expiry = Date.now() + (authResponse.expires_in * 1000);
    
    await chrome.storage.local.set({
      [STORAGE_AUTH_TOKEN]: authResponse.access_token,
      [STORAGE_REFRESH_TOKEN]: authResponse.refresh_token,
      [STORAGE_AUTH_EXPIRY]: expiry,
      [STORAGE_USER_INFO]: authResponse.user,
    });
  }

  private async clearAuthData(): Promise<void> {
    await chrome.storage.local.remove([
      STORAGE_AUTH_TOKEN,
      STORAGE_REFRESH_TOKEN,
      STORAGE_AUTH_EXPIRY,
      STORAGE_USER_INFO,
    ]);
  }

  // Message handler for background script
  static async handleAuthMessage(message: any): Promise<any> {
    const authService = AuthService.getInstance();
    
    switch (message.action) {
      case MESSAGE_AUTH_LOGIN:
        return authService.login();
        
      case MESSAGE_AUTH_LOGOUT:
        await authService.logout();
        return { success: true };
        
      case MESSAGE_AUTH_CHECK_STATUS:
        const isAuthenticated = await authService.checkAuthStatus();
        return { isAuthenticated };
        
      case MESSAGE_AUTH_GET_USER_INFO:
        const userInfo = await authService.getUserInfo();
        return { userInfo };
        
      default:
        throw new Error(`Unknown auth action: ${message.action}`);
    }
  }
}