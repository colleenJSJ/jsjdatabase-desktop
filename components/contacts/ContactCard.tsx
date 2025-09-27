'use client';

import { ReactNode, useMemo, useState } from 'react';
import {
  Building2,
  Copy,
  CopyCheck,
  Edit2,
  Globe,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Trash2
} from 'lucide-react';
import {
  ACTION_BUTTON_CLASS,
  CONTACT_CARD_CLASS,
  DEFAULT_CONTACT_AVATAR,
  formatPhoneForHref,
  formatPortalLabel,
  formatWebsiteHref,
  renderFavoriteIcon,
  resolveAddresses,
  resolveCategoryVisual,
  resolveEmails,
  resolvePhones
} from './contact-utils';
import { ContactCardBadge, ContactCardProps } from './contact-types';
import { cn } from '@/lib/utils';

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

const DEFAULT_METADATA_ICON: Record<string, ReactNode> = {
  phone: <Phone className="h-3.5 w-3.5 text-text-primary" />,
  email: <Mail className="h-3.5 w-3.5 text-text-primary" />,
  address: <MapPin className="h-3.5 w-3.5 text-text-primary" />,
  website: <Globe className="h-3.5 w-3.5 text-text-primary" />,
};

type DetailRowProps = {
  icon: ReactNode;
  value: ReactNode;
  label?: string;
  href?: string;
  badge?: ReactNode;
  secondary?: ReactNode;
};

const DetailRow = ({ icon, value, label, href, badge, secondary }: DetailRowProps) => {
  const content = (
    <div className="flex w-full flex-wrap items-start gap-3">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/10 text-text-muted">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        {label ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted/70">
            {label}
          </p>
        ) : null}
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-medium leading-snug text-white/90 break-words">
          {value}
          {badge ?? null}
        </div>
        {secondary ? (
          <div className="mt-1 text-xs text-text-muted/65 break-words">{secondary}</div>
        ) : null}
      </div>
    </div>
  );

  const className = cn(
    'group block break-words rounded-xl border border-white/8 bg-black/25 px-3 py-2 transition',
    href ? 'hover:border-white/20 hover:bg-black/30 hover:text-white' : undefined
  );

  if (href) {
    const isExternal = /^https?:/i.test(href);
    return (
      <a
        href={href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className={className}
      >
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
};

export function ContactCard({
  contact,
  canManage = false,
  assignedToLabel,
  subtitle,
  badges,
  meta,
  extraContent,
  footerContent,
  actionConfig,
  showFavoriteToggle = true,
  layout = 'auto',
}: ContactCardProps) {
  const categoryVisual = useMemo(() => resolveCategoryVisual(contact.category), [contact.category]);
  const emails = useMemo(() => resolveEmails(contact), [contact]);
  const phones = useMemo(() => resolvePhones(contact), [contact]);
  const addresses = useMemo(() => resolveAddresses(contact), [contact]);
  const website = contact.website;
  const portalUrl = contact.portal_url;
  const portalUsername = contact.portal_username;
  const portalPassword = contact.portal_password;
  const isFavoriteInitial = Boolean(contact.is_favorite);
  const [isFavorite, setIsFavorite] = useState(isFavoriteInitial);
  const [copied, setCopied] = useState(false);

  const assignedLabel = useMemo(() => assignedToLabel ?? null, [assignedToLabel]);

  const metaRows = useMemo(() => {
    if (!Array.isArray(meta) || meta.length === 0) return [] as ReactNode[];
    return meta.map(item => (
      <DetailRow
        key={item.key}
        icon={item.icon ?? DEFAULT_METADATA_ICON[item.key] ?? <MoreHorizontal className="h-3.5 w-3.5" />}
        value={<span>{item.value}</span>}
        label={item.label}
      />
    ));
  }, [meta]);

  const rightColumnRows = useMemo(() => {
    const rows: ReactNode[] = [];

    emails.forEach(email => {
      rows.push(
        <DetailRow
          key={'email-' + email}
          icon={<Mail className="h-3.5 w-3.5" />}
          value={<span>{email}</span>}
          href={'mailto:' + email}
        />
      );
    });

    phones.forEach(phone => {
      rows.push(
        <DetailRow
          key={'phone-' + phone}
          icon={<Phone className="h-3.5 w-3.5" />}
          value={<span>{phone}</span>}
          href={formatPhoneForHref(phone)}
        />
      );
    });

    addresses.forEach(address => {
      rows.push(
        <DetailRow
          key={'address-' + address}
          icon={<MapPin className="mt-0.5 h-3.5 w-3.5" />}
          value={<span className="leading-snug">{address}</span>}
        />
      );
    });

    if (website) {
      rows.push(
        <DetailRow
          key="website"
          icon={<Globe className="h-3.5 w-3.5" />}
          value={<span>{website}</span>}
          href={formatWebsiteHref(website)}
        />
      );
    }

    if (portalUrl) {
      rows.push(
        <DetailRow
          key="portal"
          icon={<Globe className="h-3.5 w-3.5" />}
          value={<span>{formatPortalLabel(portalUrl, portalUsername)}</span>}
          href={formatWebsiteHref(portalUrl)}
          badge={
            portalPassword ? (
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-text-muted/70">
                Password stored
              </span>
            ) : null
          }
        />
      );
    }

    rows.push(...metaRows);
    return rows;
  }, [addresses, emails, phones, website, portalUrl, portalUsername, portalPassword, metaRows]);

  const canFavorite = showFavoriteToggle && typeof actionConfig?.onToggleFavorite === 'function';

  const handleFavoriteToggle = () => {
    const next = !isFavorite;
    setIsFavorite(next);
    actionConfig?.onToggleFavorite?.(next);
  };

  const handleCopyAll = async () => {
    if (actionConfig?.onCopyAll) {
      actionConfig.onCopyAll();
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      return;
    }

    try {
      const lines: string[] = [];
      lines.push(contact.name);
      if (contact.company) lines.push(contact.company);
      if (emails.length > 0) {
        lines.push('Emails: ' + emails.join(', '));
      }
      if (phones.length > 0) {
        lines.push('Phones: ' + phones.join(', '));
      }
      if (addresses.length > 0) {
        lines.push('Addresses: ' + addresses.join(' | '));
      }
      if (website) lines.push('Website: ' + website);
      if (portalUrl) lines.push('Portal URL: ' + portalUrl);
      if (portalUsername) lines.push('Portal Username: ' + portalUsername);
      if (portalPassword) lines.push('Portal Password: ' + portalPassword);
      if (contact.notes) lines.push('Notes: ' + contact.notes);
      await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('[ContactCard] failed to copy contact details', error);
    }
  };

  const renderBadge = (badgeValue: ContactCardBadge) => (
    <span
      key={badgeValue.id}
      className={'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ' + buildBadgeClass(badgeValue)}
    >
      {badgeValue.icon}
      {badgeValue.label}
    </span>
  );

  const showMetaColumn = layout === 'auto' ? (phones.length > 0 || emails.length > 0 || addresses.length > 0 || website || portalUrl) : true;

  return (
    <div className={CONTACT_CARD_CLASS}>
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
        style={{
          background: 'radial-gradient(circle at top right, rgba(148,163,184,0.12), transparent 55%)'
        }}
      />

      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold leading-tight text-text-primary">
                {contact.name || 'Untitled Contact'}
              </h3>
              {canFavorite && (
                  <button
                    type="button"
                    onClick={handleFavoriteToggle}
                    className="text-text-muted transition hover:text-yellow-300"
                    aria-label={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                  >
                    {renderFavoriteIcon(isFavorite)}
                  </button>
                )}
              </div>
              {subtitle ? <p className="text-sm text-text-muted/75">{subtitle}</p> : null}
              {assignedLabel ? (
                <p className="text-xs uppercase tracking-[0.28em] text-text-muted/65">{assignedLabel}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted/85">
                <span
                  className={'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ' + categoryVisual.badgeClass}
                >
                  {categoryVisual.icon}
                  {categoryVisual.label}
                </span>
                {Array.isArray(badges) && badges.length > 0 && badges.map(renderBadge)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={handleCopyAll}
              className={ACTION_BUTTON_CLASS}
              title="Copy contact details"
            >
              {copied ? <CopyCheck className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={actionConfig?.onEdit}
                  className={ACTION_BUTTON_CLASS}
                  title="Edit contact"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={actionConfig?.onDelete}
                  className={ACTION_BUTTON_CLASS}
                  title="Delete contact"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
            {actionConfig?.onOpenDetails && (
              <button
                type="button"
                onClick={actionConfig.onOpenDetails}
                className={ACTION_BUTTON_CLASS}
                title="Open details"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className={cn('grid grid-cols-1 gap-4', showMetaColumn ? 'md:grid-cols-2' : undefined)}>
          <div className="space-y-3">
            {contact.company ? (
              <DetailRow
                icon={<Building2 className="h-3.5 w-3.5" />}
                value={<span>{contact.company}</span>}
                label="Company"
                secondary={contact.role ? <span>Role · {contact.role}</span> : undefined}
              />
            ) : null}

            {contact.notes ? (
              <DetailRow
                icon={<MoreHorizontal className="h-3.5 w-3.5" />}
                value={<span className="whitespace-pre-wrap leading-relaxed">{contact.notes}</span>}
                label="Notes"
              />
            ) : null}

            {extraContent}
          </div>

          {showMetaColumn ? (
            <div className="space-y-3">
              {rightColumnRows}
            </div>
          ) : null}
        </div>

        {footerContent}
      </div>
    </div>
  );
}
