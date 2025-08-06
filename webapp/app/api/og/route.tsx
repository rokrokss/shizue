import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get parameters
    const title = searchParams.get('title') || 'Shizue';
    const description =
      searchParams.get('description') ||
      'AI-powered browser extension for translation, chat, and web browsing';
    // const locale = searchParams.get('locale') || 'en' // Reserved for future use

    // We'll use the default font for now, since we don't have Inter font files yet

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0a0a0a',
            backgroundImage:
              'radial-gradient(circle at 25px 25px, #1a1a1a 2%, transparent 2%), radial-gradient(circle at 75px 75px, #1a1a1a 2%, transparent 2%)',
            backgroundSize: '100px 100px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 40,
            }}
          >
            {/* Logo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 40,
              }}
            >
              <svg
                width="80"
                height="80"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                style={{
                  marginLeft: 24,
                  fontSize: 60,
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {title}
              </span>
            </div>

            {/* Description */}
            <div
              style={{
                display: 'flex',
                fontSize: 32,
                fontWeight: 400,
                color: '#a1a1aa',
                textAlign: 'center',
                maxWidth: 900,
                lineHeight: 1.4,
              }}
            >
              {description}
            </div>
          </div>

          {/* Features */}
          <div
            style={{
              display: 'flex',
              gap: 40,
              marginTop: 40,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 24,
                color: '#71717a',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ marginRight: 12 }}
              >
                <path
                  d="M3 5H21M3 12H21M3 19H21"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Translation
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 24,
                color: '#71717a',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ marginRight: 12 }}
              >
                <path
                  d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              AI Chat
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 24,
                color: '#71717a',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ marginRight: 12 }}
              >
                <path
                  d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 2V8H20"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              PDF Translation
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch {
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
