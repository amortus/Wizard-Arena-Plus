import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  metadataBase: new URL('https://wizard-arena-plus.vercel.app'),
  title: 'Wizard Arena Plus',
  description: 'Free multiplayer arena survivors game. Pick a wizard, dodge hordes, stack powerups, top the leaderboard.',
  openGraph: {
    title: 'Wizard Arena Plus',
    description: 'Free multiplayer arena survivors game. Pick a wizard, dodge hordes, stack powerups, top the leaderboard.',
    type: 'website',
    images: ['/wizard_arena_plus_logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wizard Arena Plus',
    description: 'Free multiplayer survivors-style game.',
    images: ['/wizard_arena_plus_logo.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* AdSense verification metatag — must be in <head> for Google crawler */}
        <meta name="google-adsense-account" content="ca-pub-2926713394150469" />
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
        {/* AdSense auto ads — publisher pub-2926713394150469 */}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2926713394150469"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
