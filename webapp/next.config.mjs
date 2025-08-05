import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Internationalization
  i18n: undefined, // We use middleware for i18n routing

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'shizue.ai',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },

  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,

  // Production optimizations
  productionBrowserSourceMaps: false,

  // Build output - Vercel automatically detects the best output mode
  // output: 'standalone', // Commented out for Vercel

  // Experimental features for better performance
  experimental: {
    // Enable React 18 features
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Optimize server components
    // optimizeCss: true, // Disabled due to missing critters module
    // Improve cold start performance
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dropdown-menu', '@radix-ui/react-accordion'],
    // Enable partial prerendering (beta) - only available in canary
    // ppr: true,
    // Use new app router cache
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
        ],
      },
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // Webpack optimization
  webpack: (config, { isServer }) => {
    // Remove usedExports optimization as it conflicts with cacheUnaffected
    // Tree shaking is already enabled by default in Next.js production builds

    // Bundle analyzer
    if (process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: isServer
            ? '../analyze/server.html'
            : './analyze/client.html',
          openAnalyzer: false,
        })
      )
    }

    return config
  },
}

export default withNextIntl(nextConfig)
