'use client';

import { useState } from 'react';
import { X, PawPrint, Phone, Mail, MapPin, Building2 } from 'lucide-react';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';

interface PetContactModalProps {
  pets: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const contactTypes = [
  { value: 'vet', label: 'Veterinarian' },
  { value: 'other', label: 'Other' },
];

export default function PetContactModal({ pets, onClose, onSaved }: PetContactModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [contactType, setContactType] = useState<'vet' | 'other'>('vet');
  const [selectedPets, setSelectedPets] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    practice: '',
    company: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    notes: '',
  });

  const togglePet = (petId: string) => {
    setSelectedPets(prev => prev.includes(petId)
      ? prev.filter(id => id !== petId)
      : [...prev, petId]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    try {
      setSubmitting(true);
      const ApiClient = (await import('@/lib/api/api-client')).default;

      if (contactType === 'vet') {
        const payload = {
          name: formData.name,
          clinic_name: formData.practice || formData.company || formData.name,
          practice: formData.practice || formData.company || '',
          phone: formData.phone || null,
          email: formData.email || null,
          address: formData.address || null,
          website: formData.website || null,
          notes: formData.notes || null,
          pets: selectedPets,
        };
        const response = await ApiClient.post('/api/vets', payload);
        if (!response.success) throw new Error(response.error || 'Failed to create vet contact');
      } else {
        const payload = {
          name: formData.name,
          company: formData.company || formData.practice || null,
          phone: formData.phone || null,
          email: formData.email || null,
          address: formData.address || null,
          website: formData.website || null,
          notes: formData.notes || null,
          pets: selectedPets,
          contact_subtype: 'other',
        };
        const response = await ApiClient.post('/api/pet-contacts', payload);
        if (!response.success) throw new Error(response.error || 'Failed to create contact');
      }

      await onSaved();
    } catch (error) {
      console.error('[Pets] Failed to create contact', error);
      alert(error instanceof Error ? error.message : 'Failed to create contact');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-600/30 bg-background-secondary shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-600/40 px-6 py-4">
          <div className="flex items-center gap-2">
            <PawPrint className="h-5 w-5 text-teal-300" />
            <h2 className="text-lg font-semibold text-text-primary">Add Pet Contact</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-text-muted transition hover:bg-gray-700/40 hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid max-h-[80vh] grid-cols-1 gap-6 overflow-y-auto px-6 py-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-text-primary">Contact Type</label>
              <select
                value={contactType}
                onChange={(e) => {
                  const nextType = e.target.value as 'vet' | 'other';
                  setContactType(nextType);
                  setFormData(prev => ({
                    ...prev,
                    practice: nextType === 'vet' ? prev.practice || prev.company : '',
                    company: nextType === 'other' ? prev.company || prev.practice : '',
                  }));
                }}
                className="mt-1 w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                {contactTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Name *</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                placeholder={contactType === 'vet' ? 'Dr. Lynn Carter' : 'Happy Trails Boarding'}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">
                {contactType === 'vet' ? 'Clinic / Practice' : 'Company'}
              </label>
              <input
                value={contactType === 'vet' ? formData.practice : formData.company}
                onChange={(e) => setFormData({
                  ...formData,
                  practice: contactType === 'vet' ? e.target.value : formData.practice,
                  company: contactType === 'other' ? e.target.value : formData.company,
                })}
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                placeholder={contactType === 'vet' ? 'Animal Care Clinic' : 'Service name'}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm font-medium text-text-primary">
                <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> Phone</div>
                <input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </label>
              <label className="text-sm font-medium text-text-primary">
                <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</div>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Address</div>
              </label>
              <AddressAutocomplete
                value={formData.address}
                onChange={(value) => setFormData({ ...formData, address: value })}
                placeholder="Street, city, state"
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">
                <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Website</div>
              </label>
              <input
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://"
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-text-primary">Related Pets</label>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-gray-600/30 bg-background-primary p-3">
                {pets.map((pet) => (
                  <label key={pet.id} className="flex items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={selectedPets.includes(pet.id)}
                      onChange={() => togglePet(pet.id)}
                      className="rounded border-gray-600 bg-gray-800 text-primary-400 focus:ring-primary-400"
                    />
                    {pet.name}
                  </label>
                ))}
                {pets.length === 0 && <p className="col-span-2 text-xs text-text-muted">No pets available.</p>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={5}
                placeholder="Emergency contact details, specialties, after-hours availability…"
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
          </div>

          <div className="md:col-span-2 flex items-center justify-end gap-3 border-t border-gray-600/30 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-600/40 bg-background-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-background-primary/70"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-button-create px-4 py-2 text-sm font-semibold text-white transition hover:bg-button-create/90 disabled:cursor-not-allowed disabled:bg-gray-700"
            >
              {submitting ? 'Saving…' : 'Save Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
