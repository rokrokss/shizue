'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { BlogPost } from '@/lib/blog-data'
import { CalendarDays, Clock, ArrowLeft, User } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Button } from '@/components/ui/button'

interface BlogPostContentProps {
  post: BlogPost
}

export function BlogPostContent({ post }: BlogPostContentProps) {
  const t = useTranslations('blog')
  const locale = useLocale()

  const formattedDate = new Date(post.date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <article className="container mx-auto px-4 py-16 max-w-4xl">
      {/* 뒤로가기 버튼 */}
      <Link href={`/${locale}/blog`}>
        <Button variant="ghost" className="mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('backToBlog')}
        </Button>
      </Link>

      {/* 포스트 헤더 */}
      <header className="mb-8">
        <div className="mb-4">
          <span className="px-3 py-1 text-sm font-medium bg-primary text-primary-foreground rounded-full">
            {t(`categories.${post.category}`)}
          </span>
        </div>

        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>{post.author.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            <span>{formattedDate}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{post.readTime} {t('readTime')}</span>
          </div>
        </div>
      </header>

      {/* 썸네일 이미지 */}
      <div className="relative h-96 mb-8 rounded-lg overflow-hidden">
        <OptimizedImage
          src={post.thumbnail}
          alt={post.title}
          fill
          className="object-cover"
          sizes="(max-width: 896px) 100vw, 896px"
          priority
        />
      </div>

      {/* 포스트 내용 */}
      <div className="prose prose-lg dark:prose-invert max-w-none">
        <div dangerouslySetInnerHTML={{ __html: formatContent(post.content) }} />
      </div>

      {/* 저자 정보 */}
      <div className="mt-12 pt-8 border-t">
        <div className="flex items-center gap-4">
          <OptimizedImage
            src={post.author.avatar}
            alt={post.author.name}
            width={64}
            height={64}
            className="rounded-full"
          />
          <div>
            <p className="font-semibold">{post.author.name}</p>
            <p className="text-sm text-muted-foreground">{t('author')}</p>
          </div>
        </div>
      </div>
    </article>
  )
}

// 마크다운 스타일의 콘텐츠를 간단한 HTML로 변환
function formatContent(content: string): string {
  return content
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^<li>/gm, '<ul><li>')
    .replace(/<\/li>\n(?!<li>)/g, '</li></ul>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^<li>/gm, '<ol><li>')
    .replace(/<\/li>\n(?!<li>)/g, '</li></ol>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^(?!<[h|p|u|o|l])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>')
}
