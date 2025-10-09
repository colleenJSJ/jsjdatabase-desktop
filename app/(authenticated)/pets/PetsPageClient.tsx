"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PetDocumentUpload } from './PetDocumentUpload';
import { DocumentList } from '@/components/documents/document-list';
import dynamic from 'next/dynamic';
import PetAppointmentModal from './PetAppointmentModal';
import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactDetailModal } from '@/components/contacts/ContactDetailModal';
import { ContactModal as UnifiedContactModal } from '@/components/contacts/ContactModal';
import ViewPetAppointmentModal from './ViewPetAppointmentModal';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import { PawPrint, Stethoscope, Syringe, Scissors, Eye, EyeOff } from 'lucide-react';
import { PasswordCard } from '@/components/passwords/PasswordCard';
import { PasswordDetailModal } from '@/components/passwords/PasswordDetailModal';
import type { Password as SupabasePassword } from '@/lib/supabase/types';
import { getPasswordStrength } from '@/lib/passwords/utils';
import { Modal, ModalBody, ModalCloseButton, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { CredentialFormField } from '@/components/credentials/CredentialFormField';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { smartUrlComplete } from '@/lib/utils/url-helper';
import { useUser } from '@/contexts/user-context';
import type { PortalRecord } from '@/types/portals';
import type { ContactFormValues, ContactModalFieldVisibilityMap, ContactRecord } from '@/components/contacts/contact-types';
import { resolveEmails, resolvePhones, resolveAddresses } from '@/components/contacts/contact-utils';
import ApiClient from '@/lib/api/api-client';
import { Category } from '@/lib/categories/categories-client';
import { usePasswordSecurityOptional } from '@/contexts/password-security-context';

type UnknownRecord = Record<string, unknown>;
type Pet = { id: string; name: string; [key: string]: unknown };
type PetContactRaw = {
  id: string;
  name: string;
  contact_type?: string;
  contact_subtype?: string;
  practice?: string;
  clinic_name?: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  notes?: string;
  pets?: string[];
  petIds?: string[];
  pet_id?: string;
  related_to?: string[];
  description?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};
type PetAppointment = {
  id: string;
  title?: string;
  description?: string;
  pet_id?: string;
  petIds?: string[];
  pets?: string[];
  location?: string;
  start_time?: string;
  end_time?: string;
  appointment_date?: string;
  appointment_time?: string;
  appointment_type?: string;
  vet_name?: string | null;
  vet_phone?: string | null;
  additional_attendees?: string[];
  notify_attendees?: boolean;
  google_calendar_id?: string | null;
  [key: string]: unknown;
};

const TravelSearchFilter = dynamic(() => import('@/components/travel/TravelSearchFilter').then(m => m.TravelSearchFilter), { ssr: false });

const PET_CONTACT_MODAL_VISIBILITY: ContactModalFieldVisibilityMap = {
  assignedEntities: { hidden: true },
  tags: { hidden: true },
  portal: { hidden: true },
  favorite: { hidden: true },
  emergency: { hidden: true },
  preferred: { hidden: true },
};

const uniqueStringValues = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const set = new Set<string>();
  values.forEach(value => {
    if (typeof value === 'string' && value.trim()) {
      set.add(value.trim());
    }
  });
  return Array.from(set);
};

const collectPetIds = (contact: PetContactRaw): string[] => {
  const set = new Set<string>();
  uniqueStringValues(contact.pets).forEach(id => set.add(id));
  uniqueStringValues(contact.petIds).forEach(id => set.add(id));
  uniqueStringValues(contact.related_to).forEach(id => set.add(id));
  if (typeof contact.pet_id === 'string' && contact.pet_id.trim()) {
    set.add(contact.pet_id.trim());
  }
  return Array.from(set);
};

const sanitizeList = (...sources: unknown[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  const pushValue = (value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        output.push(trimmed);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(pushValue);
      return;
    }

    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(pushValue);
    }
  };

  sources.forEach(pushValue);
  return output;
};

const toNullable = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toPetContactRecord = (raw: PetContactRaw, subtype: 'vet' | 'other'): ContactRecord => {
  const related = collectPetIds(raw);
  const name = raw.name || raw.practice || raw.clinic_name || raw.company || 'Pet Contact';
  const company = raw.practice || raw.clinic_name || raw.company || null;

  return {
    id: raw.id,
    name,
    company,
    emails: sanitizeList(raw.emails, raw.email),
    phones: sanitizeList(raw.phones, raw.phone),
    addresses: sanitizeList(raw.addresses, raw.address),
    website: raw.website || null,
    notes: raw.notes || raw.description || null,
    category: 'Pets',
    contact_type: 'pets',
    contact_subtype: subtype,
    module: 'pets',
    source_type: 'pets',
    source_page: 'pets',
    related_to: related,
    pets: related,
    is_emergency: false,
    is_preferred: false,
    is_favorite: false,
    is_archived: false,
    created_by: typeof raw.created_by === 'string' ? raw.created_by : null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : null,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  } as ContactRecord;
};

export default function PetsPageClient() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [pets, setPets] = useState<Pet[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [vets, setVets] = useState<PetContactRaw[]>([]);
  const [portals, setPortals] = useState<PortalRecord[]>([]);
  const [appointments, setAppointments] = useState<PetAppointment[]>([]);
  const [refreshDocs, setRefreshDocs] = useState(0);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'appointments'|'contacts'|'portals'|'documents'|'pets'>('appointments');
  const [selectedPetId, setSelectedPetId] = useState<string>('all');
  const [showAddAppointment, setShowAddAppointment] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<PetAppointment | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [showAddPortal, setShowAddPortal] = useState(false);
  const [editingPortal, setEditingPortal] = useState<PortalRecord | null>(null);
  const { calendars: googleCalendars } = useGoogleCalendars();
  const [viewingContact, setViewingContact] = useState<ContactRecord | null>(null);
  const [viewingPassword, setViewingPassword] = useState<SupabasePassword | null>(null);
  const [viewingPortal, setViewingPortal] = useState<PortalRecord | null>(null);
  const { updateActivity } = usePasswordSecurityOptional();

  const portalUsers = useMemo(() => {
    const base = pets.map(pet => ({
      id: pet.id,
      email: '',
      name: pet.name || 'Pet'
    }));
    return [...base, { id: 'shared', email: '', name: 'Shared' }];
  }, [pets]);
  const canManagePortals = user?.role === 'admin';
  const canManageContacts = false;

  const openPortalDetail = (password: SupabasePassword, portal: PortalRecord) => {
    updateActivity();
    setViewingPortal(portal);
    setViewingPassword(password);
  };

  const renderContactCard = (contact: ContactRecord) => {
    const badges = contact.contact_subtype === 'vet'
      ? [{ id: `${contact.id}-vet`, label: 'Vet', tone: 'primary' as const }]
      : [];

    return (
      <ContactCard
        key={contact.id}
        contact={contact}
        subtitle={contact.company ?? undefined}
        badges={badges}
        showFavoriteToggle={false}
        canManage={canManageContacts}
        onOpen={() => setViewingContact(contact)}
      />
    );
  };

  const contactModalDefaults = useMemo(() => ({
    category: 'Vet',
    contactSubtype: 'vet',
    sourceType: 'pets' as const,
    sourcePage: 'pets',
    relatedToIds: selectedPetId !== 'all' ? [selectedPetId] : [],
    petIds: selectedPetId !== 'all' ? [selectedPetId] : [],
  }), [selectedPetId]);

  const mapPetContactToFormValues = (contact: ContactRecord): Partial<ContactFormValues> => ({
    id: contact.id,
    name: contact.name,
    company: contact.company ?? undefined,
    emails: resolveEmails(contact),
    phones: resolvePhones(contact),
    addresses: resolveAddresses(contact),
    website: contact.website ?? undefined,
    notes: contact.notes ?? undefined,
    related_to: contact.pets ?? contact.related_to ?? [],
    pets: contact.pets ?? contact.related_to ?? [],
    category: contact.contact_subtype === 'vet' ? 'Vet' : 'Other',
    contact_subtype: contact.contact_subtype ?? undefined,
  });

  const relatedEntityOptions = useMemo(
    () => pets.map(pet => ({ id: pet.id, label: pet.name || 'Pet' })),
    [pets]
  );

  const familyMembersForModal = useMemo(
    () => pets.map(pet => ({ id: pet.id, name: pet.name || 'Pet' })),
    [pets]
  );

  const handleContactSubmit = async (values: ContactFormValues) => {
    try {
      setSavingContact(true);
      const category = (values.category || '').toLowerCase();
      const subtype = category.includes('vet') ? 'vet' : 'other';
      const petIds = values.related_to.length > 0 ? values.related_to : values.pets;

      const emails = sanitizeList(values.emails);
      const phones = sanitizeList(values.phones);
      const addresses = sanitizeList(values.addresses);

      if (editingContact && editingContact.contact_subtype === 'vet') {
        const payload = {
          name: values.name,
          clinic_name: values.company || values.name,
          practice: values.company || '',
          phone: phones[0] ?? null,
          email: emails[0] ?? null,
          address: addresses[0] ?? null,
          website: toNullable(values.website),
          notes: toNullable(values.notes),
          pets: petIds,
        };
        const response = await ApiClient.put(`/api/vets/${editingContact.id}`, payload);
        if (!response.success) throw new Error(response.error || 'Failed to save contact');
      } else if (editingContact && editingContact.contact_subtype !== 'vet') {
        const payload = {
          name: values.name,
          company: values.company || null,
          emails,
          phones,
          addresses,
          website: toNullable(values.website),
          notes: toNullable(values.notes),
          pets: petIds,
          contact_subtype: subtype,
        };
        const response = await ApiClient.put(`/api/pet-contacts/${editingContact.id}`, payload);
        if (!response.success) throw new Error(response.error || 'Failed to save contact');
      } else if (subtype === 'vet') {
        const payload = {
          name: values.name,
          clinic_name: values.company || values.name,
          practice: values.company || '',
          phone: phones[0] ?? null,
          email: emails[0] ?? null,
          address: addresses[0] ?? null,
          website: toNullable(values.website),
          notes: toNullable(values.notes),
          pets: petIds,
        };
        const response = await ApiClient.post('/api/vets', payload);
        if (!response.success) throw new Error(response.error || 'Failed to create vet contact');
      } else {
        const payload = {
          name: values.name,
          company: values.company || null,
          emails,
          phones,
          addresses,
          website: toNullable(values.website),
          notes: toNullable(values.notes),
          pets: petIds,
          contact_subtype: 'other',
        };
        const response = await ApiClient.post('/api/pet-contacts', payload);
        if (!response.success) throw new Error(response.error || 'Failed to create contact');
      }

      await loadData();
      setShowAddContact(false);
      setEditingContact(null);
    } catch (error) {
      console.error('[Pets] Failed to save contact', error);
      alert(error instanceof Error ? error.message : 'Failed to save contact');
    } finally {
      setSavingContact(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [petsRes, vetsRes, contactsRes, portalsRes, apptRes] = await Promise.all([
        fetch('/api/pets').then(r => r.ok ? r.json() : { pets: [] }),
        fetch('/api/vets').then(r => r.ok ? r.json() : { vets: [] }),
        fetch('/api/pet-contacts').then(r => r.ok ? r.json() : { contacts: [] }),
        fetch('/api/pet-portals').then(r => r.ok ? r.json() : { portals: [] }),
        fetch('/api/pets/appointments').then(r => r.ok ? r.json() : { appointments: [] }),
      ]);

      setPets(Array.isArray(petsRes.pets) ? petsRes.pets as Pet[] : []);

      const vetContactsRaw: PetContactRaw[] = Array.isArray(vetsRes.vets)
        ? (vetsRes.vets as UnknownRecord[]).reduce<PetContactRaw[]>((acc, vet) => {
            const id = typeof vet.id === 'string' ? vet.id : undefined;
            if (!id) return acc;
            const name = (vet.name as string | undefined) || (vet.clinic_name as string | undefined) || 'Veterinary Contact';
            acc.push({
              ...(vet as UnknownRecord),
              id,
              name,
              contact_type: 'vet',
              contact_subtype: 'vet',
            } as PetContactRaw);
            return acc;
          }, [])
        : [];

      const otherContactsRaw: PetContactRaw[] = Array.isArray(contactsRes.contacts)
        ? (contactsRes.contacts as UnknownRecord[]).reduce<PetContactRaw[]>((acc, contact) => {
            const id = typeof contact.id === 'string' ? contact.id : undefined;
            if (!id) return acc;
            const subtype = (contact.contact_subtype as string | undefined) || 'other';
            acc.push({
              ...(contact as UnknownRecord),
              id,
              contact_type: subtype,
              contact_subtype: subtype,
            } as PetContactRaw);
            return acc;
          }, [])
        : [];

      setVets(vetContactsRaw);
      const combinedContacts = [
        ...vetContactsRaw.map(contact => toPetContactRecord(contact, 'vet')),
        ...otherContactsRaw.map(contact => toPetContactRecord(contact, 'other')),
      ];
      setContacts(combinedContacts);
      setPortals(Array.isArray(portalsRes.portals) ? portalsRes.portals : []);
      setAppointments(Array.isArray(apptRes.appointments) ? apptRes.appointments : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeletePortal = useCallback(async (portalId?: string) => {
    if (!portalId) return;
    if (!confirm('Delete this pet portal?')) return;
    const response = await ApiClient.delete(`/api/pet-portals/${portalId}`);
    if (!response.success) {
      alert(response.error || 'Failed to delete portal');
      return;
    }
    if (editingPortal?.id === portalId) {
      setEditingPortal(null);
    }
    await loadData();
  }, [loadData, editingPortal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatAppointmentDate = (start?: string | null, fallbackDate?: string | null, fallbackTime?: string | null) => {
    const source = start || (fallbackDate ? `${fallbackDate}${fallbackTime ? `T${fallbackTime}` : 'T00:00:00'}` : undefined);
    if (!source) return 'Date to be scheduled';
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) return 'Date to be scheduled';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getAppointmentDateForCountdown = (appointment: PetAppointment): string | null => {
    if (appointment.start_time) return appointment.start_time as string;
    if (appointment.appointment_date) {
      const time = (appointment.appointment_time as string | undefined)?.slice(0, 8) || '00:00:00';
      return `${appointment.appointment_date}T${time}`;
    }
    return null;
  };

  const daysUntil = (dateTime?: string | null) => {
    if (!dateTime) return null;
    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = Math.ceil((startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const formatPetNames = (names: string[]) => {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  };

  const describeAppointment = (appointment: PetAppointment, petNames: string[], location?: string, vetName?: string | null) => {
    const names = formatPetNames(petNames);
    const hasMultiple = petNames.length > 1;
    const rawType = (appointment.appointment_type || appointment.title || 'appointment') as string;
    const normalizedType = rawType.replace(/_/g, ' ');
    const typeLower = normalizedType.toLowerCase();
    const article = /^[aeiou]/.test(typeLower) ? 'an' : 'a';
    let sentence = `${names || 'Your pet'} ${hasMultiple ? 'have' : 'has'} ${article} ${typeLower}`;
    if (vetName) {
      sentence += ` with ${vetName}`;
    }
    if (location) {
      sentence += ` at ${location}`;
    }
    const extra = (appointment.description as string | undefined)?.trim();
    if (extra) {
      sentence += `. ${extra}`;
    } else {
      sentence += '.';
    }
    return sentence;
  };

  const appointmentIconForType = (type?: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('vet') || t.includes('doctor')) {
      return <Stethoscope className="w-4 h-4 text-blue-400" />;
    }
    if (t.includes('vaccine') || t.includes('shot') || t.includes('vaccination')) {
      return <Syringe className="w-4 h-4 text-blue-400" />;
    }
    if (t.includes('groom')) {
      return <Scissors className="w-4 h-4 text-blue-400" />;
    }
    return <PawPrint className="w-4 h-4 text-blue-400" />;
  };

  const term = search.trim().toLowerCase();
  const filtered = useMemo((): {
    pets: Pet[];
    contacts: ContactRecord[];
    portals: PortalRecord[];
    appointments: PetAppointment[];
  } => {
    const contactsMatch = contacts.filter(contact => {
      const haystack = [
        contact.name,
        contact.company ?? '',
        contact.notes ?? '',
        ...resolveEmails(contact),
        ...resolvePhones(contact),
        ...resolveAddresses(contact),
        contact.website ?? '',
      ];
      const matchesQuery = term ? haystack.some(value => value.toLowerCase().includes(term)) : true;
      if (!matchesQuery) return false;

      if (selectedPetId === 'all') return true;
      return (contact.pets ?? contact.related_to ?? []).includes(selectedPetId);
    });

    const petsMatch = pets.filter(pet => (pet.name || '').toLowerCase().includes(term));

    const portalsMatch = portals
      .filter(portal => (portal.portal_name || portal.provider_name || '').toLowerCase().includes(term))
      .filter(portal => {
        if (selectedPetId === 'all') return true;
        return portal.entity_id === selectedPetId;
      });

    const appointmentsMatch = appointments
      .filter(appointment => ((appointment.title || appointment.description || '') as string).toLowerCase().includes(term))
      .filter(appointment => {
        if (selectedPetId === 'all') return true;
        const petName = pets.find(pet => pet.id === selectedPetId)?.name?.toLowerCase() || '';
        const descriptionText = (appointment.description as string | undefined)?.toLowerCase() || '';
        const idMatches = [
          appointment.pet_id,
          ...(Array.isArray(appointment.petIds) ? appointment.petIds : []),
          ...(Array.isArray(appointment.pets) ? appointment.pets : []),
        ]
          .filter(Boolean)
          .some(value => value === selectedPetId);
        return idMatches || descriptionText.includes(petName);
      });

    return {
      pets: petsMatch,
      contacts: contactsMatch,
      portals: portalsMatch,
      appointments: appointmentsMatch,
    };
  }, [pets, contacts, portals, appointments, term, selectedPetId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-text-primary">Pet Care</h1>
      </div>
      <TravelSearchFilter
        onSearchChange={setSearch}
        placeholder="Search pets for appointments, contacts, portals..."
        customOptions={pets.map(p => ({ id: p.id, label: p.name || 'Pet' }))}
        selectedOption={selectedPetId}
        onOptionChange={setSelectedPetId}
      />
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-600/30">
        {([
          { key: 'appointments', label: 'Appointments' },
          { key: 'contacts', label: 'Contacts' },
          { key: 'portals', label: 'Passwords & Portals' },
          { key: 'documents', label: 'Documents' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-sm border-b-2 ${activeTab===tab.key ? 'border-primary-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {activeTab==='contacts' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-text-primary">Contacts</h2>
                <button
                  onClick={() => {
                    setEditingContact(null);
                    setShowAddContact(true);
                  }}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
                >
                  Add Contact
                </button>
              </div>
              {filtered.contacts.length === 0 ? (
                <div className="text-sm text-text-muted">No contacts</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {filtered.contacts.map(contact => renderContactCard(contact))}
                </div>
              )}
            </section>
          )}
          {activeTab==='portals' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-text-primary">Portals</h2>
                <button
                  onClick={() => {
                    setEditingPortal(null);
                    setShowAddPortal(true);
                  }}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
                >
                  Add Portal
                </button>
              </div>
              {filtered.portals.length === 0 ? (
                <div className="text-sm text-text-muted">No portals</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filtered.portals.map((portal, index) => {
                    const portalId = (portal.id as string | undefined) ?? `portal-${index}`;
                    const portalName = (portal.portal_name || portal.provider_name || 'Portal').trim();
                    const portalUrl = portal.portal_url || '';
                    const portalUsername = portal.username || '';
                    const portalPassword = portal.password || '';
                    const notes = portal.notes || '';
                    const rawPetIds = [
                      typeof portal.entity_id === 'string' ? portal.entity_id : undefined
                    ].filter(Boolean) as string[];
                    const uniquePetIds = Array.from(new Set(rawPetIds));
                    const relatedPetNames = uniquePetIds
                      .map(id => pets.find(p => p.id === id)?.name)
                      .filter((name): name is string => Boolean(name));

                    const nowIso = new Date().toISOString();
                    const passwordId = (portal as any).password_id || portalId;
                    const sharedWith = uniquePetIds.map(id => String(id));
                    const passwordRecord: SupabasePassword = {
                      id: passwordId,
                      title: portalName,
                      username: portalUsername,
                      password: portalPassword,
                      url: portalUrl || undefined,
                      category: 'pet-portal' as any,
                      notes: notes || undefined,
                      created_by: portal.created_by || user?.id || 'shared',
                      created_at: portal.created_at || nowIso,
                      updated_at: portal.updated_at || nowIso,
                      owner_id: 'shared',
                      shared_with: sharedWith,
                      is_favorite: Boolean((portal as any).is_favorite),
                      is_shared: sharedWith.length > 1,
                      last_changed: portal.updated_at || nowIso,
                      source: 'pets',
                      source_page: 'pets',
                      source_reference: portal.id ?? null,
                    };

                    const extraContent = notes
                      ? <p className="text-xs text-text-muted/80 italic">{notes}</p>
                      : null;

                    return (
                      <PasswordCard
                        key={portalId}
                        password={passwordRecord}
                        categories={[]}
                        users={portalUsers}
                        subtitle={null}
                        assignedToLabel={relatedPetNames.length > 0 ? relatedPetNames.join(', ') : 'Shared'}
                        extraContent={extraContent}
                        showFavoriteToggle={false}
                        strengthOverride={getPasswordStrength(portalPassword)}
                        canManage={canManagePortals}
                        onEdit={() => {
                          setEditingPortal(portal);
                          setShowAddPortal(true);
                        }}
                        onDelete={() => handleDeletePortal(portal.id as string | undefined)}
                        onOpen={() => openPortalDetail(passwordRecord, portal)}
                        variant="compact"
                      />
                    );
                  })}
                </div>
                    )}
            </section>
          )}
          {activeTab==='appointments' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-text-primary">Upcoming Appointments</h2>
                <button
                  onClick={() => setShowAddAppointment(true)}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
                >
                  Add Appointment
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {filtered.appointments.map((appointment) => {
                  const petIdSet = Array.from(
                    new Set([
                      ...(Array.isArray(appointment.petIds) ? appointment.petIds : []),
                      ...(Array.isArray(appointment.pets) ? appointment.pets : []),
                      appointment.pet_id || undefined,
                    ].filter(Boolean) as string[])
                  );
                  const petNames = petIdSet
                    .map(id => pets.find(p => p.id === id)?.name)
                    .filter(Boolean) as string[];
                  const dateDisplay = formatAppointmentDate(
                    appointment.start_time as string | undefined,
                    appointment.appointment_date as string | undefined,
                    appointment.appointment_time as string | undefined
                  );
                  const locationDisplay = (appointment.location as string | undefined) || undefined;
                  const vetName = appointment.vet_name as string | undefined;
                  const typeLabel = (appointment.appointment_type as string | undefined)?.replace(/_/g, ' ');
                  const header = (appointment.title && String(appointment.title).trim().length > 0)
                    ? String(appointment.title)
                    : (typeLabel ? typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1) : 'Pet Appointment');
                  const summary = describeAppointment(appointment, petNames, locationDisplay, vetName);
                  const countdown = daysUntil(getAppointmentDateForCountdown(appointment));

                  return (
                    <button
                      key={appointment.id}
                      onClick={() => setSelectedAppointment(appointment)}
                      className="text-left rounded-xl border border-gray-600/30 p-4 transition-colors hover:border-gray-500"
                      style={{ backgroundColor: '#30302e' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 rounded-full bg-blue-400/10 p-2">
                            {appointmentIconForType(appointment.appointment_type as string | undefined)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-text-primary capitalize">
                              {header}
                            </div>
                            <p className="mt-1 text-xs text-text-muted leading-relaxed">
                              {summary}
                            </p>
                            {countdown !== null && (
                              <div className="mt-1 text-xs text-travel font-semibold">
                                {countdown === 0 ? 'Today' : countdown === 1 ? '1 day' : `${countdown} days`}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-xs text-text-muted whitespace-nowrap">
                          {dateDisplay}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {filtered.appointments.length === 0 && (
                <div className="py-6 text-center text-text-muted">No appointments scheduled</div>
              )}
            </section>
          )}
          {activeTab==='documents' && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-text-primary">Documents</h2>
                <PetDocumentUpload pets={pets} selectedPetId={selectedPetId} onUploadSuccess={() => setRefreshDocs(x => x + 1)} />
              </div>
              <DocumentList category="pets" sourcePage="Pets" refreshKey={refreshDocs} />
            </section>
          )}
        </div>
      )}

      {/* Modals */}
      {viewingPassword && viewingPortal && (
        <PasswordDetailModal
          password={viewingPassword}
          categories={[
            {
              id: 'pet-portal',
              name: 'Pet Portal',
              color: '#f97316',
              module: 'passwords',
              created_at: viewingPortal.created_at || new Date().toISOString(),
              updated_at: viewingPortal.updated_at || new Date().toISOString(),
              icon: undefined,
            } as Category,
          ]}
          users={portalUsers}
          familyMembers={familyMembersForModal}
          canManage={canManagePortals}
          onClose={() => {
            setViewingPassword(null);
            setViewingPortal(null);
          }}
          onEdit={() => {
            setViewingPassword(null);
            if (viewingPortal) {
              setEditingPortal(viewingPortal);
              setShowAddPortal(true);
            }
          }}
          onDelete={async () => {
            if (viewingPortal?.id) {
              await handleDeletePortal(viewingPortal.id as string | undefined);
            }
            setViewingPassword(null);
            setViewingPortal(null);
          }}
        />
      )}

      {showAddAppointment && (
        <PetAppointmentModal
          pets={pets}
          vets={vets}
          onClose={() => setShowAddAppointment(false)}
          onSaved={async () => {
            setShowAddAppointment(false);
            await loadData();
          }}
        />
      )}
      {showAddContact && (
        <UnifiedContactModal
          open={showAddContact}
          mode={editingContact ? 'edit' : 'create'}
          defaults={contactModalDefaults}
          initialValues={editingContact ? mapPetContactToFormValues(editingContact) : undefined}
          visibility={PET_CONTACT_MODAL_VISIBILITY}
          labels={{
            companyLabel: 'Clinic / Company',
            relatedToLabel: 'Related Pets',
            categoryLabel: 'Contact Type',
          }}
          optionSelectors={{
            categories: ['Vet', 'Other'],
            relatedEntities: relatedEntityOptions,
          }}
          busy={savingContact}
          submitLabel={editingContact ? 'Save changes' : 'Create contact'}
          onSubmit={handleContactSubmit}
          onCancel={() => {
            setShowAddContact(false);
            setEditingContact(null);
          }}
        />
      )}

      {viewingContact && (
        <ContactDetailModal
          contact={viewingContact}
          familyMembers={familyMembersForModal}
          canManage={canManageContacts}
          onClose={() => setViewingContact(null)}
          onEdit={canManageContacts ? () => {
            setEditingContact(viewingContact);
            setShowAddContact(true);
            setViewingContact(null);
          } : undefined}
        />
      )}
      {showAddPortal && (
        <AddPetPortalModal
          pets={pets}
          selectedPetId={selectedPetId}
          editingPortal={editingPortal}
          onClose={() => {
            setShowAddPortal(false);
            setEditingPortal(null);
          }}
          onSaved={async () => {
            await loadData();
            setEditingPortal(null);
          }}
        />
      )}
      {selectedAppointment && (
        <ViewPetAppointmentModal
          appointment={selectedAppointment}
          pets={pets}
          googleCalendars={googleCalendars}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}

function AddPetPortalModal({
  pets,
  selectedPetId,
  editingPortal,
  onClose,
  onSaved,
}: {
  pets: { id: string; name?: string | null }[];
  selectedPetId: string;
  editingPortal: PortalRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [formData, setFormData] = useState({
    title: '',
    petId: '',
    username: '',
    password: '',
    url: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLength, setPasswordLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const isEditing = Boolean(editingPortal);

  useEffect(() => {
    const defaultPetId = (() => {
      if (selectedPetId !== 'all' && pets.some(pet => pet.id === selectedPetId)) {
        return selectedPetId;
      }
      return pets[0]?.id || '';
    })();

    if (editingPortal) {
      setFormData({
        title: (editingPortal.portal_name || editingPortal.provider_name || '').trim(),
        petId: typeof editingPortal.entity_id === 'string' ? editingPortal.entity_id : defaultPetId,
        username: editingPortal.username || '',
        password: editingPortal.password || '',
        url: editingPortal.portal_url || '',
        notes: editingPortal.notes || '',
      });
    } else {
      setFormData({
        title: '',
        petId: defaultPetId,
        username: '',
        password: '',
        url: '',
        notes: '',
      });
    }
  }, [pets, selectedPetId, editingPortal]);

  const passwordStrength = getPasswordStrength(formData.password || '');

  const generatePassword = () => {
    let charset = '';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) {
      charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    }

    let password = '';
    for (let i = 0; i < passwordLength; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setFormData(prev => ({ ...prev, password }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.petId) {
      alert('Please enter a title and select a pet.');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = editingPortal ? `/api/pet-portals/${editingPortal.id}` : '/api/pet-portals';
      const method = editingPortal ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          petId: formData.petId,
          username: formData.username,
          password: formData.password,
          url: formData.url,
          notes: formData.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save portal');
      }

      await onSaved();
      onClose();
    } catch (error) {
      console.error('Error saving pet portal:', error);
      alert('Failed to save portal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      ariaLabel={isEditing ? 'Edit pet portal' : 'Add pet portal'}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <ModalHeader>
          <div className="flex w-full items-start justify-between gap-4">
            <ModalTitle>{isEditing ? 'Edit Pet Portal' : 'Add Pet Portal'}</ModalTitle>
            <ModalCloseButton onClose={onClose} />
          </div>
        </ModalHeader>

        <ModalBody className="space-y-5">
          <CredentialFormField id="pet-portal-title" label="Title" required>
            <input
              id="pet-portal-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="e.g., Vet Portal"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="pet-portal-pet" label="Pet" required>
            <select
              id="pet-portal-pet"
              value={formData.petId}
              onChange={(e) => setFormData({ ...formData, petId: e.target.value })}
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            >
              {pets.length === 0 && <option value="">No pets available</option>}
              {pets.map(pet => (
                <option key={pet.id} value={pet.id}>
                  {pet.name || 'Pet'}
                </option>
              ))}
            </select>
          </CredentialFormField>

          <CredentialFormField id="pet-portal-username" label="Username">
            <input
              id="pet-portal-username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Username or email"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="pet-portal-password" label="Password">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="pet-portal-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Password"
                  className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 pr-10 text-white focus:outline-none focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
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
              >
                Generate
              </button>
            </div>
          </CredentialFormField>

          <div className="space-y-3 rounded-xl border border-neutral-600 bg-neutral-800/60 p-4">
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
                  onCheckedChange={(checked) => setIncludeUppercase(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Uppercase</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeLowercase}
                  onCheckedChange={(checked) => setIncludeLowercase(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Lowercase</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeNumbers}
                  onCheckedChange={(checked) => setIncludeNumbers(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Numbers</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeSymbols}
                  onCheckedChange={(checked) => setIncludeSymbols(Boolean(checked))}
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

          <CredentialFormField
            id="pet-portal-url"
            label="URL"
            helperText={formData.url ? `Will be saved as: ${smartUrlComplete(formData.url)}` : undefined}
          >
            <input
              id="pet-portal-url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="example.com or https://example.com"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="pet-portal-notes" label="Notes">
            <textarea
              id="pet-portal-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Any additional information about this portal"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>
        </ModalBody>

        <ModalFooter className="gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-md border border-neutral-600 bg-neutral-700 px-4 py-2 text-white transition-colors hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-70 sm:flex-initial"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !formData.title || !formData.petId}
            className="flex-1 rounded-md bg-button-create px-4 py-2 text-white transition-colors hover:bg-button-create/90 disabled:cursor-not-allowed disabled:bg-neutral-600 sm:flex-initial"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Portal'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
