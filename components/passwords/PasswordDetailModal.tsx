'use client';

import { useMemo, useState } from 'react';
import { Modal, ModalBody, ModalCloseButton, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { Password as SupabasePassword } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { PasswordField } from '@/components/passwords/PasswordField';
import { smartUrlComplete, getFriendlyDomain } from '@/lib/utils/url-helper';
import { Copy, CopyCheck, ExternalLink, Pencil, Trash2 } from 'lucide-react';

interface UserInfo {
  id: string;
  email: string;
  name?: string | null;
}

interface PasswordDetailModalProps {
  password: SupabasePassword;
  categories: Category[];
  users: UserInfo[];
  familyMembers: Array<{ id: string; name?: string }>;
  onClose: () => void;
  onEdit?: (password: SupabasePassword) => void;
  onDelete?: (password: SupabasePassword) => void;
  canManage?: boolean;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-text-primary/90">
      {children}
    </div>
  </div>
);

const formatSourceLabel = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  switch (normalized) {
    case 'medical':
    case 'medical_portal':
    case 'health':
      return 'From Health';
    case 'pet':
    case 'pet_portal':
    case 'pets':
      return 'From Pets';
    case 'academic':
    case 'academic_portal':
    case 'j3-academics':
    case 'j3_academics':
      return 'From J3 Academics';
    case 'documents':
      return 'From Documents';
    case 'calendar':
      return 'From Calendar';
    case 'manual_password':
      return 'From Manual Password';
    default:
      return `From ${value
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')}`;
  }
};

export function PasswordDetailModal({
  password,
  categories,
  users,
  familyMembers,
  onClose,
  onEdit,
  onDelete,
  canManage = false,
}: PasswordDetailModalProps) {
  type CopyTarget = 'username' | 'password' | 'url' | 'all';
  const [copiedField, setCopiedField] = useState<CopyTarget | null>(null);

  const category = useMemo(
    () => categories.find(c => c.id === password.category),
    [categories, password.category]
  );

  const ownersLabel = useMemo(() => {
    const ownerIds = new Set<string>();
    if (password.owner_id) ownerIds.add(password.owner_id);
    if (Array.isArray(password.shared_with)) {
      password.shared_with.filter(Boolean).forEach(id => ownerIds.add(String(id)));
    }
    const labels = Array.from(ownerIds).map(id => {
      if (id === 'shared') return 'Shared';
      const user = users.find(u => u.id === id);
      if (user?.name) return user.name;
      if (user?.email) return user.email.split('@')[0];
      const family = familyMembers.find(m => m.id === id);
      return family?.name || id;
    });
    if (labels.length === 0) return password.is_shared ? 'Shared' : 'Private';
    return labels.join(', ');
  }, [password, users, familyMembers]);

  const handleCopy = async (target: CopyTarget) => {
    try {
      let textToCopy = '';
      if (target === 'username') {
        textToCopy = password.username || '';
      } else if (target === 'password') {
        textToCopy = password.password || '';
      } else if (target === 'url') {
        textToCopy = password.url || '';
      } else {
        const parts = [
          password.url ? `URL: ${password.url}` : null,
          password.username ? `Username: ${password.username}` : null,
          password.password ? `Password: ${password.password}` : null,
        ].filter(Boolean);
        textToCopy = parts.join('\n');
      }

      if (!textToCopy) return;

      await navigator.clipboard.writeText(textToCopy);
      setCopiedField(target);
      setTimeout(() => setCopiedField(prev => (prev === target ? null : prev)), 2000);
    } catch (error) {
      console.error('[PasswordDetailModal] Copy failed', error);
    }
  };

  const serviceName =
    password.title?.trim() ||
    (typeof (password as any).service_name === 'string' ? (password as any).service_name.trim() : '') ||
    'Untitled';
  const formattedUrl = password.url ? smartUrlComplete(password.url) : undefined;
  const sourceValue = password.source_page ?? password.source ?? (password as any).source_page ?? (password as any).source ?? null;
  const sourceLabel = formatSourceLabel(sourceValue);

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalHeader>
        <div className="flex flex-col gap-1">
          <ModalTitle>{serviceName}</ModalTitle>
          {sourceLabel && (
            <span className="inline-flex w-fit items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {sourceLabel}
            </span>
          )}
        </div>
        <ModalCloseButton onClose={onClose} />
      </ModalHeader>
      <ModalBody className="space-y-4">
        {password.url && (
          <Section title="Website">
            <div className="flex items-center justify-between gap-3">
              <a
                href={formattedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{getFriendlyDomain(password.url)}</span>
              </a>
              <button
                type="button"
                onClick={() => handleCopy('url')}
                className="rounded border border-white/20 px-2 py-1 text-xs text-text-muted hover:border-white/40 hover:text-text-primary"
              >
                {copiedField === 'url' ? 'Copied' : 'Copy URL'}
              </button>
            </div>
          </Section>
        )}

        {password.username && (
          <Section title="Username">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-text-primary/90">{password.username}</span>
              <button
                type="button"
                onClick={() => handleCopy('username')}
                className="flex items-center gap-2 rounded border border-white/20 px-2 py-1 text-xs text-text-muted hover:border-white/40 hover:text-text-primary"
              >
                {copiedField === 'username' ? <CopyCheck className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedField === 'username' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </Section>
        )}

        <Section title="Password">
          <PasswordField password={password.password || ''} />
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Category">
            <span>{category?.name || 'Uncategorized'}</span>
          </Section>
          <Section title="Assigned">
            <span>{ownersLabel}</span>
          </Section>
        </div>

        {password.notes && (
          <Section title="Notes">
            <p className="whitespace-pre-wrap text-sm text-text-primary/85">{password.notes}</p>
          </Section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Created">
            <span>{new Date(password.created_at).toLocaleString()}</span>
          </Section>
          <Section title="Updated">
            <span>{new Date(password.updated_at).toLocaleString()}</span>
          </Section>
        </div>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleCopy('all')}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              copiedField === 'all'
                ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/5 text-text-secondary hover:border-white/20 hover:bg-white/10 hover:text-text-primary'
            }`}
          >
            {copiedField === 'all' ? 'Copied!' : 'Copy All'}
          </button>
          {canManage && (
            <>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(password)}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-secondary hover:border-white/20 hover:bg-white/10 hover:text-text-primary"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(password)}
                  className="flex items-center gap-2 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:border-red-400 hover:bg-red-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}
