// Root layout forcing dark mode with dark Tailwind theme applied to the html element.

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vox Deorum Stats',
  description: 'AI run analytics for Vox Deorum',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <nav className="border-b border-border px-6 py-3 flex items-center gap-6">
          <span className="font-bold text-lg tracking-tight">Vox Deorum Stats</span>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
          <a href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Settings</a>
        </nav>
        <main className="px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
