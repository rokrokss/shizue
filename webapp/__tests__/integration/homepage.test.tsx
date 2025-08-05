import { renderWithIntl, screen, within } from '@/__tests__/utils/test-utils'
import HomePage from '@/app/[locale]/page'
import React from 'react'

// Mock next/dynamic
jest.mock('next/dynamic', () => {
  const dynamicComponents = {
    FAQ: 'faq',
    LiveDemo: 'live-demo',
    Stats: 'stats',
    SupportedSites: 'supported-sites',
    BeforeAfter: 'before-after',
    UseCases: 'use-cases'
  }
  
  return (importFunc: any) => {
    const modulePath = importFunc.toString()
    let componentName = 'unknown'
    
    Object.keys(dynamicComponents).forEach(key => {
      if (modulePath.includes(key)) {
        componentName = dynamicComponents[key as keyof typeof dynamicComponents]
      }
    })
    
    const Component = () => <section data-testid={componentName}>{componentName} Section</section>
    return Component
  }
})

// Mock next-intl/server
jest.mock('next-intl/server', () => ({
  setRequestLocale: jest.fn()
}))

// Mock the components to test integration
jest.mock('@/components/layout/Header', () => ({
  Header: () => <header data-testid="header">Header</header>
}))

jest.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>
}))

jest.mock('@/components/sections/Hero', () => ({
  Hero: () => <section data-testid="hero">Hero Section</section>
}))

jest.mock('@/components/sections/Features', () => ({
  Features: () => <section data-testid="features">Features Section</section>
}))

jest.mock('@/components/sections/AIModels', () => ({
  AIModels: () => <section data-testid="ai-models">AI Models Section</section>
}))

jest.mock('@/components/sections/HowItWorks', () => ({
  HowItWorks: () => <section data-testid="how-it-works">How It Works Section</section>
}))

jest.mock('@/components/sections/Comparison', () => ({
  Comparison: () => <section data-testid="comparison">Comparison Section</section>
}))

jest.mock('@/components/sections/FinalCTA', () => ({
  FinalCTA: () => <section data-testid="final-cta">Final CTA Section</section>
}))

describe('HomePage Integration', () => {
  it('renders all page sections in correct order', async () => {
    // HomePage는 async 컴포넌트이므로 params를 Promise로 전달
    const params = Promise.resolve({ locale: 'en' })
    const component = await HomePage({ params })
    renderWithIntl(component)

    // Check header
    expect(screen.getByTestId('header')).toBeInTheDocument()

    // Check main content sections
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()

    // Get all sections within main
    const sections = within(main).getAllByTestId(/hero|live-demo|stats|features|before-after|supported-sites|use-cases|ai-models|how-it-works|comparison|faq|final-cta/)

    // Verify sections are rendered in correct order
    expect(sections[0]).toHaveAttribute('data-testid', 'hero')
    expect(sections[1]).toHaveAttribute('data-testid', 'live-demo')
    expect(sections[2]).toHaveAttribute('data-testid', 'stats')
    expect(sections[3]).toHaveAttribute('data-testid', 'features')
    expect(sections[4]).toHaveAttribute('data-testid', 'before-after')
    expect(sections[5]).toHaveAttribute('data-testid', 'supported-sites')
    expect(sections[6]).toHaveAttribute('data-testid', 'use-cases')
    expect(sections[7]).toHaveAttribute('data-testid', 'ai-models')
    expect(sections[8]).toHaveAttribute('data-testid', 'how-it-works')
    expect(sections[9]).toHaveAttribute('data-testid', 'comparison')
    expect(sections[10]).toHaveAttribute('data-testid', 'faq')
    expect(sections[11]).toHaveAttribute('data-testid', 'final-cta')

    // Check footer
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })

  it('renders with proper page structure', async () => {
    const params = Promise.resolve({ locale: 'en' })
    const component = await HomePage({ params })
    const { container } = renderWithIntl(component)

    // Check that header comes before main
    const header = container.querySelector('header')
    const main = container.querySelector('main')
    const footer = container.querySelector('footer')

    expect(header).toBeInTheDocument()
    expect(main).toBeInTheDocument()
    expect(footer).toBeInTheDocument()

    // Verify order in DOM
    const allElements = container.querySelectorAll('header, main, footer')
    expect(allElements[0].tagName).toBe('HEADER')
    expect(allElements[1].tagName).toBe('MAIN')
    expect(allElements[2].tagName).toBe('FOOTER')
  })

  it('applies flex layout classes', async () => {
    const params = Promise.resolve({ locale: 'en' })
    const component = await HomePage({ params })
    renderWithIntl(component)

    const main = screen.getByRole('main')
    expect(main).toHaveClass('flex-1')
  })

  it('renders all required sections', async () => {
    const params = Promise.resolve({ locale: 'en' })
    const component = await HomePage({ params })
    renderWithIntl(component)

    const requiredSections = [
      'hero',
      'features',
      'ai-models',
      'how-it-works',
      'comparison',
      'faq',
      'final-cta'
    ]

    requiredSections.forEach(sectionId => {
      expect(screen.getByTestId(sectionId)).toBeInTheDocument()
    })
  })
})