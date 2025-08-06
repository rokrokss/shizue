'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BlogCard } from './BlogCard';
import { blogPosts } from '@/lib/blog-data';

export function BlogList() {
  const t = useTranslations('blog');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // 카테고리 추출
  const categories = ['all', ...new Set(blogPosts.map((post) => post.category))];

  // 필터링된 포스트
  const filteredPosts =
    selectedCategory === 'all'
      ? blogPosts
      : blogPosts.filter((post) => post.category === selectedCategory);

  return (
    <div>
      {/* 카테고리 필터 */}
      <div className="flex flex-wrap justify-center gap-2 mb-12">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === category
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {category === 'all' ? t('filter.all') : t(`categories.${category}`)}
          </button>
        ))}
      </div>

      {/* 블로그 포스트 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredPosts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </div>

      {/* 포스트가 없을 때 */}
      {filteredPosts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('noPosts')}</p>
        </div>
      )}
    </div>
  );
}
