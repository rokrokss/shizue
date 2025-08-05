'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { BlogPost } from '@/lib/blog-data'
import { CalendarDays, Clock, ArrowRight } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface BlogCardProps {
  post: BlogPost
}

export function BlogCard({ post }: BlogCardProps) {
  const t = useTranslations('blog')
  const locale = useLocale()

  // 날짜 포맷팅
  const formattedDate = new Date(post.date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <article className="group flex flex-col h-full overflow-hidden rounded-lg border bg-card hover:shadow-lg transition-shadow">
      {/* 썸네일 이미지 */}
      <div className="relative h-48 overflow-hidden">
        <OptimizedImage
          src={post.thumbnail}
          alt={post.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <div className="absolute top-4 left-4">
          <span className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full">
            {t(`categories.${post.category}`)}
          </span>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 p-6 flex flex-col">
        <h3 className="text-xl font-semibold mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {post.title}
        </h3>

        <p className="text-muted-foreground mb-4 line-clamp-3 flex-1">
          {post.excerpt}
        </p>

        {/* 메타 정보 */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            <span>{formattedDate}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{post.readTime} {t('readTime')}</span>
          </div>
        </div>

        {/* 더 읽기 링크 */}
        <Link
          href={`/${locale}/blog/${post.slug}`}
          className="inline-flex items-center text-sm font-medium text-primary hover:underline group-hover:gap-2 transition-all"
        >
          {t('readMore')}
          <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </article>
  )
}
