import { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BlogList } from '@/components/blog/BlogList'

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const params = await props.params
  const t = await getTranslations({ locale: params.locale, namespace: 'blog' })

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
  }
}

export default async function BlogPage(props: {
  params: Promise<{ locale: string }>
}) {
  const params = await props.params
  setRequestLocale(params.locale)
  const t = await getTranslations({ locale: params.locale, namespace: 'blog' })

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold mb-8 text-center">{t('title')}</h1>
      <p className="text-lg text-muted-foreground mb-12 text-center max-w-3xl mx-auto">
        {t('subtitle')}
      </p>
      <BlogList />
    </div>
  )
}
