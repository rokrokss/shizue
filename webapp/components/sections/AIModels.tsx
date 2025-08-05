'use client'

import { useTranslations } from 'next-intl'
import { memo, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bot, Zap, Brain } from 'lucide-react'
import { motion } from 'framer-motion'

const models = [
  {
    id: 'openai',
    name: 'OpenAI',
    model: 'GPT-4.1 Turbo',
    icon: Bot,
    color: 'from-green-500 to-emerald-600',
    features: ['Most capable', 'Best reasoning', 'Creative writing'],
    description: 'State-of-the-art language model with advanced reasoning'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    model: 'Claude 3 Sonnet',
    icon: Brain,
    color: 'from-purple-500 to-indigo-600',
    features: ['Safe & helpful', 'Long context', 'Coding expert'],
    description: 'Constitutional AI with strong coding and analysis capabilities'
  },
  {
    id: 'google',
    name: 'Google',
    model: 'Gemini 2.5 Flash',
    icon: Zap,
    color: 'from-blue-500 to-cyan-600',
    features: ['Fast responses', 'Multimodal', 'Cost-effective'],
    description: 'Lightning-fast model with vision capabilities'
  }
] as const

const ModelCard = memo(({ model, index, t }: {
  model: typeof models[number],
  index: number,
  t: ReturnType<typeof useTranslations<'models'>>
}) => {
  const Icon = model.icon

  const cardVariants = useMemo(() => ({
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delay: index * 0.1
      }
    }
  }), [index])

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      <Card className="relative overflow-hidden p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        <div className={`absolute inset-0 bg-gradient-to-br ${model.color} opacity-5`} />
        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between">
            <div className={`inline-flex rounded-lg bg-gradient-to-br ${model.color} p-3`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <Badge variant="secondary" className="text-xs">
              {t(`${model.id}.badge`)}
            </Badge>
          </div>

          <h3 className="mb-1 text-xl font-semibold">
            {model.name}
          </h3>
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            {model.model}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {t(`${model.id}.description`)}
          </p>

          <div className="flex flex-wrap gap-2">
            {model.features.map((_, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {t(`${model.id}.features.${idx}`)}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
  )
})

ModelCard.displayName = 'ModelCard'

export const AIModels = memo(() => {
  const t = useTranslations('models')

  const headerVariants = useMemo(() => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 }
  }), [])

  return (
    <section id="models" className="py-20 sm:py-32 bg-muted/50">
      <div className="container">
        <motion.div
          {...headerVariants}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
        </motion.div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model, index) => (
            <ModelCard key={model.id} model={model} index={index} t={t} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <p className="text-sm text-muted-foreground">
            {t('note')}
          </p>
        </motion.div>
      </div>
    </section>
  )
})

AIModels.displayName = 'AIModels'
