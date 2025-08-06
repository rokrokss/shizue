'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function LiveDemo() {
  const t = useTranslations('liveDemo');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const demoSteps = [
    { id: 'original', label: t('steps.original') },
    { id: 'select', label: t('steps.select') },
    { id: 'translate', label: t('steps.translate') },
    { id: 'result', label: t('steps.result') },
  ];

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    if (!isPlaying) {
      // Start animation sequence
      let step = 0;
      const interval = setInterval(() => {
        step++;
        setCurrentStep(step);
        if (step >= demoSteps.length - 1) {
          clearInterval(interval);
          setIsPlaying(false);
        }
      }, 2000);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setIsPlaying(false);
  };

  return (
    <section className="py-16 sm:py-24 bg-muted/30">
      <div className="container">
        <div className="text-center mb-12">
          <Badge className="mb-4">{t('badge')}</Badge>
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">{t('title')}</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        <div className="max-w-5xl mx-auto">
          {/* Demo Window */}
          <div className="bg-background rounded-lg shadow-xl border overflow-hidden">
            {/* Browser Chrome */}
            <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-background rounded px-4 py-1 text-sm text-muted-foreground">
                  example.com
                </div>
              </div>
            </div>

            {/* Demo Content */}
            <div className="relative h-96 bg-background p-8">
              {/* Original Text */}
              <motion.div
                initial={{ opacity: 1 }}
                animate={{
                  opacity: currentStep >= 2 ? 0.3 : 1,
                  scale: currentStep >= 2 ? 0.95 : 1,
                }}
                transition={{ duration: 0.5 }}
                className="space-y-4"
              >
                <h3 className="text-2xl font-bold">Welcome to Our Platform</h3>
                <p className="text-muted-foreground">
                  Discover the power of AI-enhanced browsing with real-time translation, intelligent
                  chat assistance, and seamless multilingual support. Transform your web experience
                  today.
                </p>
              </motion.div>

              {/* Selection Highlight */}
              {currentStep >= 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.2 }}
                  className="absolute inset-0 bg-primary/20 rounded"
                />
              )}

              {/* Shizue Button */}
              {currentStep >= 1 && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute top-4 right-4"
                >
                  <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium shadow-lg">
                    Shizue
                  </div>
                </motion.div>
              )}

              {/* Translated Text */}
              {currentStep >= 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-x-8 top-32 space-y-4 bg-primary/10 p-4 rounded-lg border border-primary/20"
                >
                  <h3 className="text-2xl font-bold">우리 플랫폼에 오신 것을 환영합니다</h3>
                  <p className="text-muted-foreground">
                    실시간 번역, 지능형 채팅 지원 및 원활한 다국어 지원으로 AI 강화 브라우징의 힘을
                    발견하세요. 오늘 웹 경험을 변화시키세요.
                  </p>
                </motion.div>
              )}
            </div>

            {/* Progress Steps */}
            <div className="bg-muted/30 px-4 py-3 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {demoSteps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`flex items-center gap-2 text-sm ${
                        index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          index <= currentStep ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`}
                      />
                      {step.label}
                    </div>
                  ))}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleReset}
                    disabled={currentStep === 0}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={handlePlayPause}>
                    {isPlaying ? (
                      <>
                        <Pause className="h-4 w-4 mr-1" />
                        {t('pause')}
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1" />
                        {t('play')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Try It Now CTA */}
          <div className="text-center mt-8">
            <Button size="lg" asChild>
              <a
                href="https://chrome.google.com/webstore/detail/shizue"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('tryNow')}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
