import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies, headers } from 'next/headers'
import { createCSRFToken, csrfStore } from '@/lib/security/csrf'
import './globals.css'
import { QueryProvider } from '@/providers/query-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Johnson Family Office',
  description: 'Secure family management system',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#262625',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // CSRF token bootstrap (server-side): create a lightweight session id cookie and issue token
  try {
    const cs = await cookies();
    const hdrs = await headers();
    const cspNonce = hdrs.get('x-csp-nonce') || '';
    const sid = cs.get('csrf-session')?.value;
    let token: string | null = null;
    if (sid) {
      const existing = await csrfStore.get(sid);
      if (existing) {
        token = existing.token;
      } else {
        token = await createCSRFToken(sid);
      }
    }
    return (
      <html lang="en" className="dark">
        <head>
          {token && <meta name="csrf-token" content={token} />}
          {cspNonce && <meta name="csp-nonce" content={cspNonce} />}
        </head>
        <body className={inter.className}>
          <QueryProvider>{children}</QueryProvider>
        </body>
      </html>
    );
  } catch {
    // Fallback if cookies API is unavailable
    return (
      <html lang="en" className="dark">
        <body className={inter.className}>
          <QueryProvider>{children}</QueryProvider>
        </body>
      </html>
    );
  }
}
