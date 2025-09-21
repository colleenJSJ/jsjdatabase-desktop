"use client";

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/user-context';
import { ContactCard } from '@/components/academics/ContactCard';
import { PortalCard } from '@/components/academics/PortalCard';
import { EventCard } from '@/components/academics/EventCard';
import { ContactModal } from '@/components/academics/ContactModal';
import { PortalModal } from '@/components/academics/PortalModal';
import { EventModal } from '@/components/academics/EventModal';
import { ViewEventModal } from '@/components/academics/ViewEventModal';
import dynamic from 'next/dynamic';
import { DocumentList } from '@/components/documents/document-list';
import DocumentUploadModal from '@/components/documents/document-upload-modal';
import ApiClient from '@/lib/api/api-client';

const TravelSearchFilter = dynamic(() => import('@/components/travel/TravelSearchFilter').then(m => m.TravelSearchFilter), { ssr: false });
import { Upload } from 'lucide-react';

export default function J3AcademicsPageClient() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [portals, setPortals] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<any | null>(null);
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

  const allowedChildNames = new Set(['auggie', 'claire', 'blossom']);

  const childNames = useMemo(() => [
    { id: 'auggie', name: 'Auggie' },
    { id: 'claire', name: 'Claire' },
    { id: 'blossom', name: 'Blossom' },
  ], []);

  const normalizeChildren = (childrenList: any[] = []) => {
    const byFirstName = new Map<string, any>();
    for (const child of childrenList) {
      const name = (child?.name || child?.display_name || child?.full_name || child?.fullName || child?.first_name || child?.student_name || '').toString();
      const first = name.split(' ')[0].toLowerCase();
      if (!allowedChildNames.has(first)) continue;
      byFirstName.set(first, {
        id: String(child?.id ?? child?.child_id ?? child?.person_id ?? child?.student_id ?? child?.uuid ?? child?.user_id ?? first),
        name: name || first.charAt(0).toUpperCase() + first.slice(1),
      });
    }
    const results: { id: string; name: string }[] = [];
    for (const item of childNames) {
      const first = item.name.toLowerCase();
      if (byFirstName.has(first)) {
        results.push(byFirstName.get(first)!);
      } else {
        results.push({ id: item.id, name: item.name });
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
        setContacts(c.contacts || []);
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
      setContacts(c.contacts || c || []);
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
  const child = filteredKids.find(c => c.id === selectedChildId);
  const childName = child?.name || '';
  const nameTerm = childName.toLowerCase();
  const filtered = useMemo(() => ({
    contacts: contacts
      .filter(c => (c.name||'').toLowerCase().includes(term) || (c.company||'').toLowerCase().includes(term) || (c.email||'').toLowerCase().includes(term))
      .filter(c => selectedChildId==='all' ? true : (c.child_id===selectedChildId || (c.child_ids||[]).includes(selectedChildId) || (c.children||[]).includes(selectedChildId) || (c.notes||'').toLowerCase().includes(nameTerm))),
    portals: portals
      .filter(p => (p.name||'').toLowerCase().includes(term) || (p.portal_url||'').toLowerCase().includes(term))
      .filter(p => selectedChildId==='all' ? true : (p.child_id===selectedChildId || (p.child_ids||[]).includes(selectedChildId) || (p.children||[]).includes(selectedChildId) || (p.notes||'').toLowerCase().includes(nameTerm))),
    events: events
      .filter(e => (e.title||'').toLowerCase().includes(term) || (e.description||'').toLowerCase().includes(term))
      .filter(e => selectedChildId==='all' ? true : (e.child_id===selectedChildId || (e.child_ids||[]).includes(selectedChildId) || (e.children||[]).includes(selectedChildId) || (e.description||'').toLowerCase().includes(nameTerm))),
  }), [contacts, portals, events, term, selectedChildId, nameTerm]);

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
        {(['events','contacts','portals','documents'] as const).map(tab => {
          const label = tab === 'portals' ? 'Passwords & Portals' : tab[0].toUpperCase()+tab.slice(1);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm border-b-2 ${activeTab===tab ? 'border-primary-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
        </div>
      ) : (
        <>
        <div className="space-y-6">
          {activeTab==='contacts' && (
          <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-text-primary">Contacts</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{filtered.contacts.length} total</span>
                {user?.role === 'admin' && (
                  <button onClick={()=>{ setEditingContact(null); setShowContactModal(true); }} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Contact</button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.contacts.map((c: any) => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  children={filteredKids}
                  isAdmin={user?.role === 'admin'}
                  onEdit={() => { setEditingContact(c); setShowContactModal(true); }}
                  onDelete={async () => { if (!confirm('Delete this contact?')) return; const ApiClient = (await import('@/lib/api/api-client')).default; await ApiClient.delete(`/api/academic-contacts/${c.id}`); await reload(); }}
                />
              ))}
              {filtered.contacts.length === 0 && (
                <div className="bg-background-primary border border-gray-600/30 rounded-xl p-4 text-text-muted">No contacts</div>
              )}
            </div>
          </section>
          )}

          {activeTab==='portals' && (
          <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-text-primary">Passwords & Portals</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{filtered.portals.length} total</span>
                {user?.role === 'admin' && (
                  <button onClick={()=>{ setEditingPortal(null); setShowPortalModal(true); }} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Portal</button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.portals.map((p: any) => (
                <PortalCard
                  key={p.id}
                  portal={p}
                  children={filteredKids}
                  isAdmin={user?.role === 'admin'}
                  onEdit={() => { setEditingPortal(p); setShowPortalModal(true); }}
                  onDelete={async () => { if (!confirm('Delete this portal?')) return; const ApiClient = (await import('@/lib/api/api-client')).default; await ApiClient.delete(`/api/academic-portals/${p.id}`); await reload(); }}
                />
              ))}
              {filtered.portals.length === 0 && (
                <div className="bg-background-primary border border-gray-600/30 rounded-xl p-4 text-text-muted">No passwords or portals</div>
              )}
            </div>
          </section>
          )}

          {activeTab==='events' && (
          <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-text-primary">Events</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{filtered.events.length} total</span>
                {user?.role === 'admin' && (
                  <button onClick={()=>{ setEditingEvent(null); setShowEventModal(true); }} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Event</button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                <div className="bg-background-primary border border-gray-600/30 rounded-xl p-4 text-text-muted">No events</div>
              )}
            </div>
          </section>
          )}

          {activeTab==='documents' && (
          <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
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
        <ContactModal
          isOpen={showContactModal}
          onClose={() => { setShowContactModal(false); setEditingContact(null); }}
          onSubmit={async (form) => {
            const url = editingContact ? `/api/academic-contacts/${editingContact.id}` : '/api/academic-contacts';
            const response = editingContact
              ? await ApiClient.put(url, form)
              : await ApiClient.post(url, form);
            if (!response.success) {
              throw new Error(response.error || 'Failed to save contact');
            }
            await reload();
          }}
          editingContact={editingContact || undefined}
          children={filteredKids}
          selectedChild={'all'}
        />

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
