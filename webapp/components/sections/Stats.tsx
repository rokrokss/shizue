'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Users, Globe, Languages, Zap } from 'lucide-react'

export function Stats() {
  const t = useTranslations('stats')

  const stats = [
    {
      icon: Users,
      value: '50K+',
      label: t('users'),
      description: t('usersDesc')
    },
    {
      icon: Globe,
      value: '23',
      label: t('languages'),
      description: t('languagesDesc')
    },
    {
      icon: Languages,
      value: '10M+',
      label: t('translations'),
      description: t('translationsDesc')
    },
    {
      icon: Zap,
      value: '<100ms',
      label: t('speed'),
      description: t('speedDesc')
    }
  ]

  return (
    <section className="py-16 sm:py-24">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">
            {t('title')}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              <div className="inline-flex p-3 rounded-lg bg-primary/10 text-primary mb-4">
                <stat.icon className="h-6 w-6" />
              </div>
              <div className="text-4xl font-bold mb-2">{stat.value}</div>
              <div className="text-lg font-medium mb-1">{stat.label}</div>
              <div className="text-sm text-muted-foreground">{stat.description}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
