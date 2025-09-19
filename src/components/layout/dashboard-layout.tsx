'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { Header } from './header';
import { UserProvider } from '@/contexts/user-context';
import { PersonFilterProvider } from '@/contexts/person-filter-context';
import { NotificationsProvider } from '@/contexts/notifications-context';
import { PreferencesProvider } from '@/contexts/preferences-context';
import { NotificationsToasts } from '@/components/notifications/Toasts';
import RealtimeBridge from '@/components/notifications/RealtimeBridge';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Set a cookie with the client's timezone for server-side timezone fallback
  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tz = resolved && typeof resolved === 'string' && resolved.length > 0
        ? resolved
        : 'America/New_York';
      // 30 days expiry
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `client_tz=${encodeURIComponent(tz)}; path=/; expires=${expires}`;
    } catch {}
  }, []);

  return (
    <UserProvider>
      <PersonFilterProvider>
        <PreferencesProvider>
          <NotificationsProvider>
          <div className="min-h-screen bg-background-primary flex">
            <div className="app-sidebar h-full flex-none">
              <Sidebar isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />
            </div>
            <div className="app-content-col flex-1 flex flex-col lg:ml-64">
              <div className="app-header">
                <Header onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
              </div>
              <main className="app-content-main flex-1 p-2 sm:p-4 lg:p-8 pb-16 sm:pb-20 lg:pb-8 min-h-0 max-w-full overflow-x-hidden">
                {children}
              </main>
              <div className="app-mobile-nav">
                <MobileNav />
              </div>
            </div>
            <NotificationsToasts />
            <RealtimeBridge />
          </div>
          </NotificationsProvider>
        </PreferencesProvider>
      </PersonFilterProvider>
    </UserProvider>
  );
}
