'use client';

import { ReactNode, useMemo, useState } from 'react';
import {
  Copy,
  Mail,
  MapPin,
  Phone,
  Star
} from 'lucide-react';
import {
  formatPhoneForHref,
  renderFavoriteIcon,
  resolveAddresses,
  resolveCategoryVisual,
  resolveEmails,
  resolvePhones
} from './contact-utils';
import { ContactCardBadge, ContactCardProps } from './contact-types';
import { cn } from '@/lib/utils';
import { useResolvedPortalPassword } from '@/components/contacts/useResolvedPortalPassword';

const buildBadgeClass = (badge: ContactCardBadge) => {
  switch (badge.tone) {
    case 'danger':
      return 'bg-rose-500/15 text-rose-200 border-rose-400/30';
    case 'success':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
    case 'warning':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
    case 'primary':
      return 'bg-primary-500/15 text-primary-200 border-primary-400/30';
    case 'neutral':
    default:
      return 'bg-white/5 text-text-muted border-white/10';
  }
};

const renderBadge = (badgeValue: ContactCardBadge) => (
  <span
    key={badgeValue.id}
    className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium', buildBadgeClass(badgeValue))}
  >
    {badgeValue.icon}
    {badgeValue.label}
  </span>
);

type DetailRowProps = {
  icon: ReactNode;
  value: ReactNode;
  href?: string;
  secondary?: ReactNode;
  label?: string;
  onCopy?: () => void;
};

const DetailRow = ({ icon, value, href, secondary, label, onCopy }: DetailRowProps) => {
  const handleCopy = (event: React.MouseEvent) => {
    event.stopPropagation();
    onCopy?.();
  };

  const content = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-4 w-4 flex-none items-center justify-center text-[#7A7A78]">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        {label ? <div className="text-[11px] uppercase text-text-muted/60 tracking-wide">{label}</div> : null}
        <div className="text-sm leading-snug text-[#C2C0B6] break-words">{value}</div>
        {secondary ? <div className="text-xs text-text-muted/60 mt-0.5">{secondary}</div> : null}
      </div>
      {onCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          className="ml-2 flex h-6 w-6 flex-none items-center justify-center rounded-full border border-white/10 bg-black/40 text-text-muted hover:text-white transition-colors"
          aria-label={`Copy ${label ?? 'value'}`}
        >
          <Copy className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );

  if (!href) return <div className="py-2.5">{content}</div>;

  const isExternal = /^https?:/i.test(href);
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="block py-2.5 transition hover:opacity-80"
    >
      {content}
    </a>
  );
};

export function ContactCard({
  contact,
  canManage = false,
  assignedToLabel,
  subtitle,
  badges,
  meta: _meta,
  extraContent,
  footerContent,
  actionConfig,
  showFavoriteToggle = true,
  onOpen,
}: ContactCardProps) {
  const categoryVisual = useMemo(() => resolveCategoryVisual(contact.category), [contact.category]);
  const emails = useMemo(() => resolveEmails(contact), [contact]);
  const phones = useMemo(() => resolvePhones(contact), [contact]);
  const addresses = useMemo(() => resolveAddresses(contact), [contact]);
  const website = contact.website;
  const portalUrl = contact.portal_url;
  const portalUsername = contact.portal_username;
  const portalPassword = contact.portal_password;
  const resolvedPortalPassword = useResolvedPortalPassword(portalPassword);
  const portalPasswordDisplay = resolvedPortalPassword || portalPassword || '';
  const [isFavorite, setIsFavorite] = useState(Boolean(contact.is_favorite));
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const secondaryBadges = useMemo(() => {
    if (!Array.isArray(badges)) return [] as ContactCardBadge[];
    const categoryLabel = categoryVisual.label?.toLowerCase?.();
    return badges.filter(badge => badge.label?.toLowerCase() !== categoryLabel);
  }, [badges, categoryVisual.label]);

  const handleFavoriteToggle = () => {
    if (!showFavoriteToggle || typeof actionConfig?.onToggleFavorite !== 'function') return;
    const next = !isFavorite;
    setIsFavorite(next);
    actionConfig.onToggleFavorite(next);
  };

  const handleCopyAll = async () => {
    try {
      const lines: string[] = [];
      if (contact.name) lines.push(contact.name);
      if (contact.company) lines.push(contact.company);
      if (emails.length > 0) lines.push('Emails: ' + emails.join(', '));
      if (phones.length > 0) lines.push('Phones: ' + phones.join(', '));
      if (addresses.length > 0) lines.push('Addresses: ' + addresses.join(' | '));
      if (website) lines.push('Website: ' + website);
      if (portalUrl) lines.push('Portal URL: ' + portalUrl);
      if (portalUsername) lines.push('Portal Username: ' + portalUsername);
      if (portalPasswordDisplay) {
        lines.push('Portal Password: ' + portalPasswordDisplay);
      }
      if (contact.notes) lines.push('Notes: ' + contact.notes);
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('[ContactCard] failed to copy contact details', error);
    }
  };

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(prev => (prev === key ? null : prev)), 1500);
    } catch (error) {
      console.error('[ContactCard] copy failed', error);
    }
  };

  const computeSourceLabel = () => {
    const rawSource =
      contact.source_page ||
      contact.source_type ||
      (contact as any).source ||
      null;

    if (!rawSource) return null;
    const normalized = rawSource.toLowerCase();
    const friendly = (() => {
      switch (normalized) {
        case 'health':
          return 'Health';
        case 'pets':
          return 'Pets';
        case 'travel':
          return 'Travel';
        case 'j3-academics':
        case 'j3_academics':
          return 'J3 Academics';
        case 'household':
          return 'Household';
        case 'contacts':
          return 'Manual Contact';
        default:
          return rawSource
            .split(/[-_]/)
            .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
      }
    })();

    return friendly ? `From ${friendly}` : null;
  };

  const derivedSourceLabel = computeSourceLabel();
  const cardClassName = [
    'group relative overflow-hidden rounded-2xl border border-white/5 bg-[#30302e] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-[#363633] hover:shadow-[0_12px_30px_rgba(0,0,0,0.35)]',
    onOpen ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400/60' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const primaryEmail = emails[0];
  const primaryPhone = phones[0];
  const primaryAddress = addresses[0];

  return (
    <div
      className={cardClassName}
      onClick={event => {
        if (event.defaultPrevented) return;
        onOpen?.();
      }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={event => {
        if (!onOpen) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="truncate text-sm font-semibold leading-tight text-text-primary">
              {contact.name || 'Untitled Contact'}
            </div>
            {derivedSourceLabel && (
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/80">
                {derivedSourceLabel}
              </div>
            )}
            {assignedToLabel && (
              <div className="text-xs text-text-muted/80">{assignedToLabel}</div>
            )}
          </div>
          {showFavoriteToggle && typeof actionConfig?.onToggleFavorite === 'function' ? (
            <button
              onClick={event => {
                event.stopPropagation();
                handleFavoriteToggle();
              }}
              className={`rounded-full p-1 transition-colors ${
                isFavorite ? 'text-yellow-400' : 'text-text-muted hover:text-yellow-400'
              }`}
            >
              <Star className="h-3.5 w-3.5" fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          ) : null}
        </div>

        {(secondaryBadges.length > 0 || extraContent) && (
          <div className="flex flex-wrap items-center gap-1.5 -mb-1">
            {secondaryBadges.map(badge => (
              <span
                key={badge.id}
                className="inline-flex items-center gap-1 rounded-xl bg-[#262625] px-2.5 py-1 text-xs text-[#C2C0B6]"
              >
                {badge.icon}
                {badge.label}
              </span>
            ))}
            {extraContent}
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-white/5 bg-black/25 p-3">
          {primaryEmail && (
            <DetailRow
              icon={<Mail className="h-3.5 w-3.5" />}
              label="Email"
              value={<span className="font-mono text-[13px] text-text-primary/90">{primaryEmail}</span>}
              onCopy={() => copyValue(primaryEmail, 'email-0')}
              secondary={copiedField === 'email-0' ? <span className="text-emerald-400/80">Copied!</span> : undefined}
            />
          )}
          {primaryPhone && (
            <DetailRow
              icon={<Phone className="h-3.5 w-3.5" />}
              label="Phone"
              value={<span className="font-mono text-[13px] text-text-primary/90">{primaryPhone}</span>}
              onCopy={() => copyValue(primaryPhone, 'phone-0')}
              secondary={copiedField === 'phone-0' ? <span className="text-emerald-400/80">Copied!</span> : undefined}
            />
          )}
          {primaryAddress && (
            <DetailRow
              icon={<MapPin className="h-3.5 w-3.5" />}
              label="Address"
              value={<span className="text-[13px] text-text-primary/90">{primaryAddress}</span>}
              onCopy={() => copyValue(primaryAddress, 'address-0')}
              secondary={copiedField === 'address-0' ? <span className="text-emerald-400/80">Copied!</span> : undefined}
            />
          )}
        </div>

        {footerContent}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {canManage && (
            <button
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                actionConfig?.onEdit?.();
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-white/20 hover:bg-white/10 hover:text-text-primary"
            >
              Edit
            </button>
          )}
          <button
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              handleCopyAll();
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              copied
                ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-300'
                : 'border border-white/10 bg-white/5 text-text-secondary hover:border-white/20 hover:bg-white/10 hover:text-text-primary'
            }`}
          >
            {copied ? 'Copied!' : 'Copy All'}
          </button>
          {canManage && (
            <button
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                actionConfig?.onDelete?.();
              }}
              className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:border-red-400 hover:bg-red-500/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
