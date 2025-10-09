'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, FileText, Briefcase, Shield } from 'lucide-react';

const navigation = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Docs', href: '/documents', icon: FileText },
  { name: 'Business', href: '/businesses', icon: Briefcase },
  { name: 'Security', href: '/passwords', icon: Shield },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background-secondary border-t border-brown-dark/30">
      <div className="grid grid-cols-5 gap-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex flex-col items-center gap-1 py-2 px-1 text-xs font-medium transition-colors
                ${isActive 
                  ? 'text-beige-light' 
                  : 'text-text-on-dark-muted hover:text-text-on-dark'
                }
              `}
            >
              <Icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}