"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PetDocumentUpload } from './PetDocumentUpload';
import { DocumentList } from '@/components/documents/document-list';
import dynamic from 'next/dynamic';
import PetAppointmentModal from './PetAppointmentModal';
import PetContactModal from './PetContactModal';
import ViewPetAppointmentModal from './ViewPetAppointmentModal';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import { PawPrint, Stethoscope, Syringe, Scissors } from 'lucide-react';
import { PasswordCard } from '@/components/passwords/PasswordCard';
import { Category } from '@/lib/categories/categories-client';
import { Password } from '@/lib/services/password-service-interface';
import { getPasswordStrength } from '@/lib/passwords/utils';

const TravelSearchFilter = dynamic(() => import('@/components/travel/TravelSearchFilter').then(m => m.TravelSearchFilter), { ssr: false });

export default function PetsPageClient() {
  const [loading, setLoading] = useState(true);
  type UnknownRecord = Record<string, unknown>;
  type Pet = { id: string; name: string; [key: string]: unknown };
  type PetContact = {
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
    [key: string]: unknown;
  };
  type PetPortal = { id?: string; name?: string; portal_name?: string; [key: string]: unknown };
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

  const [pets, setPets] = useState<Pet[]>([]);
  const [contacts, setContacts] = useState<PetContact[]>([]);
  const [vets, setVets] = useState<PetContact[]>([]);
  const [portals, setPortals] = useState<PetPortal[]>([]);
  const [appointments, setAppointments] = useState<PetAppointment[]>([]);
  const [refreshDocs, setRefreshDocs] = useState(0);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'appointments'|'contacts'|'portals'|'documents'|'pets'>('appointments');
  const [selectedPetId, setSelectedPetId] = useState<string>('all');
  const [showAddAppointment, setShowAddAppointment] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<PetAppointment | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddPortal, setShowAddPortal] = useState(false);
  const { calendars: googleCalendars } = useGoogleCalendars();

  const portalUsers = useMemo(() => {
    const base = pets.map(pet => ({
      id: pet.id,
      email: '',
      name: pet.name || 'Pet'
    }));
    return [...base, { id: 'shared', email: '', name: 'Shared' }];
  }, [pets]);

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

      const vetContacts: PetContact[] = Array.isArray(vetsRes.vets)
        ? (vetsRes.vets as UnknownRecord[]).reduce<PetContact[]>((acc, vet) => {
            const id = typeof vet.id === 'string' ? vet.id : undefined;
            if (!id) return acc;
            const name = (vet.name as string | undefined) || (vet.clinic_name as string | undefined) || 'Veterinary Contact';
            acc.push({
              ...(vet as PetContact),
              id,
              contact_type: 'vet',
              name,
            });
            return acc;
          }, [])
        : [];
      const otherContacts: PetContact[] = Array.isArray(contactsRes.contacts)
        ? (contactsRes.contacts as UnknownRecord[]).reduce<PetContact[]>((acc, contact) => {
            const id = typeof contact.id === 'string' ? contact.id : undefined;
            if (!id) return acc;
            acc.push({
              ...(contact as PetContact),
              id,
              contact_type: (contact.contact_subtype as string | undefined) || 'other',
            });
            return acc;
          }, [])
        : [];

      setVets(vetContacts);
      setContacts([...vetContacts, ...otherContacts]);
      setPortals(Array.isArray(portalsRes.portals) ? portalsRes.portals : []);
      setAppointments(Array.isArray(apptRes.appointments) ? apptRes.appointments : []);
    } finally {
      setLoading(false);
    }
  }, []);

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
    contacts: PetContact[];
    portals: PetPortal[];
    appointments: PetAppointment[];
  } => ({
    pets: pets
      .filter(p => (p.name || '').toLowerCase().includes(term)),
    contacts: contacts
      .filter(contact => {
        const candidate = [
          contact.name,
          contact.practice,
          contact.clinic_name,
          contact.company,
          contact.notes,
        ].filter(Boolean).join(' ').toLowerCase();
        return candidate.includes(term);
      })
      .filter(contact => {
        if (selectedPetId === 'all') return true;
        const petName = pets.find(p => p.id === selectedPetId)?.name?.toLowerCase() || '';
        const petIds = new Set([
          contact.pet_id,
          ...(contact.petIds || []),
          ...(contact.pets || []),
          ...(contact.related_to || []),
        ].filter(Boolean));
        if (petIds.has(selectedPetId)) return true;
        return (contact.description || '').toLowerCase().includes(petName);
      }),
    portals: portals
      .filter(pt => ((pt.name as string | undefined) || (pt.portal_name as string | undefined) || '').toLowerCase().includes(term))
      .filter(pt => {
        if (selectedPetId === 'all') return true;
        const descriptionText = (pt.description as string | undefined)?.toLowerCase() || '';
        const petName = pets.find(x => x.id === selectedPetId)?.name?.toLowerCase() || '';
        const idMatches = [pt.pet_id, ...(Array.isArray(pt.petIds) ? pt.petIds : []), ...(Array.isArray(pt.pets) ? pt.pets : [])]
          .filter(Boolean)
          .some((value) => value === selectedPetId);
        return idMatches || descriptionText.includes(petName);
      }),
    appointments: appointments
      .filter(a => ((a.title || a.description || '') as string).toLowerCase().includes(term))
      .filter(a => {
        if (selectedPetId === 'all') return true;
        const petName = pets.find(x => x.id === selectedPetId)?.name?.toLowerCase() || '';
        const descriptionText = (a.description as string | undefined)?.toLowerCase() || '';
        const idMatches = [a.pet_id, ...(Array.isArray(a.petIds) ? a.petIds : []), ...(Array.isArray(a.pets) ? a.pets : [])]
          .filter(Boolean)
          .some((value) => value === selectedPetId);
        return idMatches || descriptionText.includes(petName);
      }),
  }), [pets, contacts, portals, appointments, term, selectedPetId]);

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
            <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-text-primary">Contacts</h2>
                <button onClick={()=>setShowAddContact(true)} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Contact</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.contacts.map((contact) => {
                  const relatedPets = (contact.pets || contact.petIds || contact.related_to || [])
                    .map((id: string) => pets.find(p => p.id === id)?.name)
                    .filter((name): name is string => Boolean(name));
                  const subtype = (contact.contact_type || contact.contact_subtype || '').toString();
                  const badgeLabel = subtype === 'vet' ? 'Vet' : 'Contact';
                  return (
                    <div key={contact.id} className="bg-background-primary border border-gray-600/30 rounded-lg p-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{contact.name}</p>
                          {(contact.practice || contact.clinic_name || contact.company) && (
                            <p className="text-xs text-text-muted">{contact.practice || contact.clinic_name || contact.company}</p>
                          )}
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${subtype === 'vet' ? 'border-emerald-400 text-emerald-300' : 'border-gray-500 text-text-muted'}`}>
                          {badgeLabel}
                        </span>
                      </div>
                      <div className="text-xs text-text-muted space-y-1">
                        {contact.phone && <p>Phone: {contact.phone}</p>}
                        {contact.email && <p>Email: {contact.email}</p>}
                        {contact.address && <p>{contact.address}</p>}
                        {contact.website && (
                          <p>
                            Website:{' '}
                            <a href={contact.website} target="_blank" rel="noopener noreferrer" className="text-text-primary underline">
                              {contact.website}
                            </a>
                          </p>
                        )}
                        {contact.notes && <p className="text-[11px] text-text-muted/80">{contact.notes}</p>}
                      </div>
                      {relatedPets.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {relatedPets.map((petName: string) => (
                            <span key={`${contact.id}-${petName}`} className="px-2 py-0.5 text-xs bg-gray-700/60 text-text-primary rounded-full">
                              {petName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {filtered.contacts.length === 0 && (
                <div className="text-sm text-text-muted">No contacts</div>
              )}
            </section>
          )}
          {activeTab==='portals' && (
            <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-text-primary">Portals</h2>
                <button onClick={()=>setShowAddPortal(true)} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Portal</button>
              </div>
              {filtered.portals.length === 0 ? (
                <div className="text-sm text-text-muted">No portals</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filtered.portals.map((portal, index) => {
                    const portalId = (portal.id as string | undefined) ?? `portal-${index}`;
                    const portalName = ((portal.name as string | undefined) || (portal.portal_name as string | undefined) || 'Portal').trim();
                    const portalUrl = (portal.portal_url as string | undefined) || (portal.url as string | undefined) || '';
                    const portalUsername = (portal.username as string | undefined) || '';
                    const portalPassword = (portal.password as string | undefined) || '';
                    const notes = (portal.notes as string | undefined) || '';
                    const rawPetIds = [
                      ...(Array.isArray(portal.petIds) ? (portal.petIds as string[]) : []),
                      ...(Array.isArray(portal.pets) ? (portal.pets as string[]) : []),
                      (portal.pet_id as string | undefined)
                    ].filter(Boolean) as string[];
                    const uniquePetIds = Array.from(new Set(rawPetIds));
                    const relatedPetNames = uniquePetIds
                      .map(id => pets.find(p => p.id === id)?.name)
                      .filter((name): name is string => Boolean(name));

                    const passwordRecord: Password = {
                      id: portalId,
                      service_name: portalName,
                      username: portalUsername,
                      password: portalPassword,
                      url: portalUrl || undefined,
                      category: 'pet-portal',
                      notes: notes || undefined,
                      owner_id: uniquePetIds[0] ?? 'shared',
                      shared_with: uniquePetIds,
                      is_favorite: false,
                      is_shared: uniquePetIds.length > 1,
                      last_changed: new Date(),
                      strength: undefined,
                      created_at: new Date(),
                      updated_at: new Date(),
                      source_page: 'pets',
                    };

                    const portalCategory: Category = {
                      id: 'pet-portal',
                      name: 'Pet Portal',
                      color: '#f472b6',
                      module: 'passwords',
                      created_at: '1970-01-01T00:00:00Z',
                      updated_at: '1970-01-01T00:00:00Z',
                      icon: undefined,
                    };

                    const extraContent = notes
                      ? <p className="text-xs text-text-muted/80 italic">{notes}</p>
                      : null;

                    return (
                      <PasswordCard
                        key={portalId}
                        password={passwordRecord}
                        categories={[portalCategory]}
                        users={portalUsers}
                        sourceLabel="Pets"
                        subtitle="Pet Portal"
                        assignedToLabel={relatedPetNames.length > 0 ? relatedPetNames.join(', ') : 'Shared'}
                        extraContent={extraContent}
                        showFavoriteToggle={false}
                        strengthOverride={getPasswordStrength(portalPassword)}
                        canManage={false}
                        onEdit={() => {}}
                        onDelete={() => {}}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {activeTab==='appointments' && (
            <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
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
                    (appointment as any).appointment_time as string | undefined
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
                      className="text-left bg-background-primary border border-gray-600/30 hover:border-gray-500 rounded-xl p-4 transition-colors"
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
            <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
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
        <PetContactModal
          pets={pets}
          onClose={() => setShowAddContact(false)}
          onSaved={async () => {
            setShowAddContact(false);
            await loadData();
          }}
        />
      )}
      {showAddPortal && (
        <AddPetPortalModal onClose={()=>setShowAddPortal(false)} onSaved={()=>{ setShowAddPortal(false); }} />
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

function AddPetPortalModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [portalUrl, setPortalUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    try {
      setSubmitting(true);
      const payload = { name, portal_url: portalUrl, username, password };
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const res = await ApiClient.post('/api/pet-portals', payload);
      if (res.success) onSaved();
    } finally { setSubmitting(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-xl w-full max-w-md border border-gray-600/30">
        <div className="p-4 border-b border-gray-600/30 flex items-center justify-between">
          <div className="font-semibold text-text-primary">Add Portal</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-sm">Name
            <input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <label className="block text-sm">Portal URL
            <input value={portalUrl} onChange={e=>setPortalUrl(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Username
              <input value={username} onChange={e=>setUsername(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
            <label className="block text-sm">Password
              <input value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
          </div>
        </div>
        <div className="p-4 border-t border-gray-600/30 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-3 py-2 bg-button-create disabled:bg-gray-700 text-white rounded">{submitting ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
