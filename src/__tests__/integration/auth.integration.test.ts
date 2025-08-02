import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from '@/services/authService';
import { TokenManager } from '@/services/tokenManager';

/**
 * Integration test for the authentication flow
 * This tests the interaction between AuthService, TokenManager, and Chrome APIs
 */
describe('Authentication Integration Tests', () => {
  let authService: AuthService;
  let tokenManager: TokenManager;
  // Mock server is not used, removed to fix linting

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear singleton instances
    (AuthService as any).instance = null;
    (TokenManager as any).instance = null;

    // Mock setInterval to prevent background timer
    vi.stubGlobal('setInterval', vi.fn());

    authService = AuthService.getInstance();
    tokenManager = TokenManager.getInstance();

    // Clear token cache
    (tokenManager as any).tokenCache.clear();
    (tokenManager as any).refreshPromise = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear singleton instances
    (AuthService as any).instance = null;
    (TokenManager as any).instance = null;
  });

  describe('Complete Authentication Flow', () => {
    it('should complete full authentication flow from login to token refresh', async () => {
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?...';
      const mockTabId = 123;
      const mockAccessToken = 'initial-access-token';
      const mockRefreshToken = 'refresh-token';
      const mockNewAccessToken = 'refreshed-access-token';
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        profile_picture: 'https://example.com/photo.jpg',
      };

      // Step 1: Mock initial login
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          // Get auth URL
          ok: true,
          json: async () => ({ authorization_url: mockAuthUrl }),
        })
        .mockResolvedValueOnce({
          // Token refresh (will be called later)
          ok: true,
          json: async () => ({
            access_token: mockNewAccessToken,
            expires_in: 3600,
          }),
        });

      // Mock Chrome APIs
      const mockChrome = global.chrome as any;
      mockChrome.tabs.create.mockResolvedValueOnce({ id: mockTabId });
      mockChrome.storage.local.set.mockResolvedValue(undefined);

      // Fix: Properly mock storage.local.get to return the correct values based on the keys requested
      mockChrome.storage.local.get.mockImplementation((keys: string | string[]) => {
        if (keys === 'REFRESH_TOKEN' || (Array.isArray(keys) && keys.includes('REFRESH_TOKEN'))) {
          return Promise.resolve({ REFRESH_TOKEN: mockRefreshToken });
        }
        if (
          keys === 'AUTH_TOKEN' ||
          keys === 'AUTH_EXPIRY' ||
          (Array.isArray(keys) && (keys.includes('AUTH_TOKEN') || keys.includes('AUTH_EXPIRY')))
        ) {
          return Promise.resolve({
            AUTH_TOKEN: mockAccessToken,
            AUTH_EXPIRY: Date.now() + 2 * 60 * 1000, // Expiring in 2 minutes
          });
        }
        return Promise.resolve({});
      });

      mockChrome.tabs.remove.mockResolvedValue(undefined);

      // Step 2: Start login process
      const loginPromise = authService.login();

      // Wait for listener to be added
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Step 3: Simulate successful OAuth callback
      const listener = mockChrome.tabs.onUpdated.addListener.mock.calls[0][0];
      listener(
        mockTabId,
        {
          url: `https://shizue.ai/auth/success?access_token=${mockAccessToken}&refresh_token=${mockRefreshToken}&expires_in=3600&user_id=${mockUser.id}&email=${mockUser.email}&name=${mockUser.name}&profile_picture=${mockUser.profile_picture}`,
        },
        {}
      );

      // Step 4: Wait for login to complete
      const loginResult = await loginPromise;

      // Verify login result
      expect(loginResult).toMatchObject({
        access_token: mockAccessToken,
        refresh_token: mockRefreshToken,
        user: mockUser,
      });

      // Step 5: Get a valid token (should trigger refresh due to expiry)
      const validToken = await tokenManager.getValidToken();

      // Verify token was refreshed
      expect(validToken).toBe(mockNewAccessToken);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/v1/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockRefreshToken}`,
          }),
        })
      );

      // Step 6: Verify storage was updated with new token
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          AUTH_TOKEN: mockNewAccessToken,
        })
      );
    });

    it('should handle authentication failure and recovery', async () => {
      const mockChrome = global.chrome as any;

      // Step 1: Simulate expired token scenario
      mockChrome.storage.local.get.mockImplementation((keys: string | string[]) => {
        if (keys === 'REFRESH_TOKEN' || (Array.isArray(keys) && keys.includes('REFRESH_TOKEN'))) {
          return Promise.resolve({ REFRESH_TOKEN: 'invalid-refresh-token' });
        }
        if (
          keys === 'AUTH_TOKEN' ||
          keys === 'AUTH_EXPIRY' ||
          (Array.isArray(keys) && (keys.includes('AUTH_TOKEN') || keys.includes('AUTH_EXPIRY')))
        ) {
          return Promise.resolve({
            AUTH_TOKEN: 'expired-token',
            AUTH_EXPIRY: Date.now() - 1000, // Already expired
          });
        }
        return Promise.resolve({});
      });

      // Mock failed refresh
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      mockChrome.storage.local.remove.mockResolvedValue(undefined);

      // Step 2: Try to get valid token (should fail)
      await expect(tokenManager.getValidToken()).rejects.toThrow('Authentication required');

      // Step 3: Verify tokens were cleared
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        'AUTH_TOKEN',
        'REFRESH_TOKEN',
        'AUTH_EXPIRY',
      ]);

      // Step 4: User needs to re-login
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?...';
      const mockTabId = 456;
      const mockNewAccessToken = 'new-access-token';
      const mockNewRefreshToken = 'new-refresh-token';

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authorization_url: mockAuthUrl }),
      });

      mockChrome.tabs.create.mockResolvedValueOnce({ id: mockTabId });
      mockChrome.tabs.remove.mockResolvedValue(undefined);

      // Step 5: Re-login
      const loginPromise = authService.login();

      await new Promise((resolve) => setTimeout(resolve, 0));

      const listener =
        mockChrome.tabs.onUpdated.addListener.mock.calls[
          mockChrome.tabs.onUpdated.addListener.mock.calls.length - 1
        ][0];
      listener(
        mockTabId,
        {
          url: `https://shizue.ai/auth/success?access_token=${mockNewAccessToken}&refresh_token=${mockNewRefreshToken}&expires_in=3600&user_id=user-456&email=new@example.com&name=New User`,
        },
        {}
      );

      const loginResult = await loginPromise;

      // Step 6: Verify new login was successful
      expect(loginResult.access_token).toBe(mockNewAccessToken);
      expect(loginResult.refresh_token).toBe(mockNewRefreshToken);
    });
  });

  describe('Message Handler Integration', () => {
    it('should handle auth messages through message handlers', async () => {
      const mockChrome = global.chrome as any;
      const mockUser = {
        id: 'user-789',
        email: 'handler@example.com',
        name: 'Handler User',
      };

      // Mock storage for user info
      mockChrome.storage.local.get.mockResolvedValueOnce({
        USER_INFO: mockUser,
      });

      // Test MESSAGE_AUTH_GET_USER_INFO
      const userInfoResult = await AuthService.handleAuthMessage({
        action: 'auth_get_user_info',
      });

      expect(userInfoResult).toEqual({ userInfo: mockUser });

      // Mock storage for auth status check
      mockChrome.storage.local.get.mockResolvedValueOnce({
        AUTH_TOKEN: 'valid-token',
        AUTH_EXPIRY: Date.now() + 60 * 60 * 1000, // 1 hour from now
      });

      // Test MESSAGE_AUTH_CHECK_STATUS
      const statusResult = await AuthService.handleAuthMessage({
        action: 'auth_check_status',
      });

      expect(statusResult).toEqual({ isAuthenticated: true });

      // Mock storage for logout
      mockChrome.storage.local.get.mockResolvedValueOnce({
        AUTH_TOKEN: 'token-to-logout',
      });
      mockChrome.storage.local.remove.mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      });

      // Test MESSAGE_AUTH_LOGOUT
      const logoutResult = await AuthService.handleAuthMessage({
        action: 'auth_logout',
      });

      expect(logoutResult).toEqual({ success: true });
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        'AUTH_TOKEN',
        'REFRESH_TOKEN',
        'AUTH_EXPIRY',
        'USER_INFO',
      ]);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent authentication requests correctly', async () => {
      const mockChrome = global.chrome as any;
      const mockAccessToken = 'concurrent-token';
      const futureExpiry = Date.now() + 60 * 60 * 1000;

      // Mock multiple concurrent auth status checks
      mockChrome.storage.local.get.mockResolvedValue({
        AUTH_TOKEN: mockAccessToken,
        AUTH_EXPIRY: futureExpiry,
      });

      // Make concurrent requests
      const promises = [
        authService.checkAuthStatus(),
        authService.checkAuthStatus(),
        authService.checkAuthStatus(),
        authService.getAccessToken(),
        authService.getUserInfo(),
      ];

      const results = await Promise.all(promises);

      // All auth status checks should return true
      expect(results[0]).toBe(true);
      expect(results[1]).toBe(true);
      expect(results[2]).toBe(true);
      expect(results[3]).toBe(mockAccessToken);

      // Storage should be called efficiently (not excessively)
      expect(mockChrome.storage.local.get.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it('should handle concurrent token refresh requests', async () => {
      const mockChrome = global.chrome as any;
      const expiredExpiry = Date.now() - 1000;
      const mockRefreshToken = 'concurrent-refresh-token';
      const mockNewAccessToken = 'concurrent-new-token';

      // Fix: Properly mock storage.local.get to handle different key requests
      mockChrome.storage.local.get.mockImplementation((keys: string | string[]) => {
        if (keys === 'REFRESH_TOKEN' || (Array.isArray(keys) && keys.includes('REFRESH_TOKEN'))) {
          return Promise.resolve({ REFRESH_TOKEN: mockRefreshToken });
        }
        if (
          keys === 'AUTH_TOKEN' ||
          keys === 'AUTH_EXPIRY' ||
          (Array.isArray(keys) && (keys.includes('AUTH_TOKEN') || keys.includes('AUTH_EXPIRY')))
        ) {
          return Promise.resolve({
            AUTH_TOKEN: 'expired',
            AUTH_EXPIRY: expiredExpiry,
          });
        }
        return Promise.resolve({});
      });

      // Mock successful refresh (with delay to simulate network)
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({
                  access_token: mockNewAccessToken,
                  expires_in: 3600,
                }),
              });
            }, 50);
          })
      );

      mockChrome.storage.local.set.mockResolvedValue(undefined);

      // Make concurrent token requests
      const promises = [
        tokenManager.getValidToken(),
        tokenManager.getValidToken(),
        tokenManager.getValidToken(),
      ];

      const results = await Promise.all(promises);

      // All should get the same new token
      expect(results).toEqual([mockNewAccessToken, mockNewAccessToken, mockNewAccessToken]);

      // Refresh should only be called once despite concurrent requests
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
