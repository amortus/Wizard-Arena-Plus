import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  ),
  title: 'Wizard Arena Online',
  description: 'Free multiplayer survivors-style game. Pick a wizard, dodge hordes, stack powerups, top the leaderboard.',
  openGraph: {
    title: 'Wizard Arena Online',
    description: 'Free multiplayer survivors-style game. Pick a wizard, dodge hordes, stack powerups, top the leaderboard.',
    type: 'website',
    images: ['/wizard_arena_logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wizard Arena Online',
    description: 'Free multiplayer survivors-style game.',
    images: ['/wizard_arena_logo.png'],
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
      <body>{children}</body>
    </html>
  );
}
