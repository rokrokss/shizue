import { useLocale } from 'next-intl'

interface SEOHeadProps {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
  author?: string
  keywords?: string[]
}

export function SEOHead({
  title,
  description,
  image,
  url,
  type = 'website',
  publishedTime,
  modifiedTime,
  author,
  keywords,
}: SEOHeadProps) {
  const locale = useLocale()
  const baseUrl = 'https://shizue.ai'
  const fullUrl = url || `${baseUrl}/${locale}`
  const ogImage = image || `/og-${locale}.png`

  return (
    <>
      {/* Basic meta tags */}
      {title && <meta property="og:title" content={title} />}
      {description && <meta property="og:description" content={description} />}
      {keywords && keywords.length > 0 && (
        <meta name="keywords" content={keywords.join(', ')} />
      )}
      
      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:image" content={`${baseUrl}${ogImage}`} />
      <meta property="og:locale" content={locale} />
      <meta property="og:site_name" content="Shizue" />
      
      {/* Article specific */}
      {type === 'article' && (
        <>
          {publishedTime && (
            <meta property="article:published_time" content={publishedTime} />
          )}
          {modifiedTime && (
            <meta property="article:modified_time" content={modifiedTime} />
          )}
          {author && <meta property="article:author" content={author} />}
        </>
      )}
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      {title && <meta name="twitter:title" content={title} />}
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={`${baseUrl}${ogImage}`} />
      <meta name="twitter:site" content="@shizue_ai" />
      
      {/* Additional SEO tags */}
      <link rel="canonical" href={fullUrl} />
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    </>
  )
}