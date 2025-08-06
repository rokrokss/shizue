'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeftRight } from 'lucide-react';

export function BeforeAfter() {
  const t = useTranslations('beforeAfter');
  const [showAfter, setShowAfter] = useState(false);

  const examples = [
    {
      id: 'wikipedia',
      title: 'Wikipedia',
      before: {
        title: 'Artificial Intelligence',
        content: `Artificial intelligence (AI) is intelligence demonstrated by machines,
        in contrast to the natural intelligence displayed by humans and animals.
        Leading AI textbooks define the field as the study of "intelligent agents".`,
      },
      after: {
        title: '인공 지능',
        content: `인공 지능(AI)은 인간과 동물이 보여주는 자연 지능과 대조적으로
        기계가 보여주는 지능입니다. 주요 AI 교과서는 이 분야를
        "지능형 에이전트"에 대한 연구로 정의합니다.`,
      },
    },
    {
      id: 'news',
      title: 'BBC News',
      before: {
        title: 'Climate Change Summit Reaches Historic Agreement',
        content: `World leaders have reached a groundbreaking agreement on climate action,
        committing to reduce global emissions by 50% by 2030.`,
      },
      after: {
        title: '기후 변화 정상회담, 역사적 합의 도출',
        content: `세계 지도자들이 기후 행동에 대한 획기적인 합의에 도달하여,
        2030년까지 전 세계 배출량을 50% 줄이기로 약속했습니다.`,
      },
    },
  ];

  const [currentExample, setCurrentExample] = useState(0);
  const example = examples[currentExample];

  return (
    <section className="py-16 sm:py-24">
      <div className="container">
        <div className="text-center mb-12">
          <Badge className="mb-4">{t('badge')}</Badge>
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">{t('title')}</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Example Selector */}
          <div className="flex justify-center gap-4 mb-8">
            {examples.map((ex, index) => (
              <Button
                key={ex.id}
                variant={currentExample === index ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentExample(index)}
              >
                {ex.title}
              </Button>
            ))}
          </div>

          {/* Comparison Container */}
          <div className="relative bg-background rounded-lg shadow-xl border overflow-hidden">
            {/* Toggle Button */}
            <div className="absolute top-4 right-4 z-10">
              <Button
                size="sm"
                variant={showAfter ? 'default' : 'outline'}
                onClick={() => setShowAfter(!showAfter)}
              >
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                {showAfter ? t('showOriginal') : t('showTranslation')}
              </Button>
            </div>

            {/* Content */}
            <div className="p-8">
              <motion.div
                key={`${example.id}-${showAfter}`}
                initial={{ opacity: 0, x: showAfter ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Language Badge */}
                <Badge variant={showAfter ? 'default' : 'secondary'} className="mb-4">
                  {showAfter ? t('translated') : t('original')}
                </Badge>

                {/* Article Content */}
                <article className="space-y-4">
                  <h3 className="text-2xl font-bold">
                    {showAfter ? example.after.title : example.before.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {showAfter ? example.after.content : example.before.content}
                  </p>
                </article>

                {/* Visual Indicator */}
                <div className="mt-8 flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${showAfter ? 'bg-primary' : 'bg-muted'}`}
                    />
                    <span className="text-sm text-muted-foreground">
                      {showAfter ? t('withShizue') : t('withoutShizue')}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Features List */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl mb-2">⚡</div>
              <div className="font-medium">{t('features.instant')}</div>
              <div className="text-sm text-muted-foreground">{t('features.instantDesc')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">🎨</div>
              <div className="font-medium">{t('features.preserve')}</div>
              <div className="text-sm text-muted-foreground">{t('features.preserveDesc')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">🌍</div>
              <div className="font-medium">{t('features.bilingual')}</div>
              <div className="text-sm text-muted-foreground">{t('features.bilingualDesc')}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
