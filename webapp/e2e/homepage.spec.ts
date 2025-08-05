import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en')
  })

  test('has title', async ({ page }) => {
    await expect(page).toHaveTitle(/Shizue/)
  })

  test('hero section is visible', async ({ page }) => {
    const heroSection = page.locator('section').first()
    await expect(heroSection).toBeVisible()

    // Check hero title
    const heroTitle = page.locator('h1')
    await expect(heroTitle).toBeVisible()
    await expect(heroTitle).toContainText('Translate, Chat, and Browse with AI Power')
  })

  test('navigation links work', async ({ page }) => {
    // Click Features link
    await page.click('text=Features')
    await expect(page).toHaveURL(/.*#features/)

    // Check Features section is visible
    const featuresSection = page.locator('#features')
    await expect(featuresSection).toBeVisible()
  })

  test('CTA buttons have correct links', async ({ page }) => {
    // Check Chrome button (first occurrence in hero section)
    const chromeButton = page.locator('a:has-text("Add to Chrome")').first()
    await expect(chromeButton).toHaveAttribute('href', 'https://chrome.google.com/webstore/detail/shizue')
    await expect(chromeButton).toHaveAttribute('target', '_blank')

    // Check Edge button (first occurrence in hero section)
    const edgeButton = page.locator('a:has-text("Add to Edge")').first()
    await expect(edgeButton).toHaveAttribute('href', 'https://microsoftedge.microsoft.com/addons/detail/shizue')
    await expect(edgeButton).toHaveAttribute('target', '_blank')
  })

  test('all sections are present', async ({ page }) => {
    const sections = [
      '#features',
      '#models',
      '#how-it-works',
      '#comparison',
      '#faq'
    ]

    for (const section of sections) {
      const element = page.locator(section)
      await expect(element).toBeVisible()
    }
  })

  test('FAQ accordion works', async ({ page }) => {
    // Scroll to FAQ section
    await page.locator('#faq').scrollIntoViewIfNeeded()

    // Get all FAQ items
    const faqItems = page.locator('#faq button')
    const faqCount = await faqItems.count()
    expect(faqCount).toBeGreaterThan(0)

    // Click on second FAQ item
    const secondItem = faqItems.nth(1)
    await secondItem.click()

    // Check that answer is visible
    const answer = page.locator('#faq button').nth(1).locator('..').locator('div').last()
    await expect(answer).toBeVisible()
  })

  test('language selector works', async ({ page }) => {
    // Open language selector
    await page.click('button:has-text("English")')

    // Select Korean
    await page.click('text=한국어')

    // Check URL changed to Korean
    await expect(page).toHaveURL(/\/ko/)

    // Check that content changed
    const heroTitle = page.locator('h1')
    await expect(heroTitle).toContainText('AI로 번역하고, 대화하고, 브라우징하세요')
  })
})