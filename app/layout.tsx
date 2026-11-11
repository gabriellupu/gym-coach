import type { Metadata, Viewport } from 'next';
import './globals.css';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Gym Coach — your mixed-reality trainer',
  description: 'An XR fitness instructor for the gear you actually own. Runs in the Meta Quest browser.',
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/icon.svg` },
};
export const viewport: Viewport = { themeColor: '#0b0e14', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
