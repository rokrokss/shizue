# Shizue Web Application

Official website for Shizue Chrome Extension - A free, open-source AI browser extension.

## 🚀 Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Internationalization**: next-intl (23 languages)
- **Animation**: Framer Motion
- **Deployment**: Docker / Vercel / Any Node.js hosting

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## 🌍 Internationalization

The app supports 23 languages:
- Arabic (ar), Bengali (bn), German (de), English (en), Spanish (es)
- Persian (fa), Filipino (fil), French (fr), Hindi (hi), Italian (it)
- Japanese (ja), Korean (ko), Polish (pl), Portuguese (pt-BR, pt-PT)
- Russian (ru), Swahili (sw), Thai (th), Turkish (tr), Urdu (ur)
- Vietnamese (vi), Chinese (zh-CN, zh-TW)

## 🏗️ Project Structure

```
webapp/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx    # Root layout with i18n
│   │   └── page.tsx      # Homepage
│   └── sitemap.ts        # Dynamic sitemap
├── components/
│   ├── layout/           # Header, Footer, LanguageSelector
│   ├── sections/         # Hero, Features, FAQ, etc.
│   └── ui/               # Reusable UI components
├── messages/             # Translation files (23 languages)
├── public/               # Static assets
└── lib/                  # Utilities and configs
```

## 🚀 Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/shizue&project-name=shizue-web&repository-name=shizue-web)

**Manual deployment:**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel

# Deploy to production
vercel --prod
```

**Environment variables to set in Vercel:**
- `NEXT_PUBLIC_SITE_URL`: Your production URL (e.g., https://shizue.ai)

### Docker

```bash
# Build and run with Docker
docker-compose up --build

# Or build manually
docker build -t shizue-web .
docker run -p 3000:3000 shizue-web
```

### Traditional Hosting

```bash
# Build the application
pnpm build

# Start the production server
NODE_ENV=production pnpm start
```

## 🔧 Environment Variables

Create `.env.local` from `.env.example`:

```env
NEXT_PUBLIC_BASE_URL=https://shizue.ai
NEXT_PUBLIC_GA_ID=your-ga-id
```

## 📊 Performance

- **Lighthouse Score**: 95+ on all metrics
- **Core Web Vitals**: Optimized for LCP, FID, CLS
- **Bundle Size**: Optimized with tree-shaking and code splitting
- **Caching**: Aggressive caching for static assets

## 🛠️ Development Commands

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm start        # Production server
pnpm lint         # Run ESLint
pnpm typecheck    # TypeScript check
pnpm analyze      # Bundle analysis
pnpm preview      # Build and preview
```

## 📝 License

This project is open source and available under the [MIT License](../LICENSE).
