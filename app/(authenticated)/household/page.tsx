'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';
import { 
  Home, Plus, Search, Phone, Mail, MapPin, 
  Wrench, Heart, Building2, Shield, Trash2, Edit2,
  Package, Calendar, DollarSign, Grid, List, Image,
  Download, Upload, Archive, FileText, Building,
  Zap, Trees, Hammer, Sparkles, AlertCircle
} from 'lucide-react';

// Property types
interface Property {
  id: string;
  name: string;
  address?: string;
  created_at: string;
}

// Contact types
type ContactCategory = 'plumbing' | 'electrical' | 'landscaping' | 'cleaning' | 'maintenance' | 'other';

interface HouseholdContact {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
  portal_url?: string;
  portal_username?: string;
  portal_password?: string;
  category: ContactCategory;
  is_emergency: boolean;
  created_at: string;
}

const contactCategoryIcons: Record<ContactCategory, React.ReactNode> = {
  plumbing: <Wrench className="h-4 w-4" />,
  electrical: <Zap className="h-4 w-4" />,
  landscaping: <Trees className="h-4 w-4" />,
  cleaning: <Sparkles className="h-4 w-4" />,
  maintenance: <Hammer className="h-4 w-4" />,
  other: <Building2 className="h-4 w-4" />,
};

const contactCategoryColors: Record<ContactCategory, string> = {
  plumbing: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  electrical: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  landscaping: 'bg-green-600/20 text-green-400 border-green-600/30',
  cleaning: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  maintenance: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  other: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
};

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

const itemCategoryIcons: Record<ItemCategory, React.ReactNode> = {
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
  const [contacts, setContacts] = useState<HouseholdContact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ContactCategory | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContact, setEditingContact] = useState<HouseholdContact | null>(null);
  
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
      setContacts(data.contacts || []);
    } catch (error) {
      showError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContact = async (contact: Partial<HouseholdContact>) => {
    setLoading(true);
    try {
      const response = await fetch('/api/household/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact)
      });
      if (!response.ok) throw new Error('Failed to create contact');
      
      // Auto-save portal credentials to passwords if provided
      if (contact.portal_username && contact.portal_password && contact.portal_url) {
        try {
          await fetch('/api/passwords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `${contact.company || contact.name} - Service Portal`,
              username: contact.portal_username,
              password: contact.portal_password,
              url: contact.portal_url,
              category: 'household',
              notes: `Service provider portal for ${contact.name}${contact.company ? ` (${contact.company})` : ''}\nCategory: ${contact.category}${contact.is_emergency ? '\nEmergency Contact' : ''}`,
              is_shared: true
            })
          });
        } catch (passwordError) {
          console.error('Failed to save portal credentials to passwords:', passwordError);
          // Don't fail the contact save if password save fails
        }
      }
      
      await fetchContacts();
      setShowCreateModal(false);
      showSuccess('Contact created successfully');
    } catch (error) {
      showError('Failed to create contact');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateContact = async (id: string, contact: Partial<HouseholdContact>) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/household/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact)
      });
      if (!response.ok) throw new Error('Failed to update contact');
      
      // Auto-save portal credentials to passwords if provided
      if (contact.portal_username && contact.portal_password && contact.portal_url) {
        try {
          await fetch('/api/passwords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `${contact.company || contact.name} - Service Portal`,
              username: contact.portal_username,
              password: contact.portal_password,
              url: contact.portal_url,
              category: 'household',
              notes: `Service provider portal for ${contact.name}${contact.company ? ` (${contact.company})` : ''}\nCategory: ${contact.category}${contact.is_emergency ? '\nEmergency Contact' : ''}`,
              is_shared: true
            })
          });
        } catch (passwordError) {
          console.error('Failed to save portal credentials to passwords:', passwordError);
          // Don't fail the contact update if password save fails
        }
      }
      
      await fetchContacts();
      setEditingContact(null);
      showSuccess('Contact updated successfully');
    } catch (error) {
      showError('Failed to update contact');
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
          const item = values.reduce((obj, val, index) => {
            const key = headers[index]?.toLowerCase().replace(' ', '_');
            obj[key] = val.replace(/"/g, '');
            return obj;
          }, {} as any);

          if (item.name) {
            await handleCreateItem({
              name: item.name,
              category: item.category || 'other',
              location: item.location || 'other',
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

  // Filter functions
  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contact.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contact.phone?.includes(searchTerm) ||
                         contact.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || contact.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
              onChange={(e) => setSelectedCategory(e.target.value as ContactCategory | 'all')}
              className="px-3 py-2 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
            >
              <option value="all">All Categories</option>
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="landscaping">Landscaping</option>
              <option value="cleaning">Cleaning</option>
              <option value="maintenance">Maintenance</option>
              <option value="other">Other</option>
            </select>
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Contact
              </button>
            )}
          </div>

          {/* Contacts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map(contact => (
              <div
                key={contact.id}
                className="bg-background-secondary border border-gray-600/30 rounded-xl p-4 hover:border-gray-500 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {contact.is_emergency && (
                      <span className="px-2 py-1 bg-red-600/20 text-red-400 text-xs font-medium rounded">
                        Emergency
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${contactCategoryColors[contact.category]}`}>
                      {contactCategoryIcons[contact.category]}
                      {contact.category}
                    </span>
                  </div>
                  {user?.role === 'admin' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingContact(contact)}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                      >
                        <Edit2 className="h-3 w-3 text-text-muted" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                      >
                        <Trash2 className="h-3 w-3 text-text-muted" />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="font-medium text-text-primary mb-1">{contact.name}</h3>
                {contact.company && (
                  <p className="text-sm text-text-muted mb-2">{contact.company}</p>
                )}

                <div className="space-y-1">
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </div>
                  )}
                  {contact.email && (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredContacts.length === 0 && (
            <div className="text-center py-8 text-text-muted">
              No contacts found. Try adjusting your search or filters.
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

      {/* Contact Modal */}
      {(showCreateModal || editingContact) && (
        <ContactModal
          contact={editingContact}
          onClose={() => {
            setShowCreateModal(false);
            setEditingContact(null);
          }}
          onSave={(contact) => {
            if (editingContact) {
              handleUpdateContact(editingContact.id, contact);
            } else {
              handleCreateContact(contact);
            }
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

// Contact Modal Component
function ContactModal({ 
  contact, 
  onClose, 
  onSave 
}: { 
  contact: HouseholdContact | null;
  onClose: () => void;
  onSave: (contact: Partial<HouseholdContact>) => void;
}) {
  const [formData, setFormData] = useState({
    name: contact?.name || '',
    company: contact?.company || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    website: contact?.website || '',
    portal_url: contact?.portal_url || '',
    portal_username: contact?.portal_username || '',
    portal_password: contact?.portal_password || '',
    category: contact?.category || 'other' as ContactCategory,
    is_emergency: contact?.is_emergency || false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary border border-gray-600 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          {contact ? 'Edit Contact' : 'Add Contact'}
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

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Company
            </label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Category
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as ContactCategory })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            >
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="landscaping">Landscaping</option>
              <option value="cleaning">Cleaning</option>
              <option value="maintenance">Maintenance</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Website
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://example.com"
              className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
            />
          </div>

          {/* Portal Credentials Section */}
          <div className="border-t border-gray-600/30 pt-4">
            <h3 className="text-sm font-medium text-text-primary mb-2">Portal Credentials (Optional)</h3>
            <p className="text-xs text-yellow-500 mb-3">Portal credentials will auto-sync to the Passwords page</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Portal URL
                </label>
                <input
                  type="url"
                  value={formData.portal_url}
                  onChange={(e) => setFormData({ ...formData, portal_url: e.target.value })}
                  placeholder="https://portal.example.com"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Portal Username
                </label>
                <input
                  type="text"
                  value={formData.portal_username}
                  onChange={(e) => setFormData({ ...formData, portal_username: e.target.value })}
                  placeholder="username@example.com"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Portal Password
                </label>
                <input
                  type="password"
                  value={formData.portal_password}
                  onChange={(e) => setFormData({ ...formData, portal_password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600 rounded-lg text-text-primary focus:outline-none focus:border-gray-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_emergency}
                onChange={(e) => setFormData({ ...formData, is_emergency: e.target.checked })}
                className="w-4 h-4 bg-background-primary border-gray-600 rounded"
              />
              <span className="text-sm font-medium text-text-primary">
                Emergency Contact
              </span>
            </label>
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
              {contact ? 'Update' : 'Create'}
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
