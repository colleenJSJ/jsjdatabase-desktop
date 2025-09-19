'use client';

import { useState, useEffect } from 'react';
import { X, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  editingContact?: any;
  children: { id: string; name: string }[];
  selectedChild: string;
}

export function ContactModal({
  isOpen,
  onClose,
  onSubmit,
  editingContact,
  children,
  selectedChild
}: ContactModalProps) {
  const [formData, setFormData] = useState({
    children: selectedChild !== 'all' ? [selectedChild] : [],
    contact_name: '',
    role: '',
    email: '',
    phone: '',
    category: 'teacher',
    notes: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingContact) {
      setFormData({
        children: editingContact.children || [],
        contact_name: editingContact.contact_name || '',
        role: editingContact.role || '',
        email: editingContact.email || '',
        phone: editingContact.phone || '',
        category: editingContact.category || 'teacher',
        notes: editingContact.notes || ''
      });
    } else {
      setFormData({
        children: selectedChild !== 'all' ? [selectedChild] : [],
        contact_name: '',
        role: '',
        email: '',
        phone: '',
        category: 'teacher',
        notes: ''
      });
    }
  }, [editingContact, selectedChild]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Error submitting contact:', error);
      alert(error instanceof Error ? error.message : 'Failed to save contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChildToggle = (childId: string, checked: boolean) => {
    if (checked) {
      setFormData({ ...formData, children: [...formData.children, childId] });
    } else {
      setFormData({ 
        ...formData, 
        children: formData.children.filter(id => id !== childId) 
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="flex justify-between items-center p-6 border-b border-gray-600/30">
          <h2 className="text-xl font-semibold text-gray-100">
            {editingContact ? 'Edit Contact' : 'Add Contact'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Users className="inline h-4 w-4 mr-1" />
              Associated Children
            </label>
            <div className="space-y-2 border border-gray-600/30 rounded-md p-3 bg-background-primary">
              {children.map((child) => (
                <div key={child.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`contact-child-${child.id}`}
                    checked={formData.children.includes(child.id)}
                    onCheckedChange={(checked) => 
                      handleChildToggle(child.id, checked as boolean)
                    }
                  />
                  <label
                    htmlFor={`contact-child-${child.id}`}
                    className="text-sm font-medium text-gray-300 cursor-pointer"
                  >
                    {child.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Contact Name *
              </label>
              <Input
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                required
                placeholder="e.g., Mrs. Smith"
                className="bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Role/Title
              </label>
              <Input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., Math Teacher"
                className="bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
          </div>

          {/* Category dropdown removed; Role/Title covers this context */}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@school.edu"
                className="bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Phone
              </label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-gray-700"
              rows={3}
              placeholder="Additional information..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-button-create hover:bg-button-create/90 text-white">
              {isSubmitting ? 'Saving...' : editingContact ? 'Update' : 'Add'} Contact
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
