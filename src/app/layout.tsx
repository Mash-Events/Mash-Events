import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mash Events',
  description: 'Event registration and websites.',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
