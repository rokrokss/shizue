// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key) => {
    // For most keys, just return the last part after the dot
    const lastPart = key.split('.').pop();
    return lastPart || key;
  },
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }) => children,
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/en',
  useParams: () => ({ locale: 'en' }),
  notFound: jest.fn(),
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, animate, ...props }) => {
      const { initial, whileInView, transition, variants, viewport, ...divProps } = props;

      // Handle FAQ animation state
      if (animate && typeof animate === 'object' && 'height' in animate) {
        const isOpen = animate.height === 'auto';
        if (!isOpen) {
          return (
            <div {...divProps} style={{ display: 'none' }}>
              {children}
            </div>
          );
        }
      }

      return <div {...divProps}>{children}</div>;
    },
    section: ({ children, ...props }) => {
      const { initial, animate, whileInView, transition, variants, viewport, ...sectionProps } =
        props;
      return <section {...sectionProps}>{children}</section>;
    },
  },
}));

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ priority, ...props }) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock environment variables
process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';

// Suppress console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning: ReactDOM.render')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
