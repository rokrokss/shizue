'use client'

import { useTranslations } from 'next-intl'
import { memo, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chrome, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { OptimizedImage } from '@/components/ui/optimized-image'

const HeroBadges = memo(() => {
  const t = useTranslations('hero')

  const badges = useMemo(() => [
    { key: 'free', text: t('badges.free') },
    { key: 'openSource', text: t('badges.openSource') },
    { key: 'privacy', text: t('badges.privacy') }
  ], [t])

  return (
    <div className="mb-6 flex justify-center gap-2">
      {badges.map(badge => (
        <Badge key={badge.key} variant="secondary">{badge.text}</Badge>
      ))}
    </div>
  )
})

HeroBadges.displayName = 'HeroBadges'

export const Hero = memo(() => {
  const t = useTranslations('hero')

  const motionVariants = useMemo(() => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 }
  }), [])

  const imageMotionVariants = useMemo(() => ({
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.5, delay: 0.2 }
  }), [])

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div className="container relative z-10">
        <motion.div
          {...motionVariants}
          className="mx-auto max-w-4xl text-center"
        >
          <HeroBadges />

          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
            {t('title')}
          </h1>

          <p className="mb-10 text-lg text-muted-foreground sm:text-xl">
            {t('subtitle')}
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <a
                href="https://chrome.google.com/webstore/detail/shizue"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center"
              >
                <Chrome className="mr-2 h-5 w-5" />
                {t('cta.chrome')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a
                href="https://microsoftedge.microsoft.com/addons/detail/shizue"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('cta.edge')}
              </a>
            </Button>
          </div>

          <div className="mt-16">
            <motion.div
              {...imageMotionVariants}
              className="relative mx-auto max-w-5xl"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-3xl" />
              <OptimizedImage
                src="/placeholder.jpg"
                alt={t('imageAlt', { defaultValue: 'Shizue browser extension interface showing AI chat, translation features, and bilingual web browsing capabilities' })}
                width={1200}
                height={675}
                className="relative rounded-lg border shadow-2xl"
                priority
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px"
                quality={85}
              />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
})

Hero.displayName = 'Hero'
