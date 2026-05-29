/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Static export for Capacitor (mobile). Only enabled when NEXT_OUTPUT_MODE=export.
  // Normal `npm run build` produces the standard Next.js output for Vercel.
  ...(process.env.NEXT_OUTPUT_MODE === 'export' ? { output: 'export' } : {}),
};

module.exports = nextConfig;
