'use client';

import { ReactNode, useMemo, useState } from 'react';
import {
  Copy,
  CopyCheck,
  Eye,
  EyeOff,
  Star
} from 'lucide-react';
import { Password as ServicePassword } from '@/lib/services/password-service-interface';
import { Password as SupabasePassword } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { smartUrlComplete, getFriendlyDomain } from '@/lib/utils/url-helper';
import { usePasswordSecurityOptional } from '@/contexts/password-security-context';
import { getPasswordStrength, PasswordStrength } from '@/lib/passwords/utils';

type UserInfo = {
  id: string;
  email: string;
  name?: string | null;
};

type CardPassword = ServicePassword | SupabasePassword;

const isServicePassword = (value: CardPassword): value is ServicePassword => {
  return (value as ServicePassword).service_name !== undefined;
};

type PasswordCardProps = {
  password: CardPassword;
  categories: Category[];
  users: UserInfo[];
  onEdit: () => void;
  onDelete: () => void;
  canManage?: boolean;
  subtitle?: string | null;
  sourceLabel?: string | null;
  assignedToLabel?: string | null;
  ownerLabelsOverride?: string[] | null;
  extraContent?: ReactNode;
  footerContent?: ReactNode;
  showFavoriteToggle?: boolean;
  onToggleFavorite?: (next: boolean) => void;
  strengthOverride?: PasswordStrength;
  onOpenUrl?: () => void;
};

type CopyTarget = 'url' | 'username' | 'password' | 'all';

type StrengthMeta = {
  label: string;
  dotClass: string;
  textClass: string;
};

const STRENGTH_META: Record<string, StrengthMeta> = {
  strong: {
    label: 'Strong',
    dotClass: 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.45)]',
    textClass: 'text-emerald-300'
  },
  medium: {
    label: 'Medium',
    dotClass: 'bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.45)]',
    textClass: 'text-amber-300'
  },
  weak: {
    label: 'Weak',
    dotClass: 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.45)]',
    textClass: 'text-rose-300'
  }
};

export function PasswordCard({
  password,
  categories,
  users,
  onEdit,
  onDelete,
  canManage = false,
  subtitle,
  sourceLabel,
  assignedToLabel,
  ownerLabelsOverride,
  extraContent,
  footerContent,
  showFavoriteToggle = true,
  onToggleFavorite,
  strengthOverride,
  onOpenUrl,
}: PasswordCardProps) {
  const { updateActivity } = usePasswordSecurityOptional();
  const [showPassword, setShowPassword] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);

  const servicePassword = isServicePassword(password) ? password : null;
  const supabasePassword = servicePassword ? null : (password as SupabasePassword);

  const initialFavorite = servicePassword
    ? servicePassword.is_favorite
    : Boolean(supabasePassword?.is_favorite);
  const [isFavorite, setIsFavorite] = useState(initialFavorite);

  const decryptedPassword = password.password || '';
  const strength = strengthOverride ?? getPasswordStrength(decryptedPassword);
  const strengthMeta = STRENGTH_META[strength];
  const lastChangedIso = servicePassword
    ? (servicePassword.last_changed instanceof Date
        ? servicePassword.last_changed.toISOString()
        : servicePassword.last_changed !== undefined
          ? String(servicePassword.last_changed)
          : undefined)
    : supabasePassword?.last_changed ?? undefined;

  const category = useMemo(() => categories.find(c => c.id === password.category), [categories, password.category]);
  const serviceName = useMemo(() => {
    if (servicePassword) {
      return servicePassword.service_name || 'Untitled';
    }
    return supabasePassword?.title?.trim() || 'Untitled';
  }, [servicePassword, supabasePassword]);

  const ownersDisplay = useMemo(() => {
    const ownerIds = new Set<string>();
    if (servicePassword?.owner_id) ownerIds.add(servicePassword.owner_id);
    if (supabasePassword?.owner_id) ownerIds.add(supabasePassword.owner_id);
    const sharedWith = servicePassword?.shared_with || supabasePassword?.shared_with;
    if (Array.isArray(sharedWith)) {
      sharedWith.forEach(id => {
        if (id) ownerIds.add(id);
      });
    }

    const labels = Array.from(ownerIds).map(id => {
      if (id === 'shared') return 'Shared';
      const person = users.find(u => u.id === id);
      return person?.name || person?.email?.split('@')[0] || id;
    });

    if (labels.length === 0) {
      const shared = servicePassword ? servicePassword.is_shared : Boolean(supabasePassword?.is_shared);
      return shared ? ['Shared'] : ['Private'];
    }

    return labels;
  }, [servicePassword, supabasePassword, users]);

  const resolvedOwners = ownerLabelsOverride && ownerLabelsOverride.length > 0
    ? ownerLabelsOverride
    : ownersDisplay;
  const assignedLabel = assignedToLabel ?? (resolvedOwners.length > 0 ? resolvedOwners.join(', ') : null);

  const handleCopy = async (target: CopyTarget) => {
    try {
      if (target === 'all') {
        const text = [
          password.url ? `URL: ${password.url}` : null,
          password.username ? `Username: ${password.username}` : null,
          `Password: ${decryptedPassword}`,
        ]
          .filter(Boolean)
          .join('\n');
        await navigator.clipboard.writeText(text);
      } else if (target === 'password') {
        await navigator.clipboard.writeText(decryptedPassword);
      } else if (target === 'username') {
        await navigator.clipboard.writeText(password.username || '');
      } else if (target === 'url') {
        await navigator.clipboard.writeText(password.url || '');
      }

      setCopiedTarget(target);
      setTimeout(() => {
        setCopiedTarget(prev => (prev === target ? null : prev));
      }, 1800);
    } catch (error) {
      console.error('[PasswordCard] copy failed', error);
    }
  };

  const togglePassword = () => {
    setShowPassword(prev => {
      const next = !prev;
      if (!prev && next) {
        updateActivity();
      }
      return next;
    });
  };

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-white/5 bg-[#30302e] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-[#363633] hover:shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
        style={{
          background: 'radial-gradient(circle at top right, rgba(96,165,250,0.12), transparent 55%)'
        }}
      />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="truncate text-sm font-semibold leading-tight text-text-primary">
              {serviceName}
            </div>
            {assignedLabel && (
              <div className="text-xs text-text-muted/80">{assignedLabel}</div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted/90">
              {category?.name && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium text-text-primary/85"
                  style={{ backgroundColor: category.color || '#6366f1' }}
                >
                  {category.name}
                </span>
              )}
              {sourceLabel && (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-text-muted">{sourceLabel}</span>
              )}
              {subtitle && <span className="text-[10px] text-text-muted/80">{subtitle}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              {strengthMeta.label}
            </div>
            {showFavoriteToggle && (
              <button
                onClick={() => {
                  setIsFavorite(prev => {
                    const next = !prev;
                    onToggleFavorite?.(next);
                    return next;
                  });
                }}
                className={`rounded-full p-1 transition-colors ${
                  isFavorite ? 'text-yellow-400' : 'text-text-muted hover:text-yellow-400'
                }`}
                title={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
              >
                <Star className="h-3.5 w-3.5" fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-white/5 bg-black/25 p-3">
          <div className="hidden">
            {/* spacer for consistent spacing when no url */}
          </div>
          <div className="space-y-2 text-sm text-text-primary">
            {password.url && (
              <FieldRow
                label="URL"
                action={
                  <IconButton
                    active={copiedTarget === 'url'}
                    icon={copiedTarget === 'url' ? <CopyCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    onClick={() => handleCopy('url')}
                    title="Copy URL"
                  />
                }
              >
                <a
                  href={smartUrlComplete(password.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    onOpenUrl?.();
                  }}
                  className="truncate font-mono text-[13px] text-text-primary/90 underline decoration-dotted underline-offset-4 hover:text-text-primary"
                >
                  {getFriendlyDomain(password.url)}
                </a>
              </FieldRow>
            )}

            {password.username && (
              <FieldRow
                label="User"
                action={
                  <IconButton
                    active={copiedTarget === 'username'}
                    icon={copiedTarget === 'username' ? <CopyCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    onClick={() => handleCopy('username')}
                    title="Copy username"
                  />
                }
              >
                <span className="truncate font-mono text-[13px] text-text-primary/90">{password.username}</span>
              </FieldRow>
            )}

            <FieldRow
              label="Pass"
              action={
                <div className="flex items-center gap-1.5">
                  <IconButton
                    variant={showPassword ? 'primary' : 'default'}
                    icon={showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    onClick={togglePassword}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  />
                  <IconButton
                    active={copiedTarget === 'password'}
                    icon={copiedTarget === 'password' ? <CopyCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    onClick={() => handleCopy('password')}
                    title="Copy password"
                  />
                </div>
              }
            >
              <span className={`font-mono text-[13px] tracking-wide text-text-primary/90 ${showPassword ? '' : 'select-none'}`}>
                {showPassword ? decryptedPassword : '••••••••'}
              </span>
            </FieldRow>
          </div>
        </div>

        {extraContent && (
          <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-[13px] text-text-muted/80">
            {extraContent}
          </div>
        )}
        <div className="flex flex-col gap-3 pt-2">
          {footerContent && <div className="text-xs text-text-muted/70">{footerContent}</div>}
          <div className={`grid gap-2 ${canManage ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
            <button
              onClick={() => handleCopy('all')}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                copiedTarget === 'all'
                  ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-300'
                  : 'border border-white/10 bg-white/5 text-text-secondary hover:border-white/20 hover:bg-white/10 hover:text-text-primary'
              }`}
            >
              {copiedTarget === 'all' ? 'Copied!' : 'Copy All'}
            </button>
            {canManage && (
              <>
                <button
                  onClick={onEdit}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-white/20 hover:bg-white/10 hover:text-text-primary"
                >
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:border-red-400 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type FieldRowProps = {
  label: string;
  children: ReactNode;
  action?: ReactNode;
};

const FieldRow = ({ label, children, action }: FieldRowProps) => (
  <div className="flex items-center gap-3">
    <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
      {label}
    </span>
    <div className="flex flex-1 items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
      <div className="flex-1 truncate leading-tight">{children}</div>
      {action}
    </div>
  </div>
);

type IconButtonProps = {
  icon: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  variant?: 'default' | 'primary';
};

const IconButton = ({ icon, onClick, title, active = false, variant = 'default' }: IconButtonProps) => {
  const base = 'flex h-6 w-6 items-center justify-center rounded border transition-colors';
  const classes = active
    ? 'border-emerald-400 text-emerald-300'
    : variant === 'primary'
      ? 'border-blue-400/60 text-blue-300'
      : 'border-white/10 text-text-muted hover:border-white/20 hover:text-text-primary';

  return (
    <button
      onClick={onClick}
      className={`${base} ${classes}`}
      title={title}
      type="button"
    >
      {icon}
    </button>
  );
};
