'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'
import { useState, useCallback, useMemo, memo } from 'react'
import { cn } from '@/lib/utils'

const faqItems = [
  'apiKey',
  'cost',
  'languages',
  'privacy',
  'browsers'
]

const FAQItem = memo(({ 
  item, 
  isOpen, 
  toggleItem, 
  question, 
  answer 
}: { 
  item: string
  isOpen: boolean
  toggleItem: (id: string) => void
  question: string
  answer: string
}) => {
  const handleClick = useCallback(() => toggleItem(item), [item, toggleItem])
  
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.5
          }
        }
      }}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <button
        onClick={handleClick}
        className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-muted/50"
      >
        <h3 className="text-lg font-semibold">
          {question}
        </h3>
        <div className={cn(
          "ml-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 transition-transform",
          isOpen && "rotate-180"
        )}>
          {isOpen ? (
            <Minus className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </div>
      </button>
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0
        }}
        transition={{
          duration: 0.3,
          ease: 'easeInOut'
        }}
        className="overflow-hidden"
      >
        <div className="border-t px-6 py-4">
          <p className="text-muted-foreground">
            {answer}
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
})

FAQItem.displayName = 'FAQItem'

export function FAQ() {
  const t = useTranslations('faq')
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(['apiKey']))

  const toggleItem = useCallback((id: string) => {
    setOpenItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  const containerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }), [])

  return (
    <section id="faq" className="py-20 sm:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mx-auto mt-16 max-w-3xl"
        >
          <div className="space-y-4">
            {faqItems.map((item) => {
              const isOpen = openItems.has(item)
              return (
                <FAQItem
                  key={item}
                  item={item}
                  isOpen={isOpen}
                  toggleItem={toggleItem}
                  question={t(`items.${item}.question`)}
                  answer={t(`items.${item}.answer`)}
                />
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}