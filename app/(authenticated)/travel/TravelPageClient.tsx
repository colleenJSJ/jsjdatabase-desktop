"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TransportType } from '@/types/travel';
import dynamic from 'next/dynamic';
import { SmartUploadButtonV2 } from '@/components/travel/SmartUploadButtonV2';
import { Plane, Train, Car, Ship, Globe, Pencil, Trash2, Calendar, Clock, MapPin, Users, Ticket, X } from 'lucide-react';
import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactModal as UnifiedContactModal } from '@/components/contacts/ContactModal';
import type { ContactCardBadge, ContactFormValues, ContactModalFieldVisibilityMap, ContactRecord } from '@/components/contacts/contact-types';
import { resolveAddresses, resolveEmails, resolvePhones } from '@/components/contacts/contact-utils';
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

const normalizeId = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;
  try {
    return String(raw);
  } catch {
    return null;
  }
};

const normalizeTravelerArray = (raw: unknown): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map(item => normalizeId(item))
      .filter((id): id is string => Boolean(id));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => normalizeId(item))
          .filter((id): id is string => Boolean(id));
      }
    } catch {
      return raw
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const matchesText = (searchTerm: string, value: unknown): boolean => {
  if (!searchTerm) return true;
  if (typeof value === 'string') {
    return value.toLowerCase().includes(searchTerm);
  }
  if (Array.isArray(value)) {
    return value.some(item => typeof item === 'string' && item.toLowerCase().includes(searchTerm));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(entry => typeof entry === 'string' && entry.toLowerCase().includes(searchTerm));
  }
  return false;
};

const matchesSearchBlob = (searchTerm: string, ...values: Array<unknown>): boolean => {
  if (!searchTerm) return true;
  return values.some(entry => matchesText(searchTerm, entry));
};

type TravelContactRaw = {
  id: string;
  name?: string | null;
  company?: string | null;
  organization?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  trip_id?: string | null;
  trip_name?: string | null;
  contact_type?: string | null;
  contact_subtype?: string | null;
  related_to?: string[] | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_preferred?: boolean | null;
  [key: string]: unknown;
};

const TRAVEL_CONTACT_MODAL_VISIBILITY: ContactModalFieldVisibilityMap = {
  tags: { hidden: true },
  portal: { hidden: true },
  assignedEntities: { hidden: true },
  favorite: { hidden: true },
  emergency: { hidden: true },
};

const sanitizeList = (values: (string | null | undefined)[] | undefined): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach(value => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        output.push(trimmed);
      }
    }
  });
  return output;
};

const toNullable = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const coerceTravelList = (...inputs: Array<unknown>): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  inputs.forEach(input => {
    if (!input) return;
    if (Array.isArray(input)) {
      input.forEach(value => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            output.push(trimmed);
          }
        }
      });
    } else if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        output.push(trimmed);
      }
    }
  });
  return output;
};

const toTravelContactRecord = (raw: TravelContactRaw): ContactRecord => {
  const name = raw.name || 'Travel Contact';
  const company = raw.company || raw.organization || null;
  const phones = coerceTravelList(raw.phones, raw.phone, raw.phone_number);
  const emails = coerceTravelList(raw.emails, raw.email);
  const addresses = coerceTravelList(raw.addresses, raw.address);
  return {
    id: raw.id,
    name,
    company,
    emails,
    phones,
    addresses,
    notes: raw.notes || null,
    category: 'Travel',
    contact_type: 'travel',
    contact_subtype: raw.contact_type || raw.contact_subtype || null,
    module: 'travel',
    source_type: 'travel',
    source_page: 'travel',
    related_to: Array.isArray(raw.related_to) ? raw.related_to : [],
    trip_id: raw.trip_id || null,
    is_preferred: Boolean(raw.is_preferred),
    is_favorite: false,
    is_emergency: false,
    is_archived: false,
    created_by: raw.created_by || null,
    created_at: raw.created_at || null,
    updated_at: raw.updated_at || null,
    trip_label: raw.trip_name || null,
  } as ContactRecord;
};

function daysUntil(date?: string | null) {
  if (!date) return null;
  const today = new Date();
  const d = new Date(`${date}T00:00:00`);
  return Math.ceil((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateTime(date?: string | null, time?: string | null) {
  if (!date && !time) return '';
  if (date && time) {
    const d = new Date(`${date}T${String(time).slice(0, 8)}`);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (date) {
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  }
  return String(time).slice(0, 5);
}

const TravelSearchFilter = dynamic(() => import('@/components/travel/TravelSearchFilter').then(m => m.TravelSearchFilter), { ssr: false });

export default function TravelPageClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    trips: any[];
    travel_details: any[];
    accommodations: any[];
    contacts: ContactRecord[];
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
  const [editingContact, setEditingContact] = useState<ContactRecord | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  // Filters (match Tasks page style)
  const [search, setSearch] = useState<string>('');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [memberPrefs, setMemberPrefs] = useState<Record<string, { seat?: string; meal?: string }>>({});
  const { calendars: googleCalendars } = useGoogleCalendars();
  const { selectedPersonId, setSelectedPersonId } = usePersonFilter();
  const { copyLink, downloadDocument } = useDocumentActions();
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
          contacts: Array.isArray(contactsJson?.contacts)
            ? contactsJson.contacts.map(toTravelContactRecord)
            : [],
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
        contacts: Array.isArray(contactsJson?.contacts)
          ? contactsJson.contacts.map(toTravelContactRecord)
          : [],
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

  const selectedTrip = useMemo(() => {
    if (!selectedTripId) return null;
    return (data.trips || []).find((trip: any) => trip.id === selectedTripId) || null;
  }, [data.trips, selectedTripId]);

  const tripTravelerNames = useMemo(() => {
    if (!selectedTrip) return [] as string[];
    if (Array.isArray(selectedTrip.traveler_names) && selectedTrip.traveler_names.length > 0) {
      return (selectedTrip.traveler_names as string[]).filter(Boolean);
    }
    if (Array.isArray(selectedTrip.traveler_ids) && selectedTrip.traveler_ids.length > 0) {
      return (selectedTrip.traveler_ids as string[])
        .map((id) => familyMemberMap[id] || null)
        .filter((name): name is string => Boolean(name));
    }
    return [] as string[];
  }, [selectedTrip, familyMemberMap]);

  const selectedTripDescription = useMemo(() => {
    if (!selectedTrip) return '';
    const { description, notes } = selectedTrip as { description?: string; notes?: string };
    return (description || notes || '').toString().trim();
  }, [selectedTrip]);

  const selectedTripStartDate = useMemo(() => {
    if (!selectedTrip || !selectedTrip.start_date) return '';
    return formatDateTime(selectedTrip.start_date, undefined);
  }, [selectedTrip]);

  const selectedTripEndDate = useMemo(() => {
    if (!selectedTrip || !selectedTrip.end_date) return '';
    return formatDateTime(selectedTrip.end_date, undefined);
  }, [selectedTrip]);

  // Derived filtered collections
  const filters = useMemo(() => ({ search: search.trim().toLowerCase(), tripId: selectedTripId }), [search, selectedTripId]);
  const filtered = useMemo(() => {
    const searchTerm = filters.search;

    // Trips: search destination/name/notes; person filter via traveler_ids
    const trips = (data.trips || []).filter((t: any) => {
      const textBlob = [t.destination, t.name, t.notes, t.location, t.description]
        .filter(Boolean)
        .join(' ');
      return matchesSearchBlob(searchTerm, textBlob);
    });

    // Travel details: search provider/airports/locations/notes; person via travelers array
    const details = (data.travel_details || []).filter((d: any) => {
      let travelerIds = normalizeTravelerArray(d.travelers || d.travelers_ids || d.traveler_ids);
      if (travelerIds.length === 0 && d.trip_id) {
        const trip = (data.trips || []).find((t: any) => t.id === d.trip_id);
        // Use traveler_ids from the trip (already an array of UUIDs)
        travelerIds = normalizeTravelerArray(trip?.traveler_ids);
      }
      const textBlob = [
        d.type,
        d.provider,
        d.airline,
        d.flight_number,
        d.departure_airport,
        d.arrival_airport,
        d.departure_location,
        d.arrival_location,
        d.notes,
      ].filter(Boolean);

      const filterTripId = normalizeId(filters.tripId);
      const detailTripId = normalizeId(d.trip_id);
      if (filterTripId && (!detailTripId || detailTripId !== filterTripId)) {
        return false;
      }

      return matchesSearchBlob(searchTerm, textBlob, travelerIds);
    });

    // Accommodations: search hotel/name/address/notes; person via joining to trip (best effort)
    const accommodations = (data.accommodations || []).filter((a: any) => {
      const filterTripId = normalizeId(filters.tripId);
      const accommodationTripId = normalizeId(a.trip_id);
      if (filterTripId && (!accommodationTripId || accommodationTripId !== filterTripId)) {
        return false;
      }
      const textBlob = [a.hotel_name, a.name, a.address, a.notes, a.confirmation_number]
        .filter(Boolean)
        .join(' ');
      return matchesSearchBlob(searchTerm, textBlob);
    });

    // Documents: title/file_name; no person association currently
    const documents = (data.documents || []).filter((doc: any) => {
      const filterTripId = normalizeId(filters.tripId);
      if (filterTripId) {
        const sourcePage = typeof doc.source_page === 'string' ? doc.source_page.toLowerCase() : '';
        const sourceId = normalizeId(doc.source_id);
        const linked = (sourcePage === 'travel' && sourceId === filterTripId);
        if (!linked) return false;
      }
      return matchesSearchBlob(searchTerm, doc.title, doc.file_name, doc.notes);
    });

    // Contacts: leverage unified contact record
    const contacts = (data.contacts || []).filter((contact: ContactRecord) => {
      const filterTripId = normalizeId(filters.tripId);
      const contactTripId = normalizeId(contact.trip_id);
      if (filterTripId && contactTripId !== filterTripId) {
        return false;
      }
      return matchesSearchBlob(
        searchTerm,
        contact.name,
        contact.company,
        contact.notes,
        ...resolvePhones(contact),
        ...resolveEmails(contact),
        ...resolveAddresses(contact),
      );
    });

    return { trips, details, accommodations, documents, contacts };
  }, [data, filters]);

  const tripsById = useMemo(() => {
    const map = new Map<string, any>();
    (data.trips || []).forEach((trip: any) => {
      if (trip?.id) map.set(trip.id, trip);
    });
    return map;
  }, [data.trips]);

  const renderContactCard = (contact: ContactRecord) => {
    const relatedNames = (contact.related_to ?? [])
      .map(id => familyMemberMap[id])
      .filter((name): name is string => Boolean(name));

    const trip = contact.trip_id ? tripsById.get(contact.trip_id) : null;
    const tripLabel = contact.trip_label || trip?.destination || trip?.name || '';

    const badges: ContactCardBadge[] = [];
    if (tripLabel) {
      badges.push({
        id: `${contact.id}-trip`,
        label: tripLabel,
        icon: <Ticket className="h-3 w-3" />,
      });
    }

    if (contact.is_preferred) {
      badges.push({ id: `${contact.id}-preferred`, label: 'Preferred', tone: 'primary' });
    }

    return (
      <ContactCard
        key={contact.id}
        contact={contact}
        subtitle={contact.company ?? undefined}
        extraContent={relatedNames.length > 0 ? renderContactChips(relatedNames) : null}
        badges={badges}
        showFavoriteToggle={false}
        canManage={false}
      />
    );
  };

  const tripOptions = useMemo(() => {
    return (data.trips || [])
      .filter((trip: any) => Boolean(trip?.id))
      .map((trip: any) => ({
        id: String(trip.id),
        label: trip.destination || trip.name || 'Trip',
      }));
  }, [data.trips]);

  const contactModalDefaults = useMemo(
    () => ({
      category: 'Travel' as const,
      contactSubtype: 'other',
      sourceType: 'travel' as const,
      sourcePage: 'travel',
      relatedToIds: selectedPersonParam ? [selectedPersonParam] : [],
    }),
    [selectedPersonParam]
  );

  const mapTravelContactToFormValues = (contact: ContactRecord): Partial<ContactFormValues> => ({
    id: contact.id,
    name: contact.name,
    company: contact.company ?? undefined,
    emails: resolveEmails(contact),
    phones: resolvePhones(contact),
    addresses: resolveAddresses(contact),
    notes: contact.notes ?? undefined,
    related_to: contact.related_to ?? [],
    trip_id: contact.trip_id ?? undefined,
    contact_subtype: contact.contact_subtype ?? undefined,
    category: contact.contact_subtype ?? undefined,
  });

  const renderTravelContactFields = useCallback(
    ({ values, setValues }: { values: ContactFormValues; setValues: (value: Partial<ContactFormValues> | ((prev: ContactFormValues) => Partial<ContactFormValues>)) => void }) => (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-primary">Trip</label>
        <select
          className="w-full rounded-md border border-white/10 bg-background-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-white/10"
          value={values.trip_id ?? ''}
          onChange={event => setValues({ trip_id: event.target.value || null })}
        >
          <option value="">No trip</option>
          {tripOptions.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    ),
    [tripOptions]
  );

  const handleContactSubmit = async (values: ContactFormValues) => {
    try {
      setSavingContact(true);
      const payload = {
        name: values.name,
        company: toNullable(values.company),
        emails: sanitizeList(values.emails),
        phones: sanitizeList(values.phones),
        addresses: sanitizeList(values.addresses),
        notes: toNullable(values.notes),
        trip_id: values.trip_id ?? null,
        contact_type: values.contact_type ?? 'travel',
        contact_subtype: values.contact_subtype || values.category || 'other',
        category: 'Travel',
        related_to: Array.isArray(values.related_to) ? values.related_to : [],
        is_preferred: Boolean(values.is_preferred),
        is_favorite: Boolean(values.is_favorite),
        is_archived: false,
        source_type: 'travel',
        source_page: 'travel',
      };

      const response = editingContact
        ? await ApiClient.put(`/api/travel-contacts/${editingContact.id}`, payload)
        : await ApiClient.post('/api/travel-contacts', payload);

      if (!response.success) {
        throw new Error(response.error || 'Failed to save contact');
      }

      await refreshData();
      setShowAddContact(false);
      setEditingContact(null);
    } catch (error) {
      console.error('[Travel] Failed to save contact', error);
      alert(error instanceof Error ? error.message : 'Failed to save contact');
    } finally {
      setSavingContact(false);
    }
  };

  const handleDocumentCopy = async (doc: Document) => {
    try {
      await copyLink(doc);
    } catch (error) {
      console.error('Failed to copy document link:', error);
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
            onClick={() => setSelectedTripId(null)}
            className={`px-4 py-2 text-sm rounded-xl border border-gray-600/40 ${!selectedTripId ? 'bg-gray-700 text-white' : 'bg-background-secondary text-text-muted hover:text-text-primary'}`}
          >
            All Trips
          </button>
          {(data.trips || []).map((t: any) => (
            <button
              key={t.id}
              onClick={() => { setSelectedTripId(t.id); }}
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
            onClick={() => { setActiveTab(t.k as any); }}
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
            {selectedTripId && selectedTrip && (
              <section
                className="border border-gray-600/30 rounded-xl p-4"
                style={{ backgroundColor: '#30302e' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-text-primary">
                      {selectedTrip.destination || selectedTrip.name || 'Trip'}
                    </h2>
                    <div className="mt-1 text-sm text-text-muted flex flex-wrap items-center gap-3">
                      {(selectedTripStartDate || selectedTripEndDate) && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {selectedTripStartDate || 'TBD'}
                          <span>–</span>
                          {selectedTripEndDate || 'TBD'}
                        </span>
                      )}
                      {selectedTrip.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {selectedTrip.location}
                        </span>
                      )}
                    </div>
                    {selectedTripDescription && (
                      <p className="mt-3 text-sm text-text-muted whitespace-pre-wrap">
                        {selectedTripDescription}
                      </p>
                    )}
                    {tripTravelerNames.length > 0 && (
                      <div className="mt-3 text-xs text-text-muted flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        <span>{tripTravelerNames.join(', ')}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      className="px-3 py-1.5 bg-button-edit text-white text-xs rounded"
                      onClick={() => setEditingTrip(selectedTrip)}
                    >
                      Edit Trip
                    </button>
                    <button
                      className="px-3 py-1.5 bg-button-delete text-white text-xs rounded"
                      onClick={async () => {
                        if (!confirm('Delete this trip?')) return;
                        await ApiClient.delete(`/api/trips/${selectedTrip.id}`);
                        await refreshData();
                        setSelectedTripId(null);
                      }}
                    >
                      Delete Trip
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'transport' && (
              <>
              <section className="space-y-4">
                <div className="flex items-center justify-between">
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
                      className="border border-gray-600/30 rounded-xl p-4 cursor-pointer transition-colors hover:border-gray-500"
                      style={{ backgroundColor: '#30302e' }}
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
              </section>
              <section className="space-y-4 mt-6">
                <div className="flex items-center justify-between">
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
                    <div
                      key={a.id}
                      className="border border-gray-600/30 rounded-xl p-4 transition-colors hover:border-gray-500"
                      style={{ backgroundColor: '#30302e' }}
                    >
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
              <section className="space-y-4">
                <div className="flex items-center justify-between">
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
                    <div className="grid gap-3">
                      {items.map(it => (
                        <div
                          key={it.id}
                          className="border border-gray-600/30 rounded-xl p-3 text-sm"
                          style={{ backgroundColor: '#30302e' }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-1 text-text-muted min-w-0">
                              <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs ${it.type==='transport'?'bg-blue-900/50 text-blue-200':'bg-emerald-900/50 text-emerald-200'}`}>
                                {it.type==='transport'?'Transport':'Accommodation'}
                              </span>
                              <span className="truncate text-text-primary">{it.label}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1 text-xs text-text-muted whitespace-nowrap">
                              <span>{it.date || 'Date TBD'}</span>
                              {it.right ? <span className="text-text-primary/70">{it.right}</span> : null}
                            </div>
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
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-text-primary">Travel Documents</h2>
                    <span className="text-xs text-text-muted">{filtered.documents.length} total</span>
                  </div>
                  <button onClick={() => setShowUploadDoc(true)} className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors">Upload Document</button>
                </div>
                {filtered.documents.length === 0 ? (
                  <div className="py-6 text-center text-text-muted">No documents</div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-x-8 gap-y-10 justify-items-center">
                    {(filtered.documents as Document[]).map((doc) => (
                      <DocumentCard
                        key={doc.id}
                        doc={doc}
                        familyMemberMap={familyMemberMap}
                        onCopy={handleDocumentCopy}
                        onDownload={handleDocumentDownload}
                        onOpen={handleDocumentPreview}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'contacts' && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-text-primary">Travel Contacts</h2>
                    <span className="text-xs text-text-muted">{filtered.contacts.length} total</span>
                  </div>
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
                  <div className="py-6 text-center text-text-muted">No contacts</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {filtered.contacts.map(renderContactCard)}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'preferences' && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
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
                    <div
                      key={m.id}
                      className="border border-gray-600/30 rounded-xl p-3"
                      style={{ backgroundColor: '#30302e' }}
                    >
                      <div className="text-sm font-medium text-text-primary mb-2">{m.name}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block text-sm">Seat Preference
                          <select
                            value={memberPrefs[m.id]?.seat || ''}
                            onChange={(e)=>setMemberPrefs(prev=>({ ...prev, [m.id]: { ...(prev[m.id]||{}), seat: e.target.value } }))}
                            className="mt-1 w-full px-3 py-2 rounded border border-gray-600/40 bg-[#2a2a28] text-text-primary"
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
                            className="mt-1 w-full px-3 py-2 rounded border border-gray-600/40 bg-[#2a2a28] text-text-primary"
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
          setShowAddTrip(false);
          setEditingTrip(null);
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
        <UnifiedContactModal
          open={showAddContact}
          mode={editingContact ? 'edit' : 'create'}
          defaults={contactModalDefaults}
          initialValues={editingContact
            ? mapTravelContactToFormValues(editingContact)
            : {
                trip_id: selectedTripId || undefined,
                related_to: selectedPersonParam ? [selectedPersonParam] : [],
              }}
          visibility={TRAVEL_CONTACT_MODAL_VISIBILITY}
          labels={{ relatedToLabel: 'Travelers' }}
          optionSelectors={{ relatedEntities: peopleOptions }}
          renderCustomFields={renderTravelContactFields}
          busy={savingContact}
          submitLabel={editingContact ? 'Save changes' : 'Create contact'}
          onSubmit={handleContactSubmit}
          onCancel={() => {
            setShowAddContact(false);
            setEditingContact(null);
          }}
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

// Minimal Add Trip Modal
function AddTripModal({ familyMembers, onClose, onCreated, trip }: { familyMembers: any[]; onClose: () => void; onCreated: () => void; trip?: any }) {
  const [destination, setDestination] = useState(trip?.destination || trip?.name || '');
  const [start, setStart] = useState(trip?.start_date || ''); // yyyy-mm-dd
  const [end, setEnd] = useState(trip?.end_date || '');
  const [description, setDescription] = useState(trip?.description || trip?.notes || '');
  const [travelerIds, setTravelerIds] = useState<string[]>(trip?.traveler_ids || []);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = destination && start && end && !submitting;

  const submit = async () => {
    try {
      setSubmitting(true);
      const payload = { destination, start_date: start, end_date: end, travelers: travelerIds, description: description || null, create_calendar_event: true };
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
          <label className="block text-sm">Description
            <textarea
              value={description}
              onChange={e=>setDescription(e.target.value)}
              rows={3}
              placeholder="High-level overview, key notes, travel purpose..."
              className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/40 rounded text-text-primary"
            />
          </label>
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
const renderContactChips = (names: string[]) => (
  <div className="flex flex-wrap gap-2">
    {names.map(name => (
      <span key={name} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80">
        {name}
      </span>
    ))}
  </div>
);
