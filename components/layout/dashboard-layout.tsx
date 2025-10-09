'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { Header } from './header';
import { UserProvider, useUser } from '@/contexts/user-context';
import { PersonFilterProvider } from '@/contexts/person-filter-context';
import { NotificationsProvider } from '@/contexts/notifications-context';
import { PreferencesProvider } from '@/contexts/preferences-context';
import { NotificationsToasts } from '@/components/notifications/Toasts';
import RealtimeBridge from '@/components/notifications/RealtimeBridge';
import { UpdateBanner } from '@/components/updates/UpdateBanner';

interface AuthenticatedShellProps {
  children: React.ReactNode;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
}

function AuthenticatedShell({
  children,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}: AuthenticatedShellProps) {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4 text-text-muted">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-dashed border-text-muted" />
          <span className="text-sm">Loading your workspace…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
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
                <UpdateBanner />
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
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tz = resolved && typeof resolved === 'string' && resolved.length > 0
        ? resolved
        : 'America/New_York';
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `client_tz=${encodeURIComponent(tz)}; path=/; expires=${expires}`;
    } catch {}
  }, []);

  return (
    <UserProvider>
      <AuthenticatedShell
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      >
        {children}
      </AuthenticatedShell>
    </UserProvider>
  );
}
