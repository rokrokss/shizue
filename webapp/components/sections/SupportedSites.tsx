'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'

export function SupportedSites() {
  const t = useTranslations('supportedSites')

  // Major websites that would benefit from translation
  const sites = [
    { name: 'YouTube', logo: '🎥' },
    { name: 'Wikipedia', logo: '📚' },
    { name: 'Reddit', logo: '💬' },
    { name: 'Twitter/X', logo: '🐦' },
    { name: 'Medium', logo: '📝' },
    { name: 'GitHub', logo: '💻' },
    { name: 'Stack Overflow', logo: '💡' },
    { name: 'ArXiv', logo: '🔬' },
    { name: 'BBC', logo: '📰' },
    { name: 'CNN', logo: '📺' },
    { name: 'Amazon', logo: '🛒' },
    { name: 'LinkedIn', logo: '💼' }
  ]

  return (
    <section className="py-16 sm:py-24 bg-muted/30">
      <div className="container">
        <div className="text-center mb-12">
          <Badge className="mb-4">{t('badge')}</Badge>
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">
            {t('title')}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-8">
            {sites.map((site, index) => (
              <motion.div
                key={site.name}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="text-4xl mb-2">{site.logo}</div>
                <div className="text-sm font-medium text-center">{site.name}</div>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">{t('moreInfo')}</p>
            <Badge variant="secondary" className="text-base px-4 py-2">
              {t('allWebsites')}
            </Badge>
          </div>
        </div>
      </div>
    </section>
  )
}