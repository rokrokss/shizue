import { setRequestLocale } from 'next-intl/server'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return {
    title: 'Terms of Service - Shizue',
    description: 'Terms and conditions for using Shizue browser extension',
    alternates: {
      canonical: `/${locale}/terms`,
    },
  }
}

export default async function TermsPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <>
      <Header />
      <main className="flex-1 py-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>

          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-lg text-muted-foreground mb-8">
              Last updated: January 1, 2024
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
            <p>
              By installing and using Shizue, you agree to be bound by these Terms of Service.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">2. License</h2>
            <p>
              Shizue is open source software licensed under the MIT License. You are free to use, modify, and distribute the software in accordance with the license terms.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">3. Use of Service</h2>
            <p>
              You are responsible for obtaining and managing your own API keys for third-party services (OpenAI, Anthropic, Google). You must comply with the terms of service of these providers.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">4. No Warranty</h2>
            <p>
              Shizue is provided &quot;as is&quot; without any warranty of any kind, either express or implied. We do not guarantee that the service will be uninterrupted or error-free.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Limitation of Liability</h2>
            <p>
              In no event shall the developers of Shizue be liable for any damages arising from the use or inability to use the software.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Privacy</h2>
            <p>
              Your use of Shizue is also governed by our Privacy Policy.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Continued use of Shizue after changes constitutes acceptance of the new terms.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4">8. Contact</h2>
            <p>
              For questions about these Terms of Service, please contact us at support@shizue.ai
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
