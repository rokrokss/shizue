import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { blogPosts } from '@/lib/blog-data';
import { BlogPostContent } from '@/components/blog/BlogPostContent';

export async function generateStaticParams() {
  const locales = [
    'en',
    'ko',
    'ja',
    'zh',
    'es',
    'fr',
    'de',
    'pt',
    'ru',
    'ar',
    'hi',
    'id',
    'it',
    'nl',
    'pl',
    'tr',
    'vi',
    'th',
    'sv',
    'da',
    'fi',
    'no',
    'cs',
  ];

  return locales.flatMap((locale) =>
    blogPosts.map((post) => ({
      locale,
      slug: post.slug,
    }))
  );
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const post = blogPosts.find((p) => p.slug === params.slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author.name],
      images: [post.thumbnail],
    },
  };
}

export default async function BlogPostPage(props: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const params = await props.params;
  setRequestLocale(params.locale);

  const post = blogPosts.find((p) => p.slug === params.slug);

  if (!post) {
    notFound();
  }

  return <BlogPostContent post={post} />;
}
