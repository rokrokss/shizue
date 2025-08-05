'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import {
  GraduationCap,
  Briefcase,
  Code2,
  ShoppingBag,
  Newspaper,
  BookOpen,
  Globe,
  Users
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function UseCases() {
  const t = useTranslations('useCases')

  const useCases = [
    {
      icon: GraduationCap,
      title: t('items.education.title'),
      description: t('items.education.description'),
      examples: t('items.education.examples').split('|'),
      color: 'text-blue-600'
    },
    {
      icon: Briefcase,
      title: t('items.business.title'),
      description: t('items.business.description'),
      examples: t('items.business.examples').split('|'),
      color: 'text-green-600'
    },
    {
      icon: Code2,
      title: t('items.development.title'),
      description: t('items.development.description'),
      examples: t('items.development.examples').split('|'),
      color: 'text-purple-600'
    },
    {
      icon: ShoppingBag,
      title: t('items.shopping.title'),
      description: t('items.shopping.description'),
      examples: t('items.shopping.examples').split('|'),
      color: 'text-orange-600'
    },
    {
      icon: Newspaper,
      title: t('items.news.title'),
      description: t('items.news.description'),
      examples: t('items.news.examples').split('|'),
      color: 'text-red-600'
    },
    {
      icon: BookOpen,
      title: t('items.research.title'),
      description: t('items.research.description'),
      examples: t('items.research.examples').split('|'),
      color: 'text-indigo-600'
    },
    {
      icon: Globe,
      title: t('items.travel.title'),
      description: t('items.travel.description'),
      examples: t('items.travel.examples').split('|'),
      color: 'text-teal-600'
    },
    {
      icon: Users,
      title: t('items.social.title'),
      description: t('items.social.description'),
      examples: t('items.social.examples').split('|'),
      color: 'text-pink-600'
    }
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {useCases.map((useCase, index) => (
            <motion.div
              key={useCase.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-background rounded-lg p-6 shadow-sm border hover:shadow-md transition-shadow"
            >
              <div className={`inline-flex p-3 rounded-lg bg-muted mb-4 ${useCase.color}`}>
                <useCase.icon className="h-6 w-6" />
              </div>

              <h3 className="text-lg font-semibold mb-2">{useCase.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">{useCase.description}</p>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('examples')}
                </p>
                <ul className="space-y-1">
                  {useCase.examples.map((example, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-muted-foreground mt-0.5">•</span>
                      <span>{example}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
