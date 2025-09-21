"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentList } from '@/components/documents/document-list';
import DocumentUploadModal from '@/components/documents/document-upload-modal';
import dynamic from 'next/dynamic';
import PetAppointmentModal from './PetAppointmentModal';
import PetContactModal from './PetContactModal';
import ViewPetAppointmentModal from './ViewPetAppointmentModal';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';

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
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const { calendars: googleCalendars } = useGoogleCalendars();

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
                <h2 className="font-semibold text-text-primary">Passwords & Portals</h2>
                <button onClick={()=>setShowAddPortal(true)} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Portal</button>
              </div>
              <ul className="space-y-1 text-sm text-text-muted">
                {filtered.portals.map((pt) => {
                  const key = (pt.id as string | undefined) || `${pt.name ?? pt.portal_name ?? 'portal'}`;
                  const label = (pt.name as string | undefined) || (pt.portal_name as string | undefined) || 'Portal';
                  return <li key={key}>{label}</li>;
                })}
                {filtered.portals.length === 0 && <li>No portals</li>}
              </ul>
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
                  const title = (appointment.title as string | undefined) || 'Pet Appointment';
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
                  const locationDisplay = (appointment.location as string | undefined) || 'Location TBD';
                  const vetName = appointment.vet_name as string | undefined;

                  return (
                    <button
                      key={appointment.id}
                      onClick={() => setSelectedAppointment(appointment)}
                      className="text-left bg-background-primary border border-gray-600/30 hover:border-gray-500 rounded-xl p-4 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                            <span>{title}</span>
                          </h3>
                          <p className="text-xs text-text-muted mt-1">{dateDisplay}</p>
                        </div>
                        <span className="text-xs text-text-muted capitalize bg-[#30302E] border border-[#3A3A38] px-2 py-1 rounded-full">
                          {(appointment.appointment_type as string | undefined)?.replace(/_/g, ' ') || 'appointment'}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-text-muted">
                        <div className="flex items-center gap-1">
                          <span className="text-text-primary">Pets:</span>
                          <span>{petNames.length > 0 ? petNames.join(', ') : 'TBD'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-text-primary">Location:</span>
                          <span>{locationDisplay}</span>
                        </div>
                        {vetName && (
                          <div className="flex items-center gap-1">
                            <span className="text-text-primary">Vet:</span>
                            <span>{vetName}</span>
                          </div>
                        )}
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
                <button
                  onClick={() => setShowDocumentModal(true)}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
                >
                  Upload Document
                </button>
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
      {showDocumentModal && (
        <DocumentUploadModal
          onClose={() => setShowDocumentModal(false)}
          onUploadComplete={() => {
            setShowDocumentModal(false);
            setRefreshDocs(x => x + 1);
          }}
          sourcePage="Pets"
          defaultCategory="Pets"
          includePets
          initialRelatedTo={selectedPetId && selectedPetId !== 'all' ? [selectedPetId] : ['shared']}
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
