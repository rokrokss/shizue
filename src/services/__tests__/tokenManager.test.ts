import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest';
import { TokenManager } from '../tokenManager';
import { STORAGE_AUTH_TOKEN, STORAGE_REFRESH_TOKEN, STORAGE_AUTH_EXPIRY } from '@/config/constants';

// Mock chrome API
const mockChrome = {
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

describe('TokenManager', () => {
  let tokenManager: TokenManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Clear the singleton instance to ensure fresh start for each test
    (TokenManager as any).instance = null;

    // Mock setInterval to prevent background timer
    vi.stubGlobal('setInterval', vi.fn());

    tokenManager = TokenManager.getInstance();
    // Clear the token cache
    (tokenManager as any).tokenCache.clear();
    (tokenManager as any).refreshPromise = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // Clear the singleton instance after each test
    (TokenManager as any).instance = null;
  });

  describe('getValidToken', () => {
    it('should return cached token when valid', async () => {
      const mockToken = 'cached-token';
      const futureExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now

      // First call will fetch from storage
      mockChrome.storage.local.get.mockResolvedValueOnce({
        AUTH_TOKEN: mockToken,
        AUTH_EXPIRY: futureExpiry,
      });

      // Get token first time (from storage)
      const token1 = await tokenManager.getValidToken();
      expect(token1).toBe(mockToken);
      expect(mockChrome.storage.local.get).toHaveBeenCalledTimes(1);

      // Get token second time (from cache)
      const token2 = await tokenManager.getValidToken();
      expect(token2).toBe(mockToken);
      // Should not call storage again (cache should be used)
      expect(mockChrome.storage.local.get).toHaveBeenCalledTimes(1);
    });

    it('should refresh token when expiring soon', async () => {
      const oldToken = 'old-token';
      const newToken = 'new-token';
      const expiringExpiry = Date.now() + 3 * 60 * 1000; // 3 minutes from now (less than 5 min buffer)
      const refreshToken = 'refresh-token';

      // Mock storage to return expiring token
      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (
          keys === STORAGE_REFRESH_TOKEN ||
          (Array.isArray(keys) && keys.includes(STORAGE_REFRESH_TOKEN))
        ) {
          return Promise.resolve({ [STORAGE_REFRESH_TOKEN]: refreshToken });
        }
        if (Array.isArray(keys) && keys.includes(STORAGE_AUTH_TOKEN)) {
          return Promise.resolve({
            [STORAGE_AUTH_TOKEN]: oldToken,
            [STORAGE_AUTH_EXPIRY]: expiringExpiry,
          });
        }
        return Promise.resolve({});
      });

      // Mock successful refresh response
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newToken,
          expires_in: 3600,
        }),
      });

      // Mock storage.set for saving new token
      mockChrome.storage.local.set.mockResolvedValueOnce(undefined);

      // Get token (should trigger refresh)
      const token = await tokenManager.getValidToken();
      expect(token).toBe(newToken);

      // Verify refresh was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${refreshToken}`,
          }),
        })
      );

      // Verify new token was saved
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          AUTH_TOKEN: newToken,
        })
      );
    });

    it('should handle refresh token failure', async () => {
      const expiredToken = 'expired-token';
      const expiredExpiry = Date.now() - 1000; // Already expired
      const refreshToken = 'invalid-refresh-token';

      // Mock storage to return expired token
      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (
          keys === STORAGE_REFRESH_TOKEN ||
          (Array.isArray(keys) && keys.includes(STORAGE_REFRESH_TOKEN))
        ) {
          return Promise.resolve({ [STORAGE_REFRESH_TOKEN]: refreshToken });
        }
        if (Array.isArray(keys) && keys.includes(STORAGE_AUTH_TOKEN)) {
          return Promise.resolve({
            [STORAGE_AUTH_TOKEN]: expiredToken,
            [STORAGE_AUTH_EXPIRY]: expiredExpiry,
          });
        }
        return Promise.resolve({});
      });

      // Mock failed refresh response (401)
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      // Mock storage.remove for clearing tokens
      mockChrome.storage.local.remove.mockResolvedValueOnce(undefined);

      // Attempt to get token and expect failure
      await expect(tokenManager.getValidToken()).rejects.toThrow('Authentication required');

      // Verify tokens were cleared
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        STORAGE_AUTH_TOKEN,
        STORAGE_REFRESH_TOKEN,
        STORAGE_AUTH_EXPIRY,
      ]);
    });

    it('should prevent concurrent refresh requests', async () => {
      const expiredExpiry = Date.now() - 1000;
      const refreshToken = 'refresh-token';
      const newToken = 'new-token';

      // Mock storage to return expired token
      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (
          keys === STORAGE_REFRESH_TOKEN ||
          (Array.isArray(keys) && keys.includes(STORAGE_REFRESH_TOKEN))
        ) {
          return Promise.resolve({ [STORAGE_REFRESH_TOKEN]: refreshToken });
        }
        if (Array.isArray(keys) && keys.includes(STORAGE_AUTH_TOKEN)) {
          return Promise.resolve({
            [STORAGE_AUTH_TOKEN]: 'expired',
            [STORAGE_AUTH_EXPIRY]: expiredExpiry,
          });
        }
        return Promise.resolve({});
      });

      // Mock successful refresh (immediate)
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newToken,
          expires_in: 3600,
        }),
      });

      mockChrome.storage.local.set.mockResolvedValue(undefined);

      // Start multiple concurrent requests
      const promises = [
        tokenManager.getValidToken(),
        tokenManager.getValidToken(),
        tokenManager.getValidToken(),
      ];

      // Wait for all promises
      const results = await Promise.all(promises);

      // All should return the same token
      expect(results).toEqual([newToken, newToken, newToken]);

      // Refresh should only be called once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('automatic token refresh scheduling', () => {
    it('should schedule refresh before token expiry', async () => {
      const mockToken = 'valid-token';
      const expiryTime = Date.now() + 60 * 60 * 1000; // 1 hour from now
      const refreshToken = 'refresh-token';
      const newToken = 'refreshed-token';

      // Mock storage to return valid token
      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (
          keys === STORAGE_REFRESH_TOKEN ||
          (Array.isArray(keys) && keys.includes(STORAGE_REFRESH_TOKEN))
        ) {
          return Promise.resolve({ [STORAGE_REFRESH_TOKEN]: refreshToken });
        }
        if (Array.isArray(keys) && keys.includes(STORAGE_AUTH_TOKEN)) {
          return Promise.resolve({
            [STORAGE_AUTH_TOKEN]: mockToken,
            [STORAGE_AUTH_EXPIRY]: expiryTime,
          });
        }
        return Promise.resolve({});
      });

      // Get token (should schedule refresh)
      const token = await tokenManager.getValidToken();
      expect(token).toBe(mockToken);

      // Mock successful refresh
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newToken,
          expires_in: 3600,
        }),
      });

      mockChrome.storage.local.set.mockResolvedValueOnce(undefined);

      // Fast-forward to just before expiry (55 minutes)
      await vi.advanceTimersByTimeAsync(55 * 60 * 1000);

      // Verify refresh was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/auth/refresh'),
        expect.any(Object)
      );
    });
  });

  describe('clearTokens', () => {
    it('should clear all auth tokens', async () => {
      mockChrome.storage.local.remove.mockResolvedValueOnce(undefined);

      // Access private method through instance
      await (tokenManager as any).clearTokens();

      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        STORAGE_AUTH_TOKEN,
        STORAGE_REFRESH_TOKEN,
        STORAGE_AUTH_EXPIRY,
      ]);
    });
  });

  describe('handleRefreshMessage', () => {
    it('should handle refresh message successfully', async () => {
      const refreshToken = 'refresh-token';
      const newToken = 'new-access-token';

      // Mock storage to return refresh token
      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (
          keys === STORAGE_REFRESH_TOKEN ||
          (Array.isArray(keys) && keys.includes(STORAGE_REFRESH_TOKEN))
        ) {
          return Promise.resolve({ [STORAGE_REFRESH_TOKEN]: refreshToken });
        }
        return Promise.resolve({});
      });

      // Mock successful refresh
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newToken,
          expires_in: 3600,
        }),
      });

      mockChrome.storage.local.set.mockResolvedValueOnce(undefined);

      const result = await TokenManager.handleRefreshMessage();

      expect(result).toEqual({
        success: true,
        access_token: newToken,
      });
    });

    it('should handle refresh failure', async () => {
      // Mock storage to return no refresh token
      mockChrome.storage.local.get.mockImplementation((_keys) => {
        return Promise.resolve({});
      });

      // handleRefreshMessage returns an object with success: false on error, doesn't throw
      const result = await TokenManager.handleRefreshMessage();
      expect(result).toEqual({
        success: false,
        error: 'No refresh token available',
      });
    });
  });
});
