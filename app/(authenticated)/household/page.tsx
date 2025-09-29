'use client';

import { useMemo, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useUser } from '@/contexts/user-context';
import {
  Home,
  Plus,
  Search,
  Trash2,
  Edit2,
  Package,
  Calendar,
  DollarSign,
  Grid,
  List,
  Download,
  Upload,
  Archive,
  FileText,
  Building,
} from 'lucide-react';
import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactModal as UnifiedContactModal } from '@/components/contacts/ContactModal';
import type {
  ContactCardBadge,
  ContactFormValues,
  ContactModalFieldVisibilityMap,
  ContactRecord,
} from '@/components/contacts/contact-types';
import {
  resolveAddresses,
  resolveEmails,
  resolvePhones,
} from '@/components/contacts/contact-utils';

const HOUSEHOLD_SERVICE_OPTIONS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
] as const;

type HouseholdServiceValue = (typeof HOUSEHOLD_SERVICE_OPTIONS)[number]['value'];
type HouseholdServiceLabel = (typeof HOUSEHOLD_SERVICE_OPTIONS)[number]['label'];

const HOUSEHOLD_SERVICE_LABELS: HouseholdServiceLabel[] = HOUSEHOLD_SERVICE_OPTIONS.map(option => option.label);

const normalizeHouseholdServiceValue = (raw?: string | null): HouseholdServiceValue => {
  if (!raw) return 'other';
  const lowered = raw.toString().trim().toLowerCase();
  const match = HOUSEHOLD_SERVICE_OPTIONS.find(option => option.value === lowered || option.label.toLowerCase() === lowered);
  return match ? match.value : 'other';
};

const getHouseholdServiceLabel = (raw?: string | null): HouseholdServiceLabel => {
  const value = normalizeHouseholdServiceValue(raw);
  const match = HOUSEHOLD_SERVICE_OPTIONS.find(option => option.value === value);
  return match ? match.label : 'Other';
};

// Property types
type HouseholdContactRow = {
  id: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  emails?: string[] | null;
  phone?: string | null;
  phones?: string[] | null;
  address?: string | null;
  addresses?: string[] | null;
  notes?: string | null;
  category?: string | null;
  contact_subtype?: string | null;
  tags?: string[] | null;
  related_to?: string[] | null;
  assigned_entities?: ContactRecord['assigned_entities'];
  is_emergency?: boolean | null;
  is_favorite?: boolean | null;
  is_archived?: boolean | null;
  portal_url?: string | null;
  portal_username?: string | null;
  portal_password?: string | null;
  website?: string | null;
  source_type?: string | null;
  source_page?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const coerceStringArray = (...sources: Array<unknown>): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  sources.forEach(source => {
    if (Array.isArray(source)) {
      source.forEach(value => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            output.push(trimmed);
          }
        }
      });
    } else if (typeof source === 'string') {
      const trimmed = source.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        output.push(trimmed);
      }
    }
  });

  return output;
};

const toHouseholdContactRecord = (raw: HouseholdContactRow): ContactRecord => {
  const serviceValue = normalizeHouseholdServiceValue(raw.contact_subtype ?? raw.category);

  return {
    id: String(raw.id),
    name: raw.name || 'Household Contact',
    company: raw.company || null,
    emails: coerceStringArray(raw.emails, raw.email),
    phones: coerceStringArray(raw.phones, raw.phone),
    addresses: coerceStringArray(raw.addresses, raw.address),
    website: raw.website || null,
    notes: raw.notes || null,
    category: 'household',
    contact_type: 'household',
    contact_subtype: serviceValue,
    module: 'household',
    source_type: raw.source_type || 'household',
    source_page: raw.source_page || 'household',
    tags: Array.isArray(raw.tags) ? raw.tags.filter(Boolean) : [],
    related_to: Array.isArray(raw.related_to) ? raw.related_to.filter(Boolean) : [],
    assigned_entities: Array.isArray(raw.assigned_entities) ? raw.assigned_entities : null,
    is_emergency: Boolean(raw.is_emergency),
    is_favorite: Boolean(raw.is_favorite),
    is_archived: Boolean(raw.is_archived),
    portal_url: raw.portal_url || null,
    portal_username: raw.portal_username || null,
    portal_password: raw.portal_password || null,
    created_by: raw.created_by || null,
    created_at: raw.created_at || null,
    updated_at: raw.updated_at || null,
  } as ContactRecord;
};

const HOUSEHOLD_MODAL_VISIBILITY: ContactModalFieldVisibilityMap = {
  tags: { hidden: true },
  assignedEntities: { hidden: true },
  relatedTo: { hidden: true },
  favorite: { hidden: true },
  preferred: { hidden: true },
};

const mapHouseholdContactToFormValues = (contact: ContactRecord): Partial<ContactFormValues> => ({
  id: contact.id,
  name: contact.name,
  company: contact.company ?? undefined,
  emails: resolveEmails(contact),
  phones: resolvePhones(contact),
  addresses: resolveAddresses(contact),
  website: contact.website ?? undefined,
  notes: contact.notes ?? undefined,
  category: getHouseholdServiceLabel(contact.contact_subtype ?? contact.category),
  contact_subtype: contact.contact_subtype ?? undefined,
  source_type: contact.source_type ?? undefined,
  source_page: contact.source_page ?? undefined,
  tags: Array.isArray(contact.tags) ? [...contact.tags] : [],
  related_to: Array.isArray(contact.related_to) ? [...contact.related_to] : [],
  assigned_entities: Array.isArray(contact.assigned_entities)
    ? contact.assigned_entities.map(entity => entity.id)
    : [],
  portal_url: contact.portal_url ?? undefined,
  portal_username: contact.portal_username ?? undefined,
  portal_password: contact.portal_password ?? undefined,
  is_emergency: contact.is_emergency ?? undefined,
  is_favorite: contact.is_favorite ?? undefined,
});

interface Property {
  id: string;
  name: string;
  address?: string;
  created_at: string;
}

// Inventory types
type ItemCategory = 'electronics' | 'valuables' | 'household' | 'documents' | 'other';
type ItemLocation = 'unit1' | 'unit2' | 'unit3' | 'home' | 'other';

interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  location: ItemLocation;
  value?: number;
  purchase_date?: string;
  description?: string;
  serial_number?: string;
  photo_url?: string;
  notes?: string;
  created_at: string;
}

const itemCategoryIcons: Record<ItemCategory, ReactNode> = {
  electronics: <Package className="h-4 w-4" />,
  valuables: <DollarSign className="h-4 w-4" />,
  household: <Home className="h-4 w-4" />,
  documents: <FileText className="h-4 w-4" />,
  other: <Archive className="h-4 w-4" />,
};

const itemCategoryColors: Record<ItemCategory, string> = {
  electronics: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  valuables: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  household: 'bg-green-600/20 text-green-400 border-green-600/30',
  documents: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  other: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
};

const locationColors: Record<ItemLocation, string> = {
  unit1: 'bg-blue-600/20 text-blue-400',
  unit2: 'bg-green-600/20 text-green-400',
  unit3: 'bg-purple-600/20 text-purple-400',
  home: 'bg-orange-600/20 text-orange-400',
  other: 'bg-gray-600/20 text-gray-400',
};
export default function HouseholdPage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'properties' | 'contacts' | 'inventory'>('properties');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Properties state
  const [properties, setProperties] = useState<Property[]>([]);
  const [showCreatePropertyModal, setShowCreatePropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  
  // Contacts state
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HouseholdServiceValue | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  
  // Inventory state
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [selectedItemCategory, setSelectedItemCategory] = useState<ItemCategory | 'all'>('all');
  const [selectedLocation, setSelectedLocation] = useState<ItemLocation | 'all'>('all');
  const [showCreateItemModal, setShowCreateItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Show notifications
  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  useEffect(() => {
    fetchProperties();
    fetchContacts();
    fetchInventory();
  }, []);

  // Properties functions
  const fetchProperties = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/properties');
      if (!response.ok) throw new Error('Failed to fetch properties');
      const data = await response.json();
      setProperties(data.properties || []);
    } catch (error) {
      showError('Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProperty = async (property: Partial<Property>) => {
    setLoading(true);
    try {
      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(property)
      });
      if (!response.ok) throw new Error('Failed to create property');
      await fetchProperties();
      setShowCreatePropertyModal(false);
      showSuccess('Property created successfully');
    } catch (error) {
      showError('Failed to create property');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProperty = async (id: string, property: Partial<Property>) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(property)
      });
      if (!response.ok) throw new Error('Failed to update property');
      await fetchProperties();
      setEditingProperty(null);
      showSuccess('Property updated successfully');
    } catch (error) {
      showError('Failed to update property');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!confirm('Are you sure you want to delete this property?')) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/properties/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete property');
      await fetchProperties();
      showSuccess('Property deleted successfully');
    } catch (error) {
      showError('Failed to delete property');
    } finally {
      setLoading(false);
    }
  };

  // Contacts functions
  const fetchContacts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/household/contacts');
      if (!response.ok) throw new Error('Failed to fetch contacts');
      const data = await response.json();
      const mapped = Array.isArray(data.contacts) ? data.contacts.map(toHouseholdContactRecord) : [];
      setContacts(mapped);
    } catch (error) {
      showError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/household/contacts/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete contact');
      await fetchContacts();
      showSuccess('Contact deleted successfully');
    } catch (error) {
      showError('Failed to delete contact');
    } finally {
      setLoading(false);
    }
  };

  // Inventory functions
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/inventory');
      if (!response.ok) throw new Error('Failed to fetch inventory');
      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      showError('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItem = async (item: Partial<InventoryItem>) => {
    setLoading(true);
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (!response.ok) throw new Error('Failed to create item');
      await fetchInventory();
      setShowCreateItemModal(false);
      showSuccess('Item created successfully');
    } catch (error) {
      showError('Failed to create item');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = async (id: string, item: Partial<InventoryItem>) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/inventory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (!response.ok) throw new Error('Failed to update item');
      await fetchInventory();
      setEditingItem(null);
      showSuccess('Item updated successfully');
    } catch (error) {
      showError('Failed to update item');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/inventory/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete item');
      await fetchInventory();
      showSuccess('Item deleted successfully');
    } catch (error) {
      showError('Failed to delete item');
    } finally {
      setLoading(false);
    }
  };

  // CSV Export
  const exportToCSV = () => {
    const headers = ['Name', 'Category', 'Location', 'Value', 'Purchase Date', 'Serial Number', 'Description', 'Notes'];
    const rows = filteredItems.map(item => [
      item.name,
      item.category,
      item.location,
      item.value?.toString() || '',
      item.purchase_date || '',
      item.serial_number || '',
      item.description || '',
      item.notes || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // CSV Import
  const handleCSVImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
          const item = values.reduce<Record<string, string>>((obj, val, index) => {
            const key = headers[index]?.toLowerCase().replace(' ', '_');
            if (key) {
              obj[key] = val.replace(/"/g, '');
            }
            return obj;
          }, {});

          if (item.name) {
            const category = (item.category || '').toLowerCase();
            const normalizedCategory = ['electronics', 'valuables', 'household', 'documents', 'other'].includes(category)
              ? (category as ItemCategory)
              : 'other';
            const location = (item.location || '').toLowerCase();
            const normalizedLocation = ['unit1', 'unit2', 'unit3', 'home', 'other'].includes(location)
              ? (location as ItemLocation)
              : 'other';
            await handleCreateItem({
              name: item.name,
              category: normalizedCategory,
              location: normalizedLocation,
              value: parseFloat(item.value) || undefined,
              purchase_date: item.purchase_date || undefined,
              serial_number: item.serial_number || undefined,
              description: item.description || undefined,
              notes: item.notes || undefined
            });
          }
        }
      } catch (error) {
        showError('Failed to import CSV');
      }
    };
    reader.readAsText(file);
  };

  const renderContactCard = (contact: ContactRecord) => {
    const badges: ContactCardBadge[] = [];
    const serviceLabel = getHouseholdServiceLabel(contact.contact_subtype ?? contact.category);

    if (serviceLabel && serviceLabel !== 'Other') {
      badges.push({ id: `${contact.id}-service`, label: serviceLabel, tone: 'neutral' });
    }
    if (contact.is_emergency) {
      badges.push({ id: `${contact.id}-emergency`, label: 'Emergency', tone: 'danger' });
    }
    if (contact.portal_url) {
      badges.push({ id: `${contact.id}-portal`, label: 'Portal', tone: 'primary' });
    }

    return (
      <ContactCard
        key={contact.id}
        contact={contact}
        subtitle={contact.company ?? undefined}
        badges={badges}
        showFavoriteToggle={false}
        canManage={user?.role === 'admin'}
        actionConfig={user?.role === 'admin'
          ? {
              onEdit: () => {
                setEditingContact(contact);
                setShowCreateModal(true);
              },
              onDelete: () => handleDeleteContact(contact.id),
            }
          : undefined}
      />
    );
  };

  const contactModalDefaults = useMemo(
    () => ({
      category: getHouseholdServiceLabel('other'),
      sourceType: 'household' as const,
      sourcePage: 'household',
      contactType: 'household',
      contactSubtype: 'other',
    }),
    []
  );

  const handleContactSubmit = async (values: ContactFormValues) => {
    try {
      setSavingContact(true);
      const emails = coerceStringArray(values.emails);
      const phones = coerceStringArray(values.phones);
      const addresses = coerceStringArray(values.addresses);
      const tags = Array.isArray(values.tags) ? values.tags : [];
      const relatedTo = Array.isArray(values.related_to) ? values.related_to : [];
      const assignedEntities = Array.isArray(values.assigned_entities) ? values.assigned_entities : [];
      const serviceValue = normalizeHouseholdServiceValue(values.contact_subtype ?? values.category);
      const serviceLabel = getHouseholdServiceLabel(serviceValue);

      const toNullable = (value?: string | null) => {
        if (!value) return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      };

      const payload = {
        name: values.name,
        company: toNullable(values.company),
        emails,
        phones,
        addresses,
        notes: toNullable(values.notes),
        website: toNullable(values.website),
        tags,
        related_to: relatedTo,
        assigned_entities: assignedEntities,
        category: 'household',
        contact_subtype: serviceValue,
        source_type: values.source_type || 'household',
        source_page: values.source_page || 'household',
        is_emergency: Boolean(values.is_emergency),
        is_favorite: Boolean(values.is_favorite),
        portal_url: toNullable(values.portal_url),
        portal_username: toNullable(values.portal_username),
        portal_password: toNullable(values.portal_password),
      };

      const endpoint = editingContact
        ? `/api/household/contacts/${editingContact.id}`
        : '/api/household/contacts';

      const response = await fetch(endpoint, {
        method: editingContact ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save contact');

      if (payload.portal_url && payload.portal_username && values.portal_password) {
        try {
          const categoryLabel = serviceLabel;
          await fetch('/api/passwords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `${values.company || values.name} - Service Portal`,
              username: payload.portal_username,
              password: values.portal_password,
              url: payload.portal_url,
              category: 'household',
              notes: `Service provider portal for ${values.name}${values.company ? ` (${values.company})` : ''}\nCategory: ${categoryLabel}${values.is_emergency ? '\nEmergency Contact' : ''}`,
              is_shared: true,
            }),
          });
        } catch (error) {
          console.error('[Household] Failed to sync portal credentials', error);
        }
      }

      await fetchContacts();
      setShowCreateModal(false);
      setEditingContact(null);
      showSuccess(`Contact ${editingContact ? 'updated' : 'created'} successfully`);
    } catch (error) {
      console.error('[Household] Failed to save contact', error);
      showError('Failed to save contact');
    } finally {
      setSavingContact(false);
    }
  };

  // Filter functions
  const filteredContacts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return contacts.filter(contact => {
      const matchesSearch = normalizedSearch
        ? [
            contact.name,
            contact.company ?? '',
            ...resolvePhones(contact),
            ...resolveEmails(contact),
            ...resolveAddresses(contact),
            contact.notes ?? '',
            getHouseholdServiceLabel(contact.contact_subtype ?? contact.category),
          ]
            .filter(Boolean)
            .some(value => value.toLowerCase().includes(normalizedSearch))
        : true;
      const serviceValue = normalizeHouseholdServiceValue(contact.contact_subtype ?? contact.category);
      const matchesCategory = selectedCategory === 'all' || serviceValue === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [contacts, searchTerm, selectedCategory]);

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(inventorySearchTerm.toLowerCase()) ||
                         item.description?.toLowerCase().includes(inventorySearchTerm.toLowerCase()) ||
                         item.serial_number?.toLowerCase().includes(inventorySearchTerm.toLowerCase());
    const matchesCategory = selectedItemCategory === 'all' || item.category === selectedItemCategory;
    const matchesLocation = selectedLocation === 'all' || item.location === selectedLocation;
    return matchesSearch && matchesCategory && matchesLocation;
  });

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {success}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Household Management</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-600/30">
        <button
          onClick={() => setActiveTab('properties')}
          className={`px-3 py-2 text-sm border-b-2 ${activeTab==='properties' ? 'border-primary-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
        >
          Properties
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`px-3 py-2 text-sm border-b-2 ${activeTab==='contacts' ? 'border-primary-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
        >
          Contacts
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-3 py-2 text-sm border-b-2 ${activeTab==='inventory' ? 'border-primary-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
      >
        Inventory
      </button>
      </div>

      {/* Properties Tab */}
      {activeTab === 'properties' && (
        <div className="space-y-4">
          {/* Properties Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary">Properties</h2>
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowCreatePropertyModal(true)}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Property
              </button>
            )}
          </div>

          {/* Properties List */}
          <div className="bg-background-secondary border border-gray-600/30 rounded-xl">
            {loading && (
              <div className="p-8 text-center text-text-muted">
                Loading properties...
              </div>
            )}
            {!loading && properties.length === 0 && (
              <div className="p-8 text-center text-text-muted">
                No properties added yet. Add your first property to get started.
              </div>
            )}
            {!loading && properties.length > 0 && (
              <div className="divide-y divide-gray-700">
                {properties.map(property => (
                  <div key={property.id} className="p-4 hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-text-primary flex items-center gap-2">
                          <Building className="h-4 w-4 text-gray-400" />
                          {property.name}
                        </h3>
                        {property.address && (
                          <p className="text-sm text-text-muted mt-1">{property.address}</p>
                        )}
                      </div>
                      {user?.role === 'admin' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingProperty(property)}
                            className="p-2 hover:bg-gray-700 rounded-xl transition-colors"
                          >
                            <Edit2 className="h-4 w-4 text-text-muted" />
                          </button>
                          <button
                            onClick={() => handleDeleteProperty(property.id)}
                            className="p-2 hover:bg-gray-700 rounded-xl transition-colors"
                          >
                            <Trash2 className="h-4 w-4 text-text-muted" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contacts Tab */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-1 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
            </div>
            <select
              value={selectedCategory}
              onChange={event => setSelectedCategory(event.target.value as HouseholdServiceValue | 'all')}
              className="px-3 py-2 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
            >
              <option value="all">All Service Categories</option>
              {HOUSEHOLD_SERVICE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {user?.role === 'admin' && (
              <button
                onClick={() => {
                  setEditingContact(null);
                  setShowCreateModal(true);
                }}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Contact
              </button>
            )}
          </div>

          {/* Contacts Grid */}
          {filteredContacts.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              No contacts found. Try adjusting your search or filters.
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map(renderContactCard)}
          </div>
          )}
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search inventory..."
                  value={inventorySearchTerm}
                  onChange={(e) => setInventorySearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background-secondary border border-gray-600 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-gray-500"
                />
              </div>
            </div>
            <select
              value={selectedItemCategory}
              onChange={(e) => setSelectedItemCategory(e.target.value as ItemCategory | 'all')}
              className="px-4 py-2 bg-background-secondary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            >
              <option value="all">All Categories</option>
              <option value="electronics">Electronics</option>
              <option value="valuables">Valuables</option>
              <option value="household">Household</option>
              <option value="documents">Documents</option>
              <option value="other">Other</option>
            </select>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value as ItemLocation | 'all')}
              className="px-4 py-2 bg-background-secondary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            >
              <option value="all">All Locations</option>
              <option value="unit1">Unit 1</option>
              <option value="unit2">Unit 2</option>
              <option value="unit3">Unit 3</option>
              <option value="home">Home</option>
              <option value="other">Other</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="p-2 bg-background-secondary hover:bg-gray-700 rounded-lg transition-colors"
              >
                {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
              </button>
              <button
                onClick={exportToCSV}
                className="p-2 bg-background-secondary hover:bg-gray-700 rounded-lg transition-colors"
                title="Export to CSV"
              >
                <Download className="h-4 w-4" />
              </button>
              {user?.role === 'admin' && (
                <>
                  <label className="p-2 bg-background-secondary hover:bg-gray-700 rounded-lg transition-colors cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVImport}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => setShowCreateItemModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-button-create hover:bg-button-create/90 text-white rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Item
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Inventory Grid/List */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className="bg-background-secondary border border-gray-600/30 rounded-lg p-4 hover:border-gray-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${itemCategoryColors[item.category]}`}>
                        {itemCategoryIcons[item.category]}
                        {item.category}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${locationColors[item.location]}`}>
                        {item.location}
                      </span>
                    </div>
                    {user?.role === 'admin' && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="p-1 hover:bg-gray-700 rounded transition-colors"
                        >
                          <Edit2 className="h-3 w-3 text-text-muted" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 hover:bg-gray-700 rounded transition-colors"
                        >
                          <Trash2 className="h-3 w-3 text-text-muted" />
                        </button>
                      </div>
                    )}
                  </div>

                  <h3 className="font-medium text-text-primary mb-1">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-text-muted mb-2 line-clamp-2">{item.description}</p>
                  )}

                  <div className="space-y-1 text-sm">
                    {item.value && (
                      <div className="flex items-center gap-2 text-text-muted">
                        <DollarSign className="h-3 w-3" />
                        ${item.value.toLocaleString()}
                      </div>
                    )}
                    {item.purchase_date && (
                      <div className="flex items-center gap-2 text-text-muted">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.purchase_date).toLocaleDateString()}
                      </div>
                    )}
                    {item.serial_number && (
                      <div className="text-text-muted text-xs">
                        S/N: {item.serial_number}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-background-secondary border border-gray-600/30 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-primary">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-primary">Category</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-primary">Location</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-primary">Value</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-primary">Purchase Date</th>
                    {user?.role === 'admin' && <th className="px-4 py-3 text-left text-sm font-medium text-text-primary">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-text-primary">{item.name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${itemCategoryColors[item.category]}`}>
                          {itemCategoryIcons[item.category]}
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${locationColors[item.location]}`}>
                          {item.location}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">
                        {item.value ? `$${item.value.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">
                        {item.purchase_date ? new Date(item.purchase_date).toLocaleDateString() : '-'}
                      </td>
                      {user?.role === 'admin' && (
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingItem(item)}
                              className="text-text-muted hover:text-text-primary transition-colors"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-text-muted hover:text-text-primary transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredItems.length === 0 && (
            <div className="text-center py-8 text-text-muted">
              No items found. Try adjusting your search or filters.
            </div>
          )}
        </div>
      )}

      {/* Property Modal */}
      {(showCreatePropertyModal || editingProperty) && (
        <PropertyModal
          property={editingProperty}
          onClose={() => {
            setShowCreatePropertyModal(false);
            setEditingProperty(null);
          }}
          onSave={(property) => {
            if (editingProperty) {
              handleUpdateProperty(editingProperty.id, property);
            } else {
              handleCreateProperty(property);
            }
          }}
        />
      )}

      {(showCreateModal || editingContact) && (
        <UnifiedContactModal
          open={showCreateModal || Boolean(editingContact)}
          mode={editingContact ? 'edit' : 'create'}
          defaults={contactModalDefaults}
          initialValues={editingContact ? mapHouseholdContactToFormValues(editingContact) : undefined}
          visibility={HOUSEHOLD_MODAL_VISIBILITY}
          optionSelectors={{ categories: HOUSEHOLD_SERVICE_LABELS }}
          labels={{ categoryLabel: 'Service Category' }}
          busy={savingContact || loading}
          onSubmit={handleContactSubmit}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingContact(null);
          }}
        />
      )}

      {/* Item Modal */}
      {(showCreateItemModal || editingItem) && (
        <ItemModal
          item={editingItem}
          onClose={() => {
            setShowCreateItemModal(false);
            setEditingItem(null);
          }}
          onSave={(item) => {
            if (editingItem) {
              handleUpdateItem(editingItem.id, item);
            } else {
              handleCreateItem(item);
            }
          }}
        />
      )}
    </div>
  );
}

// Property Modal Component
function PropertyModal({ 
  property, 
  onClose, 
  onSave 
}: { 
  property: Property | null;
  onClose: () => void;
  onSave: (property: Partial<Property>) => void;
}) {
  const [formData, setFormData] = useState({
    name: property?.name || '',
    address: property?.address || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary border border-gray-600 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          {property ? 'Edit Property' : 'Add Property'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Property Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Address
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-button-create hover:bg-button-create/90 text-white rounded-lg transition-colors"
            >
              {property ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Item Modal Component
function ItemModal({ 
  item, 
  onClose, 
  onSave 
}: { 
  item: InventoryItem | null;
  onClose: () => void;
  onSave: (item: Partial<InventoryItem>) => void;
}) {
  const [formData, setFormData] = useState({
    name: item?.name || '',
    category: item?.category || 'other' as ItemCategory,
    location: item?.location || 'other' as ItemLocation,
    value: item?.value?.toString() || '',
    purchase_date: item?.purchase_date || '',
    description: item?.description || '',
    serial_number: item?.serial_number || '',
    notes: item?.notes || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      value: formData.value ? parseFloat(formData.value) : undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary border border-gray-600 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          {item ? 'Edit Item' : 'Add Item'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as ItemCategory })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
              >
                <option value="electronics">Electronics</option>
                <option value="valuables">Valuables</option>
                <option value="household">Household</option>
                <option value="documents">Documents</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Location
              </label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value as ItemLocation })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
              >
                <option value="unit1">Unit 1</option>
                <option value="unit2">Unit 2</option>
                <option value="unit3">Unit 3</option>
                <option value="home">Home</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Value ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Serial Number
            </label>
            <input
              type="text"
              value={formData.serial_number}
              onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-button-create hover:bg-button-create/90 text-white rounded-lg transition-colors"
            >
              {item ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
