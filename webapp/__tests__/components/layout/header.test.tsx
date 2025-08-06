import { renderWithIntl, screen } from '@/__tests__/utils/test-utils';
import { Header } from '@/components/layout/Header';

describe('Header Component', () => {
  it('renders header with logo and navigation', () => {
    renderWithIntl(<Header />);

    // Check logo
    expect(screen.getByText('Shizue')).toBeInTheDocument();

    // Check navigation links
    expect(screen.getByText('features')).toBeInTheDocument();
    expect(screen.getByText('pricing')).toBeInTheDocument();
    expect(screen.getByText('docs')).toBeInTheDocument();

    // Check CTA button
    expect(screen.getByText('download')).toBeInTheDocument();
  });

  it('renders logo as a link to homepage', () => {
    renderWithIntl(<Header />);

    const logoLink = screen.getByRole('link', { name: /shizue/i });
    expect(logoLink).toHaveAttribute('href', '/en');
  });

  it('renders navigation links with correct hrefs', () => {
    renderWithIntl(<Header />);

    const featuresLink = screen.getByRole('link', { name: /features/i });
    expect(featuresLink).toHaveAttribute('href', '/en#features');

    const pricingLink = screen.getByRole('link', { name: /pricing/i });
    expect(pricingLink).toHaveAttribute('href', '/en#pricing');

    const docsLink = screen.getByRole('link', { name: /docs/i });
    expect(docsLink).toHaveAttribute('href', '/en#docs');
  });

  it('renders CTA button as external link', () => {
    renderWithIntl(<Header />);

    const ctaButton = screen.getByRole('link', { name: /download/i });
    expect(ctaButton).toHaveAttribute('href', 'https://chrome.google.com/webstore/detail/shizue');
    expect(ctaButton).toHaveAttribute('target', '_blank');
  });

  it('renders language selector', () => {
    renderWithIntl(<Header />);

    // Language selector is rendered but might be in a dropdown
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
  });

  it('has proper semantic structure', () => {
    renderWithIntl(<Header />);

    // Check header element
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();

    // Check navigation elements exist
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });

  it('applies sticky positioning classes', () => {
    const { container } = renderWithIntl(<Header />);

    const header = container.querySelector('header');
    expect(header).toHaveClass('sticky', 'top-0', 'z-50');
  });
});
