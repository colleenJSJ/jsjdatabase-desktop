'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/user-context';
import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactDetailModal } from '@/components/contacts/ContactDetailModal';
import { EventCard } from '@/components/academics/EventCard';
import { ContactModal as UnifiedContactModal } from '@/components/contacts/ContactModal';
import { PortalModal } from '@/components/academics/PortalModal';
import { EventModal } from '@/components/academics/EventModal';
import { ViewEventModal } from '@/components/academics/ViewEventModal';
import dynamic from 'next/dynamic';
import { DocumentList } from '@/components/documents/document-list';
import DocumentUploadModal from '@/components/documents/document-upload-modal';
import ApiClient from '@/lib/api/api-client';
import { PasswordCard } from '@/components/passwords/PasswordCard';
import { PasswordDetailModal } from '@/components/passwords/PasswordDetailModal';
import type { Password as SupabasePassword } from '@/lib/supabase/types';
import { getPasswordStrength } from '@/lib/passwords/utils';
import { normalizeFamilyMemberId } from '@/lib/constants/family-members';
import type { ContactFormValues, ContactModalFieldVisibilityMap, ContactRecord } from '@/components/contacts/contact-types';
import { resolveEmails, resolvePhones } from '@/components/contacts/contact-utils';
import { usePasswordSecurityOptional } from '@/contexts/password-security-context';
import { Category } from '@/lib/categories/categories-client';

const TravelSearchFilter = dynamic(() => import('@/components/travel/TravelSearchFilter').then(m => m.TravelSearchFilter), { ssr: false });
import { Upload } from 'lucide-react';

const ACADEMIC_MODAL_VISIBILITY: ContactModalFieldVisibilityMap = {
  addresses: { hidden: true },
  portal: { hidden: true },
  tags: { hidden: true },
  assignedEntities: { hidden: true },
  favorite: { hidden: true },
  emergency: { hidden: true },
  preferred: { hidden: true },
  category: { hidden: true },
};

interface AcademicContactResponse {
  id: string;
  contact_name?: string | null;
  name?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  category?: string | null;
  children?: string[] | null;
  child_id?: string | null;
  child_ids?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_emergency?: boolean | null;
  is_preferred?: boolean | null;
  created_by?: string | null;
}

const ensureStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(entry => entry.length > 0);
  }
  if (value === null || value === undefined) return [];
  const trimmed = String(value).trim();
  return trimmed ? [trimmed] : [];
};

const collectRelatedIds = (entry: AcademicContactResponse): string[] => {
  const related = new Set<string>();
  ensureStringArray(entry.children).forEach(id => related.add(id));
  ensureStringArray(entry.child_ids).forEach(id => related.add(id));
  if (entry.child_id) {
    const id = String(entry.child_id).trim();
    if (id) related.add(id);
  }
  return Array.from(related);
};

const transformAcademicContact = (entry: AcademicContactResponse): ContactRecord => {
  const relatedTo = collectRelatedIds(entry);
  const name = entry.contact_name || entry.name || 'Academic Contact';

  return {
    id: String(entry.id),
    name,
    company: entry.role || null,
    emails: entry.email ? [entry.email] : [],
    phones: entry.phone ? [entry.phone] : [],
    addresses: [],
    category: entry.category || 'Academics',
    contact_type: 'academics',
    contact_subtype: entry.category || null,
    module: 'academics',
    source_type: 'academics',
    source_page: 'j3-academics',
    related_to: relatedTo,
    notes: entry.notes || null,
    is_emergency: Boolean(entry.is_emergency),
    is_preferred: Boolean(entry.is_preferred),
    is_favorite: false,
    is_archived: false,
    created_by: entry.created_by || null,
    created_at: entry.created_at || null,
    updated_at: entry.updated_at || null,
    role: entry.role || null,
    children: relatedTo,
  } as ContactRecord;
};

const extractAcademicContacts = (payload: unknown): AcademicContactResponse[] => {
  if (Array.isArray(payload)) {
    return payload as AcademicContactResponse[];
  }
  if (payload && Array.isArray((payload as any).contacts)) {
    return (payload as any).contacts as AcademicContactResponse[];
  }
  return [];
};

const firstNonEmpty = (values: (string | null | undefined)[]): string | null => {
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (trimmed) return trimmed;
  }
  return null;
};

const mapAcademicContactToFormValues = (contact: ContactRecord): Partial<ContactFormValues> => ({
  id: contact.id,
  name: contact.name,
  company: contact.company ?? undefined,
  emails: resolveEmails(contact),
  phones: resolvePhones(contact),
  addresses: [],
  notes: contact.notes ?? undefined,
  related_to: contact.related_to ?? [],
  category: contact.contact_subtype ?? contact.category ?? undefined,
  contact_subtype: contact.contact_subtype ?? undefined,
  is_emergency: contact.is_emergency ?? undefined,
  is_preferred: contact.is_preferred ?? undefined,
});

export default function J3AcademicsPageClient() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [portals, setPortals] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [editingPortal, setEditingPortal] = useState<any | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'events'|'contacts'|'portals'|'documents'>('events');
  const [selectedChildId, setSelectedChildId] = useState<string>('all');
  const [showDocumentUploadModal, setShowDocumentUploadModal] = useState(false);
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [savingContact, setSavingContact] = useState(false);
  const [viewingContact, setViewingContact] = useState<ContactRecord | null>(null);
  const [viewingPassword, setViewingPassword] = useState<SupabasePassword | null>(null);
  const [viewingPortal, setViewingPortal] = useState<any | null>(null);
  const { updateActivity } = usePasswordSecurityOptional();

  const childSeeds = useMemo(
    () => [
      { key: 'auggie', id: normalizeFamilyMemberId('auggie'), name: 'Auggie' },
      { key: 'claire', id: normalizeFamilyMemberId('claire'), name: 'Claire' },
      { key: 'blossom', id: normalizeFamilyMemberId('blossom'), name: 'Blossom' },
    ],
    []
  );

  const allowedChildNames = useMemo(
    () => new Set(childSeeds.map(seed => seed.key)),
    [childSeeds]
  );

  const academicPortalUsers = useMemo(() => {
    const base = children.map(child => ({
      id: child.id,
      email: '',
      name: child.name,
    }));
    return [...base, { id: 'shared', email: '', name: 'Shared' }];
  }, [children]);

  const familyMembersForModal = useMemo(
    () => children.map(child => ({ id: child.id, name: child.name })),
    [children]
  );

  const openPortalDetail = (password: SupabasePassword, portal: any, beforeOpen?: () => void) => {
    beforeOpen?.();
    updateActivity();
    setViewingPortal(portal);
    setViewingPassword(password);
  };

  const normalizeChildren = (childrenList: any[] = []) => {
    const byFirstName = new Map<string, any>();
    for (const child of childrenList) {
      const name = (child?.name || child?.display_name || child?.full_name || child?.fullName || child?.first_name || child?.student_name || '').toString();
      const first = name.split(' ')[0].toLowerCase();
      if (!allowedChildNames.has(first)) continue;
      const rawId = String(child?.id ?? child?.child_id ?? child?.person_id ?? child?.student_id ?? child?.uuid ?? child?.user_id ?? first);
      const normalizedId = normalizeFamilyMemberId(rawId);
      const displayName = name || childSeeds.find(seed => seed.key === first)?.name || first.charAt(0).toUpperCase() + first.slice(1);
      byFirstName.set(first, {
        id: normalizedId,
        name: displayName,
      });
    }
    const results: { id: string; name: string }[] = [];
    for (const seed of childSeeds) {
      const first = seed.key;
      if (byFirstName.has(first)) {
        results.push(byFirstName.get(first)!);
      } else {
        results.push({ id: seed.id, name: seed.name });
      }
    }
    return results;
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [c, p, e, kids] = await Promise.all([
          fetch('/api/academic-contacts').then(r => r.ok ? r.json() : { contacts: [] }),
          fetch('/api/academic-portals').then(r => r.ok ? r.json() : { portals: [] }),
          fetch('/api/academic-events').then(r => r.ok ? r.json() : { events: [] }),
          fetch('/api/j3-academics/children').then(r => r.ok ? r.json() : { children: [] }),
        ]);
        const contactList = extractAcademicContacts(c).map(transformAcademicContact);
        setContacts(contactList);
        setPortals(p.portals || []);
        setEvents(e.events || []);
        const rawChildren = Array.isArray(kids) ? kids : Array.isArray(kids?.children) ? kids.children : [];
        const filteredKids = normalizeChildren(rawChildren);
        setChildren(filteredKids);
        if (selectedChildId !== 'all' && !filteredKids.some(child => child.id === selectedChildId)) {
          setSelectedChildId('all');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const reload = async () => {
    try {
      const [c, p, e, kids] = await Promise.all([
        fetch('/api/academic-contacts').then(r => r.ok ? r.json() : { contacts: [] }),
        fetch('/api/academic-portals').then(r => r.ok ? r.json() : { portals: [] }),
        fetch('/api/academic-events').then(r => r.ok ? r.json() : { events: [] }),
        fetch('/api/j3-academics/children').then(r => r.ok ? r.json() : { children: [] }),
      ]);
      const contactList = extractAcademicContacts(c).map(transformAcademicContact);
      setContacts(contactList);
      setPortals(p.portals || p || []);
      setEvents(e.events || e || []);
      const rawChildren = Array.isArray(kids) ? kids : Array.isArray(kids?.children) ? kids.children : [];
      const filteredKids = normalizeChildren(rawChildren);
      setChildren(filteredKids);
      if (selectedChildId !== 'all' && !filteredKids.some(child => child.id === selectedChildId)) {
        setSelectedChildId('all');
      }
    } catch {}
  };

  const term = search.trim().toLowerCase();
  const filteredKids = useMemo(() => normalizeChildren(children), [children]);
  const studentOptions = useMemo(
    () => filteredKids.map(child => ({ id: child.id, label: child.name || 'Student' })),
    [filteredKids]
  );
  const child = filteredKids.find(c => c.id === selectedChildId);
  const childName = child?.name || '';
  const nameTerm = childName.toLowerCase();
  const filtered = useMemo(() => {
    const matchesContactSearch = (contact: ContactRecord) => {
      if (!term) return true;
      const haystack = [
        contact.name,
        contact.company ?? '',
        contact.notes ?? '',
        ...resolveEmails(contact),
        ...resolvePhones(contact),
      ];
      return haystack.some(value => value?.toLowerCase().includes(term));
    };

    const matchesContactChild = (contact: ContactRecord) => {
      if (selectedChildId === 'all') return true;
      const related = contact.related_to ?? [];
      if (related.includes(selectedChildId)) return true;
      const note = contact.notes?.toLowerCase() ?? '';
      return note.includes(nameTerm);
    };

    return {
      contacts: contacts.filter(contact => matchesContactSearch(contact) && matchesContactChild(contact)),
      portals: portals
        .filter(p => (p.name || '').toLowerCase().includes(term) || (p.portal_url || '').toLowerCase().includes(term))
        .filter(p => selectedChildId === 'all'
          ? true
          : (p.child_id === selectedChildId
            || (Array.isArray(p.child_ids) && p.child_ids.includes(selectedChildId))
            || (Array.isArray(p.children) && p.children.includes(selectedChildId))
            || (p.notes || '').toLowerCase().includes(nameTerm))),
      events: events
        .filter(e => (e.title || '').toLowerCase().includes(term) || (e.description || '').toLowerCase().includes(term))
        .filter(e => selectedChildId === 'all'
          ? true
          : (e.child_id === selectedChildId
            || (Array.isArray(e.child_ids) && e.child_ids.includes(selectedChildId))
            || (Array.isArray(e.children) && e.children.includes(selectedChildId))
            || (e.description || '').toLowerCase().includes(nameTerm))),
    };
  }, [contacts, portals, events, term, selectedChildId, nameTerm]);

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Delete this contact?')) return;
    try {
      const response = await ApiClient.delete(`/api/academic-contacts/${contactId}`);
      if (!response.success) {
        alert(response.error || 'Failed to delete contact');
        return;
      }
      await reload();
    } catch (error) {
      console.error('[J3 Academics] Failed to delete contact', error);
      alert('Failed to delete contact');
    }
  };

  const renderContactCard = (contact: ContactRecord) => {
    const canManage = user?.role === 'admin';

    return (
      <ContactCard
        key={contact.id}
        contact={contact}
        subtitle={contact.role ?? undefined}
        showFavoriteToggle={false}
        canManage={canManage}
        onOpen={() => setViewingContact(contact)}
        actionConfig={{
          onEdit: canManage ? () => {
            setEditingContact(contact);
            setShowContactModal(true);
          } : undefined,
          onDelete: canManage ? () => handleDeleteContact(contact.id) : undefined,
        }}
      />
    );
  };

  const contactModalDefaults = useMemo(() => ({
    category: 'Academics' as const,
    sourceType: 'academics' as const,
    sourcePage: 'j3-academics',
    relatedToIds: selectedChildId !== 'all' ? [selectedChildId] : [],
  }), [selectedChildId]);

  const handleContactSubmit = async (values: ContactFormValues) => {
    try {
      setSavingContact(true);
      const payload = {
        contact_name: values.name,
        role: (values.company ?? '').trim(),
        email: firstNonEmpty(values.emails) ?? null,
        phone: firstNonEmpty(values.phones) ?? null,
        category: editingContact?.contact_subtype || values.contact_subtype || values.category || 'teacher',
        notes: values.notes ?? '',
        children: values.related_to,
      };

      const url = editingContact ? `/api/academic-contacts/${editingContact.id}` : '/api/academic-contacts';
      const response = editingContact
        ? await ApiClient.put(url, payload)
        : await ApiClient.post(url, payload);

      if (!response.success) {
        throw new Error(response.error || 'Failed to save contact');
      }

      await reload();
      setShowContactModal(false);
      setEditingContact(null);
    } catch (error) {
      console.error('[J3 Academics] Failed to save contact', error);
      alert(error instanceof Error ? error.message : 'Failed to save contact');
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-text-primary">J3 Academics</h1>
      <TravelSearchFilter
        onSearchChange={setSearch}
        placeholder="Search academics for contacts, portals, events..."
        customOptions={filteredKids.map(k => ({ id: k.id, label: k.name }))}
        selectedOption={selectedChildId}
        onOptionChange={setSelectedChildId}
      />
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-600/30">
        {([
          { key: 'events' as const, label: 'Events' },
          { key: 'contacts' as const, label: 'Contacts' },
          { key: 'portals' as const, label: 'Passwords & Portals' },
          { key: 'documents' as const, label: 'Documents' },
        ]).map(tab => (
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
        <>
        <div className="space-y-6">
          {activeTab==='contacts' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">Contacts</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{filtered.contacts.length} total</span>
                {user?.role === 'admin' && (
                  <button onClick={()=>{ setEditingContact(null); setShowContactModal(true); }} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Contact</button>
                )}
              </div>
            </div>
            {filtered.contacts.length === 0 ? (
              <div
                className="border border-gray-600/30 rounded-xl p-4 text-center text-text-muted"
                style={{ backgroundColor: '#30302e' }}
              >
                No contacts
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filtered.contacts.map(contact => renderContactCard(contact))}
              </div>
            )}
          </section>
          )}

          {activeTab==='portals' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">Portals</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{filtered.portals.length} total</span>
                {user?.role === 'admin' && (
                  <button onClick={()=>{ setEditingPortal(null); setShowPortalModal(true); }} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Portal</button>
                )}
              </div>
            </div>
            {filtered.portals.length === 0 ? (
              <div
                className="border border-gray-600/30 rounded-xl p-4 text-center text-text-muted"
                style={{ backgroundColor: '#30302e' }}
              >
                No portals
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filtered.portals.map((portal: any, index) => {
                  const portalId: string = (portal.id as string | undefined) || `portal-${index}`;
                  const student = filteredKids.find(c => c.id === portal.child_id);
                  const portalName: string = portal.portal_name || portal.name || 'Portal';
                  const portalUrl: string = portal.url || portal.portal_url || '';
                  const portalUsername: string = portal.username || '';
                  const portalPassword: string = portal.password || '';
                  const notes: string | undefined = portal.notes || undefined;
                  const childIds = Array.isArray(portal.children)
                    ? (portal.children as string[])
                    : Array.isArray(portal.child_ids)
                      ? (portal.child_ids as string[])
                      : portal.child_id
                        ? [portal.child_id]
                        : [];
                  const sharedWith = childIds.map(id => String(id));
                  const assignedNames = sharedWith
                    .map(childId => filteredKids.find(c => c.id === childId)?.name)
                    .filter((name): name is string => Boolean(name));

                  const nowIso = new Date().toISOString();
                  const passwordId = (portal as any).password_id || portalId;
                  const passwordRecord: SupabasePassword = {
                    id: passwordId,
                    title: portalName,
                    username: portalUsername,
                    password: portalPassword,
                    url: portalUrl || undefined,
                    category: 'academic-portal' as any,
                    notes,
                    created_by: portal.created_by || user?.id || 'shared',
                    created_at: portal.created_at || nowIso,
                    updated_at: portal.updated_at || nowIso,
                    owner_id: 'shared',
                    shared_with: sharedWith,
                    is_favorite: Boolean((portal as any).is_favorite),
                    is_shared: sharedWith.length > 1,
                    last_changed: portal.updated_at || nowIso,
                    source: 'j3-academics',
                    source_page: 'j3-academics',
                    source_reference: portal.id ?? null,
                  };

                  const lastAccessDisplay = portal.last_accessed
                    ? new Date(portal.last_accessed).toLocaleDateString()
                    : null;

                  const footerContent = lastAccessDisplay ? (
                    <span>Last accessed: {lastAccessDisplay}</span>
                  ) : undefined;

                  const handlePortalOpen = async () => {
                    if (!portal.id) return;
                    try {
                      await fetch(`/api/academic-portals/${portal.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...portal,
                          last_accessed: new Date().toISOString(),
                        }),
                      });
                    } catch (error) {
                      console.error('Failed to update portal access time:', error);
                    }
                  };

                  return (
                    <PasswordCard
                      key={portalId}
                      password={passwordRecord}
                      categories={[]}
                      users={academicPortalUsers}
                      subtitle={null}
                      assignedToLabel={assignedNames.length > 0 ? assignedNames.join(', ') : student?.name || 'Shared'}
                      extraContent={notes ? <p className="text-xs text-text-muted/80 italic">{notes}</p> : null}
                      footerContent={footerContent}
                      showFavoriteToggle={false}
                      strengthOverride={getPasswordStrength(portalPassword)}
                      canManage={user?.role === 'admin'}
                      onEdit={() => { setEditingPortal(portal); setShowPortalModal(true); }}
                      onDelete={async () => {
                        if (!portal.id) return;
                        if (!confirm('Delete this portal?')) return;
                        const ApiClient = (await import('@/lib/api/api-client')).default;
                        const response = await ApiClient.delete(`/api/academic-portals/${portal.id}`);
                        if (!response.success) {
                          alert(response.error || 'Failed to delete portal');
                          return;
                        }
                        await reload();
                      }}
                      onOpen={() => openPortalDetail(passwordRecord, portal, () => { if (portal.id) void handlePortalOpen(); })}
                      variant="compact"
                    />
                  );
                })}
              </div>
            )}
          </section>
          )}

          {activeTab==='events' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">Events</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{filtered.events.length} total</span>
                {user?.role === 'admin' && (
                  <button onClick={()=>{ setEditingEvent(null); setShowEventModal(true); }} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Event</button>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {filtered.events.map((ev: any) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  children={filteredKids}
                  isAdmin={user?.role === 'admin'}
                  onEdit={() => { setEditingEvent(ev); setShowEventModal(true); }}
                  onDelete={async () => { if (!confirm('Delete this event?')) return; const ApiClient = (await import('@/lib/api/api-client')).default; await ApiClient.delete(`/api/academic-events/${ev.id}`); await reload(); }}
                  onClick={() => setSelectedEvent(ev)}
                />
              ))}
              {filtered.events.length === 0 && (
                <div
                  className="rounded-xl border border-gray-600/30 p-4 text-center text-text-muted"
                  style={{ backgroundColor: '#30302e' }}
                >
                  No events
                </div>
              )}
            </div>
          </section>
          )}

          {activeTab==='documents' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">Documents</h2>
              {user?.role === 'admin' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDocumentUploadModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Document
                  </button>
                  {showDocumentUploadModal && (
                    <DocumentUploadModal
                      onClose={() => setShowDocumentUploadModal(false)}
                      onUploadComplete={() => {
                        setShowDocumentUploadModal(false);
                        setDocumentsRefreshKey(prev => prev + 1);
                      }}
                      sourcePage="J3 Academics"
                      defaultCategory="Education"
                      initialRelatedTo={selectedChildId !== 'all' ? [selectedChildId] : []}
                    />
                  )}
                </div>
              )}
            </div>
          <DocumentList
            category="Education"
            sourcePage="J3 Academics"
            refreshKey={documentsRefreshKey}
              selectedPerson={selectedChildId !== 'all' ? filteredKids.find(c => c.id === selectedChildId)?.name : undefined}
          />
          </section>
          )}
        </div>

        {/* Modals */}
        {viewingPassword && viewingPortal && (
          <PasswordDetailModal
            password={viewingPassword}
            categories={[
              {
                id: 'academic-portal',
                name: 'Academic Portal',
                color: '#6366f1',
                module: 'passwords',
                created_at: viewingPortal.created_at || new Date().toISOString(),
                updated_at: viewingPortal.updated_at || new Date().toISOString(),
                icon: undefined,
              } as Category,
            ]}
            users={academicPortalUsers}
            familyMembers={familyMembersForModal}
            canManage={user?.role === 'admin'}
            onClose={() => {
              setViewingPassword(null);
              setViewingPortal(null);
            }}
            onEdit={() => {
              setViewingPassword(null);
              if (viewingPortal) {
                setEditingPortal(viewingPortal);
                setShowPortalModal(true);
              }
            }}
            onDelete={async () => {
              if (viewingPortal?.id) {
                if (!confirm('Delete this portal?')) return;
                const response = await ApiClient.delete(`/api/academic-portals/${viewingPortal.id}`);
                if (!response.success) {
                  alert(response.error || 'Failed to delete portal');
                } else {
                  await reload();
                }
              }
              setViewingPassword(null);
              setViewingPortal(null);
            }}
          />
        )}

        {showContactModal && (
          <UnifiedContactModal
            open={showContactModal}
            mode={editingContact ? 'edit' : 'create'}
            initialValues={editingContact ? mapAcademicContactToFormValues(editingContact) : undefined}
            defaults={contactModalDefaults}
            visibility={ACADEMIC_MODAL_VISIBILITY}
            labels={{ companyLabel: 'Role/Title', relatedToLabel: 'Students' }}
            optionSelectors={{ relatedEntities: studentOptions }}
            busy={savingContact}
            submitLabel={editingContact ? 'Save changes' : 'Create contact'}
            onSubmit={handleContactSubmit}
            onCancel={() => {
              setShowContactModal(false);
              setEditingContact(null);
            }}
        />
      )}

      {viewingContact && (
        <ContactDetailModal
          contact={viewingContact}
          familyMembers={familyMembersForModal}
          canManage={user?.role === 'admin'}
          onClose={() => setViewingContact(null)}
          onEdit={user?.role === 'admin' ? () => {
            setEditingContact(viewingContact);
            setShowContactModal(true);
            setViewingContact(null);
          } : undefined}
          onDelete={user?.role === 'admin' ? async () => {
            await handleDeleteContact(viewingContact.id);
            setViewingContact(null);
          } : undefined}
        />
      )}

      <PortalModal
        isOpen={showPortalModal}
          onClose={() => { setShowPortalModal(false); setEditingPortal(null); }}
          onSubmit={async (form) => {
            const url = editingPortal ? `/api/academic-portals/${editingPortal.id}` : '/api/academic-portals';
            const response = editingPortal
              ? await ApiClient.put(url, form)
              : await ApiClient.post(url, form);
            if (!response.success) {
              throw new Error(response.error || 'Failed to save portal');
            }
            await reload();
          }}
          editingPortal={editingPortal || undefined}
          children={filteredKids}
          selectedChild={'all'}
        />

        <EventModal
          isOpen={showEventModal}
          onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
          onSubmit={async (form) => {
            const url = editingEvent ? `/api/academic-events/${editingEvent.id}` : '/api/academic-events';
            const response = editingEvent
              ? await ApiClient.put(url, form)
              : await ApiClient.post(url, form);
            if (!response.success) {
              throw new Error(response.error || 'Failed to save event');
            }
            await reload();
          }}
          editingEvent={editingEvent || undefined}
          children={filteredKids}
          selectedChild={selectedChildId}
        />

        {selectedEvent && (
          <ViewEventModal
            isOpen={!!selectedEvent}
            event={selectedEvent}
            children={filteredKids}
            onClose={() => setSelectedEvent(null)}
            onEdit={() => {
              setShowEventModal(true);
              setEditingEvent(selectedEvent);
              setSelectedEvent(null);
            }}
            onDelete={async () => {
              const eventToDelete = selectedEvent;
              if (!eventToDelete) return;
              await ApiClient.delete(`/api/academic-events/${eventToDelete.id}`);
              setSelectedEvent(null);
              await reload();
            }}
          />
        )}
        </>
      )}
    </div>
  );
}
