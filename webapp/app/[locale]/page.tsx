import { setRequestLocale } from 'next-intl/server'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/sections/Hero'

// Static imports for server components (no code splitting needed)
import { Features } from '@/components/sections/Features'
import { AIModels } from '@/components/sections/AIModels'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { Comparison } from '@/components/sections/Comparison'
import { FinalCTA } from '@/components/sections/FinalCTA'

// Dynamic imports for client components
import dynamic from 'next/dynamic'

const FAQ = dynamic(() => import('@/components/sections/FAQ').then(mod => ({ default: mod.FAQ })), {
  loading: () => <div className="py-20 sm:py-32 animate-pulse bg-muted/50" />,
  ssr: true
})

const LiveDemo = dynamic(() => import('@/components/sections/LiveDemo').then(mod => ({ default: mod.LiveDemo })), {
  loading: () => <div className="py-16 sm:py-24 animate-pulse bg-muted/50" />,
  ssr: true
})

const Stats = dynamic(() => import('@/components/sections/Stats').then(mod => ({ default: mod.Stats })), {
  loading: () => <div className="py-16 sm:py-24 animate-pulse bg-muted/50" />,
  ssr: true
})

const SupportedSites = dynamic(() => import('@/components/sections/SupportedSites').then(mod => ({ default: mod.SupportedSites })), {
  loading: () => <div className="py-16 sm:py-24 animate-pulse bg-muted/50" />,
  ssr: true
})

const BeforeAfter = dynamic(() => import('@/components/sections/BeforeAfter').then(mod => ({ default: mod.BeforeAfter })), {
  loading: () => <div className="py-16 sm:py-24 animate-pulse bg-muted/50" />,
  ssr: true
})

const UseCases = dynamic(() => import('@/components/sections/UseCases').then(mod => ({ default: mod.UseCases })), {
  loading: () => <div className="py-16 sm:py-24 animate-pulse bg-muted/50" />,
  ssr: true
})

export default async function HomePage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <LiveDemo />
        <Stats />
        <Features />
        <BeforeAfter />
        <SupportedSites />
        <UseCases />
        <AIModels />
        <HowItWorks />
        <Comparison />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
