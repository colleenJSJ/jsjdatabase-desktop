'use client';

import { Menu } from 'lucide-react';
import { GlobalSearch } from '@/components/search/global-search';
import { TimezoneSelector } from '@/components/layout/TimezoneSelector';

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {

  return (
    <header className="bg-background-tertiary border-b border-gray-600/30">
      <div className="px-2 sm:px-4 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Mobile menu + Global Search (aligned left) */}
          <div className="flex items-center gap-3 flex-1">
            {/* Mobile menu button */}
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-md bg-gray-700/50 text-text-muted hover:text-text-primary"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:block flex-1">
              <GlobalSearch />
            </div>
          </div>

          {/* Right side - Timezone only */}
          <div className="flex items-center gap-3">
            <TimezoneSelector />
          </div>
        </div>
      </div>
    </header>
  );
}
