'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Plus, Filter, Users, Grid3X3, List as ListIcon } from 'lucide-react';

import { ContactCard } from '@/components/contacts/ContactCard';
import {
  ContactModal as UnifiedContactModal,
} from '@/components/contacts/ContactModal';
import type {
  ContactCardBadge,
  ContactFormValues,
  ContactModalFieldVisibilityMap,
  ContactRecord,
} from '@/components/contacts/contact-types';
import {
  resolveEmails,
  resolvePhones,
  resolveAddresses,
} from '@/components/contacts/contact-utils';
import { useUser } from '@/contexts/user-context';
import { createClient } from '@/lib/supabase/client';

import { ViewContactModal } from './ViewContactModal';

const DEFAULT_CONTACT_CATEGORIES = ['Health', 'Household', 'Pets', 'Travel', 'J3 Academics', 'Other'];

interface FamilyMember {
  id: string;
  name: string;
  email?: string;
  is_child: boolean;
}

const BASE_MODAL_VISIBILITY: ContactModalFieldVisibilityMap = {
  tags: { hidden: true },
  assignedEntities: { hidden: true },
};

type RawContact = Partial<ContactRecord> & {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  addresses?: string[] | null;
  tags?: string[] | null;
  related_to?: string[] | null;
  assigned_entities?: ContactRecord['assigned_entities'];
  pets?: string[] | null;
};

const toContactRecord = (raw: RawContact): ContactRecord => {
  const emails = Array.isArray(raw.emails)
    ? raw.emails.filter(Boolean)
    : raw.email
      ? [raw.email]
      : [];
  const phones = Array.isArray(raw.phones)
    ? raw.phones.filter(Boolean)
    : raw.phone
      ? [raw.phone]
      : [];
  const addresses = Array.isArray(raw.addresses)
    ? raw.addresses.filter(Boolean)
    : raw.address
      ? [raw.address]
      : [];

  return {
    ...raw,
    emails,
    phones,
    addresses,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    related_to: Array.isArray(raw.related_to) ? raw.related_to : [],
    assigned_entities: Array.isArray(raw.assigned_entities) ? raw.assigned_entities : null,
    pets: Array.isArray(raw.pets) ? raw.pets : [],
  } as ContactRecord;
};

const sanitizeList = (values: string[] | undefined): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach(value => {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      output.push(trimmed);
    }
  });
  return output;
};

const toNullable = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildApiPayload = (values: ContactFormValues) => {
  return {
    name: values.name,
    company: toNullable(values.company),
    emails: sanitizeList(values.emails),
    phones: sanitizeList(values.phones),
    addresses: sanitizeList(values.addresses),
    notes: toNullable(values.notes),
    website: toNullable(values.website),
    tags: Array.isArray(values.tags) ? values.tags : [],
    related_to: Array.isArray(values.related_to) ? values.related_to : [],
    assigned_entities: Array.isArray(values.assigned_entities) ? values.assigned_entities : [],
    category: values.category || null,
    source_type: values.source_type || 'other',
    source_page: values.source_page || 'contacts',
    contact_type: values.contact_type || null,
    contact_subtype: values.contact_subtype || null,
    portal_url: toNullable(values.portal_url),
    portal_username: toNullable(values.portal_username),
    portal_password: toNullable(values.portal_password),
    is_emergency: Boolean(values.is_emergency),
    is_preferred: Boolean(values.is_preferred),
    is_favorite: Boolean(values.is_favorite),
    pets: Array.isArray(values.pets) ? values.pets : [],
    trip_id: values.trip_id ?? null,
  };
};

const mapContactToFormValues = (contact: ContactRecord): Partial<ContactFormValues> => ({
  id: contact.id,
  name: contact.name,
  company: contact.company ?? undefined,
  emails: resolveEmails(contact),
  phones: resolvePhones(contact),
  addresses: resolveAddresses(contact),
  website: contact.website ?? undefined,
  notes: contact.notes ?? undefined,
  tags: Array.isArray(contact.tags) ? [...contact.tags] : [],
  related_to: contact.related_to ?? [],
  category: contact.category ?? undefined,
  source_type: contact.source_type ?? undefined,
  source_page: contact.source_page ?? undefined,
  contact_type: contact.contact_type ?? undefined,
  contact_subtype: contact.contact_subtype ?? undefined,
  assigned_entities: Array.isArray(contact.assigned_entities)
    ? contact.assigned_entities.map(entity => entity.id)
    : [],
  pets: Array.isArray(contact.pets) ? [...contact.pets] : [],
  trip_id: contact.trip_id ?? undefined,
  portal_url: contact.portal_url ?? undefined,
  portal_username: contact.portal_username ?? undefined,
  portal_password: contact.portal_password ?? undefined,
  is_favorite: Boolean(contact.is_favorite),
  is_emergency: Boolean(contact.is_emergency),
  is_preferred: Boolean(contact.is_preferred),
});

export default function ContactsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const supabase = createClient();

  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ContactRecord[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CONTACT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedFamilyMember, setSelectedFamilyMember] = useState<string>('all');
  const [showEmergencyOnly, setShowEmergencyOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [viewingContact, setViewingContact] = useState<ContactRecord | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const relatedEntityOptions = useMemo(
    () => familyMembers.map(member => ({ id: member.id, label: member.name })),
    [familyMembers]
  );

  const modalOptions = useMemo(
    () => ({
      categories,
      relatedEntities: relatedEntityOptions,
    }),
    [categories, relatedEntityOptions]
  );

  const filterContacts = useCallback(() => {
    let next = [...contacts];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      next = next.filter(contact => {
        const haystack = [
          contact.name,
          contact.company ?? '',
          contact.notes ?? '',
          ...resolveEmails(contact),
          ...resolvePhones(contact),
        ];
        return haystack.some(value => value?.toLowerCase().includes(query));
      });
    }

    if (selectedCategory !== 'all') {
      const selected = selectedCategory.toLowerCase();
      next = next.filter(contact => {
        const category = contact.category?.toLowerCase() ?? '';
        return category === selected || category.includes(selected) || selected.includes(category);
      });
    }

    if (selectedFamilyMember !== 'all') {
      next = next.filter(contact => contact.related_to?.includes(selectedFamilyMember));
    }

    if (showEmergencyOnly) {
      next = next.filter(contact => contact.is_emergency);
    }

    next = next.filter(contact => !contact.is_archived);

    next.sort((a, b) => a.name.localeCompare(b.name));
    setFilteredContacts(next);
  }, [contacts, searchQuery, selectedCategory, selectedFamilyMember, showEmergencyOnly]);

  useEffect(() => {
    filterContacts();
  }, [filterContacts]);

  useEffect(() => {
    const seedSelectedPerson = () => {
      try {
        const url = new URL(window.location.href);
        const fromUrl = url.searchParams.get('selected_person');
        const fromStorage = localStorage.getItem('selected_person') || undefined;
        const seed = fromUrl || fromStorage;
        if (seed) {
          setSelectedFamilyMember(seed);
        }
      } catch {
        // ignore seed errors
      }
    };

    const initialise = async () => {
      setLoading(true);
      try {
        seedSelectedPerson();
        await Promise.all([fetchContacts(), fetchFamilyMembers(), fetchCategories()]);
      } finally {
        setLoading(false);
      }
    };

    initialise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const open = searchParams?.get('open');
    if (!open) return;
    const [kind, identifier] = open.split(':');
    if (kind !== 'contact' || !identifier) return;

    (async () => {
      try {
        const res = await fetch(`/api/contacts/${identifier}`);
        if (res.ok) {
          const data = await res.json();
          const contact = toContactRecord(data.contact);
          setViewingContact(contact);
          setShowModal(false);
        }
      } catch {
        // ignore errors
      }
      try {
        router.replace('/contacts');
      } catch {
        // ignore router failures
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchContacts = async () => {
    try {
      const response = await fetch('/api/contacts');
      if (response.ok) {
        const data = await response.json();
        const normalised = Array.isArray(data.contacts)
          ? data.contacts.map(toContactRecord)
          : [];
        setContacts(normalised);
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
      if (data) setFamilyMembers(data);
    } catch (error) {
      console.error('Failed to fetch family members:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/contacts/categories');
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data.categories) && data.categories.length > 0
          ? data.categories
          : DEFAULT_CONTACT_CATEGORIES;
        setCategories(list);
      } else {
        setCategories(DEFAULT_CONTACT_CATEGORIES);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      setCategories(DEFAULT_CONTACT_CATEGORIES);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      const response = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setContacts(prev => prev.filter(contact => contact.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete contact:', error);
    }
  };

  const handleModalSubmit = async (values: ContactFormValues) => {
    try {
      setSavingContact(true);
      const payload = buildApiPayload(values);
      const method = editingContact ? 'PUT' : 'POST';
      const url = editingContact ? `/api/contacts/${editingContact.id}` : '/api/contacts';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to save contact' }));
        alert(error.error || 'Failed to save contact');
        return;
      }

      await fetchContacts();
      setShowModal(false);
      setEditingContact(null);
    } catch (error) {
      console.error('Failed to save contact:', error);
      alert('Failed to save contact');
    } finally {
      setSavingContact(false);
    }
  };

  const getFamilyMemberName = useCallback(
    (id: string) => familyMembers.find(member => member.id === id)?.name || '',
    [familyMembers]
  );

  const buildBadgesForContact = (contact: ContactRecord): ContactCardBadge[] => {
    const badges: ContactCardBadge[] = [];
    if (contact.is_emergency) {
      badges.push({ id: `${contact.id}-emergency`, label: 'Emergency', tone: 'danger' });
    }
    if (contact.is_preferred) {
      badges.push({ id: `${contact.id}-preferred`, label: 'Preferred', tone: 'primary' });
    }
    if (contact.source_type && contact.source_type !== 'other') {
      badges.push({
        id: `${contact.id}-source`,
        label: contact.source_type.replace(/_/g, ' '),
        tone: 'neutral',
      });
    }
    return badges;
  };

  const renderContactCard = (contact: ContactRecord, layout: 'auto' | 'compact') => {
    const relatedNames = (contact.related_to ?? [])
      .map(getFamilyMemberName)
      .filter(Boolean);

    const extraContent = relatedNames.length > 0 ? renderContactChips(relatedNames) : null;

    const canManage = user?.role === 'admin' || contact.created_by === user?.id;

    return (
      <ContactCard
        key={contact.id}
        contact={contact}
        subtitle={contact.company ?? undefined}
        badges={buildBadgesForContact(contact)}
        extraContent={extraContent}
        canManage={canManage}
        actionConfig={{
          onEdit: canManage ? () => {
            setEditingContact(contact);
            setShowModal(true);
          } : undefined,
          onDelete: canManage ? () => handleDeleteContact(contact.id) : undefined,
          onOpenDetails: () => setViewingContact(contact),
        }}
        showFavoriteToggle={false}
        layout={layout}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-700" />
      </div>
    );
  }

  const modalDefaults = {
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    sourceType: 'general' as const,
    sourcePage: 'contacts',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Contacts</h1>
        </div>
        <button
          onClick={() => {
            setEditingContact(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-button-create px-5 py-2 text-sm text-white transition-colors hover:bg-button-create/90"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </button>
      </div>

      <div className="rounded-xl border border-gray-600/30 bg-background-secondary p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search by name, email, phone, or notes"
                className="w-full rounded-xl border border-gray-600/30 bg-background-primary px-9 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700 md:min-w-[280px]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-background-primary p-1 text-text-muted">
              <button
                onClick={() => setViewMode('card')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'card'
                    ? 'bg-gray-700 text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                aria-label="Card view"
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
                aria-label="List view"
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => setShowFilters(prev => !prev)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 transition-colors ${
                showFilters || selectedCategory !== 'all' || selectedFamilyMember !== 'all' || showEmergencyOnly
                  ? 'bg-gray-700 text-text-primary'
                  : 'bg-background-primary text-text-muted hover:bg-gray-700/20'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {(selectedCategory !== 'all' || selectedFamilyMember !== 'all' || showEmergencyOnly) && (
                <span className="ml-1 rounded-full bg-blue-500 px-1.5 py-0.5 text-xs text-white">Active</span>
              )}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 border-t border-gray-600/30 pt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <select
                  aria-label="Category"
                  value={selectedCategory}
                  onChange={event => setSelectedCategory(event.target.value)}
                  onFocus={fetchCategories}
                  className="w-full rounded-xl border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  <option value="all">All Categories</option>
                  {categories.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  aria-label="Related To"
                  value={selectedFamilyMember}
                  onChange={event => setSelectedFamilyMember(event.target.value)}
                  className="w-full rounded-xl border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  <option value="all">All Family Members</option>
                  {familyMembers.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="emergency-only"
                  type="checkbox"
                  checked={showEmergencyOnly}
                  onChange={event => setShowEmergencyOnly(event.target.checked)}
                  className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="emergency-only" className="text-sm text-text-primary">
                  Emergency Only
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-sm text-text-muted">
        Showing {filteredContacts.length} of {contacts.length} contacts
      </div>

      {filteredContacts.length === 0 ? (
        <div className="rounded-xl border border-gray-600/30 bg-background-secondary py-12 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-text-muted" />
          <p className="text-text-muted">No contacts found</p>
          {searchQuery && (
            <p className="mt-2 text-sm text-text-muted">Try adjusting your search or filters</p>
          )}
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredContacts.map(contact => renderContactCard(contact, 'auto'))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContacts.map(contact => renderContactCard(contact, 'compact'))}
        </div>
      )}

      {showModal && (
        <UnifiedContactModal
          open={showModal}
          mode={editingContact ? 'edit' : 'create'}
          initialValues={editingContact ? mapContactToFormValues(editingContact) : undefined}
          defaults={modalDefaults}
          visibility={BASE_MODAL_VISIBILITY}
          optionSelectors={modalOptions}
          labels={{ relatedToLabel: 'Family Members' }}
          busy={savingContact}
          submitLabel={editingContact ? 'Save changes' : 'Create contact'}
          onSubmit={handleModalSubmit}
          onCancel={() => {
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
            setShowModal(true);
            setViewingContact(null);
          }}
          onClose={() => setViewingContact(null)}
        />
      )}
    </div>
  );
}
const renderContactChips = (names: string[]) => (
  <div className="flex flex-wrap gap-2">
    {names.map(name => (
      <span key={name} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80">
        {name}
      </span>
    ))}
  </div>
);
