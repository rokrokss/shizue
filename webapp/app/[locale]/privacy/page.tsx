import { setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return {
    title: 'Privacy Policy - Shizue',
    description: 'Learn how Shizue protects your privacy and handles your data',
    alternates: {
      canonical: `/${locale}/privacy`,
    },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Header />
      <main className="flex-1 py-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>

          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-lg text-muted-foreground mb-8">Last updated: January 1, 2024</p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Information We Collect</h2>
            <p>
              Shizue is designed with privacy in mind. We do not collect, store, or transmit any
              personal information or browsing data to our servers.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">2. API Keys</h2>
            <p>
              Your API keys for OpenAI, Anthropic, and Google services are stored locally in your
              browser using Chrome&apos;s secure storage API. These keys are never transmitted to
              our servers.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">3. Local Storage</h2>
            <p>
              All your data including chat history, notes, and preferences are stored locally in
              your browser. This data remains on your device and is not accessible to us.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Third-Party Services</h2>
            <p>
              When you use AI features, your requests are sent directly from your browser to the
              respective AI service providers (OpenAI, Anthropic, or Google) using your API keys.
              Please refer to their privacy policies for how they handle your data.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Analytics</h2>
            <p>
              We do not use any analytics or tracking services. Your usage of Shizue is completely
              private.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Open Source</h2>
            <p>
              Shizue is open source software. You can review our code on GitHub to verify our
              privacy practices.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Contact</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at
              support@shizue.ai
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
