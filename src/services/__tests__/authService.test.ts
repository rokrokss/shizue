import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { AuthService } from '../authService';

// Mock chrome API
const mockChrome = {
  tabs: {
    create: vi.fn(),
    remove: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
};

// Mock fetch
global.fetch = vi.fn();

// Replace global chrome with mock
(global as any).chrome = mockChrome;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    // Get singleton instance
    authService = AuthService.getInstance();
  });

  describe('login', () => {
    it('should successfully login with Google OAuth', async () => {
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?...';
      const mockTabId = 123;
      const mockAuthResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          profile_picture: 'https://example.com/photo.jpg',
        },
      };

      // Mock fetch response for getting auth URL
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authorization_url: mockAuthUrl }),
      });

      // Mock chrome.tabs.create
      mockChrome.tabs.create.mockResolvedValueOnce({ id: mockTabId });

      // Mock chrome.storage.local.set
      mockChrome.storage.local.set.mockResolvedValueOnce(undefined);

      // Create a promise that will be resolved when the tab listener is added
      const loginPromise = authService.login();

      // Wait for the listener to be added
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Get the listener function that was added
      const listenerCall = mockChrome.tabs.onUpdated.addListener.mock.calls[0];
      expect(listenerCall).toBeDefined();
      const listener = listenerCall[0];

      // Simulate successful OAuth callback
      listener(
        mockTabId,
        {
          url: `https://shizue.ai/auth/success?access_token=${mockAuthResponse.access_token}&refresh_token=${mockAuthResponse.refresh_token}&expires_in=${mockAuthResponse.expires_in}&user_id=${mockAuthResponse.user.id}&email=${mockAuthResponse.user.email}&name=${mockAuthResponse.user.name}&profile_picture=${mockAuthResponse.user.profile_picture}`,
        },
        {}
      );

      // Wait for the login to complete
      const result = await loginPromise;

      // Verify the result
      expect(result).toEqual(mockAuthResponse);

      // Verify chrome APIs were called correctly
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/v1/auth/login/google'));
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: mockAuthUrl });
      expect(mockChrome.tabs.remove).toHaveBeenCalledWith(mockTabId);
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it('should handle login failure', async () => {
      // Mock fetch to return error
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      // Attempt login and expect it to throw
      await expect(authService.login()).rejects.toThrow('Failed to get authorization URL');
    });

    it('should handle OAuth error callback', async () => {
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?...';
      const mockTabId = 123;

      // Mock fetch response
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authorization_url: mockAuthUrl }),
      });

      // Mock chrome.tabs.create
      mockChrome.tabs.create.mockResolvedValueOnce({ id: mockTabId });

      // Start login
      const loginPromise = authService.login();

      // Wait for listener to be added
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Get the listener
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];

      // Simulate error callback
      listener(
        mockTabId,
        {
          url: 'https://shizue.ai/auth/error?error=access_denied',
        },
        {}
      );

      // Expect login to reject
      await expect(loginPromise).rejects.toThrow('access_denied');
      expect(mockChrome.tabs.remove).toHaveBeenCalledWith(mockTabId);
    });
  });

  describe('logout', () => {
    it('should successfully logout', async () => {
      const mockToken = 'mock-access-token';

      // Mock storage.get to return token
      mockChrome.storage.local.get.mockResolvedValueOnce({
        AUTH_TOKEN: mockToken,
      });

      // Mock fetch for logout
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
      });

      // Mock storage.remove
      mockChrome.storage.local.remove.mockResolvedValueOnce(undefined);

      // Perform logout
      await authService.logout();

      // Verify API call
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );

      // Verify storage was cleared
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        'AUTH_TOKEN',
        'REFRESH_TOKEN',
        'AUTH_EXPIRY',
        'USER_INFO',
      ]);
    });

    it('should clear storage even if logout API fails', async () => {
      // Mock storage.get to return no token
      mockChrome.storage.local.get.mockResolvedValueOnce({});

      // Mock storage.remove
      mockChrome.storage.local.remove.mockResolvedValueOnce(undefined);

      // Perform logout
      await authService.logout();

      // Verify storage was still cleared
      expect(mockChrome.storage.local.remove).toHaveBeenCalled();
    });
  });

  describe('checkAuthStatus', () => {
    it('should return true when token is valid', async () => {
      const futureExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now

      // Mock storage to return valid token
      mockChrome.storage.local.get.mockResolvedValueOnce({
        AUTH_TOKEN: 'valid-token',
        AUTH_EXPIRY: futureExpiry,
      });

      const isAuthenticated = await authService.checkAuthStatus();
      expect(isAuthenticated).toBe(true);
    });

    it('should return false when token is expired', async () => {
      const pastExpiry = Date.now() - 10 * 60 * 1000; // 10 minutes ago

      // Mock storage to return expired token
      mockChrome.storage.local.get.mockResolvedValueOnce({
        AUTH_TOKEN: 'expired-token',
        AUTH_EXPIRY: pastExpiry,
      });

      const isAuthenticated = await authService.checkAuthStatus();
      expect(isAuthenticated).toBe(false);
    });

    it('should return false when no token exists', async () => {
      // Mock storage to return empty
      mockChrome.storage.local.get.mockResolvedValueOnce({});

      const isAuthenticated = await authService.checkAuthStatus();
      expect(isAuthenticated).toBe(false);
    });
  });

  describe('getUserInfo', () => {
    it('should return user info when available', async () => {
      const mockUserInfo = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        profile_picture: 'https://example.com/photo.jpg',
      };

      // Mock storage to return user info
      mockChrome.storage.local.get.mockResolvedValueOnce({
        USER_INFO: mockUserInfo,
      });

      const userInfo = await authService.getUserInfo();
      expect(userInfo).toEqual(mockUserInfo);
    });

    it('should return null when no user info exists', async () => {
      // Mock storage to return empty
      mockChrome.storage.local.get.mockResolvedValueOnce({});

      const userInfo = await authService.getUserInfo();
      expect(userInfo).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('should return access token when available', async () => {
      const mockToken = 'mock-access-token';

      // Mock storage to return token
      mockChrome.storage.local.get.mockResolvedValueOnce({
        AUTH_TOKEN: mockToken,
      });

      const token = await authService.getAccessToken();
      expect(token).toBe(mockToken);
    });

    it('should return null when no token exists', async () => {
      // Mock storage to return empty
      mockChrome.storage.local.get.mockResolvedValueOnce({});

      const token = await authService.getAccessToken();
      expect(token).toBeNull();
    });
  });
});
