'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';
import { Password, PasswordCategory } from '@/lib/supabase/types';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';
// Note: Encryption/decryption is handled by the API routes on the server side
import { 
  Plus, Search, Eye, EyeOff, Copy, 
  ExternalLink, Edit2, Trash2, Key,
  Building2, Heart, Plane, DollarSign, Tv, MoreHorizontal,
  ShoppingCart, Users, Calendar, Briefcase, Zap, Star,
  AlertCircle, CopyCheck, Home, Stethoscope, School,
  ChevronDown, Grid3X3, List as ListIcon, Filter, X
} from 'lucide-react';
import { UI } from '@/constants';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal, ModalBody, ModalCloseButton, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { CredentialFormField } from '@/components/credentials/CredentialFormField';
import { PasswordField } from '@/components/passwords/PasswordField';
import { PasswordCard } from '@/components/passwords/PasswordCard';
import { usePasswordSecurity } from '@/contexts/password-security-context';
import { smartUrlComplete, getFriendlyDomain } from '@/lib/utils/url-helper';
import { getPasswordStrength } from '@/lib/passwords/utils';

// Categories will be loaded dynamically

interface UserInfo {
  id: string;
  email: string;
  name?: string;
}

const formatPasswordSource = (source?: string | null): string | null => {
  if (!source) return null;
  const normalized = source.toLowerCase();
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
    case 'documents':
      return 'Documents';
    case 'calendar':
      return 'Calendar';
    case 'passwords':
      return 'Passwords';
    default:
      return source
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
};

const getAssignedLabel = (password: Password, users: UserInfo[]): string => {
  const ownerIds = new Set<string>();
  if (password.owner_id) ownerIds.add(password.owner_id);
  const sharedWith = Array.isArray(password.shared_with)
    ? password.shared_with
    : [];
  sharedWith.filter(Boolean).forEach(id => ownerIds.add(id as string));

  const labels = Array.from(ownerIds).map(id => {
    if (id === 'shared') return 'Shared';
    const person = users.find(u => u.id === id);
    return person?.name || person?.email?.split('@')[0] || id;
  });

  if (labels.length === 0) {
    return password.is_shared ? 'Shared' : 'Private';
  }

  return labels.join(', ');
};

export default function PasswordsPage() {
  const { user } = useUser();
  const [passwords, setPasswords] = useState<Password[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPassword, setEditingPassword] = useState<Password | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [showFavorites, setShowFavorites] = useState(false);
  const [showExpiring, setShowExpiring] = useState(false);
  const [showWeak, setShowWeak] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [categories, setCategories] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    console.log('[Passwords Page] useEffect triggered, user:', user);
    if (user) {
      console.log('[Passwords Page] User found, fetching data...');
      // Seed selected owner from URL or localStorage (persist pet selection)
      try {
        const url = new URL(window.location.href);
        const fromUrl = url.searchParams.get('selected_person');
        const fromStorage = localStorage.getItem('selected_person') || undefined;
        const seed = fromUrl || fromStorage;
        if (seed) {
          setSelectedOwner(seed);
        }
      } catch {}
      fetchPasswords();
      fetchCategories();
      fetchUsers();
      fetchFamilyMembers();
    } else {
      console.log('[Passwords Page] No user, setting loading to false');
      setLoading(false);
    }
  }, [user]);

  const fetchCategories = async () => {
    try {
      const passwordCategories = await CategoriesClient.getCategories('passwords');
      setCategories(passwordCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/auth/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || data || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchFamilyMembers = async () => {
    try {
      const response = await fetch('/api/family-members');
      if (response.ok) {
        const data = await response.json();
        setFamilyMembers(data.members || []);
      }
    } catch (error) {
      console.error('Error fetching family members:', error);
    }
  };

  const fetchPasswords = async () => {
    console.log('[Passwords Page] Fetching passwords...');
    try {
      // First test authentication
      const authTest = await fetch('/api/test-auth');
      const authData = await authTest.json();
      console.log('[Passwords Page] Auth test:', authData);
      
      // Respect persisted person filter if present
      let url = '/api/passwords';
      try {
        const seed = (new URL(window.location.href)).searchParams.get('selected_person') || localStorage.getItem('selected_person');
        if (seed) {
          const sp = new URLSearchParams({ selected_person: seed });
          url += `?${sp.toString()}`;
        }
      } catch {}
      const response = await fetch(url);
      console.log('[Passwords Page] Response status:', response.status);
      console.log('[Passwords Page] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[Passwords Page] Failed to fetch passwords:', errorData);
        
        // Provide more helpful error messages
        if (errorData.hint) {
          setError(`${errorData.error}: ${errorData.hint}`);
        } else if (errorData.details) {
          setError(`${errorData.error}: ${errorData.details}`);
        } else {
          setError(errorData.error || 'Failed to fetch passwords');
        }
      } else {
        const data = await response.json();
        console.log('[Passwords Page] Fetched passwords:', data);
        console.log('[Passwords Page] Number of passwords:', data.passwords?.length || 0);
        
        
        if (data.note) {
          console.log('[Passwords Page] Note from API:', data.note);
          // If there's a note about missing table, show it as a warning instead of error
          if (data.note.includes('not yet created')) {
            setError(null);
            // Could add a warning state here if needed
          }
        }
        
        setPasswords(data.passwords || []);
        if (!data.note?.includes('not yet created')) {
          setError(null); // Clear any previous errors
        }
      }
    } catch (error) {
      console.error('[Passwords] Error:', error);
      setError('Failed to fetch passwords');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this password?')) return;

    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.delete(`/api/passwords/${id}`);
      if (response.success) {
        setPasswords(passwords.filter(p => p.id !== id));
      }
    } catch (error) {

    }
  };

  // Debug logging
  console.log('[Passwords Page] Total passwords before filtering:', passwords.length);
  console.log('[Passwords Page] Passwords:', passwords);
  console.log('[Passwords Page] Current filters:', {
    searchTerm,
    selectedCategory,
    selectedOwner,
    showFavorites,
    showExpiring,
    showWeak
  });

  const filteredPasswords = passwords.filter(password => {
    // Handle both title and service_name fields for backward compatibility
    const title = (password as any).title || (password as any).service_name || '';
    const matchesSearch = !searchTerm || 
                         (title.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
                         (password.username?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
                         (password.notes?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    const matchesCategory = selectedCategory === 'all' || password.category === selectedCategory;
    const matchesOwner = selectedOwner === 'all' || 
                        (selectedOwner === 'shared' && (password.is_shared || (password.shared_with && password.shared_with.length > 1))) ||
                        (selectedOwner !== 'all' && selectedOwner !== 'shared' && 
                         (password.owner_id === selectedOwner || 
                          (password.shared_with && password.shared_with.includes(selectedOwner))));
    const matchesFavorites = !showFavorites || password.is_favorite;
    const matchesExpiring = !showExpiring || 
                           (password.last_changed && 
                            new Date(password.last_changed) < new Date(Date.now() - 60 * 24 * 60 * 60 * 1000));
    const matchesWeak = !showWeak || (password.password && password.password.length < 12);
    
    return matchesSearch && matchesCategory && matchesOwner && 
           matchesFavorites && matchesExpiring && matchesWeak;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-2">Error loading passwords</p>
          <p className="text-neutral-400 text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              fetchPasswords();
            }}
            className="mt-4 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-md transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Password Vault</h1>
        </div>
        
        {user?.role === 'admin' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Password</span>
          </button>
        )}
      </div>

      {/* Search Bar and Filters */}
      <div className="space-y-4">
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search passwords, usernames, notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-1 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
            
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-background-secondary rounded-xl p-1 border border-gray-600/30">
              <button
                onClick={() => setViewMode('card')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'card'
                    ? 'bg-gray-700 text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'list'
                    ? 'bg-gray-700 text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-1 rounded-xl transition-colors ${
                showFilters || (selectedCategory !== 'all' || selectedOwner !== 'all' || showFavorites || showExpiring || showWeak)
                  ? 'bg-gray-700 text-text-primary'
                  : 'bg-background-primary text-text-muted hover:bg-gray-700/20'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {(selectedCategory !== 'all' || selectedOwner !== 'all' || showFavorites || showExpiring || showWeak) && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                  Active
                </span>
              )}
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-600/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    onFocus={async () => {
                      // Fetch fresh categories when dropdown is focused
                      try {
                        const passwordCategories = await CategoriesClient.getCategories('passwords');
                        setCategories(passwordCategories);
                      } catch (error) {
                        console.error('Error refreshing password categories:', error);
                      }
                    }}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Owner
                  </label>
                  <select
                    value={selectedOwner}
                    onChange={(e) => setSelectedOwner(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    <option value="all">All Owners</option>
                    <option value="shared">Shared/Family</option>
                    {familyMembers.map(member => {
                      const memberType = member.type === 'pet' ? '🐾' : member.is_child ? '👶' : '👤';
                      const memberName = member.name || member.email?.split('@')[0] || 'Unknown';
                      return (
                        <option key={member.id} value={member.id}>
                          {memberType} {memberName}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Quick Filters
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowFavorites(!showFavorites)}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        showFavorites
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      <Star className="h-4 w-4" fill={showFavorites ? 'currentColor' : 'none'} />
                      Favorites
                    </button>
                    <button
                      onClick={() => setShowExpiring(!showExpiring)}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        showExpiring
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      <AlertCircle className="h-4 w-4" />
                      Expiring
                    </button>
                    <button
                      onClick={() => setShowWeak(!showWeak)}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        showWeak
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      <AlertCircle className="h-4 w-4" />
                      Weak
                    </button>
                  </div>
                </div>
              </div>

              {/* Clear Filters */}
              {(selectedCategory !== 'all' || selectedOwner !== 'all' || showFavorites || showExpiring || showWeak || searchTerm) && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedCategory('all');
                      setSelectedOwner('all');
                      setShowFavorites(false);
                      setShowExpiring(false);
                      setShowWeak(false);
                      setSearchTerm('');
                    }}
                    className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Passwords Grid */}
      {filteredPasswords.length === 0 ? (
        <div className="text-center py-12 bg-neutral-800 rounded-xl border border-neutral-700">
          <p className="text-neutral-400">No passwords found</p>
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPasswords.map(password => {
            const assignedLabel = getAssignedLabel(password, users);
            const sourceLabel = formatPasswordSource((password as any).source_page);
            const notesContent = password.notes
              ? <p className="text-xs text-text-muted/80 italic">{password.notes}</p>
              : undefined;

            return (
              <PasswordCard
                key={password.id}
                password={password}
                categories={categories}
                users={users}
                canManage={user?.role === 'admin'}
                sourceLabel={sourceLabel}
                assignedToLabel={assignedLabel}
                extraContent={notesContent}
                onEdit={() => setEditingPassword(password)}
                onDelete={() => handleDelete(password.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-600/30">
              <tr>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Service</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Username</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Password</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Strength</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Category</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Related To</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600/30">
              {filteredPasswords.map(password => (
                <PasswordListItem
                  key={password.id}
                  password={password}
                  categories={categories}
                  users={users}
                  onEdit={() => setEditingPassword(password)}
                  onDelete={() => handleDelete(password.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingPassword) && (
        <PasswordModal
          password={editingPassword}
          categories={categories}
          users={users}
          familyMembers={familyMembers}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPassword(null);
          }}
          onSave={async (savedPassword) => {
            // Refresh the passwords list to ensure we have the latest data
            await fetchPasswords();
            setShowCreateModal(false);
            setEditingPassword(null);
          }}
        />
      )}
    </div>
  );
}

// List view component
function PasswordListItem({ 
  password, 
  onEdit, 
  onDelete,
  categories,
  users
}: { 
  password: Password; 
  onEdit: () => void; 
  onDelete: () => void;
  categories: Category[];
  users: UserInfo[];
}) {
  const { user } = useUser();
  const { updateActivity } = usePasswordSecurity();
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [isFavorite, setIsFavorite] = useState(password.is_favorite || false);

  const serviceName = (password as any).title || (password as any).service_name || 'Untitled';
  const initial = serviceName.charAt(0).toUpperCase();
  const decryptedPassword = password.password || '';
  const passwordStrength = getPasswordStrength(decryptedPassword);
  const categoryData = categories.find(c => c.id === password.category);
  const categoryClass = categoryData?.color?.startsWith('bg-') ? categoryData.color : '';
  const categoryStyle = categoryData?.color && categoryData.color.startsWith('#')
    ? { backgroundColor: categoryData.color }
    : undefined;

  const copyToClipboard = async (text: string, type: 'password' | 'username') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'password') {
        setCopiedPassword(true);
        setTimeout(() => setCopiedPassword(false), 2000);
      } else {
        setCopiedUsername(true);
        setTimeout(() => setCopiedUsername(false), 2000);
      }
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const copyAllDetails = async () => {
    try {
      const parts = [
        password.url ? `Link: ${password.url}` : null,
        password.username ? `User: ${password.username}` : null,
        `Password: ${decryptedPassword}`
      ].filter(Boolean);
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopiedDetails(true);
      setTimeout(() => setCopiedDetails(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const ownerIds = new Set<string>();
  if (password.owner_id) ownerIds.add(password.owner_id);
  const shared = (password as any).shared_with as string[] | undefined;
  if (Array.isArray(shared)) {
    shared.forEach(id => ownerIds.add(id));
  }
  const ownerLabels = Array.from(ownerIds)
    .map(id => {
      if (id === 'shared') return 'Shared';
      const person = users.find(u => u.id === id);
      return person?.name || person?.email?.split('@')[0] || id;
    })
    .filter(Boolean);
  const ownersDisplay = ownerLabels.length === 0
    ? (password.is_shared ? ['Shared'] : ['Private'])
    : ownerLabels;

  const strengthColor = passwordStrength === 'strong'
    ? 'text-green-400'
    : passwordStrength === 'medium'
      ? 'text-yellow-400'
      : 'text-red-400';
  const strengthLabel = passwordStrength === 'strong'
    ? 'Strong'
    : passwordStrength === 'medium'
      ? 'Medium'
      : 'Weak';

  const faviconSrc = password.url ? `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(password.url)}` : null;
  const canManage = user?.role === 'admin';

  return (
    <tr className="hover:bg-gray-800/40 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center text-text-primary bg-gray-700/30 overflow-hidden">
            {faviconSrc ? (
              <img src={faviconSrc} alt={serviceName} className="h-5 w-5" />
            ) : (
              <span className="text-base font-semibold">{initial}</span>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={onEdit}
                className="text-left text-sm font-semibold text-text-primary truncate hover:text-blue-400 transition-colors"
                title={serviceName}
              >
                <span className="truncate">{serviceName}</span>
              </button>
              <button
                onClick={() => setIsFavorite(!isFavorite)}
                className={`p-1 rounded transition-colors ${isFavorite ? 'text-yellow-500' : 'text-text-muted hover:text-yellow-500'}`}
                title={isFavorite ? 'Unfavorite' : 'Favorite'}
              >
                <Star className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            {password.url && (
              <a
                href={smartUrlComplete(password.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-text-muted hover:text-blue-400 transition-colors"
                title={password.url}
              >
                <ExternalLink className="h-3 w-3" />
                <span className="truncate max-w-[180px]">{getFriendlyDomain(password.url)}</span>
              </a>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-text-primary group/username">
          <span className="truncate" title={password.username || '—'}>
            {password.username || '—'}
          </span>
          {password.username && (
            <button
              onClick={() => copyToClipboard(password.username as string, 'username')}
              className={`opacity-0 group-hover/username:opacity-100 transition-opacity text-text-muted hover:text-text-primary ${copiedUsername ? 'text-green-500 opacity-100' : ''}`}
              title="Copy username"
            >
              {copiedUsername ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-text-primary">
          <span className="font-mono truncate max-w-[160px]">
            {showPassword ? decryptedPassword : '••••••••'}
          </span>
          <button
            onClick={() => {
              setShowPassword(!showPassword);
              if (!showPassword) {
                updateActivity();
              }
            }}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={() => copyToClipboard(decryptedPassword, 'password')}
            className={`p-1 text-text-muted hover:text-text-primary transition-colors ${copiedPassword ? 'text-green-500' : ''}`}
            title="Copy password"
          >
            {copiedPassword ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium ${strengthColor}`}>{strengthLabel}</span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${categoryClass}`}
          style={categoryStyle}
        >
          {categoryData?.name || password.category}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
          {ownersDisplay.length === 0 ? (
            <span>Private</span>
          ) : ownersDisplay.length === 1 && ownersDisplay[0] === 'Shared' ? (
            <span>Shared</span>
          ) : (
            ownersDisplay.slice(0, 3).map(name => (
              <span key={`${password.id}-${name}`} className="px-2 py-0.5 rounded-full bg-gray-700/60 text-text-primary">
                {name}
              </span>
            ))
          )}
          {ownersDisplay.length > 3 && (
            <span>+{ownersDisplay.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-2 text-text-muted/70">
          {password.url && (
            <a
              href={smartUrlComplete(password.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 hover:text-blue-400 transition-colors"
              title="Open link"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button
            onClick={copyAllDetails}
            className={`p-1 hover:text-text-primary transition-colors ${copiedDetails ? 'text-green-500' : ''}`}
            title="Copy link, username, and password"
          >
            {copiedDetails ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          {canManage && (
            <>
              <button
                onClick={onEdit}
                className="p-1 hover:text-yellow-400 transition-colors"
                title="Edit"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 hover:text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function PasswordModal({ 
  password, 
  onClose, 
  onSave,
  categories,
  users,
  familyMembers 
}: { 
  password: Password | null; 
  onClose: () => void; 
  onSave: (password: Password) => void;
  categories: Category[];
  users: UserInfo[];
  familyMembers: any[];
}) {
  // Initialize shared_with from existing password or empty array
  const getInitialSharedWith = () => {
    if (password?.shared_with && Array.isArray(password.shared_with)) {
      return password.shared_with;
    }
    if (password?.owner_id) {
      return [password.owner_id];
    }
    return [];
  };

  const [formData, setFormData] = useState({
    title: (password as any)?.title || (password as any)?.service_name || '',
    username: password?.username || '',
    password: password ? password.password : '', // Already decrypted from API
    url: password?.url || '',
    category: password?.category || (categories.length > 0 ? categories[0].id : 'other') as PasswordCategory,
    notes: password?.notes || '',
    owner_id: password?.owner_id || 'shared',
    shared_with: getInitialSharedWith(),
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordLength, setPasswordLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  
  const passwordStrength = getPasswordStrength(formData.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('Saving password with data:', formData);
      
      // Don't encrypt here - let the API handle encryption
      const data = {
        service_name: formData.title, // Map title to service_name
        username: formData.username,
        password: formData.password, // Send plain password - API will encrypt
        website_url: formData.url ? smartUrlComplete(formData.url) : '',   // Normalize URL before sending
        category: formData.category,
        notes: formData.notes,
        is_shared: formData.shared_with.length > 1 || formData.shared_with.length === 0,
        owner_id: formData.shared_with.length === 1 ? formData.shared_with[0] : formData.owner_id,
        shared_with: formData.shared_with
      };

      console.log('Sending to API:', data);

      const response = await fetch(
        password ? `/api/passwords/${password.id}` : '/api/passwords',
        {
          method: password ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      const responseData = await response.json();
      console.log('Response:', response.status, responseData);

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to save password');
      }

      onSave(responseData);
    } catch (error) {
      console.error('Error saving password:', error);
      alert('Failed to save password: ' + (error as any).message);
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    let charset = '';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (!charset) {
      charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    }
    
    let newPassword = '';
    for (let i = 0; i < passwordLength; i++) {
      newPassword += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    setFormData({ ...formData, password: newPassword });
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <ModalHeader>
          <div className="flex w-full items-start justify-between gap-4">
            <ModalTitle>{password ? 'Edit Password' : 'Add New Password'}</ModalTitle>
            <ModalCloseButton onClose={onClose} />
          </div>
        </ModalHeader>

        <ModalBody className="space-y-5">
          <CredentialFormField id="password-title" label="Title" required>
            <input
              id="password-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="password-username" label="Username">
            <input
              id="password-username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="password-value" label="Password" required>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="password-value"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 pr-10 text-white focus:outline-none focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={generatePassword}
                className="rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white transition-colors hover:bg-neutral-600"
                title="Generate password"
              >
                <Key className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 space-y-3 rounded-lg bg-neutral-700 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-300">Password Length: {passwordLength}</span>
                <Slider
                  value={passwordLength}
                  onValueChange={(value) => setPasswordLength(value[0])}
                  min={8}
                  max={32}
                  step={1}
                  className="w-32"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={includeUppercase}
                    onCheckedChange={(checked) => setIncludeUppercase(!!checked)}
                  />
                  <span className="text-sm text-neutral-300">Uppercase</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={includeLowercase}
                    onCheckedChange={(checked) => setIncludeLowercase(!!checked)}
                  />
                  <span className="text-sm text-neutral-300">Lowercase</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={includeNumbers}
                    onCheckedChange={(checked) => setIncludeNumbers(!!checked)}
                  />
                  <span className="text-sm text-neutral-300">Numbers</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={includeSymbols}
                    onCheckedChange={(checked) => setIncludeSymbols(!!checked)}
                  />
                  <span className="text-sm text-neutral-300">Symbols</span>
                </label>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-neutral-300">Strength:</span>
                  <span
                    className={`text-sm capitalize ${
                      passwordStrength === 'strong'
                        ? 'text-green-500'
                        : passwordStrength === 'medium'
                        ? 'text-yellow-500'
                        : 'text-red-500'
                    }`}
                  >
                    {passwordStrength}
                  </span>
                </div>
                <div className="h-2 w-full rounded bg-neutral-600">
                  <div
                    className={`h-full rounded transition-all ${
                      passwordStrength === 'strong'
                        ? 'w-full bg-green-500'
                        : passwordStrength === 'medium'
                        ? 'w-2/3 bg-yellow-500'
                        : 'w-1/3 bg-red-500'
                    }`}
                  />
                </div>
              </div>
            </div>
          </CredentialFormField>

          <CredentialFormField
            id="password-url"
            label="URL"
            helperText={formData.url ? `Will be saved as: ${smartUrlComplete(formData.url)}` : undefined}
          >
            <input
              id="password-url"
              type="text"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="example.com or https://example.com"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="password-category" label="Category">
            <select
              id="password-category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as PasswordCategory })}
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </CredentialFormField>

          <CredentialFormField label="Owners (who can access this password)">
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-neutral-600 bg-neutral-700 p-3">
              {familyMembers.map(member => {
                const memberId = member.id;
                const memberName = member.name || member.email?.split('@')[0] || 'Unknown';
                const memberType = member.type === 'pet' ? '🐾' : member.is_child ? '👶' : '👤';

                return (
                  <label key={memberId} className="flex items-center gap-2 rounded p-1 transition hover:bg-neutral-600">
                    <Checkbox
                      checked={formData.shared_with.includes(memberId)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData({
                            ...formData,
                            shared_with: [...formData.shared_with, memberId]
                          });
                        } else {
                          setFormData({
                            ...formData,
                            shared_with: formData.shared_with.filter((id: string) => id !== memberId)
                          });
                        }
                      }}
                    />
                    <span className="text-sm text-neutral-200">
                      {memberType} {memberName}
                      {member.email && <span className="ml-1 text-neutral-400">({member.email})</span>}
                    </span>
                  </label>
                );
              })}

              <div className="border-t border-neutral-500 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (formData.shared_with.length === familyMembers.length) {
                      setFormData({ ...formData, shared_with: [] });
                    } else {
                      setFormData({ ...formData, shared_with: familyMembers.map(m => m.id) });
                    }
                  }}
                  className="text-xs text-primary-400 transition hover:text-primary-300"
                >
                  {formData.shared_with.length === familyMembers.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>
          </CredentialFormField>

          <CredentialFormField id="password-notes" label="Notes">
            <textarea
              id="password-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-neutral-600 bg-neutral-700 px-4 py-2 text-white transition-colors hover:bg-neutral-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !formData.title || !formData.password}
            className="flex-1 rounded-md bg-button-create px-4 py-2 text-white transition-colors hover:bg-button-create/90 disabled:cursor-not-allowed disabled:bg-neutral-600"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
