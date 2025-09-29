'use client';

import { ReactNode, useMemo, useState } from 'react';
import {
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

type DetailRowProps = {
  icon: ReactNode;
  value: ReactNode;
  label?: string;
  href?: string;
};

const DetailRow = ({ icon, value, label, href }: DetailRowProps) => {
  const content = (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-white/10 text-text-muted">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white/90 leading-snug break-words">{value}</div>
        {label ? <p className="mt-1 text-xs text-text-muted/70">{label}</p> : null}
      </div>
    </div>
  );

  if (!href) return <div className="rounded-lg px-1 py-2">{content}</div>;

  const isExternal = /^https?:/i.test(href);
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="block rounded-lg px-1 py-2 transition hover:bg-white/10"
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
  const [isFavorite, setIsFavorite] = useState(Boolean(contact.is_favorite));
  const [copied, setCopied] = useState(false);

  const assignedLabel = useMemo(() => {
    if (assignedToLabel) return assignedToLabel;
    if (Array.isArray(contact.assigned_entities) && contact.assigned_entities.length > 0) {
      return contact.assigned_entities.map(entity => entity.label).join(', ');
    }
    if (Array.isArray(contact.related_to) && contact.related_to.length > 0) {
      return contact.related_to.length + ' linked';
    }
    return null;
  }, [assignedToLabel, contact.assigned_entities, contact.related_to]);

  const handleFavoriteToggle = () => {
    if (!showFavoriteToggle || typeof actionConfig?.onToggleFavorite !== 'function') return;
    const next = !isFavorite;
    setIsFavorite(next);
    actionConfig.onToggleFavorite(next);
  };

  const handleCopyAll = async () => {
    try {
      const lines: string[] = [];
      lines.push(contact.name);
      if (contact.company) lines.push(contact.company);
      if (emails.length > 0) lines.push('Emails: ' + emails.join(', '));
      if (phones.length > 0) lines.push('Phones: ' + phones.join(', '));
      if (addresses.length > 0) lines.push('Addresses: ' + addresses.join(' | '));
      if (website) lines.push('Website: ' + website);
      if (portalUrl) lines.push('Portal URL: ' + portalUrl);
      if (portalUsername) lines.push('Portal Username: ' + portalUsername);
      if (portalPassword) lines.push('Portal Password: ' + portalPassword);
      if (contact.notes) lines.push('Notes: ' + contact.notes);
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('[ContactCard] failed to copy contact details', error);
    }
  };

  const renderBadge = (badgeValue: ContactCardBadge) => (
    <span
      key={badgeValue.id}
      className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium', buildBadgeClass(badgeValue))}
    >
      {badgeValue.icon}
      {badgeValue.label}
    </span>
  );

  const showPrimaryColumn = Boolean(contact.company || contact.role || contact.notes || extraContent);
  const showDetailColumn = layout === 'auto'
    ? phones.length > 0 || emails.length > 0 || addresses.length > 0 || Boolean(website) || Boolean(portalUrl) || Boolean(meta && meta.length > 0)
    : true;

  type RowConfig = DetailRowProps & { id: string };

  const detailRows = useMemo<RowConfig[]>(() => {
    const rows: RowConfig[] = [];

    emails.forEach(email => {
      rows.push({
        id: 'email-' + email,
        icon: <Mail className="h-3.5 w-3.5" />,
        value: <span>{email}</span>,
        label: 'Email',
        href: 'mailto:' + email,
      });
    });

    phones.forEach(phone => {
      rows.push({
        id: 'phone-' + phone,
        icon: <Phone className="h-3.5 w-3.5" />,
        value: <span>{phone}</span>,
        label: 'Phone',
        href: formatPhoneForHref(phone),
      });
    });

    addresses.forEach(address => {
      rows.push({
        id: 'address-' + address,
        icon: <MapPin className="h-3.5 w-3.5" />,
        value: <span className="leading-snug">{address}</span>,
        label: 'Address',
      });
    });

    if (website) {
      rows.push({
        id: 'website',
        icon: <Globe className="h-3.5 w-3.5" />,
        value: <span>{website}</span>,
        label: 'Website',
        href: formatWebsiteHref(website),
      });
    }

    if (portalUrl) {
      rows.push({
        id: 'portal',
        icon: <Globe className="h-3.5 w-3.5" />,
        value: <span>{formatPortalLabel(portalUrl, portalUsername)}</span>,
        label: portalPassword ? 'Portal · Password stored' : 'Portal',
        href: formatWebsiteHref(portalUrl),
      });
    }

    if (Array.isArray(meta) && meta.length > 0) {
      meta.forEach(item => {
        rows.push({
          id: 'meta-' + item.key,
          icon: item.icon ?? <MoreHorizontal className="h-3.5 w-3.5" />,
          value: <span>{item.value}</span>,
          label: item.label,
        });
      });
    }

    return rows;
  }, [addresses, emails, meta, phones, portalUrl, portalUsername, portalPassword, website]);

  return (
    <div className={CONTACT_CARD_CLASS}>
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold leading-tight text-text-primary">
                {contact.name || 'Untitled Contact'}
              </h3>
              {showFavoriteToggle && typeof actionConfig?.onToggleFavorite === 'function' ? (
                <button
                  type="button"
                  onClick={handleFavoriteToggle}
                  className="text-text-muted transition hover:text-yellow-300"
                  aria-label={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                >
                  {renderFavoriteIcon(isFavorite)}
                </button>
              ) : null}
            </div>
            {subtitle ? <p className="text-sm text-text-muted/75">{subtitle}</p> : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted/80">
              <span className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium', categoryVisual.badgeClass)}>
                {categoryVisual.label}
              </span>
              {Array.isArray(badges) && badges.length > 0 && badges.map(renderBadge)}
              {assignedLabel ? (
                <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-text-muted/70">
                  {assignedLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={handleCopyAll} className={ACTION_BUTTON_CLASS} title="Copy contact details">
              {copied ? <CopyCheck className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
            </button>
            {canManage && (
              <>
                <button type="button" onClick={actionConfig?.onEdit} className={ACTION_BUTTON_CLASS} title="Edit contact">
                  <Edit2 className="h-4 w-4" />
                </button>
                <button type="button" onClick={actionConfig?.onDelete} className={ACTION_BUTTON_CLASS} title="Delete contact">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
            {actionConfig?.onOpenDetails ? (
              <button type="button" onClick={actionConfig.onOpenDetails} className={ACTION_BUTTON_CLASS} title="Open details">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          {showPrimaryColumn ? (
            <div className="space-y-2 text-sm text-text-muted">
              {contact.company ? (
                <DetailRow icon={<span className="text-text-muted">🏢</span>} value={<span>{contact.company}</span>} label={contact.role || undefined} />
              ) : null}
              {contact.notes ? (
                <DetailRow icon={<span className="text-text-muted">📝</span>} value={<span className="whitespace-pre-wrap leading-relaxed">{contact.notes}</span>} />
              ) : null}
              {extraContent}
            </div>
          ) : null}

          {showDetailColumn ? (
            <div className="space-y-2 text-sm text-text-muted">
              {detailRows.map(row => (
                <DetailRow key={row.id} icon={row.icon} value={row.value} label={row.label} href={row.href} />
              ))}
            </div>
          ) : null}
        </div>

        {footerContent}
      </div>
    </div>
  );
}
