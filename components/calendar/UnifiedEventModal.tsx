'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Calendar, Plane, Heart, PawPrint, GraduationCap, Loader2, Users } from 'lucide-react';
import { CalendarEventCategory, User } from '@/lib/supabase/types';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { RecentContactsAutocomplete } from '@/components/ui/recent-contacts-autocomplete';
import { AirportAutocomplete } from '@/components/ui/airport-autocomplete';
import { ContactAutocomplete } from '@/components/ui/contact-autocomplete';
import { DateDisplay } from '@/components/ui/date-display';
import { TimeInput } from '@/components/ui/time-input';
import { CalendarSelector } from './CalendarSelector';
import { Category } from '@/lib/categories/categories-client';
import { createClient } from '@/lib/supabase/client';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import {
  EventType,
  BaseEventData,
  TravelEventData,
  HealthEventData,
  PetsEventData,
  AcademicsEventData,
  getEventAdapter
} from '@/lib/calendar/event-adapters';
import { useToast } from '@/hooks/use-toast';
import ApiClient from '@/lib/api/api-client';
import { useEventSync, useCrossTabSync } from '@/hooks/useEventSync';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

const EVENT_TYPES = [
  { value: 'general', label: 'General Event', icon: Calendar, color: 'text-blue-500' },
  { value: 'travel', label: 'Travel', icon: Plane, color: 'text-green-500' },
  { value: 'health', label: 'Health', icon: Heart, color: 'text-red-500' },
  { value: 'pets', label: 'Pets', icon: PawPrint, color: 'text-orange-500' },
  { value: 'academics', label: 'Academics', icon: GraduationCap, color: 'text-purple-500' }
];

const GENERAL_FAMILY_PARTICIPANT_NAMES = new Set(['John Johnson', 'Susan Johnson']);
const GENERAL_STAFF_PARTICIPANT_NAMES = new Set(['Colleen Russell', 'Kate McLaren']);
const sectionClass = 'space-y-3 rounded-xl border border-gray-600/30 bg-background-primary/40 p-4';

interface UnifiedEventModalProps {
  onClose: () => void;
  selectedDate?: Date | null;
  prefillData?: {
    startDate: Date;
    endDate: Date;
    isAllDay: boolean;
  };
  categories?: Category[];
  onEventCreated: (event: any) => void;
}

export function UnifiedEventModal({
  onClose,
  selectedDate,
  prefillData,
  categories,
  onEventCreated,
}: UnifiedEventModalProps) {
  const { toast } = useToast();
  const { handleEventCreated: syncEventCreated } = useEventSync();
  const { triggerSync } = useCrossTabSync('calendar-event-created');
  const [loading, setLoading] = useState(false);
  const [eventType, setEventType] = useState<EventType>('general');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
  const [calendarManuallySelected, setCalendarManuallySelected] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; hasValidTokens?: boolean; userEmail?: string; lastSync?: string; calendarsCount?: number } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [pets, setPets] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [vets, setVets] = useState<any[]>([]);
  const { familyMembers, loading: familyLoading } = useFamilyMembers();

  const allowedFamilyParticipants = useMemo(
    () => (familyMembers || []).filter(member => GENERAL_FAMILY_PARTICIPANT_NAMES.has(member.name)),
    [familyMembers]
  );

  const allowedStaffParticipants = useMemo(
    () => (familyMembers || []).filter(member => GENERAL_STAFF_PARTICIPANT_NAMES.has(member.name)),
    [familyMembers]
  );

  const allowedParticipantIds = useMemo(() => {
    const set = new Set<string>();
    allowedFamilyParticipants.forEach(member => member.id && set.add(member.id));
    allowedStaffParticipants.forEach(member => member.id && set.add(member.id));
    return set;
  }, [allowedFamilyParticipants, allowedStaffParticipants]);

  const handleCalendarChange = (calendarId: string) => {
    setCalendarManuallySelected(true);
    setBaseData(prev => ({ ...prev, googleCalendarId: calendarId }));
  };

  const getDefaultCalendarIdForType = (type: EventType, calendars: any[]): string | null => {
    if (!calendars || calendars.length === 0) return null;
    const normalize = (value: string | undefined) => value?.toLowerCase() ?? '';
    const findByName = (needle: string) =>
      calendars.find((cal: any) => normalize(cal.name).includes(needle));
    const primaryCalendar = calendars.find((cal: any) => cal.is_primary);
    const fallbackCalendar = calendars[0];
    switch (type) {
      case 'travel': {
        const travelCal = findByName('travel');
        return (travelCal?.google_calendar_id) || (primaryCalendar?.google_calendar_id) || (fallbackCalendar?.google_calendar_id) || null;
      }
      case 'academics': {
        const academicsCal = findByName('j3 academics');
        return (academicsCal?.google_calendar_id) || (primaryCalendar?.google_calendar_id) || (fallbackCalendar?.google_calendar_id) || null;
      }
      case 'general':
      case 'health':
      case 'pets':
      default: {
        return (primaryCalendar?.google_calendar_id) || (fallbackCalendar?.google_calendar_id) || null;
      }
    }
  };
  
  useEffect(() => {
    if (eventType !== 'general') return;
    setGeneralData(prev => {
      const current = prev.participantIds || [];
      const filtered = current.filter(id => allowedParticipantIds.has(id));
      if (filtered.length === current.length) return prev;
      return { ...prev, participantIds: filtered };
    });
  }, [allowedParticipantIds, eventType]);

  useEffect(() => {
    setCalendarManuallySelected(false);
  }, [eventType]);

  useEffect(() => {
    if (googleCalendars.length === 0) return;
    const defaultCalendarId = getDefaultCalendarIdForType(eventType, googleCalendars);
    if (!defaultCalendarId) return;

    setBaseData(prev => {
      if (calendarManuallySelected && prev.googleCalendarId && prev.googleCalendarId !== defaultCalendarId) {
        return prev;
      }
      if (prev.googleCalendarId === defaultCalendarId) {
        return prev;
      }
      return { ...prev, googleCalendarId: defaultCalendarId };
    });
  }, [eventType, googleCalendars, calendarManuallySelected]);

  // Force timed behavior for travel (no all-day)
  useEffect(() => {
    if (eventType === 'travel') {
      setBaseData(prev => ({ ...prev, allDay: false }));
      setShowTimeInputs(true);
    }
  }, [eventType]);

  // Base fields (common to all event types)
  const getInitialBaseData = (): BaseEventData => {
    if (prefillData) {
      const sd = prefillData.startDate;
      const ed = prefillData.endDate || prefillData.startDate;
      const pad = (n: number) => n.toString().padStart(2, '0');
      const toHHMM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      return {
        title: '',
        description: '',
        startDate: sd.toISOString().split('T')[0],
        startTime: toHHMM(sd),
        endDate: ed.toISOString().split('T')[0],
        endTime: toHHMM(ed),
        allDay: prefillData?.isAllDay ?? true,
        location: '',
        isVirtual: false,
        virtualLink: '',
        attendees: [],
        googleCalendarId: null,
        reminderMinutes: 15,
        category: 'other' as CalendarEventCategory
      };
    }
    const base = selectedDate || new Date();
    const dateStr = base.toISOString().split('T')[0];
    return {
      title: '',
      description: '',
      startDate: dateStr,
      startTime: '12:00',
      endDate: dateStr,
      endTime: '13:00',
      allDay: true,
      location: '',
      isVirtual: false,
      virtualLink: '',
      attendees: [],
      googleCalendarId: null,
      reminderMinutes: 15,
      category: 'other' as CalendarEventCategory
    };
  };

  const [baseData, setBaseData] = useState<BaseEventData>(getInitialBaseData());
  const [showTimeInputs, setShowTimeInputs] = useState<boolean>(getInitialBaseData().allDay === false);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  // Email invitations (native Google). Default ON; user can disable to create silently.
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  
  // Keep endDate >= startDate for timed events
  useEffect(() => {
    if (!baseData.allDay) {
      if (baseData.endDate < baseData.startDate) {
        setBaseData(prev => ({ ...prev, endDate: prev.startDate }));
      }
    }
  }, [baseData.startDate, baseData.allDay]);
  // Zoom integration
  const [zoomEnabled, setZoomEnabled] = useState(false);
  
  // Type-specific data
  const [travelData, setTravelData] = useState<Partial<TravelEventData>>({ 
    vehicleType: 'flight', // Initialize with flight to show fields immediately
    travelers: [], // Will store family_members.id (UUIDs)
    otherTravelers: '' 
  });
  const [generalData, setGeneralData] = useState<{ participantIds?: string[] }>({ participantIds: [] });
  const [healthData, setHealthData] = useState<Partial<HealthEventData>>({ parentAttendeeIds: [] });
  const [petsData, setPetsData] = useState<Partial<PetsEventData>>({ ownerAttendeeIds: [] });
  const [academicsData, setAcademicsData] = useState<Partial<AcademicsEventData>>({ 
    parentIds: [],
    otherParticipants: ''
  });
  
  useEffect(() => {
    fetchInitialData();
  }, []);
  
  const fetchInitialData = async () => {
    const supabase = createClient();
    
    // Fetch current user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      if (userData) setCurrentUser(userData);
    }
    
    // Fetch Google calendars
    try {
      const response = await fetch('/api/calendars');
      if (response.ok) {
        const data = await response.json();
        setGoogleCalendars(data.calendars || []);
      }
    } catch (error) {
      console.error('Error fetching calendars:', error);
    }
    
    // Fetch Google connection status
    try {
      const statusRes = await fetch('/api/auth/google/status');
      if (statusRes.ok) {
        const status = await statusRes.json();
        setGoogleStatus(status);
      } else {
        setGoogleStatus({ connected: false });
      }
    } catch (e) {
      setGoogleStatus({ connected: false });
    }
    
    // Fetch domain-specific data
    fetchPets();
    fetchDoctors();
    fetchVets();
    // Family members now fetched via hook
  };

  const handleCheckRepair = async () => {
    setRepairing(true);
    try {
      // Re-check status first
      const statusRes = await fetch('/api/auth/google/status');
      const status = statusRes.ok ? await statusRes.json() : { connected: false };
      setGoogleStatus(status);
      if (!status.connected) {
        // Not connected: start OAuth flow
        const authRes = await fetch('/api/auth/google');
        if (authRes.ok) {
          const { authUrl } = await authRes.json();
          window.location.href = authUrl;
          return;
        }
      } else {
        // Connected: resync calendars
        const syncRes = await ApiClient.post('/api/google/calendars/sync');
        if (syncRes.success) {
          // Refresh list
          const list = await fetch('/api/calendars');
          if (list.ok) {
            const data = await list.json();
            setGoogleCalendars(data.calendars || []);
          }
          // Update status after sync
          const statusAgain = await fetch('/api/auth/google/status');
          if (statusAgain.ok) setGoogleStatus(await statusAgain.json());
        }
      }
    } catch (err) {
      console.error('Check/Repair error:', err);
    } finally {
      setRepairing(false);
    }
  };
  
  const fetchPets = async () => {
    try {
      const response = await fetch('/api/pets');
      if (response.ok) {
        const data = await response.json();
        setPets(data.pets || []);
      }
    } catch (error) {
      console.error('Error fetching pets:', error);
    }
  };
  
  const fetchDoctors = async () => {
    try {
      const response = await fetch('/api/doctors');
      if (response.ok) {
        const data = await response.json();
        setDoctors(data.doctors || []);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };
  
  const fetchVets = async () => {
    try {
      const response = await fetch('/api/vets');
      if (response.ok) {
        const data = await response.json();
        setVets(data.vets || []);
      }
    } catch (error) {
      console.error('Error fetching vets:', error);
    }
  };
  
  
  const handleSave = async () => {
    // Validate travel-specific fields
    if (eventType === 'travel') {
      if (!travelData.travelers || travelData.travelers.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please select at least one traveler',
          variant: 'destructive'
        });
        return;
      }
      
      if (travelData.vehicleType === 'flight') {
        if (!travelData.departureAirport || !travelData.arrivalAirport) {
          toast({
            title: 'Validation Error',
            description: 'Please select departure and arrival airports for the flight',
            variant: 'destructive'
          });
          return;
        }
        if (!travelData.airline) {
          toast({
            title: 'Validation Error',
            description: 'Please enter or select an airline for the flight',
            variant: 'destructive'
          });
          return;
        }
        if (!travelData.flightNumber) {
          toast({
            title: 'Validation Error',
            description: 'Please enter the flight number',
            variant: 'destructive'
          });
          return;
        }
      }
    }
    
    setLoading(true);
    
    try {
      // Get the appropriate adapter
      const adapter = getEventAdapter(eventType);
      
      // Convert attendees string to array if needed
      const attendeesArray = Array.isArray(baseData.attendees)
        ? baseData.attendees
        : ([] as string[]);
      
      // Combine base data with type-specific data
      let eventData: any = { ...baseData, attendees: attendeesArray };
      
      // Pass type-specific data
      switch (eventType) {
        case 'general':
          // Pass participant IDs as UUIDs, keep external attendees separate
          eventData = { 
            ...eventData, 
            participantIds: generalData.participantIds || []
          };
          break;
        case 'travel':
          eventData = { ...eventData, ...travelData };
          break;
        case 'health':
          eventData = { 
            ...eventData, 
            ...healthData,
            attendees: [...(eventData.attendees || []), ...(healthData.parentAttendeeIds || [])]
          };
          break;
        case 'pets':
          eventData = { 
            ...eventData, 
            ...petsData,
            attendees: [...(eventData.attendees || []), ...(petsData.ownerAttendeeIds || [])]
          };
          break;
        case 'academics':
          eventData = { 
            ...eventData, 
            ...academicsData
            // parentIds are already UUIDs, external attendees are separate
          };
          break;
      }
      
      // Add notify_attendees to all event types
      (eventData as any).notify_attendees = notifyByEmail;
      (eventData as any).metadata = {
        ...((eventData as any).metadata || {}),
        notify_attendees: notifyByEmail
      };
      
      // Validate fields
      const validation = adapter.validateFields(eventData);
      if (!validation.valid) {
        toast({
          title: 'Validation Error',
          description: validation.errors?.join(', '),
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }
      
      // Optionally create a Zoom meeting (timed events only)
      if (zoomEnabled) {
        if (baseData.allDay) {
          toast({ title: 'Zoom not available for all‑day events', variant: 'destructive' });
          setLoading(false);
          return;
        }
        try {
          const startIso = `${baseData.startDate}T${baseData.startTime}:00`;
          const durationMinutes = computeDurationMinutes();
          const zr = await fetch('/api/zoom/meetings', {
            method: 'POST',
            headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ topic: baseData.title || 'Meeting', start_time: startIso, duration: durationMinutes })
          });
          if (zr.ok) {
            const z = await zr.json();
            // Attach Zoom join link to the event payload
            (eventData as any).isVirtual = true;
            (eventData as any).virtualLink = z.join_url;
            (eventData as any).metadata = {
              ...((eventData as any).metadata || {}),
              zoom: { id: z.id, join_url: z.join_url, start_url: z.start_url, password: z.password }
            };
          } else {
            const err = await zr.json().catch(() => ({}));
            console.warn('Zoom API error:', err);
            toast({ title: 'Could not create Zoom meeting', description: err?.details || 'Please check your Zoom settings.', variant: 'destructive' });
          }
        } catch (ze) {
          console.error('Zoom create error:', ze);
          toast({ title: 'Could not create Zoom meeting', description: 'Unexpected error', variant: 'destructive' });
        }
      }

      // Create the event
      const result = await adapter.createEvent(eventData);
      
      if (result.success) {
        // More informative toast with Google sync status for supported types
        const syncedText = (eventType === 'health' || eventType === 'pets')
          ? (result.googleSynced ? 'Synced to Google Calendar' : 'Saved locally only')
          : (baseData.googleCalendarId ? 'Sync requested to Google' : 'Saved locally only');
        toast({
          title: 'Event Created',
          description: syncedText
        });
        
        // Trigger sync for realtime updates
        syncEventCreated(eventType, result);
        
        // Trigger cross-tab sync
        triggerSync({ eventType, result });
        
        // Notify parent component
        onEventCreated({
          id: result.calendarEventId,
          domainId: result.domainId,
          type: eventType
        });
        
        onClose();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to create event',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error creating event:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  
  const renderExternalAttendeesSection = () => (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text-primary">
        External Attendees
      </label>
      <RecentContactsAutocomplete
        value={Array.isArray(baseData.attendees) ? baseData.attendees : (baseData.attendees ? [baseData.attendees] : [])}
        multiple
        onChange={(value) => {
          const emails = Array.isArray(value)
            ? value
            : value
                .split(',')
                .map(email => email.trim())
                .filter(email => email && email.includes('@'));
          const uniqueEmails = Array.from(new Set(emails));
          setBaseData({ ...baseData, attendees: uniqueEmails });
        }}
        placeholder="Add external attendee emails (comma-separated)..."
      />
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="notifyByEmail"
          checked={!notifyByEmail}
          onChange={(e) => setNotifyByEmail(!e.target.checked)}
          className="rounded border-gray-600 bg-gray-700"
        />
        <label htmlFor="notifyByEmail" className="text-sm text-text-primary">
          Don’t send email invite
        </label>
      </div>
    </div>
  );

  const renderTypeSpecificFields = () => {
    switch (eventType) {
      case 'travel':
        return (
          <div className={`${sectionClass} space-y-4`}>
            <h3 className="text-sm font-medium text-text-primary">Travel Details</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Travel Type
                </label>
                <select
                  value={travelData.vehicleType || 'flight'}
                  onChange={(e) => setTravelData(prev => ({ ...prev, vehicleType: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                >
                  <option value="flight">Flight</option>
                  <option value="train">Train</option>
                  <option value="car_rental">Car Rental</option>
                  <option value="ferry">Ferry</option>
                  <option value="private_driver">Private Driver</option>
                  <option value="helicopter">Helicopter</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Travellers will be selected below; parent invites belong to Medical/Pets */}

              {(travelData.vehicleType ?? 'flight') === 'flight' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Airline
                    </label>
                    <ContactAutocomplete
                      filterType="airline"
                      onChange={(value) => setTravelData(prev => ({ ...prev, airline: value }))}
                      value={travelData.airline || ''}
                      placeholder="Airline"
                      contacts={[]}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Flight Number
                    </label>
                    <input
                      type="text"
                      value={travelData.flightNumber || ''}
                      onChange={(e) => setTravelData(prev => ({ ...prev, flightNumber: e.target.value }))}
                      className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                      placeholder="e.g., AA123"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Departure Airport
                    </label>
                    <AirportAutocomplete
                      value={travelData.departureAirport || ''}
                      onChange={(value) => setTravelData(prev => ({ ...prev, departureAirport: value }))}
                      placeholder="Search airports..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Arrival Airport
                    </label>
                    <AirportAutocomplete
                      value={travelData.arrivalAirport || ''}
                      onChange={(value) => setTravelData(prev => ({ ...prev, arrivalAirport: value }))}
                      placeholder="Search airports..."
                    />
                  </div>

                  {/* Departure Date/Time */}
                  <div>
                    <DateDisplay
                      label="Departure Date"
                      date={travelData.departureDate || baseData.startDate}
                      onChange={(v) => setTravelData(prev => ({ ...prev, departureDate: v }))}
                    />
                  </div>
                  <div>
                    <TimeInput
                      label="Departure Time"
                      value={travelData.departureTime || baseData.startTime}
                      onChange={(v) => setTravelData(prev => ({ ...prev, departureTime: v }))}
                      required
                    />
                  </div>

                  {/* Optional Return */}
                  <div className="col-span-2 mt-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!(travelData.returnDate && travelData.returnTime)}
                        onChange={(e) => {
                          if (!e.target.checked) {
                            setTravelData(prev => ({ ...prev, returnDate: undefined, returnTime: undefined }));
                          } else {
                            setTravelData(prev => ({ ...prev, returnDate: prev.departureDate, returnTime: prev.departureTime }));
                          }
                        }}
                        className="rounded border-gray-600 bg-gray-700"
                      />
                      <span className="text-sm text-text-primary">Add Return</span>
                    </label>
                  </div>
                  {travelData.returnDate !== undefined && (
                    <>
                      <div>
                        <DateDisplay
                          label="Return Date"
                          date={travelData.returnDate || ''}
                          onChange={(v) => setTravelData(prev => ({ ...prev, returnDate: v }))}
                        />
                      </div>
                      <div>
                        <TimeInput
                          label="Return Time"
                          value={travelData.returnTime || ''}
                          onChange={(v) => setTravelData(prev => ({ ...prev, returnTime: v }))}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
              
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Confirmation Number
                </label>
                <input
                  type="text"
                  value={travelData.confirmationNumber || ''}
                  onChange={(e) => setTravelData(prev => ({ ...prev, confirmationNumber: e.target.value }))}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                />
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  <Users className="inline-block h-4 w-4 mr-1" />
                  Travelers
                </label>
                <div className="space-y-3">
                  {/* Family Members */}
                  <div>
                    <p className="text-xs text-text-muted mb-1 font-medium">Family Members</p>
                    <div className="grid grid-cols-3 gap-2">
                      {familyMembers
                        .filter(m => m.type === 'human' && m.role !== 'member')
                        .map(member => (
                          <label key={member.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={travelData.travelers?.includes(member.id) || false}
                              onChange={(e) => {
                                setTravelData(prev => {
                                  const currentTravelers = prev.travelers || [];
                                  if (e.target.checked) {
                                    return { ...prev, travelers: [...currentTravelers, member.id] };
                                  } else {
                                    return { ...prev, travelers: currentTravelers.filter(t => t !== member.id) };
                                  }
                                });
                              }}
                              className="rounded border-gray-600 bg-gray-700"
                            />
                            <span className="text-sm text-text-primary">{member.name}</span>
                          </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Staff */}
                  <div>
                    <p className="text-xs text-text-muted mb-1 font-medium">Staff</p>
                    <div className="grid grid-cols-3 gap-2">
                      {familyMembers
                        .filter(m => m.type === 'human' && m.role === 'member')
                        .map(member => (
                          <label key={member.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={travelData.travelers?.includes(member.id) || false}
                              onChange={(e) => {
                                setTravelData(prev => {
                                  const currentTravelers = prev.travelers || [];
                                  if (e.target.checked) {
                                    return { ...prev, travelers: [...currentTravelers, member.id] };
                                  } else {
                                    return { ...prev, travelers: currentTravelers.filter(t => t !== member.id) };
                                  }
                                });
                              }}
                              className="rounded border-gray-600 bg-gray-700"
                            />
                            <span className="text-sm text-text-primary">{member.name}</span>
                          </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Pets */}
                  <div>
                    <p className="text-xs text-text-muted mb-1 font-medium">Pets</p>
                    <div className="grid grid-cols-3 gap-2">
                      {familyMembers
                        .filter(m => m.type === 'pet')
                        .map(member => (
                          <label key={member.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={travelData.travelers?.includes(member.id) || false}
                              onChange={(e) => {
                                setTravelData(prev => {
                                  const currentTravelers = prev.travelers || [];
                                  if (e.target.checked) {
                                    return { ...prev, travelers: [...currentTravelers, member.id] };
                                  } else {
                                    return { ...prev, travelers: currentTravelers.filter(t => t !== member.id) };
                                  }
                                });
                              }}
                              className="rounded border-gray-600 bg-gray-700"
                            />
                            <span className="text-sm text-text-primary">{member.name} 🐾</span>
                          </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Other */}
                  <div>
                    <p className="text-xs text-text-muted mb-1 font-medium">Other</p>
                    <input
                      type="text"
                      value={travelData.otherTravelers || ''}
                      onChange={(e) => setTravelData(prev => ({ ...prev, otherTravelers: e.target.value }))}
                      className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary text-sm"
                      placeholder="Enter other travelers (comma-separated)..."
                    />
                  </div>
                </div>
              </div>
            </div>
            {renderExternalAttendeesSection()}
          </div>
        );
        
      case 'health':
        return (
          <div className={`${sectionClass} space-y-4`}>
            <h3 className="text-sm font-medium text-text-primary">Health Details</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Healthcare Provider
                </label>
                <select
                  value={healthData.providerId || ''}
                  onChange={(e) => {
                    const doctor = doctors.find(d => d.id === e.target.value);
                    setHealthData({
                      ...healthData,
                      providerId: e.target.value,
                      providerName: doctor?.name
                    });
                  }}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                >
                  <option value="">Select a provider...</option>
                  {doctors.map(doctor => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name} - {doctor.specialty}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Appointment Type
                </label>
                <select
                  value={healthData.appointmentType || 'checkup'}
                  onChange={(e) => setHealthData({ ...healthData, appointmentType: e.target.value })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                >
                  <option value="checkup">Check-up</option>
                  <option value="consultation">Consultation</option>
                  <option value="followup">Follow-up</option>
                  <option value="procedure">Procedure</option>
                  <option value="test">Test/Lab Work</option>
                </select>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Patient(s)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {familyMembers
                    .filter(m => m.type === 'human' && m.role !== 'member') // Excludes Colleen & Kate who are 'member' role
                    .map(member => (
                      <label key={member.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={healthData.patientIds?.includes(member.id) || false}
                          onChange={(e) => {
                            const currentPatients = healthData.patientIds || [];
                            if (e.target.checked) {
                              setHealthData({ 
                                ...healthData, 
                                patientIds: [...currentPatients, member.id] 
                              });
                            } else {
                              setHealthData({ 
                                ...healthData, 
                                patientIds: currentPatients.filter(id => id !== member.id) 
                              });
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{member.name}</span>
                      </label>
                  ))}
                </div>
              </div>

              {/* Send invites for Travel */}
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sendInvitesTravel"
                  checked={(travelData as any).send_invites === true}
                  onChange={(e) => setTravelData({ ...(travelData as any), send_invites: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-700"
                />
                <label htmlFor="sendInvitesTravel" className="text-sm text-text-primary">
                  Send email invites (ICS)
                </label>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Notify Parents/Guardians
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {familyMembers
                    .filter(m => m.type === 'human' && (m.role === 'parent' || m.role === 'admin'))
                    .map(parent => (
                      <label key={parent.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={healthData.parentAttendeeIds?.includes(parent.id) || false}
                          onChange={(e) => {
                            const currentParents = healthData.parentAttendeeIds || [];
                            if (e.target.checked) {
                              setHealthData({ 
                                ...healthData, 
                                parentAttendeeIds: [...currentParents, parent.id] 
                              });
                            } else {
                              setHealthData({ 
                                ...healthData, 
                                parentAttendeeIds: currentParents.filter(id => id !== parent.id) 
                              });
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{parent.name}</span>
                      </label>
                  ))}
                </div>
              </div>
            </div>
            {renderExternalAttendeesSection()}
          </div>
        );
        
      case 'pets':
        return (
          <div className={`${sectionClass} space-y-4`}>
            <h3 className="text-sm font-medium text-text-primary">Pets Details</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Pet(s) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {familyMembers
                    .filter(m => m.type === 'pet')
                    .map(pet => (
                      <label key={pet.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={petsData.petIds?.includes(pet.id) || false}
                          onChange={(e) => {
                            const currentPets = petsData.petIds || [];
                            if (e.target.checked) {
                              setPetsData({ 
                                ...petsData, 
                                petIds: [...currentPets, pet.id] 
                              });
                            } else {
                              setPetsData({ 
                                ...petsData, 
                                petIds: currentPets.filter(id => id !== pet.id) 
                              });
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{pet.name} 🐾</span>
                      </label>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Veterinarian
                </label>
                <select
                  value={petsData.vetId || ''}
                  onChange={(e) => {
                    const vet = vets.find(v => v.id === e.target.value);
                    setPetsData({
                      ...petsData,
                      vetId: e.target.value,
                      vetName: vet?.name
                    });
                  }}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                >
                  <option value="">Select a vet...</option>
                  {vets.map(vet => (
                    <option key={vet.id} value={vet.id}>
                      {vet.name} - {vet.clinic_name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Appointment Type
                </label>
                <select
                  value={petsData.appointmentType || 'checkup'}
                  onChange={(e) => setPetsData({ ...petsData, appointmentType: e.target.value as any })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                >
                  <option value="checkup">Check-up</option>
                  <option value="vaccination">Vaccination</option>
                  <option value="grooming">Grooming</option>
                  <option value="surgery">Surgery</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Invite Parent(s) */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Invite Parent(s)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {familyMembers
                    .filter(m => m.type === 'human' && (m.role === 'parent' || m.role === 'admin'))
                    .map(parent => (
                      <label key={parent.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={petsData.ownerAttendeeIds?.includes(parent.id) || false}
                          onChange={(e) => {
                            const current = petsData.ownerAttendeeIds || [];
                            const next = e.target.checked
                              ? [...current, parent.id]
                              : current.filter((id: string) => id !== parent.id);
                            setPetsData({ ...petsData, ownerAttendeeIds: next });
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{parent.name}</span>
                      </label>
                  ))}
                </div>
              </div>
            </div>
            {renderExternalAttendeesSection()}
          </div>
        );
        
      case 'academics':
        return (
          <div className={`${sectionClass} space-y-4`}>
            <h3 className="text-sm font-medium text-text-primary">School Event Details</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Event Type
                </label>
                <select
                  value={academicsData.eventType || 'school-event'}
                  onChange={(e) => setAcademicsData(prev => ({ ...prev, eventType: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                >
                  <option value="parent-teacher">Parent-Teacher Conference</option>
                  <option value="school-event">School Event</option>
                  <option value="exam">Exam</option>
                  <option value="assignment">Assignment Due</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Parents
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {familyMembers
                    .filter(m => m.type === 'human' && (m.role === 'parent' || m.role === 'admin'))
                    .map(parent => (
                      <label key={parent.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={academicsData.parentIds?.includes(parent.id) || false}
                          onChange={(e) => {
                            setAcademicsData(prev => {
                              const currentParents = prev.parentIds || [];
                              if (e.target.checked) {
                                return { ...prev, parentIds: [...currentParents, parent.id] };
                              } else {
                                return { ...prev, parentIds: currentParents.filter(id => id !== parent.id) };
                              }
                            });
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{parent.name}</span>
                      </label>
                  ))}
                </div>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Student(s)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {familyMembers
                    .filter(m => m.is_child === true)
                    .map(student => (
                      <label key={student.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={academicsData.studentIds?.includes(student.id) || false}
                          onChange={(e) => {
                            const currentStudents = academicsData.studentIds || [];
                            if (e.target.checked) {
                              setAcademicsData({ 
                                ...academicsData, 
                                studentIds: [...currentStudents, student.id] 
                              });
                            } else {
                              setAcademicsData({ 
                                ...academicsData, 
                                studentIds: currentStudents.filter(id => id !== student.id) 
                              });
                            }
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{student.name}</span>
                      </label>
                  ))}
                </div>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Other
                </label>
                <input
                  type="text"
                  value={academicsData.otherParticipants || ''}
                  onChange={(e) => setAcademicsData({ ...academicsData, otherParticipants: e.target.value })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary text-sm"
                  placeholder="Enter other participants (e.g., tutors, coaches - comma-separated)..."
                />
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  School Name
                </label>
                <input
                  type="text"
                  value={academicsData.schoolName || ''}
                  onChange={(e) => setAcademicsData({ ...academicsData, schoolName: e.target.value })}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                  placeholder="Enter school name"
                />
              </div>
            </div>
            {renderExternalAttendeesSection()}
          </div>
        );
        
      case 'general':
        return (
          <div className="space-y-4 border-t border-gray-600/30 pt-4">
            <h3 className="text-sm font-medium text-text-primary">Participants</h3>
            
            <div className="space-y-3">
              {/* Family Members */}
              <div>
                <p className="text-xs text-text-muted mb-1 font-medium">Family Members</p>
                <div className="grid grid-cols-3 gap-2">
                  {familyMembers
                    .filter(m => m.type === 'human' && m.role !== 'member')
                    .map(member => (
                      <label key={member.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={generalData.participantIds?.includes(member.id) || false}
                          onChange={(e) => {
                            setGeneralData(prev => {
                              const currentParticipants = prev.participantIds || [];
                              if (e.target.checked) {
                                return { ...prev, participantIds: [...currentParticipants, member.id] };
                              } else {
                                return { ...prev, participantIds: currentParticipants.filter(id => id !== member.id) };
                              }
                            });
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{member.name}</span>
                      </label>
                  ))}
                </div>
              </div>
              
              {/* Staff */}
              <div>
                <p className="text-xs text-text-muted mb-1 font-medium">Staff</p>
                <div className="grid grid-cols-3 gap-2">
                  {familyMembers
                    .filter(m => m.type === 'human' && m.role === 'member')
                    .map(member => (
                      <label key={member.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={generalData.participantIds?.includes(member.id) || false}
                          onChange={(e) => {
                            setGeneralData(prev => {
                              const currentParticipants = prev.participantIds || [];
                              if (e.target.checked) {
                                return { ...prev, participantIds: [...currentParticipants, member.id] };
                              } else {
                                return { ...prev, participantIds: currentParticipants.filter(id => id !== member.id) };
                              }
                            });
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{member.name}</span>
                      </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  // Helper to compute duration in minutes
  const computeDurationMinutes = (): number => {
    try {
      const start = new Date(`${baseData.startDate}T${baseData.startTime}:00`);
      const end = new Date(`${baseData.endDate}T${baseData.endTime}:00`);
      const diff = Math.max(0, end.getTime() - start.getTime());
      const mins = Math.round(diff / 60000);
      return mins || 60; // default 60 if 0
    } catch {
      return 60;
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background-secondary rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-600/30">
          <h2 className="text-xl font-semibold text-text-primary">Create Event</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Connection indicator removed per request */}
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Event Type Selector */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Event Type
              </label>
              <div className="grid grid-cols-5 gap-2">
                {EVENT_TYPES.map(type => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setEventType(type.value as EventType)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                        eventType === type.value
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600/30 hover:border-gray-600'
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${type.color}`} />
                      <span className="text-xs text-text-primary">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Base Fields */}
            <div className="space-y-4">
              <div className={sectionClass}>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={baseData.title}
                    onChange={(e) => setBaseData({ ...baseData, title: e.target.value })}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                    placeholder="Event title"
                  />
                </div>
              </div>

              {eventType !== 'travel' && (
                <div className={`${sectionClass} space-y-4`}>
                  <div className="grid grid-cols-2 gap-4">
                    <DateDisplay
                      label="Start Date"
                      date={baseData.startDate}
                      onChange={(v) => setBaseData({ ...baseData, startDate: v })}
                      ref={startDateInputRef}
                    />
                    {showTimeInputs ? (
                      <TimeInput
                        label="Start Time"
                        value={baseData.startTime}
                        onChange={(v) => setBaseData({ ...baseData, startTime: v })}
                        required={!baseData.allDay}
                      />
                    ) : (
                      <div />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <DateDisplay
                      label="End Date"
                      date={baseData.endDate}
                      onChange={(v) => setBaseData({ ...baseData, endDate: v })}
                      minDate={baseData.startDate}
                      ref={endDateInputRef}
                    />
                    {showTimeInputs ? (
                      <TimeInput
                        label="End Time"
                        value={baseData.endTime}
                        onChange={(v) => setBaseData({ ...baseData, endTime: v })}
                        required={false}
                        placeholder="Optional"
                      />
                    ) : (
                      <div />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="allDay"
                      checked={baseData.allDay}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (!checked) {
                          setBaseData(prev => ({
                            ...prev,
                            allDay: false,
                            endDate: prev.startDate,
                          }));
                        } else {
                          setBaseData(prev => ({ ...prev, allDay: true }));
                        }
                        setShowTimeInputs(!checked);
                      }}
                      className="rounded border-gray-600 bg-gray-700"
                    />
                    <label htmlFor="allDay" className="text-sm text-text-primary">
                      All-day event
                    </label>
                  </div>
                </div>
              )}

              {eventType !== 'travel' && (
                <div className={sectionClass}>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Location
                    </label>
                    <AddressAutocomplete
                      value={baseData.location || ''}
                      onChange={(value) => setBaseData({ ...baseData, location: value })}
                      placeholder="Enter location..."
                      className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="zoomEnabled"
                      checked={zoomEnabled}
                      onChange={(e) => setZoomEnabled(e.target.checked)}
                      className="rounded border-gray-600 bg-gray-700"
                      disabled={baseData.allDay}
                    />
                    <label htmlFor="zoomEnabled" className="text-sm text-text-primary">
                      Add Zoom meeting {baseData.allDay && '(disabled for all‑day)'}
                    </label>
                  </div>
                </div>
              )}

              {eventType === 'general' ? (
                <div className={sectionClass}>
                  <h3 className="text-sm font-medium text-text-primary">Participants</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[...allowedFamilyParticipants, ...allowedStaffParticipants].map(member => (
                      <label key={member.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={generalData.participantIds?.includes(member.id) || false}
                          onChange={(e) => {
                            setGeneralData(prev => {
                              const currentParticipants = prev.participantIds || [];
                              if (e.target.checked) {
                                return { ...prev, participantIds: [...currentParticipants, member.id] };
                              }
                              return { ...prev, participantIds: currentParticipants.filter(id => id !== member.id) };
                            });
                          }}
                          className="rounded border-gray-600 bg-gray-700"
                        />
                        <span className="text-sm text-text-primary">{member.name}</span>
                      </label>
                    ))}
                    {[...allowedFamilyParticipants, ...allowedStaffParticipants].length === 0 && (
                      <span className="text-xs text-text-muted col-span-3">No participants</span>
                    )}
                  </div>
                  {renderExternalAttendeesSection()}
                </div>
              ) : (
                <>{renderTypeSpecificFields()}</>
              )}

              <div className={sectionClass}>
                {googleCalendars.length > 0 && (
                  <CalendarSelector
                    calendars={googleCalendars}
                    selectedCalendarId={baseData.googleCalendarId}
                    onCalendarChange={handleCalendarChange}
                    label="Add to Calendar"
                  />
                )}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Notes
                  </label>
                  <textarea
                    value={baseData.description}
                    onChange={(e) => setBaseData({ ...baseData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                    rows={3}
                    placeholder="Add notes..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-600/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-muted hover:text-text-primary transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-button-create hover:bg-button-create/90 text-white rounded-md transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Event
          </button>
        </div>
      </div>
    </div>
  );
}
