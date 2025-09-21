"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { TransportType } from '@/types/travel';
import dynamic from 'next/dynamic';
import { SmartUploadButtonV2 } from '@/components/travel/SmartUploadButtonV2';
import { Plane, Train, Car, Ship, Globe, Pencil, Trash2, Calendar, Clock, MapPin, Users, Ticket, X } from 'lucide-react';
import { TravelSegmentFields } from '@/components/travel/shared/TravelSegmentFields';
import { TravelersPicker } from '@/components/travel/shared/TravelersPicker';
import { InvitesCalendarPanel } from '@/components/travel/shared/InvitesCalendarPanel';
import { DocumentUploadPanel } from '@/components/travel/shared/DocumentUploadPanel';
import { uploadPendingDocs } from '@/lib/travel/doc-upload';
import { useToast } from '@/hooks/use-toast';
import { getCSRFHeaders } from '@/lib/security/csrf-client';
import ApiClient from '@/lib/api/api-client';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { Document } from '@/types';
import { DocumentCard } from '@/components/documents/document-card';
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal';
import { useDocumentActions } from '@/hooks/useDocumentActions';
import { useDocumentPreview } from '@/hooks/useDocumentPreview';

const TravelSearchFilter = dynamic(() => import('@/components/travel/TravelSearchFilter').then(m => m.TravelSearchFilter), { ssr: false });

export default function TravelPageClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    trips: any[];
    travel_details: any[];
    accommodations: any[];
    contacts: any[];
    documents: any[];
    family_members: any[];
  }>({ trips: [], travel_details: [], accommodations: [], contacts: [], documents: [], family_members: [] });
  const [activeTab, setActiveTab] = useState<'transport' | 'documents' | 'contacts' | 'preferences' | 'history'>('transport');
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [showAddTransport, setShowAddTransport] = useState(false);
  const [showAddAccommodation, setShowAddAccommodation] = useState(false);
  const [editingTransport, setEditingTransport] = useState<any | null>(null);
  const [editingTrip, setEditingTrip] = useState<any | null>(null);
  const [editingAccommodation, setEditingAccommodation] = useState<any | null>(null);
  const [viewingDetail, setViewingDetail] = useState<any | null>(null);
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  // Filters (match Tasks page style)
  const [search, setSearch] = useState<string>('');
  const [showTripsList, setShowTripsList] = useState<boolean>(true);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [memberPrefs, setMemberPrefs] = useState<Record<string, { seat?: string; meal?: string }>>({});
  const { calendars: googleCalendars } = useGoogleCalendars();
  const { selectedPersonId, setSelectedPersonId } = usePersonFilter();
  const { copyLink, viewDocument, downloadDocument } = useDocumentActions();
  const {
    doc: previewDoc,
    signedUrl: previewUrl,
    loading: previewLoading,
    error: previewError,
    openPreview,
    closePreview,
  } = useDocumentPreview();

  const assignedTo = selectedPersonId ?? 'all';
  const selectedPersonParam = selectedPersonId && selectedPersonId !== 'all' ? selectedPersonId : null;

  const withSelectedPerson = (path: string) => {
    if (!selectedPersonParam) return path;
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}selected_person=${encodeURIComponent(selectedPersonParam)}`;
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch resources in parallel from dedicated endpoints to avoid consolidated route issues
        const [tripsRes, detailsRes, accRes, contactsRes, docsRes, famRes] = await Promise.all([
          fetch(withSelectedPerson('/api/trips')),
          fetch(withSelectedPerson('/api/travel-details')),
          fetch(withSelectedPerson('/api/travel-accommodations')),
          fetch(withSelectedPerson('/api/travel-contacts')).catch(() => ({ ok:false } as any)),
          fetch(withSelectedPerson('/api/travel-documents')),
          fetch('/api/family-members'),
        ]);

        // Parse whatever succeeded; fall back to empty structures on failure
        const tripsJson = tripsRes.ok ? await tripsRes.json() : { trips: [] };
        const detailsJson = detailsRes.ok ? await detailsRes.json() : { details: [] };
        const accJson = accRes.ok ? await accRes.json() : { accommodations: [] };
        const contactsJson = contactsRes.ok ? await contactsRes.json() : { contacts: [] };
        const docsJson = docsRes.ok ? await docsRes.json() : { documents: [] };
        const famJson = famRes.ok ? await famRes.json() : { members: [] };
        setData({
          trips: tripsJson?.trips || [],
          travel_details: detailsJson?.details || [],
          accommodations: accJson?.accommodations || [],
          contacts: contactsJson?.contacts || [],
          documents: docsJson?.documents || [],
          family_members: famJson?.members || [],
        });
      } catch (e: any) {
        setError(e?.message || 'Error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedPersonParam]);

  const peopleOptions = useMemo(() => {
    return (data.family_members || []).map((member: any) => ({
      id: member.id,
      label: (member.name || 'Person').split(' ')[0] || 'Person',
    }));
  }, [data.family_members]);

  const refreshData = async () => {
    try {
      const [tripsRes, detailsRes, accRes, contactsRes, docsRes, famRes] = await Promise.all([
        fetch(withSelectedPerson('/api/trips')),
        fetch(withSelectedPerson('/api/travel-details')),
        fetch(withSelectedPerson('/api/travel-accommodations')),
        fetch(withSelectedPerson('/api/travel-contacts')).catch(() => ({ ok:false } as any)),
        fetch(withSelectedPerson('/api/travel-documents')),
        fetch('/api/family-members'),
      ]);
      const tripsJson = tripsRes.ok ? await tripsRes.json() : { trips: [] };
      const detailsJson = detailsRes.ok ? await detailsRes.json() : { details: [] };
      const accJson = accRes.ok ? await accRes.json() : { accommodations: [] };
      const contactsJson = contactsRes.ok ? await contactsRes.json() : { contacts: [] };
      const docsJson = docsRes.ok ? await docsRes.json() : { documents: [] };
      const famJson = famRes.ok ? await famRes.json() : { members: [] };
      setData({
        trips: tripsJson?.trips || [],
        travel_details: detailsJson?.details || [],
        accommodations: accJson?.accommodations || [],
        contacts: contactsJson?.contacts || [],
        documents: docsJson?.documents || [],
        family_members: famJson?.members || [],
      });
    } catch {}
  };

  const familyMemberMap = useMemo(() => {
    const map: Record<string, string> = { shared: 'Shared/Family' };
    (data.family_members || []).forEach((member: any) => {
      const name = member.display_name || member.name || member.email || member.id;
      if (member?.id) {
        map[member.id] = name;
      }
    });
    return map;
  }, [data.family_members]);

  // Derived filtered collections
  const filters = useMemo(() => ({ search: search.trim().toLowerCase(), tripId: selectedTripId }), [search, selectedTripId]);
  const filtered = useMemo(() => {
    const matchesText = (str: any) => {
      const term = filters.search;
      if (!term) return true;
      const s = (str || '').toString().toLowerCase();
      return s.includes(term);
    };

    // Trips: search destination/name/notes; person filter via traveler_ids
    const trips = (data.trips || []).filter((t: any) => {
      // traveler_ids is already an array of UUIDs
      const textBlob = [t.destination, t.name, t.notes, t.location].filter(Boolean).join(' ');
      return matchesText(textBlob);
    });

    // Travel details: search provider/airports/locations/notes; person via travelers array
    const details = (data.travel_details || []).filter((d: any) => {
      let travelerIds = (d.travelers || d.travelers_ids || d.traveler_ids) as string[] | undefined;
      if ((!travelerIds || travelerIds.length === 0) && d.trip_id) {
        const trip = (data.trips || []).find((t: any) => t.id === d.trip_id);
        // Use traveler_ids from the trip (already an array of UUIDs)
        travelerIds = trip?.traveler_ids || [];
      }
      travelerIds = (travelerIds || []).filter(Boolean);
      const textBlob = [d.type, d.provider, d.airline, d.flight_number, d.departure_airport, d.arrival_airport, d.departure_location, d.arrival_location, d.notes].filter(Boolean).join(' ');
      if (filters.tripId && d.trip_id !== filters.tripId) return false;
      return matchesText(textBlob);
    });

    // Accommodations: search hotel/name/address/notes; person via joining to trip (best effort)
    const accommodations = (data.accommodations || []).filter((a: any) => {
      if (filters.tripId && a.trip_id !== filters.tripId) return false;
      const textBlob = [a.hotel_name, a.name, a.address, a.notes, a.confirmation_number].filter(Boolean).join(' ');
      return matchesText(textBlob);
    });

    // Documents: title/file_name; no person association currently
    const documents = (data.documents || []).filter((doc: any) => {
      if (filters.tripId) {
        const linked = (doc.source_page === 'travel' && (doc.source_id === filters.tripId));
        if (!linked) return false;
      }
      return matchesText([doc.title, doc.file_name, doc.notes].filter(Boolean).join(' '));
    });

    // Contacts: name/company/notes
    const contacts = (data.contacts || []).filter((c: any) => {
      if (filters.tripId && c.trip_id !== filters.tripId) return false;
      return matchesText([c.name, c.company, c.notes].filter(Boolean).join(' '));
    });

    return { trips, details, accommodations, documents, contacts };
  }, [data, filters]);

  const handleDocumentCopy = async (doc: Document) => {
    try {
      await copyLink(doc);
    } catch (error) {
      console.error('Failed to copy document link:', error);
    }
  };

  const handleDocumentView = async (doc: Document) => {
    try {
      await viewDocument(doc);
    } catch (error) {
      console.error('Failed to open document:', error);
    }
  };

  const handleDocumentDownload = async (doc: Document) => {
    try {
      await downloadDocument(doc);
    } catch (error) {
      console.error('Failed to download document:', error);
    }
  };

  const handleDocumentPreview = async (doc: Document) => {
    try {
      await openPreview(doc);
    } catch (error) {
      console.error('Failed to preview document:', error);
    }
  };

  const IconForType = ({ type }: { type?: string }) => {
    const t = (type || 'other').toLowerCase();
    if (t === 'flight' || t === 'helicopter') return <Plane className="w-4 h-4 text-blue-400" />;
    if (t === 'train') return <Train className="w-4 h-4 text-blue-400" />;
    if (t === 'car_rental' || t === 'private_driver') return <Car className="w-4 h-4 text-blue-400" />;
    if (t === 'ferry') return <Ship className="w-4 h-4 text-blue-400" />;
    return <Globe className="w-4 h-4 text-blue-400" />;
  };
  const daysUntil = (date?: string | null) => {
    if (!date) return null;
    const today = new Date();
    const d = new Date(`${date}T00:00:00`);
    const diff = Math.ceil((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / (1000*60*60*24));
    return diff;
  };

  // Helpers to render dashboard-like summaries on cards
  const formatDateTime = (date?: string | null, time?: string | null) => {
    if (!date && !time) return '';
    if (date && time) {
      const d = new Date(`${date}T${String(time).slice(0,8)}`);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    if (date) {
      const d = new Date(`${date}T00:00:00`);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    }
    return String(time).slice(0,5);
  };
  const joinNames = (names: string[]) => {
    if (names.length === 0) return 'Someone';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  };
  const getTravelerNames = (detail: any) => {
    if (Array.isArray(detail.traveler_names) && detail.traveler_names.length > 0) return detail.traveler_names as string[];
    const famMap = new Map((data.family_members || []).map((m: any) => [m.id, m.name]));
    // Try resolving from detail.travelers UUIDs
    if (Array.isArray(detail.travelers) && detail.travelers.length > 0) {
      const names = (detail.travelers as string[]).map(id => famMap.get(id)).filter(Boolean) as string[];
      if (names.length > 0) return names;
    }
    // Fallback to linked trip's traveler_names or traveler_ids
    if (detail.trip_id) {
      const trip = (data.trips || []).find((t: any) => t.id === detail.trip_id);
      if (trip) {
        if (Array.isArray(trip.traveler_names) && trip.traveler_names.length > 0) return trip.traveler_names as string[];
        if (Array.isArray(trip.traveler_ids) && trip.traveler_ids.length > 0) {
          const names = (trip.traveler_ids as string[]).map((id: string) => famMap.get(id)).filter(Boolean) as string[];
          if (names.length > 0) return names;
        }
      }
    }
    // If a single person filter is applied, use that name
    if (assignedTo && assignedTo !== 'all') {
      const n = famMap.get(assignedTo);
      if (n) return [n];
    }
    return [] as string[];
  };
  const summarizeTransport = (d: any) => {
    const names = joinNames(getTravelerNames(d));
    const type = (d.type || 'travel').toLowerCase();
    const dep = d.departure_airport || d.departure_location || 'departure';
    const arr = d.arrival_airport || d.arrival_location || 'destination';
    const depDt = formatDateTime(d.travel_date || undefined, d.departure_time || undefined);
    const arrTime = d.arrival_time ? new Date(`${d.travel_date || ''}T${String(d.arrival_time).slice(0,8)}`).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    if (type === 'flight') {
      const airline = d.airline || 'the airline';
      const flightNum = d.flight_number ? ` Flight ${d.flight_number}` : '';
      return `${names} will be flying on ${airline}${flightNum} on ${depDt} from ${dep} to ${arr}${arrTime ? `, landing at ${arrTime}` : ''}`;
    } else if (type === 'train') {
      const prov = d.provider || 'the train';
      const trainNum = d.train_number ? ` Train ${d.train_number}` : '';
      return `${names} will be taking ${prov}${trainNum} on ${depDt} from ${dep} to ${arr}${arrTime ? `, arriving at ${arrTime}` : ''}`;
    } else if (type === 'car_rental') {
      const prov = d.provider || 'the rental company';
      return `${names} will pick up a car from ${prov} on ${depDt}${d.departure_location ? ` in ${d.departure_location}` : ''}`;
    }
    const prov = d.provider || 'transportation';
    return `${names} will be traveling via ${prov} on ${depDt} from ${dep} to ${arr}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-text-primary">Travel</h1>
        <div className="flex items-center gap-2" />
      </div>
      
      {/* Top controls: Add Trip + All Trips */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setShowAddTrip(true)}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
          >
            Add Trip
          </button>
          <button
            onClick={() => { setShowTripsList(true); setSelectedTripId(null); }}
            className={`px-4 py-2 text-sm rounded-xl border border-gray-600/40 ${!selectedTripId ? 'bg-gray-700 text-white' : 'bg-background-secondary text-text-muted hover:text-text-primary'}`}
          >
            All Trips
          </button>
          {(data.trips || []).map((t: any) => (
            <button
              key={t.id}
              onClick={() => { setSelectedTripId(t.id); setShowTripsList(false); }}
              className={`px-3 py-1.5 text-sm rounded-xl border ${selectedTripId===t.id ? 'bg-primary-700/70 text-white border-primary-600' : 'bg-background-secondary text-text-muted hover:text-text-primary border-gray-600/40'}`}
              title={t.destination || t.name}
            >
              {t.destination || t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search + Filters bar (match Tasks styling) */}
      <TravelSearchFilter
        onSearchChange={setSearch}
        customOptions={peopleOptions}
        selectedOption={assignedTo}
        onOptionChange={(value) => {
          if (value === 'all') {
            setSelectedPersonId(null);
          } else {
            setSelectedPersonId(value);
          }
        }}
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-600/30">
        {[
          { k: 'transport', label: 'Transportation' },
          { k: 'documents', label: 'Documents' },
          { k: 'contacts', label: 'Contacts' },
          { k: 'preferences', label: 'Preferences' },
          { k: 'history', label: 'History' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => { setActiveTab(t.k as any); setShowTripsList(false); }}
            className={`px-3 py-2 text-sm border-b-2 ${activeTab===t.k ? 'border-primary-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
        </div>
      ) : error ? (
        <div className="text-urgent">{error}</div>
      ) : (
        <div className="space-y-4">
          {/* Main content by tab */}
            {showTripsList && (
              <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold text-text-primary">Trips</h2>
                  <span className="text-xs text-text-muted">{filtered.trips.length} total</span>
                </div>
                <div className="divide-y divide-gray-700/50">
                  {filtered.trips.map((t: any) => (
                    <div key={t.id} className="py-2 text-sm text-text-muted flex items-center justify-between">
                      <div className="truncate text-text-primary">{t.destination || t.name}</div>
                      <div className="flex items-center gap-2">
                        <button className="text-xs px-2 py-1 bg-button-edit text-white rounded" onClick={() => setEditingTrip(t)}>Edit</button>
                        <button className="text-xs px-2 py-1 bg-button-delete text-white rounded" onClick={async ()=>{ if(!confirm('Delete this trip?')) return; await ApiClient.delete(`/api/trips/${t.id}`); await refreshData(); }}>Delete</button>
                      </div>
                    </div>
                  ))}
                  {(filtered.trips.length === 0) && (
                    <div className="py-6 text-center text-text-muted">No trips</div>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'transport' && (
              <>
              <section className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-text-primary">Transportation</h2>
                    <span className="text-xs text-text-muted">{filtered.details.length} items</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddTransport(true)}
                      className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
                    >
                      Add Transportation
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {filtered.details.map((d: any) => (
                    <div
                      key={d.id}
                      className="bg-background-primary border border-gray-600/30 hover:border-gray-500 rounded-xl p-4 cursor-pointer transition-colors"
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (!target.closest('button')) setViewingDetail(d);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <IconForType type={d.type} />
                          <div className="text-sm font-medium text-text-primary capitalize">
                            {d.type?.replace('_',' ') || 'detail'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Date (right aligned) */}
                          <div className="text-xs text-text-muted whitespace-nowrap">{formatDateTime(d.travel_date || undefined, d.departure_time || undefined)}</div>
                          <button
                            onClick={() => setEditingTransport(d)}
                            className="p-1.5 hover:bg-gray-700/30 rounded"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4 text-text-muted" />
                          </button>
                          <button
                            onClick={async ()=>{ if(!confirm('Delete this item?')) return; await ApiClient.delete(`/api/travel-details/${d.id}`); await refreshData(); }}
                            className="p-1.5 hover:bg-gray-700/30 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-text-muted" />
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-text-muted">
                        {summarizeTransport(d)}
                      </p>
                      {(() => { const du = daysUntil(d.travel_date); return (du !== null) ? (
                        <div className="mt-1 text-xs text-travel font-semibold">{du === 0 ? 'Today' : du === 1 ? '1 day' : `${du} days`}</div>
                      ) : null; })()}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                        {d.confirmation_number && <div>Confirmation: <span className="text-text-primary">{d.confirmation_number}</span></div>}
                      </div>
                    </div>
                  ))}
                  {(filtered.details.length === 0) && (
                    <div className="py-6 text-center text-text-muted">No transportation details</div>
                  )}
                </div>
                {/* Accommodations section under Transportation */}
              </section>
              {/* Separate Accommodations module wrapper */}
              <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4 mt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-text-primary">Accommodations</h3>
                    <span className="text-xs text-text-muted">{filtered.accommodations.length} total</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddAccommodation(true)}
                      className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
                    >
                      Add Accommodation
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {filtered.accommodations.map((a: any) => (
                    <div key={a.id} className="bg-background-primary border border-gray-600/30 hover:border-gray-500 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text-primary truncate">{a.hotel_name || a.name || 'Accommodation'}</div>
                          <div className="text-xs text-text-muted mt-1">
                            Check-in: <span className="text-text-primary">{formatDateTime(a.check_in || a.check_in_date || undefined, a.check_in_time || undefined)}</span>
                            {a.check_out || a.check_out_date ? (
                              <> • Check-out: <span className="text-text-primary">{formatDateTime(a.check_out || a.check_out_date, a.check_out_time || undefined)}</span></>
                            ) : null}
                          </div>
                          {a.confirmation_number && (
                            <div className="text-xs text-text-muted mt-1">Confirmation: <span className="text-text-primary">{a.confirmation_number}</span></div>
                          )}
                          {a.address && (
                            <div className="text-xs text-text-muted mt-1 truncate">{a.address}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-none">
                          <button
                            onClick={() => setEditingAccommodation(a)}
                            className="p-1.5 hover:bg-gray-700/30 rounded"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4 text-text-muted" />
                          </button>
                          <button
                            onClick={async ()=>{ if(!confirm('Delete this accommodation?')) return; await ApiClient.delete(`/api/travel-accommodations/${a.id}`); await refreshData(); }}
                            className="p-1.5 hover:bg-gray-700/30 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-text-muted" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(filtered.accommodations.length === 0) && (
                    <div className="py-6 text-center text-text-muted">No accommodations added</div>
                  )}
                </div>
              </section>
              </>
            )}

            {activeTab === 'history' && (
              <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold text-text-primary">History</h2>
                </div>
                {(() => {
                  type HistoryItem = { id: string; type: 'transport' | 'accommodation'; label: string; date: string; right?: string };
                  const items: HistoryItem[] = [];
                  for (const d of filtered.details) {
                    const dateStr = d.travel_date || d.departure_datetime || '';
                    items.push({ id: `d-${d.id}`, type: 'transport', label: `${(d.type||'detail').replace('_',' ')} — ${d.departure_location || d.departure_airport || d.provider || ''}`.trim(), date: dateStr, right: d.arrival_location || d.arrival_airport || '' });
                  }
                  for (const a of filtered.accommodations) {
                    items.push({ id: `a-${a.id}`, type: 'accommodation', label: `${a.hotel_name || a.name || 'Accommodation'}`, date: a.check_in_date || a.check_in_datetime || a.created_at || '' });
                  }
                  items.sort((x,y) => new Date(x.date || 0).getTime() - new Date(y.date || 0).getTime());
                  return (
                    <div className="divide-y divide-gray-700/50">
                      {items.map(it => (
                        <div key={it.id} className="py-2 text-sm flex items-center justify-between gap-3">
                          <span className="truncate text-text-muted">
                            <span className={`inline-block px-2 py-0.5 mr-2 rounded text-xs ${it.type==='transport'?'bg-blue-900/50 text-blue-200':'bg-emerald-900/50 text-emerald-200'}`}>{it.type==='transport'?'Transport':'Accommodation'}</span>
                            {it.label}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">{it.date}</span>
                          </div>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div className="py-6 text-center text-text-muted">No history</div>
                      )}
                    </div>
                  );
                })()}
              </section>
            )}

            {activeTab === 'documents' && (
              <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-text-primary">Travel Documents</h2>
                    <span className="text-xs text-text-muted">{filtered.documents.length} total</span>
                  </div>
                  <button onClick={() => setShowUploadDoc(true)} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Upload Document</button>
                </div>
                {filtered.documents.length === 0 ? (
                  <div className="py-6 text-center text-text-muted">No documents</div>
                ) : (
                  <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
                    {(filtered.documents as Document[]).map((doc) => (
                      <DocumentCard
                        key={doc.id}
                        doc={doc}
                        familyMemberMap={familyMemberMap}
                        onCopy={handleDocumentCopy}
                        onView={handleDocumentView}
                        onDownload={handleDocumentDownload}
                        onOpen={handleDocumentPreview}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'contacts' && (
              <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-text-primary">Travel Contacts</h2>
                    <span className="text-xs text-text-muted">{filtered.contacts.length} total</span>
                  </div>
                  <button onClick={() => setShowAddContact(true)} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Add Contact</button>
                </div>
                <ul className="space-y-2">
                  {filtered.contacts.map((c: any) => (
                    <li key={c.id} className="text-sm text-text-muted truncate">{c.name}</li>
                  ))}
                  {(filtered.contacts.length === 0) && (
                    <li className="text-text-muted">No contacts</li>
                  )}
                </ul>
              </section>
            )}

            {activeTab === 'preferences' && (
              <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-text-primary">Preferences</h2>
                  <button
                    className="px-4 py-2 bg-button-create hover:bg-button-create/90 text-white rounded-xl"
                    onClick={async () => {
                      const payload = { airline_programs: { per_member: memberPrefs } };
                      await ApiClient.post('/api/travel-preferences', payload);
                    }}
                  >
                    Save Preferences
                  </button>
                </div>
                <div className="space-y-3">
                  {data.family_members.map((m: any) => (
                    <div key={m.id} className="bg-background-primary border border-gray-600/30 rounded-xl p-3">
                      <div className="text-sm font-medium text-text-primary mb-2">{m.name}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block text-sm">Seat Preference
                          <select
                            value={memberPrefs[m.id]?.seat || ''}
                            onChange={(e)=>setMemberPrefs(prev=>({ ...prev, [m.id]: { ...(prev[m.id]||{}), seat: e.target.value } }))}
                            className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary"
                          >
                            <option value="">No preference</option>
                            <option value="aisle">Aisle</option>
                            <option value="window">Window</option>
                            <option value="middle">Middle</option>
                          </select>
                        </label>
                        <label className="block text-sm">Meal Preference
                          <select
                            value={memberPrefs[m.id]?.meal || ''}
                            onChange={(e)=>setMemberPrefs(prev=>({ ...prev, [m.id]: { ...(prev[m.id]||{}), meal: e.target.value } }))}
                            className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary"
                          >
                            <option value="">No preference</option>
                            <option value="vegetarian">Vegetarian</option>
                            <option value="vegan">Vegan</option>
                            <option value="gluten_free">Gluten-free</option>
                            <option value="kosher">Kosher</option>
                            <option value="halal">Halal</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
        </div>
      )}

      {(showAddTrip || editingTrip) && (
        <AddTripModal
          familyMembers={data.family_members}
          trip={editingTrip || undefined}
          onClose={() => { setShowAddTrip(false); setEditingTrip(null); }}
          onCreated={() => {
            setShowAddTrip(false); setEditingTrip(null); setShowTripsList(true);
            // refresh
            refreshData();
          }}
        />
      )}

  {/* View Travel Detail Modal */}
  {viewingDetail && (
    <ViewTravelDetailModal
      detail={viewingDetail}
      trips={data.trips}
      travelerNames={getTravelerNames(viewingDetail)}
      googleCalendars={googleCalendars}
      onClose={() => setViewingDetail(null)}
    />
  )}

      <DocumentPreviewModal
        doc={previewDoc}
        signedUrl={previewUrl}
        loading={previewLoading}
        error={previewError}
        onClose={closePreview}
        onDownload={handleDocumentDownload}
      />

      {/* Upload Document Modal */}
      {showUploadDoc && (
        <UploadTravelDocumentModal
          onClose={() => setShowUploadDoc(false)}
          onUploaded={async ()=>{ setShowUploadDoc(false); await refreshData(); }}
          familyMembers={data.family_members}
        />
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <AddTravelContactModal
          onClose={() => setShowAddContact(false)}
          onSaved={async ()=>{ setShowAddContact(false); await refreshData(); }}
          trips={data.trips}
        />
      )}

      {(showAddTransport || editingTransport) && (
        <AddTransportationModal
          trips={data.trips}
          familyMembers={data.family_members}
          detail={editingTransport || undefined}
          defaultTripId={selectedTripId || undefined}
          defaultTravelerId={selectedPersonParam || undefined}
          onClose={() => { setShowAddTransport(false); setEditingTransport(null); }}
          onCreated={() => {
            setShowAddTransport(false); setEditingTransport(null);
            refreshData();
          }}
        />
      )}

      {(showAddAccommodation || editingAccommodation) && (
        <AddAccommodationModal
          trips={data.trips}
          defaultTripId={selectedTripId || undefined}
          accommodation={editingAccommodation || undefined}
          onClose={() => { setShowAddAccommodation(false); setEditingAccommodation(null); }}
          onSaved={() => { setShowAddAccommodation(false); setEditingAccommodation(null); refreshData(); }}
        />
      )}
    </div>
  );
}

// Minimal view modal for a travel detail
function ViewTravelDetailModal({ detail, trips, travelerNames, googleCalendars = [], onClose }: { detail: any; trips: any[]; travelerNames: string[]; googleCalendars?: Array<{ google_calendar_id?: string; id?: string; name?: string }>; onClose: () => void }) {
  const relatedTrip = trips.find(t => t.id === detail.trip_id);
  const typeLabel = (detail.type || 'Travel').replace(/_/g, ' ');

  const formatDateTimeLong = (date?: string | null, time?: string | null) => {
    if (!date && !time) return '';
    if (date && time) {
      const safeTime = String(time).length === 5 ? `${time}:00` : String(time).slice(0, 8);
      const d = new Date(`${date}T${safeTime}`);
      return d.toLocaleString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
    if (date) {
      const d = new Date(`${date}T00:00:00`);
      return d.toLocaleString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
    return String(time).slice(0, 5);
  };

  const departureLocation = detail.departure_airport || detail.departure_location || detail.origin || '';
  const arrivalLocation = detail.arrival_airport || detail.arrival_location || detail.destination || '';
  const departureDisplay = formatDateTimeLong(detail.travel_date || detail.departure_date, detail.departure_time);
  const arrivalDisplay = formatDateTimeLong(detail.arrival_date || detail.travel_date, detail.arrival_time);

  const summaryTitle = (() => {
    const airline = detail.airline ? detail.airline.trim() : '';
    const flight = detail.flight_number ? String(detail.flight_number).toUpperCase() : '';
    if (airline || flight) return `${airline}${airline && flight ? ' ' : ''}${flight}`.trim();
    if (detail.provider) return detail.provider;
    if (departureLocation && arrivalLocation) return `${departureLocation} → ${arrivalLocation}`;
    return `${typeLabel} Detail`;
  })();

  const calendarId = detail.google_calendar_id
    || detail.googleCalendarId
    || detail.metadata?.google_calendar_id
    || detail.calendar_event?.google_calendar_id
    || null;
  const calendarDisplayName = calendarId
    ? (() => {
        const match = googleCalendars.find(cal => (cal.google_calendar_id || cal.id) === calendarId);
        return match?.name || 'Google Calendar';
      })()
    : null;

  const infoItems = [
    { label: 'Travel Type', value: typeLabel },
    relatedTrip ? { label: 'Trip', value: relatedTrip.destination || relatedTrip.name } : null,
    detail.confirmation_number ? { label: 'Confirmation', value: detail.confirmation_number } : null,
    detail.provider ? { label: 'Provider', value: detail.provider } : null,
    detail.seat ? { label: 'Seat', value: detail.seat } : null,
    detail.cabin_class || detail.travel_class
      ? { label: 'Class', value: detail.cabin_class || detail.travel_class }
      : null,
    travelerNames.length > 0
      ? { label: 'Assigned To', value: travelerNames.join(', ') }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const TypeIcon = ({ large }: { large?: boolean }) => {
    const size = large ? 'h-6 w-6' : 'h-5 w-5';
    const t = (detail.type || '').toLowerCase();
    if (t === 'flight' || t === 'helicopter') return <Plane className={`${size} text-blue-300`} />;
    if (t === 'train') return <Train className={`${size} text-blue-300`} />;
    if (t === 'car_rental' || t === 'private_driver') return <Car className={`${size} text-blue-300`} />;
    if (t === 'ferry') return <Ship className={`${size} text-blue-300`} />;
    return <Globe className={`${size} text-blue-300`} />;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-background-secondary rounded-2xl w-full max-w-3xl border border-gray-600/30 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-600/30 bg-background-secondary">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/10 text-blue-300 p-3"><TypeIcon large /></div>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">{summaryTitle}</h2>
              {(departureDisplay || arrivalDisplay) && (
                <p className="text-sm text-text-muted">
                  {departureDisplay ? `Departs ${departureDisplay}` : 'Schedule forthcoming'}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-text-muted hover:text-text-primary hover:bg-gray-700/30 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-500/10 text-blue-300 p-2">
                <Ticket className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-text-muted uppercase tracking-wide">Overview</p>
                <p className="text-sm text-text-primary mt-1">
                  {departureLocation && arrivalLocation
                    ? `${departureLocation} → ${arrivalLocation}`
                    : travellerOrType(typeLabel, travelerNames)}
                </p>
              </div>
            </div>
                    {infoItems.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3 text-sm">
                        {infoItems.map(item => (
                          <div key={item.label}>
                            <p className="text-xs uppercase tracking-wide text-text-muted">{item.label}</p>
                            <p className="text-text-primary mt-1 break-words">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                        <p className="text-xs text-text-muted uppercase">Calendar Sync</p>
                        <p className="text-sm text-text-primary mt-1">
                          {calendarId ? calendarDisplayName : 'Not synced to Google Calendar'}
                        </p>
                      </div>
                      {calendarId && (
                        <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                          <p className="text-xs text-text-muted uppercase">Calendar ID</p>
                          <p className="text-xs text-text-muted mt-1 break-all">{calendarId}</p>
                        </div>
                      )}
                    </div>
                  </div>

          {(departureDisplay || arrivalDisplay) && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-300" /> Schedule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {departureDisplay && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                    <p className="text-xs text-text-muted uppercase flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-300" /> Departure
                    </p>
                    <p className="mt-2 text-sm text-text-primary font-medium">{departureLocation || 'TBD'}</p>
                    <p className="text-xs text-text-muted mt-1">{departureDisplay}</p>
                  </div>
                )}
                {arrivalDisplay && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                    <p className="text-xs text-text-muted uppercase flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-300" /> Arrival
                    </p>
                    <p className="mt-2 text-sm text-text-primary font-medium">{arrivalLocation || 'TBD'}</p>
                    <p className="text-xs text-text-muted mt-1">{arrivalDisplay}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {travelerNames.length > 0 && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-300" /> Assigned To
              </h3>
              <div className="flex flex-wrap gap-2">
                {travelerNames.map(name => (
                  <span key={name} className="px-3 py-1 text-sm rounded-full bg-[#2A2A28] border border-[#3A3A38] text-text-primary">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {detail.notes && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Notes</h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{detail.notes}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );

  function travellerOrType(defaultLabel: string, names: string[]) {
    if (names.length === 0) return defaultLabel;
    if (names.length === 1) return `${names[0]}'s ${defaultLabel}`;
    if (names.length === 2) return `${names[0]} & ${names[1]} — ${defaultLabel}`;
    return `${names[0]}, ${names[1]} +${names.length - 2} — ${defaultLabel}`;
  }
}

// Upload document modal (uses /api/documents/upload)
function UploadTravelDocumentModal({ onClose, onUploaded, familyMembers }: { onClose: () => void; onUploaded: () => void; familyMembers: any[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [assignedPersonIds, setAssignedPersonIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const toggleAssigned = (id: string) => setAssignedPersonIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('title', title || file.name);
      fd.set('category', 'travel');
      fd.set('sourcePage', 'travel');
      fd.set('relatedPeople', JSON.stringify(assignedPersonIds));
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd, headers: getCSRFHeaders() });
      if (res.ok) onUploaded();
    } finally { setSubmitting(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-xl w-full max-w-xl border border-gray-600/30">
        <div className="p-4 border-b border-gray-600/30 flex items-center justify-between">
          <div className="font-semibold text-text-primary">Upload Travel Document</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-sm">File
            <input type="file" onChange={e=>setFile(e.target.files?.[0]||null)} className="mt-1 w-full text-sm" />
          </label>
          <label className="block text-sm">Title
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Document title" className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <div>
            <div className="text-sm mb-1">Assign To</div>
            <div className="grid grid-cols-2 gap-2 p-2 bg-background-primary rounded border border-gray-600/30 max-h-40 overflow-auto">
              {familyMembers.map((m:any)=> (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={assignedPersonIds.includes(m.id)} onChange={()=>toggleAssigned(m.id)} />
                  <span className="text-text-primary">{m.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-gray-600/30 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary">Cancel</button>
          <button disabled={!file || submitting} onClick={submit} className="px-3 py-2 bg-button-create disabled:bg-gray-700 text-white rounded">{submitting?'Uploading...':'Upload'}</button>
        </div>
      </div>
    </div>
  );
}

// Add travel contact modal (uses /api/travel-contacts)
function AddTravelContactModal({ onClose, onSaved, trips }: { onClose: () => void; onSaved: () => void; trips: any[] }) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [tripId, setTripId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = { name, company, phone, email, address, notes, trip_id: tripId || null };
      const res = await ApiClient.post('/api/travel-contacts', payload);
      if (res.success) onSaved();
    } finally { setSubmitting(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-xl w-full max-w-xl border border-gray-600/30">
        <div className="p-4 border-b border-gray-600/30 flex items-center justify-between">
          <div className="font-semibold text-text-primary">Add Travel Contact</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-sm">Name
            <input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Company
              <input value={company} onChange={e=>setCompany(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
            <label className="block text-sm">Trip (optional)
              <select value={tripId} onChange={(e)=>setTripId(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary">
                <option value="">(none)</option>
                {trips.map(t => <option key={t.id} value={t.id}>{t.destination || t.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Phone
              <input value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
            <label className="block text-sm">Email
              <input value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
          </div>
          <label className="block text-sm">Address
            <input value={address} onChange={e=>setAddress(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <label className="block text-sm">Notes
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
        </div>
        <div className="p-4 border-t border-gray-600/30 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary">Cancel</button>
          <button disabled={!name || submitting} onClick={submit} className="px-3 py-2 bg-button-create disabled:bg-gray-700 text-white rounded">{submitting?'Saving...':'Save'}</button>
        </div>
      </div>
    </div>
  );
}
// Minimal Add Trip Modal
function AddTripModal({ familyMembers, onClose, onCreated, trip }: { familyMembers: any[]; onClose: () => void; onCreated: () => void; trip?: any }) {
  const [destination, setDestination] = useState(trip?.destination || trip?.name || '');
  const [start, setStart] = useState(trip?.start_date || ''); // yyyy-mm-dd
  const [end, setEnd] = useState(trip?.end_date || '');
  const [travelerIds, setTravelerIds] = useState<string[]>(trip?.traveler_ids || []);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = destination && start && end && !submitting;

  const submit = async () => {
    try {
      setSubmitting(true);
      const payload = { destination, start_date: start, end_date: end, travelers: travelerIds, create_calendar_event: true };
      const url = trip ? `/api/trips/${trip.id}` : '/api/trips';
      const res = trip ? await ApiClient.put(url, payload) : await ApiClient.post(url, payload);
      if (res.success) onCreated();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-lg w-full max-w-xl border border-gray-600/30">
        <div className="p-4 border-b border-gray-600/30 flex items-center justify-between">
          <div className="font-semibold text-text-primary">{trip ? 'Edit Trip' : 'Add Trip'}</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-sm">Destination
            <input value={destination} onChange={e=>setDestination(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Start Date
              <input type="date" value={start} onChange={e=>setStart(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
            <label className="block text-sm">End Date
              <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
          </div>
          <TravelersPicker
            selectedIds={travelerIds}
            onChange={setTravelerIds}
            includePets
            includeExtended
            title="Assign To"
          />
        </div>
        <div className="p-4 border-t border-gray-600/30 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary">Cancel</button>
          <button disabled={!canSubmit} onClick={submit} className="px-3 py-2 bg-button-create disabled:bg-gray-700 text-white rounded">{submitting?'Saving...':'Create Trip'}</button>
        </div>
      </div>
    </div>
  );
}

// Minimal Add Transportation Modal
function AddTransportationModal({ trips, onClose, onCreated, familyMembers, detail, defaultTripId, defaultTravelerId }: { trips: any[]; onClose: () => void; onCreated: () => void; familyMembers?: any[]; detail?: any; defaultTripId?: string; defaultTravelerId?: string }) {
  const [type, setType] = useState<TransportType>(detail?.type || 'flight');
  const [tripId, setTripId] = useState<string>(detail?.trip_id || defaultTripId || '');
  const [travelDate, setTravelDate] = useState(detail?.travel_date || '');
  const [departureTime, setDepartureTime] = useState(detail?.departure_time ? String(detail.departure_time).slice(0,5) : ''); // HH:MM
  const [arrivalTime, setArrivalTime] = useState(detail?.arrival_time ? String(detail.arrival_time).slice(0,5) : '');
  const [departureAirport, setDepartureAirport] = useState(detail?.departure_airport || '');
  const [arrivalAirport, setArrivalAirport] = useState(detail?.arrival_airport || '');
  const [departureLocation, setDepartureLocation] = useState(detail?.departure_location || '');
  const [arrivalLocation, setArrivalLocation] = useState(detail?.arrival_location || '');
  const [airline, setAirline] = useState(detail?.airline || '');
  const [flightNumber, setFlightNumber] = useState(detail?.flight_number || '');
  const [provider, setProvider] = useState(detail?.provider || '');
  const [notes, setNotes] = useState(detail?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const initialTravelerIds = detail?.travelers || (defaultTravelerId ? [defaultTravelerId] : []);
  const [travelerIds, setTravelerIds] = useState<string[]>(initialTravelerIds);
  const [guestTraveler, setGuestTraveler] = useState<string>('');
  const [saveLocalOnly, setSaveLocalOnly] = useState(false);
  const [googleCalendarId, setGoogleCalendarId] = useState<string>('');
  const [additionalAttendees, setAdditionalAttendees] = useState('');
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
  const [doNotSendInvite, setDoNotSendInvite] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; title: string; category: string }>>([]);
  const { toast } = useToast();

  const docCategories = [
    { id: 'medical', name: 'Medical' },
    { id: 'financial', name: 'Financial' },
    { id: 'legal', name: 'Legal' },
    { id: 'education', name: 'Education' },
    { id: 'travel', name: 'Travel' },
    { id: 'property', name: 'Property' },
    { id: 'vehicles', name: 'Vehicles' },
    { id: 'personal', name: 'Personal' },
    { id: 'work', name: 'Work' },
    { id: 'photos', name: 'Photos' },
    { id: 'other', name: 'Other' },
  ];

  useEffect(() => {
    if (!detail && defaultTripId && !tripId) {
      setTripId(defaultTripId);
    }
  }, [defaultTripId, detail, tripId]);

  useEffect(() => {
    if (!detail && defaultTravelerId) {
      setTravelerIds((prev) => {
        if (prev.length === 0) return [defaultTravelerId];
        if (prev.includes(defaultTravelerId)) return prev;
        return [...prev, defaultTravelerId];
      });
    }
  }, [defaultTravelerId, detail]);

  // Load Google calendars on open
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/google/calendars/list');
        if (res.ok) {
          const data = await res.json();
          const cals = data.calendars || [];
          setGoogleCalendars(cals);
          // Pick primary or first
          const primary = cals.find((c: any) => c.primary) || cals[0];
          if (primary) setGoogleCalendarId(primary.google_calendar_id || primary.id);
        }
      } catch {}
    })();
  }, []);

  const submit = async () => {
    try {
      setSubmitting(true);
      const payload: any = {
        type,
        trip_id: tripId || null,
        travel_date: travelDate || null,
        departure_time: travelDate && departureTime ? `${travelDate}T${departureTime}:00` : null,
        arrival_time: travelDate && arrivalTime ? `${travelDate}T${arrivalTime}:00` : null,
        departure_airport: departureAirport || null,
        arrival_airport: arrivalAirport || null,
        departure_location: departureLocation || null,
        arrival_location: arrivalLocation || null,
        airline: airline || null,
        flight_number: flightNumber || null,
        provider: provider || null,
        notes: notes || null,
        travelers: travelerIds,
        google_sync_enabled: !saveLocalOnly,
        google_calendar_id: !saveLocalOnly ? (googleCalendarId || null) : null,
        // Email invites behavior
        send_invites: !doNotSendInvite,
        notify_attendees: !doNotSendInvite,
        additional_attendees: [
          ...((additionalAttendees || '').split(',').map(x => x.trim()).filter(Boolean)),
          ...(guestTraveler && guestTraveler.includes('@') ? [guestTraveler.trim()] : [])
        ],
      };
      const url = detail ? `/api/travel-details/${detail.id}` : '/api/travel-details';
      const res = detail ? await ApiClient.put(url, payload) : await ApiClient.post(url, payload);
      if (!res.success) return;

      // Upload any pending documents after creating/updating the transportation
      if (pendingFiles.length > 0) {
        const count = pendingFiles.length;
        const descriptionLines = [
          `Document for ${type}`,
          airline ? `Airline: ${airline}` : undefined,
          flightNumber ? `Flight: ${flightNumber}` : undefined,
        ].filter(Boolean) as string[];

        await uploadPendingDocs({
          pendingFiles,
          sourcePage: 'travel',
          sourceId: tripId || null,
          relatedPeople: travelerIds,
          descriptionLines,
        });
        setPendingFiles([]);
        toast({ title: 'Uploaded travel documents', description: `${count} file${count > 1 ? 's' : ''} uploaded.` });
      }

      onCreated();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-lg w-full max-w-2xl border border-gray-600/30">
        <div className="p-4 border-b border-gray-600/30 flex items-center justify-between">
          <div className="font-semibold text-text-primary">{detail ? 'Edit Transportation' : 'Add Transportation'}</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {/* Trip (optional) */}
          <label className="block text-sm">Trip
              <select value={tripId} onChange={e=>setTripId(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary">
                <option value="">(none)</option>
                {trips.map(t => (<option key={t.id} value={t.id}>{t.destination || t.name}</option>))}
              </select>
            </label>

          {/* Transport type tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { id: 'flight', label: 'Flight', icon: <Plane className="w-4 h-4 text-blue-400" /> },
              { id: 'train', label: 'Train', icon: <Train className="w-4 h-4 text-emerald-400" /> },
              { id: 'car_rental', label: 'Car Rental', icon: <Car className="w-4 h-4 text-amber-400" /> },
              { id: 'ferry', label: 'Ferry', icon: <Ship className="w-4 h-4 text-cyan-400" /> },
              { id: 'private_driver', label: 'Driver', icon: <Car className="w-4 h-4 text-sky-400" /> },
              { id: 'helicopter', label: 'Helicopter', icon: <Plane className="w-4 h-4 text-purple-400" /> },
              { id: 'other', label: 'Other', icon: <Globe className="w-4 h-4 text-gray-400" /> },
            ] as any[]).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setType(opt.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${type===opt.id ? 'border-2 border-gray-500' : 'border border-gray-600/30'} bg-background-primary`}
                title={opt.label}
              >
                {opt.icon}
                <span className="text-sm">{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Assign To */}
          {familyMembers && familyMembers.length > 0 && (
            <TravelersPicker selectedIds={travelerIds} onChange={setTravelerIds} includePets includeExtended title="Assign To" />
          )}

          {/* Guest traveler */}
          <div>
            <label className="block text-sm">Add Guest (email optional)
              <input value={guestTraveler} onChange={e=>setGuestTraveler(e.target.value)} placeholder="Enter name or email" className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
          </div>

          {/* Date/Times */}
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">Travel Date
              <input type="date" value={travelDate} onChange={e=>setTravelDate(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
            <label className="block text-sm">Depart Time
              <input type="time" value={departureTime} onChange={e=>setDepartureTime(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
            <label className="block text-sm">Arrive Time
              <input type="time" value={arrivalTime} onChange={e=>setArrivalTime(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
          </div>

          {type === 'flight' && (
            <TravelSegmentFields
              airline={airline} setAirline={setAirline}
              flightNumber={flightNumber} setFlightNumber={setFlightNumber}
              departureAirport={departureAirport} setDepartureAirport={setDepartureAirport}
              arrivalAirport={arrivalAirport} setArrivalAirport={setArrivalAirport}
            />
          )}

          {type !== 'flight' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Provider
                <input value={provider} onChange={e=>setProvider(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
              </label>
              <div />
              <label className="block text-sm">Departure Location
                <input value={departureLocation} onChange={e=>setDepartureLocation(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
              </label>
              <label className="block text-sm">Arrival Location
                <input value={arrivalLocation} onChange={e=>setArrivalLocation(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
              </label>
            </div>
          )}

          <label className="block text-sm">Notes
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          {/* Additional Attendees */}
          <label className="block text-sm">Additional Attendees
            <input
              value={additionalAttendees}
              onChange={e=>setAdditionalAttendees(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = additionalAttendees || '';
                  const parts = v.split(',').map(s => s.trim()).filter(Boolean);
                  const last = parts[parts.length - 1] || v.trim();
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (emailRegex.test(last)) {
                    // Commit current email with delimiter and space
                    const dedup = Array.from(new Set(parts));
                    setAdditionalAttendees(dedup.join(', ') + ', ');
                  }
                }
              }}
              placeholder="Enter additional attendee's email (press enter to add)"
              className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary"
            />
          </label>

          <InvitesCalendarPanel
            doNotSendInvite={doNotSendInvite}
            onDoNotSendInviteChange={setDoNotSendInvite}
            googleCalendars={googleCalendars}
            selectedCalendarId={googleCalendarId}
            onCalendarChange={setGoogleCalendarId}
            saveLocalOnly={saveLocalOnly}
            onSaveLocalOnlyChange={setSaveLocalOnly}
          />

          <DocumentUploadPanel
            pendingFiles={pendingFiles}
            setPendingFiles={(files)=>setPendingFiles(files)}
            categories={docCategories}
            smartUploadButton={
              <SmartUploadButtonV2
                context="travel-modal"
                tripId={tripId || undefined}
                onAutofill={(result: any) => {
                  try {
                    const data = result?.data || {};
                    if (!data) return;
                    if (data.airline || data.flight_number) setType('flight');
                    if (data.airline) setAirline(data.airline);
                    if (data.flight_number) setFlightNumber(data.flight_number);
                    if (data.departure_airport) setDepartureAirport(data.departure_airport);
                    if (data.arrival_airport) setArrivalAirport(data.arrival_airport);
                    if (data.departure_date) setTravelDate(data.departure_date);
                    if (data.departure_time) setDepartureTime(String(data.departure_time).slice(0,5));
                    if (data.arrival_time) setArrivalTime(String(data.arrival_time).slice(0,5));
                    if (Array.isArray(result?.matched_travelers) && result.matched_travelers.length > 0) {
                      setTravelerIds(result.matched_travelers.map((t: any) => t.id));
                    }
                    if (data.confirmation_number) {
                      setNotes((prev: string) => prev ? `${prev}\nConfirmation: ${data.confirmation_number}` : `Confirmation: ${data.confirmation_number}`);
                    }
                  } catch {}
                }}
                className="w-full justify-center"
              />
            }
          />
        </div>
        <div className="p-4 border-t border-gray-600/30 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 bg-background-primary border border-gray-600/40 rounded-xl text-text-primary">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-3 py-2 bg-button-create hover:bg-button-create/90 disabled:bg-gray-700 text-white rounded-xl">{submitting ? 'Saving...' : 'Add Transportation'}</button>
        </div>
      </div>
    </div>
  );
}

// Add/Edit Accommodation Modal
function AddAccommodationModal({ trips, onClose, onSaved, accommodation, defaultTripId }: { trips: any[]; onClose: () => void; onSaved: () => void; accommodation?: any; defaultTripId?: string }) {
  const [tripId, setTripId] = useState<string>(accommodation?.trip_id || defaultTripId || '');
  const [hotelName, setHotelName] = useState<string>(accommodation?.hotel_name || accommodation?.name || '');
  const [checkIn, setCheckIn] = useState<string>(accommodation?.check_in_date || '');
  const [checkOut, setCheckOut] = useState<string>(accommodation?.check_out_date || '');
  const [confirmation, setConfirmation] = useState<string>(accommodation?.confirmation_number || '');
  const [address, setAddress] = useState<string>(accommodation?.address || '');
  const [notes, setNotes] = useState<string>(accommodation?.notes || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accommodation && defaultTripId && !tripId) {
      setTripId(defaultTripId);
    }
  }, [accommodation, defaultTripId, tripId]);

  const submit = async () => {
    try {
      setSubmitting(true);
      const payload: any = {
        trip_id: tripId || null,
        hotel_name: hotelName || null,
        check_in_date: checkIn || null,
        check_out_date: checkOut || null,
        confirmation_number: confirmation || null,
        address: address || null,
        notes: notes || null,
      };
      const url = accommodation ? `/api/travel-accommodations/${accommodation.id}` : '/api/travel-accommodations';
      const method = accommodation ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) onSaved();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-lg w-full max-w-xl border border-gray-600/30">
        <div className="p-4 border-b border-gray-600/30 flex items-center justify-between">
          <div className="font-semibold text-text-primary">{accommodation ? 'Edit Accommodation' : 'Add Accommodation'}</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-sm">Trip
            <select value={tripId} onChange={e=>setTripId(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary">
              <option value="">(none)</option>
              {trips.map(t => (<option key={t.id} value={t.id}>{t.destination || t.name}</option>))}
            </select>
          </label>
          <label className="block text-sm">Hotel Name
            <input value={hotelName} onChange={e=>setHotelName(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Check-In
              <input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
            <label className="block text-sm">Check-Out
              <input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
            </label>
          </div>
          <label className="block text-sm">Confirmation #
            <input value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <label className="block text-sm">Address
            <input value={address} onChange={e=>setAddress(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
          <label className="block text-sm">Notes
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary" />
          </label>
        </div>
        <div className="p-4 border-t border-gray-600/30 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-3 py-2 bg-emerald-700 disabled:bg-gray-700 text-white rounded">{submitting ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
