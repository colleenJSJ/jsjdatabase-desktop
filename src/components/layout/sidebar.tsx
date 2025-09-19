'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, Calendar, FileText, Briefcase, Shield, 
  Settings, LogOut, Menu, X, CheckSquare,
  House, PawPrint, Package, User, Heart, Plane, Activity,
  GraduationCap, Users
} from 'lucide-react';
import { useState, memo } from 'react';
import { useUser } from '@/contexts/user-context';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Travel', href: '/travel', icon: Plane },
  { name: 'Health', href: '/health', icon: Heart },
  { name: 'Passwords', href: '/passwords', icon: Shield },
  { name: 'Household', href: '/household', icon: House },
  { name: 'Pets', href: '/pets', icon: PawPrint },
  { name: 'Documents', href: '/documents', icon: FileText },
  { name: 'J3 Academics', href: '/j3-academics', icon: GraduationCap },
  { name: 'Contacts', href: '/contacts', icon: Users },
];

const adminNavigation = [
  { name: 'Activity', href: '/activity', icon: Activity },
  { name: 'Admin Settings', href: '/admin/settings', icon: Settings },
];

export const Sidebar = memo(function Sidebar({ 
  isMobileMenuOpen, 
  setIsMobileMenuOpen 
}: {
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen?: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const [localMobileMenuOpen, setLocalMobileMenuOpen] = useState(false);
  
  // Use props if provided, otherwise use local state
  const isOpen = isMobileMenuOpen ?? localMobileMenuOpen;
  const setIsOpen = setIsMobileMenuOpen ?? setLocalMobileMenuOpen;

  const isActive = (path: string) => pathname === path;

  const NavLink = ({ item }: { item: typeof navigation[0] }) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    
    return (
      <Link
        href={item.href}
        className={`
          flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
          ${active 
            ? 'bg-background-tertiary text-text-primary' 
            : 'text-text-muted hover:bg-gray-700/50 hover:text-text-primary'
          }
        `}
        onClick={() => setIsOpen(false)}
      >
        <Icon className="h-5 w-5" />
        <span>{item.name}</span>
      </Link>
    );
  };

  return (
    <>

      {/* Mobile menu backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-background-tertiary transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="flex flex-col h-full">

          {/* Navigation */}
          <nav className="flex-1 px-4 pt-16 pb-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
            
            {user?.role === 'admin' && (
              <>
                <div className="pt-4 mt-4 border-t border-gray-600/30">
                  <p className="px-3 text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Admin
                  </p>
                  <div className="mt-2 space-y-1">
                    {adminNavigation.map((item) => (
                      <NavLink key={item.name} item={item} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </nav>

          {/* Account & Logout */}
          <div className="px-4 py-4 border-t border-gray-600/30 space-y-1">
            <Link
              href="/account/settings"
              className={`
                flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
                ${pathname === '/account/settings'
                  ? 'bg-gray-700/50 text-text-primary' 
                  : 'text-text-muted hover:bg-gray-700/50 hover:text-text-primary'
                }
              `}
              onClick={() => setIsOpen(false)}
            >
              <User className="h-5 w-5" />
              <span>Account Settings</span>
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-text-muted hover:bg-gray-700/50 hover:text-text-primary transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
});
