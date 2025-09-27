import { ReactNode } from 'react';
import {
  Building2,
  GraduationCap,
  Heart,
  House,
  MapPin,
  PawPrint,
  Star,
  Tag,
  Users
} from 'lucide-react';
import { ContactCategory, ContactRecord } from './contact-types';

export type CategoryVisual = {
  label: string;
  icon: ReactNode;
  badgeClass: string;
};

const CATEGORY_MAP: Record<string, CategoryVisual> = {
  health: {
    label: 'Health',
    icon: <Heart className="h-4 w-4" />,
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
  },
  medical: {
    label: 'Health',
    icon: <Heart className="h-4 w-4" />,
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
  },
  household: {
    label: 'Household',
    icon: <House className="h-4 w-4" />,
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-400/30'
  },
  service: {
    label: 'Service',
    icon: <House className="h-4 w-4" />,
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-400/30'
  },
  pets: {
    label: 'Pets',
    icon: <PawPrint className="h-4 w-4" />,
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-400/30'
  },
  veterinary: {
    label: 'Pets',
    icon: <PawPrint className="h-4 w-4" />,
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-400/30'
  },
  travel: {
    label: 'Travel',
    icon: <MapPin className="h-4 w-4" />,
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-400/30'
  },
  academics: {
    label: 'Academics',
    icon: <GraduationCap className="h-4 w-4" />,
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-400/30'
  },
  'j3 academics': {
    label: 'J3 Academics',
    icon: <GraduationCap className="h-4 w-4" />,
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-400/30'
  }
};

export const resolveCategoryVisual = (
  category?: ContactCategory | null
): CategoryVisual => {
  if (!category) {
    return {
      label: 'General',
      icon: <Users className="h-4 w-4" />,
      badgeClass: 'bg-gray-500/15 text-gray-300 border-gray-400/30'
    };
  }

  const key = category.toString().toLowerCase();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];

  const tokens = Object.keys(CATEGORY_MAP).filter(token => key.includes(token));
  if (tokens.length > 0) {
    return CATEGORY_MAP[tokens[0]];
  }

  return {
    label: category,
    icon: <Tag className="h-4 w-4" />,
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-400/30'
  };
};

export const resolveEmails = (contact: ContactRecord): string[] => {
  if (Array.isArray(contact.emails) && contact.emails.length > 0) {
    return contact.emails.filter(Boolean) as string[];
  }
  return contact.email ? [contact.email] : [];
};

export const resolvePhones = (contact: ContactRecord): string[] => {
  if (Array.isArray(contact.phones) && contact.phones.length > 0) {
    return contact.phones.filter(Boolean) as string[];
  }
  return contact.phone ? [contact.phone] : [];
};

export const resolveAddresses = (contact: ContactRecord): string[] => {
  if (Array.isArray(contact.addresses) && contact.addresses.length > 0) {
    return contact.addresses.filter(Boolean) as string[];
  }
  return contact.address ? [contact.address] : [];
};

export const getContactInitials = (name: string): string => {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

export const formatPhoneForHref = (value: string): string => {
  return `tel:${value.replace(/[^\d+]/g, '')}`;
};

export const formatWebsiteHref = (value: string): string => {
  if (!value) return '#';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

export const formatPortalLabel = (
  url?: string | null,
  username?: string | null
): string => {
  if (username && url) return `${username} · ${url}`;
  if (username) return username;
  if (url) return url;
  return 'Portal access';
};

export const DEFAULT_CONTACT_AVATAR = (
  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-sm font-semibold text-white/80">
    <Building2 className="h-4 w-4" />
  </div>
);

export const renderFavoriteIcon = (isFavorite: boolean | undefined | null) => {
  return (
    <Star
      className={`h-4 w-4 transition-colors ${
        isFavorite
          ? 'fill-yellow-400 text-yellow-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]'
          : 'text-text-muted'
      }`}
    />
  );
};

export const DEFAULT_SECTION_CLASS =
  'space-y-1 text-sm text-text-muted border border-white/5 rounded-lg bg-background-tertiary/40 p-3';

export const CONTACT_CARD_CLASS =
  'relative overflow-hidden rounded-2xl border border-white/5 bg-[#30302E] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-[#353532] hover:shadow-[0_12px_30px_rgba(0,0,0,0.35)]';

export const ACTION_BUTTON_CLASS =
  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/5 bg-background-secondary/60 text-text-muted transition hover:border-white/10 hover:text-white';
