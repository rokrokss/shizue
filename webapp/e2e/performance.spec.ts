import { test, expect } from '@playwright/test'

test.describe('Performance', () => {
  test('page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/en', { waitUntil: 'networkidle' })
    
    const loadTime = Date.now() - startTime
    
    // Page should load within 3 seconds
    expect(loadTime).toBeLessThan(3000)
  })

  test('images are optimized', async ({ page }) => {
    await page.goto('/en')

    // Wait for images to load
    await page.waitForLoadState('networkidle')

    // Get all images
    const images = await page.locator('img').all()

    for (const img of images) {
      const src = await img.getAttribute('src')
      
      // Check that Next.js image optimization is used
      if (src && !src.startsWith('data:')) {
        // Images should have width and height attributes
        const width = await img.getAttribute('width')
        const height = await img.getAttribute('height')
        
        expect(width).toBeTruthy()
        expect(height).toBeTruthy()
      }
    }
  })

  test('no console errors', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/en')
    await page.waitForLoadState('networkidle')

    expect(consoleErrors).toHaveLength(0)
  })

  test('assets are cached properly', async ({ page }) => {
    // First visit
    await page.goto('/en')
    
    // Get all static assets
    const assetRequests: string[] = []
    
    page.on('response', (response) => {
      const url = response.url()
      if (url.includes('/_next/static/') || url.includes('/images/')) {
        const cacheControl = response.headers()['cache-control']
        if (cacheControl) {
          assetRequests.push(cacheControl)
        }
      }
    })

    // Navigate to trigger asset loading
    await page.goto('/en#features')
    await page.waitForLoadState('networkidle')

    // Check that static assets have proper cache headers
    assetRequests.forEach(cacheControl => {
      expect(cacheControl).toContain('max-age=')
      expect(cacheControl).toContain('immutable')
    })
  })

  test('no layout shifts', async ({ page }) => {
    await page.goto('/en')

    // Wait for initial load
    await page.waitForLoadState('networkidle')

    // Measure CLS
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0
        let clsEntries: PerformanceEntry[] = []

        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if ((entry as any).hadRecentInput) continue
            clsEntries.push(entry)
            clsValue += (entry as any).value
          }
        })

        observer.observe({ type: 'layout-shift', buffered: true })

        setTimeout(() => {
          observer.disconnect()
          resolve(clsValue)
        }, 3000)
      })
    })

    // CLS should be less than 0.1 for good user experience
    expect(cls).toBeLessThan(0.1)
  })
})