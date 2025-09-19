'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@/contexts/user-context';
import { createClient } from '@/lib/supabase/client';
import { 
  Search, Plus, Filter, Phone, Mail, 
  Globe, Building2, MapPin, Edit2, Trash2, 
  Eye, EyeOff, Copy, Users, Heart, House, PawPrint, GraduationCap,
  Grid3X3, List as ListIcon
} from 'lucide-react';
import { ContactModal } from './ContactModal';
import { ViewContactModal } from './ViewContactModal';

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  category?: string;
  related_to?: string[];
  source_type?: 'health' | 'household' | 'pets' | 'academics' | 'other';
  source_id?: string;
  notes?: string;
  website?: string;
  portal_url?: string;
  portal_username?: string;
  portal_password?: string;
  is_emergency: boolean;
  is_archived: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface FamilyMember {
  id: string;
  name: string;
  email?: string;
  is_child: boolean;
}

const getCategoryIcon = (category: string) => {
  const lowerCategory = category?.toLowerCase();
  if (lowerCategory?.includes('health') || lowerCategory?.includes('medical')) {
    return <Heart className="h-4 w-4" />;
  } else if (lowerCategory?.includes('household') || lowerCategory?.includes('service')) {
    return <House className="h-4 w-4" />;
  } else if (lowerCategory?.includes('pet') || lowerCategory?.includes('veterinary')) {
    return <PawPrint className="h-4 w-4" />;
  } else if (lowerCategory?.includes('academic') || lowerCategory?.includes('education') || lowerCategory?.includes('school')) {
    return <GraduationCap className="h-4 w-4" />;
  } else {
    return <Users className="h-4 w-4" />;
  }
};

const getCategoryColor = (category: string) => {
  const lowerCategory = category?.toLowerCase();
  if (lowerCategory?.includes('health') || lowerCategory?.includes('medical')) {
    return 'bg-green-500/10 text-green-400 border-green-500/20';
  } else if (lowerCategory?.includes('household') || lowerCategory?.includes('service')) {
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  } else if (lowerCategory?.includes('pet') || lowerCategory?.includes('veterinary')) {
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  } else if (lowerCategory?.includes('academic') || lowerCategory?.includes('education') || lowerCategory?.includes('school')) {
    return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  } else {
    return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  }
};

export default function ContactsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const supabase = createClient();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFamilyMember, setSelectedFamilyMember] = useState<string>('all');
  const [showEmergencyOnly, setShowEmergencyOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showPortalPasswords, setShowPortalPasswords] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchInitialData();
    // Seed selected filter from URL or localStorage (persist pet selection)
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get('selected_person');
      const fromStorage = localStorage.getItem('selected_person') || undefined;
      const seed = fromUrl || fromStorage;
      if (seed) {
        setSelectedFamilyMember(seed);
      }
    } catch {}
  }, []);

  // Deep-link: open contact modal via ?open=contact:ID
  useEffect(() => {
    const open = searchParams?.get('open');
    if (!open) return;
    const [kind, id] = open.split(':');
    if (kind !== 'contact' || !id) return;
    (async () => {
      try {
        const res = await fetch(`/api/contacts/${id}`);
        if (res.ok) {
          const data = await res.json();
          setViewingContact(data.contact);
          setShowModal(false);
        }
      } catch {}
      // Clean URL param silently
      try { router.replace('/contacts'); } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterContacts();
  }, [contacts, searchQuery, selectedCategory, selectedFamilyMember, showEmergencyOnly]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchContacts(),
        fetchFamilyMembers(),
        fetchCategories()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async () => {
    try {
      const response = await fetch('/api/contacts');
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    }
  };

  const fetchFamilyMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .order('name');
      
      if (error) throw error;
      if (data) {
        setFamilyMembers(data);
      }
    } catch (error) {
      console.error('Failed to fetch family members:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/contacts/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || ['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other']);
      }
    } catch (error) {
      // Use default categories if fetch fails
      setCategories(['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other']);
    }
  };

  const filterContacts = () => {
    let filtered = [...contacts];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact =>
        contact.name.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.phone?.toLowerCase().includes(query) ||
        contact.company?.toLowerCase().includes(query)
      );
    }

    // Category filter - be more flexible with matching
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(contact => {
        const contactCat = contact.category?.toLowerCase() || '';
        const selectedCat = selectedCategory.toLowerCase();
        // Match if category contains the selected category or if they're equal
        return contactCat === selectedCat || 
               contactCat.includes(selectedCat) ||
               selectedCat.includes(contactCat);
      });
    }

    // Family member filter
    if (selectedFamilyMember !== 'all') {
      filtered = filtered.filter(contact =>
        contact.related_to?.includes(selectedFamilyMember)
      );
    }

    // Emergency filter
    if (showEmergencyOnly) {
      filtered = filtered.filter(contact => contact.is_emergency);
    }

    // Filter out archived contacts
    filtered = filtered.filter(contact => !contact.is_archived);

    // Sort by name
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    setFilteredContacts(filtered);
  };

  const handleSaveContact = async (contactData: Partial<Contact>) => {
    try {
      const url = editingContact 
        ? `/api/contacts/${editingContact.id}`
        : '/api/contacts';
      
      const method = editingContact ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactData)
      });

      if (response.ok) {
        await fetchContacts();
        setShowModal(false);
        setEditingContact(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save contact');
      }
    } catch (error) {
      console.error('Failed to save contact:', error);
      alert('Failed to save contact');
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;

    try {
      const response = await fetch(`/api/contacts/${id}`, { 
        method: 'DELETE' 
      });
      
      if (response.ok) {
        setContacts(contacts.filter(c => c.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete contact:', error);
    }
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setShowModal(true);
  };

  const togglePortalPassword = (contactId: string) => {
    setShowPortalPasswords(prev => ({
      ...prev,
      [contactId]: !prev[contactId]
    }));
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getFamilyMemberName = (memberId: string) => {
    const member = familyMembers.find(m => m.id === memberId);
    return member?.name || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Contacts</h1>
        </div>
        <button
          onClick={() => {
            setEditingContact(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
        >
          <Plus className="h-5 w-5" />
          Add Contact
        </button>
      </div>

      {/* Search Bar and Controls */}
      <div className="space-y-4">
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search contacts by name, email, phone, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-1 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-gray-700"
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
              className={`inline-flex items-center h-10 gap-2 px-4 rounded-xl transition-colors ${
                showFilters || (selectedCategory !== 'all' || selectedFamilyMember !== 'all' || showEmergencyOnly)
                  ? 'bg-gray-700 text-text-primary'
                  : 'bg-background-primary text-text-muted hover:bg-gray-700/20'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {(selectedCategory !== 'all' || selectedFamilyMember !== 'all' || showEmergencyOnly) && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                  Active
                </span>
              )}
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-600/30">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Category Filter Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    onFocus={async () => {
                      // Fetch fresh categories when dropdown is focused
                      await fetchCategories();
                    }}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                {/* Related To Filter Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Related To
                  </label>
                  <select
                    value={selectedFamilyMember}
                    onChange={(e) => setSelectedFamilyMember(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    <option value="all">All Family Members</option>
                    {familyMembers.map(member => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>

                {/* Quick Filters */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Quick Filters
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="emergency-only"
                      checked={showEmergencyOnly}
                      onChange={(e) => setShowEmergencyOnly(e.target.checked)}
                      className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="emergency-only" className="text-sm text-text-primary cursor-pointer">
                      Emergency Only
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-text-muted">
        Showing {filteredContacts.length} of {contacts.length} contacts
      </div>

      {/* Contacts Display */}
      {filteredContacts.length === 0 ? (
        <div className="text-center py-12 bg-background-secondary border border-gray-600/30 rounded-xl">
          <Users className="h-12 w-12 text-text-muted mx-auto mb-4" />
          <p className="text-text-muted">No contacts found</p>
          {searchQuery && (
            <p className="text-sm text-text-muted mt-2">
              Try adjusting your search or filters
            </p>
          )}
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map(contact => (
            <div
              key={contact.id}
              className="bg-background-secondary border border-gray-600/30 rounded-xl p-4 hover:border-gray-500 transition-colors"
            >
              {/* Contact Header */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary text-lg truncate">{contact.name}</h3>
                  {contact.company && (
                    <p className="text-sm text-text-muted flex items-center gap-1 mt-1 truncate">
                      <Building2 className="h-3 w-3" />
                      {contact.company}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {contact.is_emergency && (
                    <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded">
                      Emergency
                    </span>
                  )}
                  {/* View */}
                  <button
                    onClick={() => setViewingContact(contact)}
                    className="p-1.5 hover:bg-gray-700/30 rounded"
                    title="View"
                  >
                    <Eye className="h-4 w-4 text-text-muted" />
                  </button>
                  {/* Edit/Delete for admin */}
                  {user?.role === 'admin' && (
                    <>
                      <button
                        onClick={() => handleEditContact(contact)}
                        className="p-1.5 hover:bg-gray-700/30 rounded"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4 text-text-muted" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        className="p-1.5 hover:bg-gray-700/30 rounded"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-text-muted" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Category Badge */}
              {contact.category && (
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${getCategoryColor(contact.category)} mb-3`}>
                  {getCategoryIcon(contact.category)}
                  {contact.category}
                </div>
              )}

              {/* Contact Info */}
              <div className="space-y-2 mb-3">
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <Mail className="h-4 w-4" />
                    <a href={`mailto:${contact.email}`} className="hover:text-text-primary">
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${contact.phone}`} className="hover:text-text-primary">
                      {contact.phone}
                    </a>
                  </div>
                )}
                {contact.address && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <MapPin className="h-4 w-4" />
                    <span>{contact.address}</span>
                  </div>
                )}
                {contact.website && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <Globe className="h-4 w-4" />
                    <a 
                      href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-text-primary"
                    >
                      {contact.website}
                    </a>
                  </div>
                )}
              </div>

              {/* Portal Info */}
              {contact.portal_url && (
                <div className="border-t border-gray-600/30 pt-3 mb-3">
                  <div className="mb-2 text-xs font-medium text-text-muted uppercase">Portal Access</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <a
                        href={contact.portal_url.startsWith('http') ? contact.portal_url : `https://${contact.portal_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-400 hover:text-primary-300"
                      >
                        Open Portal
                      </a>
                    </div>
                    {contact.portal_username && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Username:</span>
                        <span className="text-xs text-text-primary">{contact.portal_username}</span>
                        <button
                          onClick={() => copyToClipboard(contact.portal_username!, 'Username')}
                          className="text-text-muted hover:text-text-primary"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {contact.portal_password && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Password:</span>
                        <span className="text-xs text-text-primary font-mono">
                          {showPortalPasswords[contact.id] ? contact.portal_password : '••••••••'}
                        </span>
                        <button
                          onClick={() => copyToClipboard(contact.portal_password!, 'Password')}
                          className="text-text-muted hover:text-text-primary"
                          title="Copy password"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => togglePortalPassword(contact.id)}
                          className="text-text-muted hover:text-text-primary"
                          title={showPortalPasswords[contact.id] ? 'Hide password' : 'Show password'}
                        >
                          {showPortalPasswords[contact.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Related To */}
              {contact.related_to && contact.related_to.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {contact.related_to.map(memberId => (
                    <span
                      key={memberId}
                      className="px-2 py-0.5 bg-gray-700/50 text-text-primary text-xs rounded"
                    >
                      {getFamilyMemberName(memberId)}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions moved to top-right; removed bottom actions */}
            </div>
          ))}
        </div>
      ) : (
        // List View
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-background-tertiary border-b border-gray-600/30">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Related To</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600/30">
              {filteredContacts.map(contact => (
                <tr key={contact.id} className="hover:bg-background-tertiary/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-text-primary">{contact.name}</div>
                      {contact.company && (
                        <div className="text-sm text-text-muted">{contact.company}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {contact.category && (
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${getCategoryColor(contact.category)}`}>
                        {getCategoryIcon(contact.category)}
                        {contact.category}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {contact.email && (
                        <div className="text-sm text-text-muted">{contact.email}</div>
                      )}
                      {contact.phone && (
                        <div className="text-sm text-text-muted">{contact.phone}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {contact.related_to && contact.related_to.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {contact.related_to.map(memberId => (
                          <span
                            key={memberId}
                            className="px-2 py-0.5 bg-gray-700/50 text-text-primary text-xs rounded"
                          >
                            {getFamilyMemberName(memberId)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setViewingContact(contact)}
                        className="p-1.5 text-text-muted hover:text-text-primary hover:bg-background-tertiary rounded transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEditContact(contact)}
                        className="p-1.5 text-text-muted hover:text-text-primary hover:bg-background-tertiary rounded transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <ContactModal
          contact={editingContact}
          categories={categories}
          familyMembers={familyMembers}
          onSave={handleSaveContact}
          onClose={() => {
            setShowModal(false);
            setEditingContact(null);
          }}
        />
      )}

      {viewingContact && (
        <ViewContactModal
          contact={viewingContact}
          familyMembers={familyMembers}
          onEdit={() => {
            setEditingContact(viewingContact);
            setViewingContact(null);
            setShowModal(true);
          }}
          onClose={() => setViewingContact(null)}
        />
      )}
    </div>
  );
}
