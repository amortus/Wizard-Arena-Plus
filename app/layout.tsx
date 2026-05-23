import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  ),
  title: 'Madness Arena',
  description: 'Free multiplayer survivors-style game. Pick a wizard, dodge hordes, stack powerups, top the leaderboard.',
  openGraph: {
    title: 'Madness Arena',
    description: 'Free multiplayer survivors-style game. Pick a wizard, dodge hordes, stack powerups, top the leaderboard.',
    type: 'website',
    images: ['/madness_arena_logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Madness Arena',
    description: 'Free multiplayer survivors-style game.',
    images: ['/madness_arena_logo.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Press+Start+2P&family=VT323&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Script
          src="https://cloud.umami.is/script.js"
          data-website-id="49381c52-58a4-466d-b10e-27c91fa95ec5"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
