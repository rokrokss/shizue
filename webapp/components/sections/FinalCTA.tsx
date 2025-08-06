'use client';

import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Chrome, Github, MessageSquare, FileText } from 'lucide-react';
import Link from 'next/link';

export const FinalCTA = memo(() => {
  const t = useTranslations('finalCta');

  const motionVariants = useMemo(
    () => ({
      initial: { opacity: 0, y: 20 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true },
      transition: { duration: 0.5 },
    }),
    []
  );

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/10" />
      <div className="container relative z-10">
        <motion.div {...motionVariants} className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-5xl">{t('title')}</h2>
          <p className="mb-8 text-lg text-muted-foreground sm:text-xl">{t('subtitle')}</p>

          <Button size="lg" className="mb-8" asChild>
            <a
              href="https://chrome.google.com/webstore/detail/shizue"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
            >
              <Chrome className="mr-2 h-5 w-5" />
              {t('button')}
            </a>
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <Link
              href="https://github.com/shizue"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="mr-2 h-4 w-4" />
              {t('links.github')}
            </Link>
            <Link
              href="https://discord.gg/shizue"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {t('links.discord')}
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <FileText className="mr-2 h-4 w-4" />
              {t('links.docs')}
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
});

FinalCTA.displayName = 'FinalCTA';
