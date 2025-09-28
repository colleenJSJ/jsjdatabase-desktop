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
  DEFAULT_SECTION_CLASS,
  formatPhoneForHref,
  formatPortalLabel,
  formatWebsiteHref,
  getContactInitials,
  renderFavoriteIcon,
  resolveAddresses,
  resolveCategoryVisual,
  resolveEmails,
  resolvePhones
} from './contact-utils';
import { ContactCardBadge, ContactCardProps } from './contact-types';

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

  const assignedLabel = useMemo(() => {
    if (assignedToLabel) return assignedToLabel;
    if (Array.isArray(contact.assigned_entities) && contact.assigned_entities.length > 0) {
      return contact.assigned_entities.map(entity => entity.label).join(', ');
    }
    if (Array.isArray(contact.related_to) && contact.related_to.length > 0) {
      return `${contact.related_to.length} linked`;
    }
    return null;
  }, [assignedToLabel, contact.assigned_entities, contact.related_to]);

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
        lines.push(`Emails: ${emails.join(', ')}`);
      }
      if (phones.length > 0) {
        lines.push(`Phones: ${phones.join(', ')}`);
      }
      if (addresses.length > 0) {
        lines.push(`Addresses: ${addresses.join(' | ')}`);
      }
      if (website) lines.push(`Website: ${website}`);
      if (portalUrl) lines.push(`Portal URL: ${portalUrl}`);
      if (portalUsername) lines.push(`Portal Username: ${portalUsername}`);
      if (portalPassword) lines.push(`Portal Password: ${portalPassword}`);
      if (contact.notes) lines.push(`Notes: ${contact.notes}`);
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
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${buildBadgeClass(badgeValue)}`}
    >
      {badgeValue.icon}
      {badgeValue.label}
    </span>
  );

  const showMetaColumn = layout === 'auto' ? (phones.length > 0 || emails.length > 0 || addresses.length > 0 || website || portalUrl) : true;

  const renderAvatar = () => {
    if (!contact.name) {
      return DEFAULT_CONTACT_AVATAR;
    }

    const initials = getContactInitials(contact.name);
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-base font-semibold text-white/80">
        {initials || <Building2 className="h-4 w-4" />}
      </div>
    );
  };

  return (
    <div className={CONTACT_CARD_CLASS}>
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
        style={{
          background: 'radial-gradient(circle at top right, rgba(148,163,184,0.15), transparent 55%)'
        }}
      />

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {renderAvatar()}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white/90">{contact.name || 'Untitled Contact'}</h3>
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
              {subtitle && <p className="text-sm text-text-muted/80">{subtitle}</p>}
              {assignedLabel && (
                <p className="text-xs text-text-muted/70">
                  {assignedLabel}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${categoryVisual.badgeClass}`}
            >
              {categoryVisual.icon}
              {categoryVisual.label}
            </span>

            {Array.isArray(badges) && badges.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {badges.map(renderBadge)}
              </div>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopyAll}
                className={ACTION_BUTTON_CLASS}
                title="Copy contact details"
              >
                {copied ? <CopyCheck className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
              </button>
              {canManage && (
                <div className="flex items-center gap-1">
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
                </div>
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
        </div>

        <div className={
          showMetaColumn
            ? 'grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]'
            : 'grid grid-cols-1 gap-4'
        }>
          <div className="space-y-3 text-sm text-text-muted">
            {contact.company && (
              <div className={DEFAULT_SECTION_CLASS}>
                <div className="flex items-center gap-2 text-text-primary">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="font-medium text-white/85">{contact.company}</span>
                </div>
                {contact.role && (
                  <p className="text-xs text-text-muted/80">{contact.role}</p>
                )}
              </div>
            )}

            {contact.notes && (
              <div className={DEFAULT_SECTION_CLASS}>
                <p className="text-xs uppercase tracking-wide text-text-muted/60">Notes</p>
                <p className="whitespace-pre-wrap text-sm text-text-primary">{contact.notes}</p>
              </div>
            )}

            {extraContent}
          </div>

          {showMetaColumn && (
            <div className="space-y-2 text-sm text-text-muted">
              {emails.map(email => (
                <a
                  key={email}
                  href={`mailto:${email}`}
                  className={DEFAULT_SECTION_CLASS}
                >
                  <div className="flex items-center gap-2 text-text-primary">
                    <Mail className="h-3.5 w-3.5" />
                    <span className="font-medium">{email}</span>
                  </div>
                  <p className="text-xs text-text-muted/70">Email</p>
                </a>
              ))}

              {phones.map(phone => (
                <a
                  key={phone}
                  href={formatPhoneForHref(phone)}
                  className={DEFAULT_SECTION_CLASS}
                >
                  <div className="flex items-center gap-2 text-text-primary">
                    <Phone className="h-3.5 w-3.5" />
                    <span className="font-medium">{phone}</span>
                  </div>
                  <p className="text-xs text-text-muted/70">Phone</p>
                </a>
              ))}

              {addresses.map(address => (
                <div key={address} className={DEFAULT_SECTION_CLASS}>
                  <div className="flex items-start gap-2 text-text-primary">
                    <MapPin className="mt-0.5 h-3.5 w-3.5" />
                    <span className="font-medium leading-snug">{address}</span>
                  </div>
                  <p className="text-xs text-text-muted/70">Address</p>
                </div>
              ))}

              {website && (
                <a
                  href={formatWebsiteHref(website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={DEFAULT_SECTION_CLASS}
                >
                  <div className="flex items-center gap-2 text-text-primary">
                    <Globe className="h-3.5 w-3.5" />
                    <span className="font-medium">{website}</span>
                  </div>
                  <p className="text-xs text-text-muted/70">Website</p>
                </a>
              )}

              {portalUrl && (
                <div className={DEFAULT_SECTION_CLASS}>
                  <div className="flex items-center justify-between gap-2 text-text-primary">
                    <span className="font-medium">{formatPortalLabel(portalUrl, portalUsername)}</span>
                    {portalPassword && (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-text-muted/60">
                        Password Stored
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted/70">Portal Access</p>
                </div>
              )}

              {Array.isArray(meta) && meta.length > 0 && (
                <div className="space-y-2">
                  {meta.map(item => (
                    <div key={item.key} className={DEFAULT_SECTION_CLASS}>
                      <div className="flex items-center gap-2 text-text-primary">
                        {item.icon ?? DEFAULT_METADATA_ICON[item.key] ?? <MoreHorizontal className="h-3.5 w-3.5" />}
                        <span className="font-medium">{item.value}</span>
                      </div>
                      <p className="text-xs text-text-muted/70">{item.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {footerContent}
      </div>
    </div>
  );
}
