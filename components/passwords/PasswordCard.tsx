'use client';

import { ReactNode, useMemo, useState } from 'react';
import {
  Copy,
  CopyCheck,
  Eye,
  EyeOff,
  ExternalLink,
  Link2,
  Star,
  User
} from 'lucide-react';
import { Password } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { smartUrlComplete, getFriendlyDomain } from '@/lib/utils/url-helper';
import { usePasswordSecurity } from '@/contexts/password-security-context';
import { getPasswordStrength, getPasswordAgeDays, PasswordStrength } from '@/lib/passwords/utils';

type UserInfo = {
  id: string;
  email: string;
  name?: string | null;
};

type PasswordCardProps = {
  password: Password;
  categories: Category[];
  users: UserInfo[];
  onEdit: () => void;
  onDelete: () => void;
  canManage?: boolean;
  subtitle?: string | null;
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

type LegacyPassword = Password & { title?: string | null };

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
  ownerLabelsOverride,
  extraContent,
  footerContent,
  showFavoriteToggle = true,
  onToggleFavorite,
  strengthOverride,
  onOpenUrl,
}: PasswordCardProps) {
  const { updateActivity } = usePasswordSecurity();
  const [showPassword, setShowPassword] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [isFavorite, setIsFavorite] = useState(password.is_favorite || false);

  const legacyPassword = password as LegacyPassword;
  const decryptedPassword = password.password || '';
  const strength = strengthOverride ?? getPasswordStrength(decryptedPassword);
  const strengthMeta = STRENGTH_META[strength];
  const passwordAgeDays = getPasswordAgeDays(password.last_changed);

  const category = useMemo(() => categories.find(c => c.id === password.category), [categories, password.category]);
  const serviceName = useMemo(() => legacyPassword.title?.trim() || legacyPassword.service_name || 'Untitled', [legacyPassword]);

  const ownersDisplay = useMemo(() => {
    const ownerIds = new Set<string>();
    if (password.owner_id) ownerIds.add(password.owner_id);
    const sharedWith = password.shared_with;
    if (Array.isArray(sharedWith)) {
      sharedWith.forEach(id => ownerIds.add(id));
    }

    const labels = Array.from(ownerIds).map(id => {
      if (id === 'shared') return 'Shared';
      const person = users.find(u => u.id === id);
      return person?.name || person?.email?.split('@')[0] || id;
    });

    if (labels.length === 0) {
      return password.is_shared ? ['Shared'] : ['Private'];
    }

    return labels;
  }, [password, users]);

  const resolvedOwners = ownerLabelsOverride && ownerLabelsOverride.length > 0
    ? ownerLabelsOverride
    : ownersDisplay;

  const faviconSrc = password.url
    ? `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(password.url)}`
    : null;

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
      className="group relative overflow-hidden rounded-2xl border border-white/5 bg-[#30302e] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-[#3a3a38] hover:shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
        style={{
          background: 'radial-gradient(circle at top right, rgba(96,165,250,0.12), transparent 55%)'
        }}
      />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-text-primary">{serviceName}</h3>
              {showFavoriteToggle && (
                <button
                  onClick={() => {
                    setIsFavorite(prev => {
                      const next = !prev;
                      onToggleFavorite?.(next);
                      return next;
                    });
                  }}
                  className={`rounded p-1 transition-colors ${
                    isFavorite ? 'text-yellow-400' : 'text-text-muted hover:text-yellow-400'
                  }`}
                  title={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                >
                  <Star className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-text-muted/80">{subtitle}</p>
            )}
            {category?.name && (
              <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{category.name}</p>
            )}
            {resolvedOwners.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-text-muted">
                <User className="h-3.5 w-3.5" />
                <span className="truncate">{resolvedOwners.join(', ')}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${strengthMeta.dotClass}`}
              title={`${strengthMeta.label} password`}
            />
            <span className={`text-[10px] font-medium uppercase ${strengthMeta.textClass}`}>{strengthMeta.label}</span>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-black/30 p-4">
          <div className="space-y-3">
            {password.url && (
              <div className="flex flex-col gap-1 text-sm text-text-primary">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-text-muted">
                  <span>URL</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy('url')}
                      className={`flex h-6 w-6 items-center justify-center rounded border border-white/10 text-[12px] transition-colors ${
                        copiedTarget === 'url' ? 'border-emerald-400 text-emerald-300' : 'text-text-muted hover:border-white/20 hover:text-text-primary'
                      }`}
                      title="Copy URL"
                    >
                      {copiedTarget === 'url' ? <CopyCheck className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                    </button>
                    <a
                      href={smartUrlComplete(password.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        onOpenUrl?.();
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded border border-white/10 text-text-muted transition-colors hover:border-white/20 hover:text-text-primary"
                      title="Open URL"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
                <span className="truncate font-mono text-[13px] text-text-primary/90">
                  {getFriendlyDomain(password.url)}
                </span>
              </div>
            )}

            {password.username && (
              <div className="flex flex-col gap-1 text-sm text-text-primary">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-text-muted">
                  <span>Username</span>
                  <button
                    onClick={() => handleCopy('username')}
                    className={`flex h-6 w-6 items-center justify-center rounded border border-white/10 transition-colors ${
                      copiedTarget === 'username' ? 'border-emerald-400 text-emerald-300' : 'text-text-muted hover:border-white/20 hover:text-text-primary'
                    }`}
                    title="Copy username"
                  >
                    {copiedTarget === 'username' ? <CopyCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <span className="truncate font-mono text-[13px] text-text-primary/90">{password.username}</span>
              </div>
            )}

            <div className="flex flex-col gap-1 text-sm text-text-primary">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-text-muted">
                <span>Password</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={togglePassword}
                    className={`flex h-6 w-6 items-center justify-center rounded border border-white/10 transition-colors ${
                      showPassword ? 'border-blue-400/60 text-blue-300' : 'text-text-muted hover:border-white/20 hover:text-text-primary'
                    }`}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleCopy('password')}
                    className={`flex h-6 w-6 items-center justify-center rounded border border-white/10 transition-colors ${
                      copiedTarget === 'password' ? 'border-emerald-400 text-emerald-300' : 'text-text-muted hover:border-white/20 hover:text-text-primary'
                    }`}
                    title="Copy password"
                  >
                    {copiedTarget === 'password' ? <CopyCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <span className={`font-mono text-[13px] tracking-wide text-text-primary/90 ${showPassword ? '' : 'select-none'}`}>
                {showPassword ? decryptedPassword : '••••••••'}
              </span>
            </div>
          </div>
        </div>

        {extraContent && (
          <div className="text-sm text-text-muted/80">
            {extraContent}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            {faviconSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={faviconSrc} alt="favicon" className="h-4 w-4 rounded" />
            )}
            {password.url && (
              <span className="truncate max-w-[140px]">{getFriendlyDomain(password.url)}</span>
            )}
          </div>
          {typeof passwordAgeDays === 'number' && (
            <span>{passwordAgeDays} {passwordAgeDays === 1 ? 'day' : 'days'} old</span>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-text-muted">
            {footerContent ?? resolvedOwners.join(', ')}
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={() => handleCopy('all')}
              className={`flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm transition-colors sm:flex-initial sm:w-auto ${
                copiedTarget === 'all'
                  ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-300'
                  : 'bg-white/5 text-text-secondary hover:border-white/20 hover:bg-white/10 hover:text-text-primary'
              }`}
            >
              {copiedTarget === 'all' ? 'Copied!' : 'Copy All'}
            </button>
            {canManage && (
              <div className="flex flex-1 gap-2 sm:flex-initial">
                <button
                  onClick={onEdit}
                  className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm text-text-secondary transition-colors hover:border-white/20 hover:bg-white/10 hover:text-text-primary"
                >
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  className="flex-1 rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 transition-colors hover:border-red-400 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
