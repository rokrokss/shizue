export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  category: string
  thumbnail: string
  date: string
  readTime: number
  author: {
    name: string
    avatar: string
  }
}

// 샘플 블로그 포스트 데이터
export const blogPosts: BlogPost[] = [
  {
    id: '1',
    slug: 'introducing-shizue-ai-browser-extension',
    title: 'Introducing Shizue: Your AI-Powered Browser Companion',
    excerpt: 'Discover how Shizue transforms your browsing experience with real-time translation, AI chat, and smart features that respect your privacy.',
    content: `
# Introducing Shizue: Your AI-Powered Browser Companion

Shizue is more than just another browser extension. It's your personal AI assistant that seamlessly integrates into your web browsing experience, offering real-time translation, intelligent chat capabilities, and much more.

## Why We Built Shizue

In today's interconnected world, language barriers shouldn't limit your access to information. We created Shizue to break down these barriers while respecting your privacy and giving you full control over your AI experience.

## Key Features

### 1. Real-Time Translation
- Translate entire web pages with a single click
- Preserve original formatting and layout
- Support for 23+ languages

### 2. AI Chat Integration
- Access GPT-4, Claude, and Gemini models
- Context-aware responses based on current page
- Stream responses in real-time

### 3. Privacy First
- Use your own API keys
- No data collection or tracking
- Open-source for full transparency

## Getting Started

1. Install Shizue from the Chrome Web Store or Edge Add-ons
2. Add your API keys in settings
3. Start chatting, translating, and exploring!

Join thousands of users who are already enhancing their browsing experience with Shizue.
    `,
    category: 'announcement',
    thumbnail: '/placeholder.jpg',
    date: '2025-01-15',
    readTime: 5,
    author: {
      name: 'Shizue Team',
      avatar: '/placeholder.jpg'
    }
  },
  {
    id: '2',
    slug: 'youtube-caption-translation-guide',
    title: 'How to Translate YouTube Captions in Real-Time with Shizue',
    excerpt: 'Learn how to use Shizue\'s powerful caption translation feature to watch YouTube videos in any language.',
    content: `
# How to Translate YouTube Captions in Real-Time with Shizue

YouTube has content from all over the world, but language barriers can limit what you can enjoy. With Shizue's real-time caption translation, you can watch any video in your preferred language.

## Setting Up Caption Translation

1. **Install Shizue** and add your API keys
2. **Navigate to YouTube** and open any video with captions
3. **Click the Shizue icon** in the caption area
4. **Select your target language**

## Features

- Real-time translation as captions appear
- Caching for repeated content
- Support for 23+ languages
- Minimal API usage through smart caching

## Pro Tips

- Use keyboard shortcuts for quick language switching
- Enable auto-translation for specific channels
- Adjust translation speed in settings

Start exploring global content without language barriers today!
    `,
    category: 'tutorial',
    thumbnail: '/placeholder.jpg',
    date: '2025-01-10',
    readTime: 3,
    author: {
      name: 'Shizue Team',
      avatar: '/placeholder.jpg'
    }
  },
  {
    id: '3',
    slug: 'pdf-translation-preserving-layout',
    title: 'Translating PDFs While Preserving Original Layout',
    excerpt: 'Shizue\'s PDF translation feature maintains document structure and formatting for professional results.',
    content: `
# Translating PDFs While Preserving Original Layout

PDFs are everywhere - from academic papers to business documents. Shizue's PDF translation feature ensures you can read any PDF in your language while maintaining the original layout.

## How It Works

Our PDF translation uses advanced parsing to:
- Extract text while preserving structure
- Maintain formatting and styling
- Keep images and diagrams in place
- Support multi-column layouts

## Step-by-Step Guide

1. Open Shizue's side panel
2. Navigate to the PDF Translator tab
3. Upload your PDF file
4. Select source and target languages
5. Click translate and download the result

## Use Cases

- Academic research papers
- Business contracts and proposals
- Technical documentation
- E-books and magazines

Experience seamless PDF translation that respects the original design.
    `,
    category: 'feature',
    thumbnail: '/placeholder.jpg',
    date: '2025-01-05',
    readTime: 4,
    author: {
      name: 'Shizue Team',
      avatar: '/placeholder.jpg'
    }
  }
]