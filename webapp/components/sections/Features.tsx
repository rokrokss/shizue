'use client';

import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe, MessageSquare, FileText, Youtube, Image, StickyNote, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';

const features = [
  {
    id: 'translation',
    icon: Globe,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
  },
  {
    id: 'chat',
    icon: MessageSquare,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
  },
  {
    id: 'pdf',
    icon: FileText,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
  },
  {
    id: 'youtube',
    icon: Youtube,
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950/20',
  },
  {
    id: 'ocr',
    icon: Image,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
  },
  {
    id: 'notes',
    icon: StickyNote,
    color: 'text-teal-500',
    bgColor: 'bg-teal-50 dark:bg-teal-950/20',
  },
] as const;

const FeatureCard = memo(
  ({
    feature,
    t,
  }: {
    feature: (typeof features)[number];
    t: ReturnType<typeof useTranslations<'features'>>;
  }) => {
    const Icon = feature.icon;

    const itemVariants = useMemo(
      () => ({
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.5,
          },
        },
      }),
      []
    );

    return (
      <motion.div variants={itemVariants}>
        <Card className="relative overflow-hidden p-6 hover:shadow-lg transition-shadow">
          <div className={`absolute inset-0 ${feature.bgColor} opacity-50`} />
          <div className="relative z-10">
            <div className={`mb-4 inline-flex rounded-lg p-3 ${feature.bgColor}`}>
              <Icon className={`h-6 w-6 ${feature.color}`} />
            </div>
            <h3 className="mb-2 text-xl font-semibold">{t(`items.${feature.id}.title`)}</h3>
            <p className="text-muted-foreground">{t(`items.${feature.id}.description`)}</p>
          </div>
        </Card>
      </motion.div>
    );
  }
);

FeatureCard.displayName = 'FeatureCard';

export const Features = memo(() => {
  const t = useTranslations('features');

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

  const headerVariants = useMemo(
    () => ({
      initial: { opacity: 0, y: 20 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true },
      transition: { duration: 0.5 },
    }),
    []
  );

  return (
    <section id="features" className="py-20 sm:py-32">
      <div className="container">
        <motion.div {...headerVariants} className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm mb-4">
            <Sparkles className="mr-2 h-3 w-3" />
            {t('badge')}
          </div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h2>
          <p className="text-lg text-muted-foreground">{t('subtitle')}</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} t={t} />
          ))}
        </motion.div>
      </div>
    </section>
  );
});

Features.displayName = 'Features';
