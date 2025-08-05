import { useTranslations } from 'next-intl'
import { Check, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const comparisonItems = [
  { id: 'price', shizue: true, competitor: false },
  { id: 'models', shizue: true, competitor: false },
  { id: 'privacy', shizue: true, competitor: false },
  { id: 'source', shizue: true, competitor: false },
  { id: 'usage', shizue: true, competitor: false }
]

export function Comparison() {
  const t = useTranslations('comparison')

  return (
    <section id="comparison" className="py-20 sm:py-32 bg-muted/50">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center animate-fadeIn">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
        </div>

        <div className="mt-16 mx-auto max-w-4xl animate-fadeInUp animate-delay-100">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Feature Names Column */}
            <div className="space-y-4">
              <div className="h-[180px]" /> {/* Spacer for card headers */}
              {comparisonItems.map((item) => (
                <div
                  key={item.id}
                  className="flex h-[72px] items-center rounded-lg bg-background px-4 font-medium"
                >
                  {t(item.id)}
                </div>
              ))}
            </div>

            {/* Shizue Column */}
            <Card className="relative overflow-hidden border-2 border-primary/20 animate-scaleIn animate-delay-200">
              <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
              <div className="relative p-6">
                <Badge className="mb-2" variant="default">
                  Recommended
                </Badge>
                <h3 className="mb-2 text-2xl font-bold">Shizue</h3>
                <p className="text-sm text-muted-foreground">
                  Free & Open Source
                </p>
              </div>
              <div className="space-y-4 p-6 pt-0">
                {comparisonItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex h-[72px] items-center justify-between rounded-lg bg-muted/50 px-4"
                  >
                    <span className="text-sm">
                      {t(`shizue.${item.id}`)}
                    </span>
                    {item.shizue && (
                      <Check className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Competitor Column */}
            <Card className="relative overflow-hidden animate-scaleIn animate-delay-300">
              <div className="p-6">
                <div className="mb-2 h-6" /> {/* Spacer for badge */}
                <h3 className="mb-2 text-2xl font-bold">Others</h3>
                <p className="text-sm text-muted-foreground">
                  Subscription Services
                </p>
              </div>
              <div className="space-y-4 p-6 pt-0">
                {comparisonItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex h-[72px] items-center justify-between rounded-lg bg-muted/50 px-4"
                  >
                    <span className="text-sm">
                      {t(`competitor.${item.id}`)}
                    </span>
                    {!item.competitor && (
                      <X className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}