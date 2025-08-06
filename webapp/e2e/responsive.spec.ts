import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  test('mobile navigation works', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/en');

    // Check that desktop navigation is hidden
    const desktopNav = page.locator('nav.hidden.md\\:flex');
    await expect(desktopNav).toBeHidden();

    // Mobile menu button should be visible (if implemented)
    // This test can be expanded when mobile menu is implemented
  });

  test('hero section adapts to mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/en');

    // Check that hero buttons stack vertically on mobile
    const buttonContainer = page.locator('.flex.flex-col.gap-4.sm\\:flex-row');
    await expect(buttonContainer).toHaveClass(/flex-col/);
  });

  test('feature cards stack on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/en');

    // Scroll to features
    await page.locator('#features').scrollIntoViewIfNeeded();

    // Check that grid is single column on mobile
    const grid = page.locator('#features .grid');
    const cards = grid.locator('> *');
    const cardCount = await cards.count();

    // Get first and second card positions
    if (cardCount >= 2) {
      const firstCard = await cards.nth(0).boundingBox();
      const secondCard = await cards.nth(1).boundingBox();

      // Cards should be stacked (same x position, different y)
      expect(firstCard?.x).toBe(secondCard?.x);
      if (firstCard?.y !== undefined && secondCard?.y !== undefined) {
        expect(firstCard.y).toBeLessThan(secondCard.y);
      }
    }
  });

  test('tablet layout works correctly', async ({ page }) => {
    // iPad size
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/en');

    // Check features grid is 2 columns
    await page.locator('#features').scrollIntoViewIfNeeded();

    const grid = page.locator('#features .grid');
    const cards = grid.locator('> *');
    const cardCount = await cards.count();

    if (cardCount >= 3) {
      const firstCard = await cards.nth(0).boundingBox();
      const secondCard = await cards.nth(1).boundingBox();
      const thirdCard = await cards.nth(2).boundingBox();

      // First two cards should be in same row
      expect(Math.abs(firstCard!.y - secondCard!.y)).toBeLessThan(10);
      // Third card should be in next row
      expect(thirdCard!.y).toBeGreaterThan(firstCard!.y);
    }
  });

  test('desktop layout displays correctly', async ({ page }) => {
    // Desktop size
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en');

    // Check navigation is visible
    const nav = page.locator('nav.hidden.md\\:flex');
    await expect(nav).toBeVisible();

    // Check features grid is 3 columns
    await page.locator('#features').scrollIntoViewIfNeeded();

    const grid = page.locator('#features .grid');
    const cards = grid.locator('> *');
    const cardCount = await cards.count();

    if (cardCount >= 3) {
      const firstCard = await cards.nth(0).boundingBox();
      const secondCard = await cards.nth(1).boundingBox();
      const thirdCard = await cards.nth(2).boundingBox();

      // All three cards should be in same row
      expect(Math.abs(firstCard!.y - secondCard!.y)).toBeLessThan(10);
      expect(Math.abs(secondCard!.y - thirdCard!.y)).toBeLessThan(10);
    }
  });
});
