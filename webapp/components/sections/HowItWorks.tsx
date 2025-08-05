import { useTranslations } from 'next-intl'
import { Download, Key, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const steps = [
  {
    id: 'step1',
    number: '01',
    icon: Download,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    lineColor: 'from-blue-500 to-purple-500'
  },
  {
    id: 'step2',
    number: '02',
    icon: Key,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    lineColor: 'from-purple-500 to-green-500'
  },
  {
    id: 'step3',
    number: '03',
    icon: Sparkles,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    lineColor: null
  }
]

export function HowItWorks() {
  const t = useTranslations('howItWorks')

  return (
    <section id="how-it-works" className="py-20 sm:py-32">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center animate-fadeIn">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3 lg:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div
                key={step.id}
                className={cn(
                  "relative animate-fadeInUp",
                  index === 0 && "animate-delay-100",
                  index === 1 && "animate-delay-200",
                  index === 2 && "animate-delay-300"
                )}
              >
                <div className="text-center lg:text-left">
                  <div className="relative mx-auto mb-8 inline-flex lg:mx-0">
                    <div className={cn(
                      "relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl shadow-lg",
                      step.bgColor
                    )}>
                      <Icon className={cn("h-8 w-8", step.color)} />
                    </div>
                    <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background shadow-md">
                      <span className="text-sm font-bold">{step.number}</span>
                    </div>
                  </div>
                  
                  {/* Connecting line for desktop */}
                  {step.lineColor && (
                    <div className="absolute left-[60px] top-10 hidden h-[2px] w-[calc(100%-40px)] lg:block">
                      <div className={cn(
                        "h-full w-full bg-gradient-to-r",
                        step.lineColor
                      )} />
                    </div>
                  )}
                  
                  <h3 className="mb-4 text-xl font-semibold">
                    {t(`${step.id}.title`)}
                  </h3>
                  <p className="text-muted-foreground">
                    {t(`${step.id}.description`)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}