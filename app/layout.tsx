import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FloodGuard | Bilog Falls Monitoring',
  description: 'Water-level monitoring and early warning system for Bilog Falls.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
