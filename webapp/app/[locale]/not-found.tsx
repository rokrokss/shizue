'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('notFound');
  const locale = useLocale();

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6 px-4">
        <div className="space-y-2">
          <h1 className="text-9xl font-bold text-primary">404</h1>
          <h2 className="text-2xl font-semibold">
            {t('title', { defaultValue: 'Page Not Found' })}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t('description', {
              defaultValue: "The page you're looking for doesn't exist or has been moved.",
            })}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild>
            <Link href={`/${locale}`} className="inline-flex items-center">
              <Home className="mr-2 h-4 w-4" />
              {t('goHome', { defaultValue: 'Go Home' })}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('goBack', { defaultValue: 'Go Back' })}
          </Button>
        </div>

        <div className="mt-8">
          <p className="text-sm text-muted-foreground">
            {t('needHelp', { defaultValue: 'Need help? Contact us at' })}{' '}
            <a href="mailto:support@shizue.ai" className="text-primary hover:underline">
              support@shizue.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
