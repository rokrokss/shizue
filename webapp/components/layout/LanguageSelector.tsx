'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { useCallback, memo } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { locales, localeNames } from '@/lib/i18n/locales'
import { Globe } from 'lucide-react'

const LanguageMenuItem = memo(({ 
  locale, 
  currentLocale, 
  onClick 
}: { 
  locale: string
  currentLocale: string
  onClick: (locale: string) => void 
}) => {
  const handleClick = useCallback(() => onClick(locale), [locale, onClick])
  
  return (
    <DropdownMenuItem
      onClick={handleClick}
      className={currentLocale === locale ? 'bg-accent' : ''}
    >
      {localeNames[locale as keyof typeof localeNames]}
    </DropdownMenuItem>
  )
})

LanguageMenuItem.displayName = 'LanguageMenuItem'

export const LanguageSelector = memo(() => {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const handleLocaleChange = useCallback((newLocale: string) => {
    const newPathname = pathname.replace(`/${locale}`, `/${newLocale}`)
    router.push(newPathname)
  }, [locale, pathname, router])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Globe className="mr-2 h-4 w-4" />
          {localeNames[locale as keyof typeof localeNames]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[400px] overflow-y-auto">
        {locales.map((loc) => (
          <LanguageMenuItem
            key={loc}
            locale={loc}
            currentLocale={locale}
            onClick={handleLocaleChange}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

LanguageSelector.displayName = 'LanguageSelector'