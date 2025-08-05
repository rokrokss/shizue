import { renderWithIntl, screen } from '@/__tests__/utils/test-utils'
import { Features } from '@/components/sections/Features'

describe('Features Section', () => {
  it('renders features section with all elements', () => {
    renderWithIntl(<Features />)

    // Check section title and subtitle
    const mainTitle = screen.getByRole('heading', { level: 2 })
    expect(mainTitle).toHaveTextContent('title')
    expect(screen.getByText('subtitle')).toBeInTheDocument()
    expect(screen.getByText('badge')).toBeInTheDocument()

    // Check all feature cards
    const features = [
      'translation',
      'chat',
      'pdf',
      'youtube',
      'ocr',
      'notes'
    ]

    // Just check that we have title and description elements
    const titles = screen.getAllByText('title')
    const descriptions = screen.getAllByText('description')

    expect(titles.length).toBeGreaterThan(1)
    expect(descriptions.length).toBe(features.length)
  })

  it('renders correct number of feature cards', () => {
    const { container } = renderWithIntl(<Features />)

    // Since Cards are not rendered as articles, look for the card elements
    const cards = container.querySelectorAll('.rounded-lg.border.bg-card')
    expect(cards).toHaveLength(6)
  })

  it('applies correct grid layout classes', () => {
    const { container } = renderWithIntl(<Features />)

    const grid = container.querySelector('.grid')
    expect(grid).toHaveClass('gap-8', 'sm:grid-cols-2', 'lg:grid-cols-3')
  })

  it('renders with proper semantic structure', () => {
    renderWithIntl(<Features />)

    // Check heading hierarchy
    const mainHeading = screen.getByRole('heading', { level: 2 })
    expect(mainHeading).toHaveTextContent('title')

    // Check feature titles are h3
    const featureTitles = screen.getAllByRole('heading', { level: 3 })
    expect(featureTitles).toHaveLength(6)
  })

  it('applies correct styling to feature cards', () => {
    const { container } = renderWithIntl(<Features />)

    const cards = container.querySelectorAll('.relative.overflow-hidden')
    expect(cards.length).toBeGreaterThan(0)

    cards.forEach(card => {
      expect(card).toHaveClass('p-6', 'hover:shadow-lg', 'transition-shadow')
    })
  })

  it('renders icons for each feature', () => {
    const { container } = renderWithIntl(<Features />)

    // Check that icon containers exist
    const iconContainers = container.querySelectorAll('.inline-flex.rounded-lg.p-3')
    expect(iconContainers).toHaveLength(6)
  })

  it('applies different colors to each feature', () => {
    const { container } = renderWithIntl(<Features />)

    // Check for different background colors
    expect(container.querySelector('.bg-blue-50')).toBeInTheDocument()
    expect(container.querySelector('.bg-purple-50')).toBeInTheDocument()
    expect(container.querySelector('.bg-green-50')).toBeInTheDocument()
    expect(container.querySelector('.bg-red-50')).toBeInTheDocument()
    expect(container.querySelector('.bg-orange-50')).toBeInTheDocument()
    expect(container.querySelector('.bg-teal-50')).toBeInTheDocument()
  })

  it('has proper accessibility attributes', () => {
    const { container } = renderWithIntl(<Features />)

    const section = container.querySelector('section#features')
    expect(section).toBeInTheDocument()
  })
})
