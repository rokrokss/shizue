import { renderWithIntl, screen } from '@/__tests__/utils/test-utils'
import { Hero } from '@/components/sections/Hero'

describe('Hero Section', () => {
  it('renders hero section with all elements', () => {
    renderWithIntl(<Hero />)

    // Check title
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('title')

    // Check subtitle
    expect(screen.getByText('subtitle')).toBeInTheDocument()

    // Check badges
    expect(screen.getByText('free')).toBeInTheDocument()
    expect(screen.getByText('openSource')).toBeInTheDocument()
    expect(screen.getByText('privacy')).toBeInTheDocument()

    // Check CTA buttons
    expect(screen.getByText('chrome')).toBeInTheDocument()
    expect(screen.getByText('edge')).toBeInTheDocument()
  })

  it('renders Chrome CTA button with correct attributes', () => {
    renderWithIntl(<Hero />)

    const chromeButton = screen.getByRole('link', { name: /chrome/i })
    expect(chromeButton).toHaveAttribute('href', 'https://chrome.google.com/webstore/detail/shizue')
    expect(chromeButton).toHaveAttribute('target', '_blank')
    expect(chromeButton).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders Edge CTA button with correct attributes', () => {
    renderWithIntl(<Hero />)

    const edgeButton = screen.getByRole('link', { name: /edge/i })
    expect(edgeButton).toHaveAttribute('href', 'https://microsoftedge.microsoft.com/addons/detail/shizue')
    expect(edgeButton).toHaveAttribute('target', '_blank')
    expect(edgeButton).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders hero image with correct attributes', () => {
    renderWithIntl(<Hero />)

    // 테스트 환경에서는 번역 키가 그대로 표시됨
    const heroImage = screen.getByAltText('imageAlt')
    expect(heroImage).toBeInTheDocument()
    expect(heroImage).toHaveAttribute('src', '/placeholder.jpg')
    expect(heroImage).toHaveAttribute('width', '1200')
    expect(heroImage).toHaveAttribute('height', '675')
  })

  it('applies correct styling classes', () => {
    const { container } = renderWithIntl(<Hero />)

    // Check section classes
    const section = container.querySelector('section')
    expect(section).toHaveClass('relative', 'overflow-hidden', 'py-20', 'sm:py-32')

    // Check container classes
    const containerDiv = container.querySelector('.container')
    expect(containerDiv).toHaveClass('relative', 'z-10')

    // Check text alignment
    const textContainer = container.querySelector('.text-center')
    expect(textContainer).toBeInTheDocument()
  })

  it('renders with proper semantic structure', () => {
    renderWithIntl(<Hero />)

    // Check heading hierarchy
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('title')

    // Check links are properly structured
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
  })
})
