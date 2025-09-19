'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

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
  notes?: string;
  website?: string;
  portal_url?: string;
  portal_username?: string;
  portal_password?: string;
  is_emergency: boolean;
  is_archived: boolean;
}

interface FamilyMember {
  id: string;
  name: string;
}

interface ContactModalProps {
  contact: Contact | null;
  categories: string[];
  familyMembers: FamilyMember[];
  onSave: (contact: Partial<Contact>) => void;
  onClose: () => void;
}

export function ContactModal({
  contact,
  categories,
  familyMembers,
  onSave,
  onClose
}: ContactModalProps) {
  const [formData, setFormData] = useState<Partial<Contact>>({
    name: '',
    email: '',
    phone: '',
    address: '',
    company: '',
    category: categories[0] || 'Other',
    related_to: [],
    notes: '',
    website: '',
    portal_url: '',
    portal_username: '',
    portal_password: '',
    is_emergency: false,
    source_type: 'other'
  });

  useEffect(() => {
    if (contact) {
      setFormData({
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        address: contact.address || '',
        company: contact.company || '',
        category: contact.category || categories[0] || 'Other',
        related_to: contact.related_to || [],
        notes: contact.notes || '',
        website: contact.website || '',
        portal_url: contact.portal_url || '',
        portal_username: contact.portal_username || '',
        portal_password: contact.portal_password || '',
        is_emergency: contact.is_emergency || false,
        source_type: contact.source_type || 'other'
      });
    }
  }, [contact, categories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      alert('Please enter a contact name');
      return;
    }
    onSave(formData);
  };

  const handleRelatedToToggle = (memberId: string) => {
    const currentRelated = formData.related_to || [];
    if (currentRelated.includes(memberId)) {
      setFormData({
        ...formData,
        related_to: currentRelated.filter(id => id !== memberId)
      });
    } else {
      setFormData({
        ...formData,
        related_to: [...currentRelated, memberId]
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-text-primary">
              {contact ? 'Edit Contact' : 'Add New Contact'}
            </h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  placeholder="Contact name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Company
                </label>
                <input
                  type="text"
                  value={formData.company || ''}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  placeholder="Company or organization"
                />
              </div>
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Address
              </label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                placeholder="123 Main St, City, State 12345"
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Website
              </label>
              <input
                type="url"
                value={formData.website || ''}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                placeholder="https://example.com"
              />
            </div>

            {/* Category and Emergency */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Category
                </label>
                <select
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is-emergency"
                  checked={formData.is_emergency || false}
                  onChange={(e) => setFormData({ ...formData, is_emergency: e.target.checked })}
                  className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="is-emergency" className="ml-2 text-sm font-medium text-text-primary cursor-pointer">
                  Emergency Contact
                </label>
              </div>
            </div>

            {/* Portal Information */}
            <div className="border-t border-gray-600/30 pt-4">
              <h3 className="text-sm font-medium text-text-primary mb-3">Portal Access (Optional)</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">
                    Portal URL
                  </label>
                  <input
                    type="url"
                    value={formData.portal_url || ''}
                    onChange={(e) => setFormData({ ...formData, portal_url: e.target.value })}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                    placeholder="https://portal.example.com"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={formData.portal_username || ''}
                      onChange={(e) => setFormData({ ...formData, portal_username: e.target.value })}
                      className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Username"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">
                      Password
                    </label>
                    <input
                      type="text"
                      value={formData.portal_password || ''}
                      onChange={(e) => setFormData({ ...formData, portal_password: e.target.value })}
                      className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Password"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Related To */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Related To (Family Members)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {familyMembers.map(member => (
                  <label
                    key={member.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-600/30 hover:bg-background-tertiary cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.related_to?.includes(member.id) || false}
                      onChange={() => handleRelatedToToggle(member.id)}
                      className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-text-primary">{member.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                placeholder="Additional notes about this contact..."
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-600/30">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-text-muted bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-button-create hover:bg-button-create/90 text-white rounded-md transition-colors"
              >
                {contact ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}