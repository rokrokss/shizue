'use client';

import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

const comparisonItems = [
  { id: 'price', shizue: true, competitor: false },
  { id: 'models', shizue: true, competitor: false },
  { id: 'privacy', shizue: true, competitor: false },
  { id: 'source', shizue: true, competitor: false },
  { id: 'usage', shizue: true, competitor: false },
] as const;

export const Comparison = memo(() => {
  const t = useTranslations('comparison');

  const containerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: 0.1,
        },
      },
    }),
    []
  );

  const itemVariants = useMemo(
    () => ({
      hidden: { opacity: 0, scale: 0.95 },
      visible: {
        opacity: 1,
        scale: 1,
        transition: {
          duration: 0.5,
        },
      },
    }),
    []
  );

  return (
    <section id="comparison" className="py-20 sm:py-32 bg-muted/50">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h2>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-16 mx-auto max-w-4xl"
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <motion.div variants={itemVariants} className="space-y-4">
              <div className="h-[180px]" />
              {comparisonItems.map((item) => (
                <div
                  key={item.id}
                  className="flex h-[72px] items-center rounded-lg bg-background px-4 font-medium"
                >
                  {t(item.id)}
                </div>
              ))}
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card className="relative overflow-hidden border-2 border-primary/20">
                <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
                <div className="relative p-6">
                  <Badge className="mb-2" variant="default">
                    {t('recommended')}
                  </Badge>
                  <h3 className="mb-2 text-2xl font-bold">Shizue</h3>
                  <p className="text-sm text-muted-foreground">{t('shizue.subtitle')}</p>
                </div>
                <div className="space-y-4 p-6 pt-0">
                  {comparisonItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex h-[72px] items-center justify-between rounded-lg bg-muted/50 px-4"
                    >
                      <span className="text-sm">{t(`shizue.${item.id}`)}</span>
                      {item.shizue && <Check className="h-5 w-5 text-green-500" />}
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card className="relative overflow-hidden">
                <div className="p-6">
                  <div className="mb-2 h-6" />
                  <h3 className="mb-2 text-2xl font-bold">{t('competitor.title')}</h3>
                  <p className="text-sm text-muted-foreground">{t('competitor.subtitle')}</p>
                </div>
                <div className="space-y-4 p-6 pt-0">
                  {comparisonItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex h-[72px] items-center justify-between rounded-lg bg-muted/50 px-4"
                    >
                      <span className="text-sm">{t(`competitor.${item.id}`)}</span>
                      {!item.competitor && <X className="h-5 w-5 text-red-500" />}
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
});

Comparison.displayName = 'Comparison';
