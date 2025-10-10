'use client';

import { useMemo, useState } from 'react';
import { Mail, Phone, MapPin, Globe, Copy, Shield, Building2, UserCircle2 } from 'lucide-react';
import { PasswordField } from '@/components/passwords/PasswordField';
import { Modal, ModalBody, ModalCloseButton, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import type { ContactRecord } from '@/components/contacts/contact-types';
import { resolveAddresses, resolveEmails, resolvePhones, formatWebsiteHref } from '@/components/contacts/contact-utils';
import { useResolvedPortalPassword } from '@/components/contacts/useResolvedPortalPassword';

interface FamilyMemberInfo {
  id: string;
  name: string;
}

interface ContactDetailModalProps {
  contact: ContactRecord;
  familyMembers: FamilyMemberInfo[];
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canManage?: boolean;
}

const formatSourceLabel = (source?: string | null) => {
  if (!source) return null;
  const normalized = source.toLowerCase();
  switch (normalized) {
    case 'health':
      return 'From Health';
    case 'pets':
      return 'From Pets';
    case 'travel':
      return 'From Travel';
    case 'j3-academics':
    case 'j3_academics':
      return 'From J3 Academics';
    case 'household':
      return 'From Household';
    case 'contacts':
      return 'Manual Contact';
    default:
      return `From ${source
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')}`;
  }
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-text-primary/90">
      {children}
    </div>
  </div>
);

const DetailRow = ({
  icon,
  label,
  value,
  onCopy,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  onCopy?: () => Promise<void> | void;
}) => (
  <div className="flex items-start justify-between gap-3 rounded-lg bg-black/25 px-3 py-2">
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-4 w-4 items-center justify-center text-text-muted/70">{icon}</span>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">{label}</div>
        <div className="text-sm text-text-primary/90">{value}</div>
      </div>
    </div>
    {onCopy ? (
      <button
        type="button"
        onClick={onCopy}
        className="rounded border border-white/10 p-1.5 text-text-muted hover:border-white/20 hover:text-text-primary"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    ) : null}
  </div>
);

export function ContactDetailModal({
  contact,
  familyMembers,
  onClose,
  onEdit,
  onDelete,
  canManage = false,
}: ContactDetailModalProps) {
  const emails = useMemo(() => resolveEmails(contact), [contact]);
  const phones = useMemo(() => resolvePhones(contact), [contact]);
  const addresses = useMemo(() => resolveAddresses(contact), [contact]);
  const sourceLabel = formatSourceLabel(contact.source_page || contact.source_type || null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const resolvedPortalPassword = useResolvedPortalPassword(contact.portal_password);
  const portalPasswordDisplay = resolvedPortalPassword || contact.portal_password || '';
  const createdAtValue = contact.created_at || (contact as any).created_at || new Date().toISOString();
  const updatedAtValue = contact.updated_at || (contact as any).updated_at || createdAtValue;

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(prev => (prev === key ? null : prev)), 1500);
    } catch (error) {
      console.error('[ContactDetailModal] copy failed', error);
    }
  };

  const relatedNames = (contact.related_to || [])
    .map(id => familyMembers.find(member => member.id === id)?.name)
    .filter((value): value is string => Boolean(value));

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalHeader>
        <div className="flex flex-col gap-1">
          <ModalTitle>{contact.name || 'Untitled Contact'}</ModalTitle>
          {sourceLabel && (
            <span className="inline-flex w-fit items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {sourceLabel}
            </span>
          )}
        </div>
        <ModalCloseButton onClose={onClose} />
      </ModalHeader>
      <ModalBody className="space-y-4">
        {contact.company && (
          <Section title="Organization">
            <div className="flex items-center gap-2 text-sm text-text-primary/90">
              <Building2 className="h-4 w-4 text-text-muted" />
              <span>{contact.company}</span>
            </div>
          </Section>
        )}

        {(emails.length > 0 || phones.length > 0 || addresses.length > 0) && (
          <Section title="Contact Details">
            <div className="space-y-2">
              {emails.map(email => (
                <DetailRow
                  key={email}
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={
                    <a className="hover:text-primary-300" href={`mailto:${email}`}>
                      {email}
                    </a>
                  }
                  onCopy={() => copyValue(email, 'email-' + email)}
                />
              ))}
              {phones.map(phone => (
                <DetailRow
                  key={phone}
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Phone"
                  value={
                    <a className="hover:text-primary-300" href={`tel:${phone}`}>
                      {phone}
                    </a>
                  }
                  onCopy={() => copyValue(phone, 'phone-' + phone)}
                />
              ))}
              {addresses.map(address => (
                <DetailRow
                  key={address}
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Address"
                  value={address}
                  onCopy={() => copyValue(address, 'address-' + address)}
                />
              ))}
            </div>
          </Section>
        )}

        {contact.website && (
          <Section title="Website">
            <a
              href={formatWebsiteHref(contact.website)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary-300 hover:text-primary-200"
            >
              <Globe className="h-4 w-4" />
              {contact.website}
            </a>
          </Section>
        )}

        {(contact.portal_url || contact.portal_username || contact.portal_password) && (
          <Section title="Portal Access">
            <div className="space-y-2">
              {contact.portal_url && (
                <DetailRow
                  icon={<Globe className="h-3.5 w-3.5" />}
                  label="URL"
                  value={
                    <a
                      className="hover:text-primary-300"
                      href={formatWebsiteHref(contact.portal_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {contact.portal_url}
                    </a>
                  }
                  onCopy={() => copyValue(contact.portal_url!, 'portal-url')}
                />
              )}
              {contact.portal_username && (
                <DetailRow
                  icon={<UserCircle2 className="h-3.5 w-3.5" />}
                  label="Username"
                  value={contact.portal_username}
                  onCopy={() => copyValue(contact.portal_username!, 'portal-username')}
                />
              )}
              {portalPasswordDisplay && (
                <DetailRow
                  icon={<Shield className="h-3.5 w-3.5" />}
                  label="Password"
                  value={<PasswordField password={portalPasswordDisplay} className="text-sm break-all" />}
                  onCopy={() => copyValue(portalPasswordDisplay, 'portal-password')}
                />
              )}
            </div>
          </Section>
        )}

        {relatedNames.length > 0 && (
          <Section title="Related To">
            <div className="flex flex-wrap gap-2">
              {relatedNames.map(name => (
                <span key={name} className="rounded-full bg-white/5 px-3 py-1 text-xs text-text-primary/80">
                  {name}
                </span>
              ))}
            </div>
          </Section>
        )}

        {contact.notes && (
          <Section title="Notes">
            <p className="whitespace-pre-wrap text-sm text-text-primary/85">{contact.notes}</p>
          </Section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Created">
            <span>{new Date(createdAtValue).toLocaleString()}</span>
          </Section>
          <Section title="Updated">
            <span>{new Date(updatedAtValue).toLocaleString()}</span>
          </Section>
        </div>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            const lines: string[] = [];
            if (contact.name) lines.push(contact.name);
            if (contact.company) lines.push(contact.company);
            emails.forEach(email => lines.push('Email: ' + email));
            phones.forEach(phone => lines.push('Phone: ' + phone));
            addresses.forEach(address => lines.push('Address: ' + address));
            if (contact.website) lines.push('Website: ' + contact.website);
            if (contact.portal_url) lines.push('Portal URL: ' + contact.portal_url);
            if (contact.portal_username) lines.push('Portal Username: ' + contact.portal_username);
            if (portalPasswordDisplay) {
              lines.push('Portal Password: ' + portalPasswordDisplay);
            }
            if (contact.notes) lines.push('Notes: ' + contact.notes);
            navigator.clipboard.writeText(lines.join('\n')).catch(err => console.error('Copy all failed', err));
            setCopiedField('copy-all');
            setTimeout(() => setCopiedField(prev => (prev === 'copy-all' ? null : prev)), 1500);
          }}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            copiedField === 'copy-all'
              ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-300'
              : 'border-white/10 bg-white/5 text-text-secondary hover:border-white/20 hover:bg-white/10 hover:text-text-primary'
          }`}
        >
          {copiedField === 'copy-all' ? 'Copied!' : 'Copy All'}
        </button>
        {canManage && (
          <>
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onEdit();
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-secondary hover:border-white/20 hover:bg-white/10 hover:text-text-primary"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete()}
                className="rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:border-red-400 hover:bg-red-500/20"
              >
                Delete
              </button>
            )}
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
