'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, MapPin, Upload, Bot, Calendar as CalendarIcon, Plane, Heart, PawPrint, GraduationCap } from 'lucide-react';
import { CalendarEvent, CalendarEventCategory, User } from '@/lib/supabase/types';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { AirportAutocomplete } from '@/components/ui/airport-autocomplete';
import { ContactAutocomplete } from '@/components/ui/contact-autocomplete';
import { RecentContactsAutocomplete } from '@/components/ui/recent-contacts-autocomplete';
import { DateDisplay } from '@/components/ui/date-display';
import { TimeInput } from '@/components/ui/time-input';
import { CalendarSelector } from './CalendarSelector';
import { TravelersPicker } from '@/components/travel/shared/TravelersPicker';
import { DocumentUploadPanel } from '@/components/travel/shared/DocumentUploadPanel';
import { uploadPendingDocs } from '@/lib/travel/doc-upload';
import { validateTravelSegment } from '@/lib/travel/validation';
import { getCSRFHeaders } from '@/lib/security/csrf-client';
import ApiClient from '@/lib/api/api-client';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';
import { createClient } from '@/lib/supabase/client';

const categoryLabels: Record<CalendarEventCategory, string> = {
  medical: 'Health',
  personal: 'Personal',
  work: 'Work',
  family: 'Family',
  travel: 'Travel',
  school: 'School',
  education: 'Education',
  pets: 'Pets',
  financial: 'Financial',
  household: 'Household',
  legal: 'Legal',
  administrative: 'Administrative',
  other: 'Other'
};

interface CreateEventModalProps {
  onClose: () => void;
  selectedDate?: Date | null;
  prefillData?: {
    startDate: Date;
    endDate: Date;
    isAllDay: boolean;
  };
  categories?: any[];
  onEventCreated: (event: CalendarEvent) => void;
}

export function CreateEventModal({
  onClose,
  selectedDate,
  prefillData,
  categories,
  onEventCreated,
}: CreateEventModalProps) {
  // Use prefillData if provided, otherwise fall back to selectedDate
  const getInitialStartDate = () => {
    if (prefillData?.startDate) {
      return prefillData.startDate.toISOString().split('T')[0];
    }
    return selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  };

  const getInitialEndDate = () => {
    if (prefillData?.endDate) {
      return prefillData.endDate.toISOString().split('T')[0];
    }
    return selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  };

  const getInitialStartTime = () => {
    if (prefillData?.startDate && !prefillData.isAllDay) {
      const hours = prefillData.startDate.getHours().toString().padStart(2, '0');
      const minutes = prefillData.startDate.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return '12:00'; // Default to 12:00 PM (noon)
  };

  const getInitialEndTime = () => {
    if (prefillData?.endDate && !prefillData.isAllDay) {
      const hours = prefillData.endDate.getHours().toString().padStart(2, '0');
      const minutes = prefillData.endDate.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return '13:00'; // Default to 1:00 PM
  };

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CalendarEventCategory>('personal');
  const [startDate, setStartDate] = useState(getInitialStartDate());
  const [startTime, setStartTime] = useState(getInitialStartTime());
  const [endDate, setEndDate] = useState(getInitialEndDate());
  const [endTime, setEndTime] = useState(getInitialEndTime());
  const [allDay, setAllDay] = useState(prefillData?.isAllDay ?? true); // Default to all-day CHECKED
  const [showTimeInputs, setShowTimeInputs] = useState(prefillData?.isAllDay === false); // Only show times if explicitly NOT all-day
  const [location, setLocation] = useState('');
  const [isVirtual, setIsVirtual] = useState(false);
  const [zoomLink, setZoomLink] = useState('');
  // Travel-specific fields
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [departureAirport, setDepartureAirport] = useState('');
  const [arrivalAirport, setArrivalAirport] = useState('');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [additionalAttendees, setAdditionalAttendees] = useState('');
  const additionalAttendeesRef = useRef<string>('');
  const [reminderMinutes, setReminderMinutes] = useState<number>(15);
  const [recurringPattern, setRecurringPattern] = useState<string>('none');
  const [saveLocalOnly, setSaveLocalOnly] = useState(false); // Default to sync with Google
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [dynamicCategories, setDynamicCategories] = useState<Category[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [smartUploadStatus, setSmartUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualFileInputRef = useRef<HTMLInputElement>(null);
  const { selectedPersonId } = usePersonFilter();
  const [doNotSendInvite, setDoNotSendInvite] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; title: string; category: string }>>([]);
  const [travelers, setTravelers] = useState<string[]>([]);

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
    fetchUsers();
    fetchCalendars();
    fetchCategories();
    fetchCurrentUser();
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    additionalAttendeesRef.current = additionalAttendees;
    console.log('[CreateEventModal] Synced ref with state:', additionalAttendees);
  }, [additionalAttendees]);

  const fetchCurrentUser = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('email')
        .eq('id', user.id)
        .single();
      
      if (userData) {
        setCurrentUserEmail(userData.email);
      }
    }
  };

  // Listen for category updates from admin panel
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'categories-updated' && e.newValue) {
        // Refetch categories when they're updated in admin
        fetchCategories();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const fetchCategories = async () => {
    try {
      setLoadingCategories(true);
      const cats = await CategoriesClient.getCategories('calendar');
      
      // Create a mapping of category names to enum values
      const categoryEnumMapping: Record<string, CalendarEventCategory> = {
        'health': 'medical',
        'medical': 'medical',
        'personal': 'personal',
        'work': 'work',
        'family': 'family',
        'family event': 'family',
        'travel': 'travel',
        'school': 'school',
        'j3 academics': 'education',
        'education': 'education',
        'pets': 'pets',
        'pet care': 'pets',
        'financial': 'financial',
        'household': 'household',
        'legal': 'legal',
        'administrative': 'administrative',
        'meeting': 'work',
        'appointment': 'medical',
        'other': 'other'
      };
      
      // Map categories to use enum values as IDs
      const mappedCategories = cats.map(cat => {
        const lowerName = cat.name.toLowerCase();
        const enumValue = categoryEnumMapping[lowerName] || 'other';
        return {
          ...cat,
          id: enumValue, // Use the enum value as the ID for filtering
          originalId: cat.id // Keep original ID if needed
        };
      });
      
      // Remove duplicates based on the mapped enum value
      const uniqueCategories = Array.from(
        new Map(mappedCategories.map(cat => [cat.id, cat])).values()
      );
      
      setDynamicCategories(uniqueCategories as Category[]);
      
      // Set default category if we have categories
      if (uniqueCategories.length > 0) {
        const defaultCat = uniqueCategories.find(c => c.id === 'personal') || uniqueCategories[0];
        setCategory(defaultCat.id as CalendarEventCategory);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fall back to using hardcoded categories
    } finally {
      setLoadingCategories(false);
    }
  };


  const fetchUsers = async () => {
    try {
      console.log('[CreateEventModal] Fetching users...');
      const response = await fetch('/api/auth/users', {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      
      if (!response.ok) {
        console.error('[CreateEventModal] Failed to fetch users:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        console.error('[CreateEventModal] Error data:', errorData);
        return;
      }
      
      const data = await response.json();
      console.log('[CreateEventModal] Received data:', data);
      console.log('[CreateEventModal] Users array:', data.users);
      
      // Filter out pets from the users list
      const humanUsers = (data.users || []).filter((user: User) => {
        const firstName = user.name.split(' ')[0];
        return !['Daisy', 'Jack', 'Kiki'].includes(firstName);
      });
      
      console.log('[CreateEventModal] Filtered human users:', humanUsers);
      setUsers(humanUsers);
      
      // Fallback if no users were loaded
      if (humanUsers.length === 0) {
        console.log('[CreateEventModal] No users loaded, using fallback list');
        const fallbackUsers: User[] = [
          { id: 'da167ee0-ec65-4ec3-a77f-2184eb8b2262', name: 'Colleen Russell', email: 'colleen@example.com', role: 'admin', created_at: '', updated_at: '', user_status: 'active', theme_preference: 'system' as any },
          { id: '10f29b0f-47a7-4320-8b52-aa6ee4035ef2', name: 'Kate McLaren', email: 'kate@example.com', role: 'user', created_at: '', updated_at: '', user_status: 'active', theme_preference: 'system' as any },
          { id: '5d9107a8-f61a-4967-a9ec-bf6448d3d771', name: 'John Johnson', email: 'john@example.com', role: 'user', created_at: '', updated_at: '', user_status: 'active', theme_preference: 'system' as any },
          { id: 'd9c6b10a-2585-43af-8d5a-672a748bb27c', name: 'Susan Johnson', email: 'susan@example.com', role: 'user', created_at: '', updated_at: '', user_status: 'active', theme_preference: 'system' as any }
        ];
        setUsers(fallbackUsers);
      }
    } catch (error) {
      console.error('[CreateEventModal] Error fetching users:', error);
      // Use fallback users on error
      const fallbackUsers: User[] = [
        { id: 'da167ee0-ec65-4ec3-a77f-2184eb8b2262', name: 'Colleen Russell', email: 'colleen@example.com', role: 'admin', created_at: '', updated_at: '', user_status: 'active', theme_preference: 'system' as any },
        { id: '10f29b0f-47a7-4320-8b52-aa6ee4035ef2', name: 'Kate McLaren', email: 'kate@example.com', role: 'user', created_at: '', updated_at: '', user_status: 'active', theme_preference: 'system' as any },
        { id: '5d9107a8-f61a-4967-a9ec-bf6448d3d771', name: 'John Johnson', email: 'john@example.com', role: 'user', created_at: '', updated_at: '', user_status: 'active', theme_preference: 'system' as any },
        { id: 'd9c6b10a-2585-43af-8d5a-672a748bb27c', name: 'Susan Johnson', email: 'susan@example.com', role: 'user', created_at: '', updated_at: '', user_status: 'active', theme_preference: 'system' as any }
      ];
      setUsers(fallbackUsers);
    }
  };

  const fetchCalendars = async () => {
    try {
      const response = await fetch('/api/google/calendars/list');
      if (response.ok) {
        const data = await response.json();
        // Map to the format expected by CalendarSelector
        const formattedCalendars = data.calendars?.map((cal: any) => ({
          google_calendar_id: cal.id,
          name: cal.name,
          background_color: cal.backgroundColor,
          foreground_color: cal.foregroundColor,
          is_primary: cal.isPrimary,
          can_write: cal.canWrite
        })) || [];
        setGoogleCalendars(formattedCalendars);
        
        // Auto-select primary calendar
        const primaryCalendar = formattedCalendars.find((cal: any) => cal.is_primary);
        if (primaryCalendar && !selectedCalendarId) {
          setSelectedCalendarId(primaryCalendar.google_calendar_id);
        }
      }
    } catch (error) {
      console.error('Error fetching calendars:', error);
    }
  };

  // Smart upload handler for travel documents
  const handleSmartUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    const MAX_SIZE_MB = 10;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`File too large. Maximum size is ${MAX_SIZE_MB}MB`);
      return;
    }

    setUploadingFile(true);
    setSmartUploadStatus('processing');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', 'flight');
      formData.append('saveToDocuments', 'true'); // Save to Documents page
      
      // Add attendees as travelers if they exist
      if (attendees && attendees.length > 0) {
        formData.append('travelers', JSON.stringify(attendees));
      }
      
      const response = await fetch('/api/travel/parse-document', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const data = result.data;
          
          // Auto-fill form fields with extracted data
          if (data.airline && data.flight_number) {
            setTitle(`Flight: ${data.airline} ${data.flight_number}`);
          } else if (data.departure_airport && data.arrival_airport) {
            setTitle(`Flight: ${data.departure_airport} → ${data.arrival_airport}`);
          }
          
          // Set description with flight details
          const descParts = [];
          if (data.airline) descParts.push(`Airline: ${data.airline}`);
          if (data.flight_number) descParts.push(`Flight: ${data.flight_number}`);
          if (data.confirmation_number) descParts.push(`Confirmation: ${data.confirmation_number}`);
          setDescription(descParts.join('\n'));
          
          // Set dates and times
          // Handle both combined datetime and separate date/time fields
          if (data.departure_time && data.departure_time.includes('T')) {
            // Combined datetime format
            const [depDate, depTime] = data.departure_time.split('T');
            setStartDate(depDate);
            setStartTime(depTime.slice(0, 5));
            setAllDay(false);
            setShowTimeInputs(true);
          } else {
            // Separate date and time fields
            if (data.departure_date) {
              setStartDate(data.departure_date);
              setAllDay(false);
              setShowTimeInputs(true);
            }
            if (data.departure_time) {
              setStartTime(data.departure_time.slice(0, 5));
            }
          }
          
          if (data.arrival_time && data.arrival_time.includes('T')) {
            // Combined datetime format
            const [arrDate, arrTime] = data.arrival_time.split('T');
            setEndDate(arrDate);
            setEndTime(arrTime.slice(0, 5));
          } else {
            // Separate date and time fields
            if (data.arrival_date) {
              setEndDate(data.arrival_date);
            } else if (data.departure_date) {
              setEndDate(data.departure_date); // Same day arrival
            }
            if (data.arrival_time) {
              setEndTime(data.arrival_time.slice(0, 5));
            }
          }
          
          // Set location
          if (data.departure_airport) {
            setLocation(data.departure_airport);
          }
          
          setSmartUploadStatus('success');
          
          // Show message if document was saved
          if (result.document) {
            console.log('Travel document saved to Documents page:', result.document);
          }
          
          setTimeout(() => setSmartUploadStatus('idle'), 3000);
        } else {
          setSmartUploadStatus('error');
          alert('Could not extract travel details from the document');
        }
      } else {
        setSmartUploadStatus('error');
        alert('Failed to process document');
      }
    } catch (error) {
      console.error('Smart upload error:', error);
      setSmartUploadStatus('error');
      alert('Error processing document');
    } finally {
      setUploadingFile(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Event validation function
  const validateEvent = () => {
    if (!title.trim()) {
      return { valid: false, error: 'Title is required' };
    }
    
    if (!allDay) {
      if (!startTime) {
        return { valid: false, error: 'Start time is required for timed events' };
      }
      
      // Travel events require end time
      if (category === 'travel') {
        if (!endTime) {
          return { valid: false, error: 'Travel events require an end time' };
        }
        const startDT = new Date(`${startDate}T${startTime}:00`);
        const endDT = new Date(`${endDate}T${endTime}:00`);
        if (endDT <= startDT) {
          return { valid: false, error: 'End time must be after start time for travel events' };
        }
      } else if (endTime) {
        // If end time is provided, validate it's after start
        const startDT = new Date(`${startDate}T${startTime}:00`);
        const endDT = new Date(`${endDate}T${endTime}:00`);
        if (endDT <= startDT) {
          return { valid: false, error: 'End time must be after start time' };
        }
      }
    }
    
    return { valid: true };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate before submission
    const validation = validateEvent();
    if (!validation.valid) {
      alert(validation.error);
      return;
    }
    
    setLoading(true);

    try {
      // Use ISO string format with timezone for proper date handling
      // For all-day events, preserve local date (avoid UTC shift)
      // Store wall-clock local times (no timezone) for timed events
      const startDateTime = allDay 
        ? `${startDate}T00:00:00`
        : `${startDate}T${startTime}:00`;
      
      // Handle end time: point-in-time events have end = start
      let endDateTime;
      if (allDay) {
        endDateTime = `${endDate}T23:59:59`;
      } else if (endTime && endTime !== startTime) {
        // End time explicitly provided and different from start
        endDateTime = `${endDate}T${endTime}:00`;
      } else {
        // Point-in-time event: end = start
        endDateTime = startDateTime;
      }

      console.log('Creating event with dates:', { startDateTime, endDateTime });
      console.log('[Submit] ===== CHECKING ADDITIONAL ATTENDEES =====');
      console.log('[Submit] State value:', additionalAttendees);
      console.log('[Submit] Ref value:', additionalAttendeesRef.current);
      console.log('[Submit] Type of state:', typeof additionalAttendees);
      console.log('[Submit] Type of ref:', typeof additionalAttendeesRef.current);
      console.log('[Submit] State length:', additionalAttendees?.length);
      console.log('[Submit] Ref length:', additionalAttendeesRef.current?.length);
      
      // Parse additional attendees - use ref.current for most up-to-date value
      const attendeesValue = additionalAttendeesRef.current || additionalAttendees;
      console.log('[Submit] Using value:', attendeesValue);
      
      const additionalAttendeesList = attendeesValue 
        ? attendeesValue.split(',').map(email => email.trim()).filter(email => email && email.includes('@'))
        : [];
      
      console.log('[Submit] Parsed list:', additionalAttendeesList);
      console.log('[Submit] Number of attendees:', additionalAttendeesList.length);
      console.log('[Submit] ===== END CHECKING =====');

      const attendeeIds: string[] = category === 'travel' ? travelers.slice() : [];
      if (selectedPersonId && category !== 'travel') attendeeIds.push(selectedPersonId);

      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
      const eventPayload = {
        event: {
          title,
          description,
          category,
          start_time: startDateTime,
          end_time: endDateTime,
          all_day: allDay,
          location,
          is_virtual: category === 'travel' ? false : isVirtual,
          zoom_link: category === 'travel' ? null : (isVirtual ? zoomLink : null),
          attendees,
          attendee_ids: attendeeIds,
          reminder_minutes: reminderMinutes,
          recurrence_pattern: recurringPattern !== 'none' ? { pattern: recurringPattern } : null,
          is_recurring: recurringPattern !== 'none',
          // Always include metadata with additional_attendees array (even if empty)
          metadata: {
            additional_attendees: additionalAttendeesList,
            timezone: browserTz,
            airline: category === 'travel' ? airline : undefined,
            flight_number: category === 'travel' ? flightNumber : undefined,
            departure_airport: category === 'travel' ? departureAirport : undefined,
            arrival_airport: category === 'travel' ? arrivalAirport : undefined
          },
          // Email invites
          send_invites: !doNotSendInvite,
          // Color determined by Google Calendar
          google_sync_enabled: !saveLocalOnly,
          google_calendar_id: !saveLocalOnly ? selectedCalendarId : null
        }
      };
      
      console.log('Sending event payload:', JSON.stringify(eventPayload, null, 2));

      const resp = await ApiClient.post('/api/calendar-events', eventPayload);

      if (resp.success) {
        const createdEvent = (resp.data as any)?.event || (resp.data as any);
        
        // Save additional attendees to recent contacts if they exist
        if (additionalAttendees) {
          const emails = additionalAttendees.split(',').map(email => email.trim()).filter(email => email);
          if (emails.length > 0) {
            ApiClient.post('/api/recent-contacts/add', { emails }).catch(err => console.error('Failed to save recent contacts:', err));
          }
        }
        
        // Upload any pending documents (travel only)
        if (category === 'travel' && pendingFiles.length > 0) {
          await uploadPendingDocs({
            pendingFiles,
            sourcePage: 'travel',
            sourceId: createdEvent?.id || null,
            relatedPeople: attendeeIds,
            descriptionLines: [
              airline ? `Airline: ${airline}` : '',
              flightNumber ? `Flight: ${flightNumber}` : '',
              departureAirport ? `From: ${departureAirport}` : '',
              arrivalAirport ? `To: ${arrivalAirport}` : ''
            ],
          });
          setPendingFiles([]);
        }

        onEventCreated(createdEvent);
        onClose();
      } else {
        let errorMessage = 'Unknown error';
        let errorDetails = '';
        try {
          console.error('Error creating event:', resp.error);
          errorMessage = resp.error || 'Unknown error';
        } catch (e) {}
        alert(`Failed to create event: ${errorMessage}${errorDetails ? '\nDetails: ' + errorDetails : ''}`);
      }
    } catch (error) {
      console.error('Error creating event:', error);
      alert('Failed to create event: Network error or server is not responding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-primary">Add Event</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded-md transition-colors"
            >
              <X className="h-5 w-5 text-text-primary" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quick category tabs */}
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory('personal')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${category==='personal' ? 'border-2 border-gray-500' : 'border border-gray-600/30'} bg-background-primary`}
                >
                  <CalendarIcon className="h-4 w-4" />
                  <span className="text-sm">General</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('travel')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${category==='travel' ? 'border-2 border-gray-500' : 'border border-gray-600/30'} bg-background-primary`}
                >
                  <Plane className="h-4 w-4 text-travel" />
                  <span className="text-sm">Travel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('medical')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${category==='medical' ? 'border-2 border-gray-500' : 'border border-gray-600/30'} bg-background-primary`}
                >
                  <Heart className="h-4 w-4 text-medical" />
                  <span className="text-sm">Medical</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('pets')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${category==='pets' ? 'border-2 border-gray-500' : 'border border-gray-600/30'} bg-background-primary`}
                >
                  <PawPrint className="h-4 w-4 text-pets" />
                  <span className="text-sm">Pet Care</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('education')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${category==='education' ? 'border-2 border-gray-500' : 'border border-gray-600/30'} bg-background-primary`}
                >
                  <GraduationCap className="h-4 w-4 text-purple-400" />
                  <span className="text-sm">Academics</span>
                </button>
              </div>
            </div>
            {/* Title and Description */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={1}
                className="w-full px-3 py-2 min-h-[40px] resize-y bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            {/* Smart Upload section omitted for travel here; see travel documents panel below */}

            {/* Date and Time Section */}
            <div className="space-y-4">
              {/* Start Date/Time Row */}
              <div className="grid grid-cols-2 gap-4">
                <DateDisplay
                  label="Start Date"
                  date={startDate}
                  onChange={setStartDate}
                  ref={startDateInputRef}
                />
                {showTimeInputs ? (
                  <TimeInput
                    label="Start Time"
                    value={startTime}
                    onChange={setStartTime}
                    required={!allDay}
                  />
                ) : (
                  <div /> /* Empty space reserved for time input */
                )}
              </div>

              {/* End Date/Time Row */}
              <div className="grid grid-cols-2 gap-4">
                <DateDisplay
                  label="End Date"
                  date={endDate}
                  onChange={setEndDate}
                  minDate={startDate}
                  ref={endDateInputRef}
                />
                {showTimeInputs ? (
                  <TimeInput
                    label={category === 'travel' ? 'End Time *' : 'End Time'}
                    value={endTime}
                    onChange={setEndTime}
                    required={category === 'travel'}
                    placeholder={category === 'travel' ? 'Required for travel' : 'Optional'}
                  />
                ) : (
                  <div /> /* Empty space reserved for time input */
                )}
              </div>
            </div>

            {/* All Day Checkbox (moved below date fields) */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => {
                    setAllDay(e.target.checked);
                    setShowTimeInputs(!e.target.checked);
                  }}
                  className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
                />
                <span className="text-sm text-text-primary font-medium">All day event</span>
              </label>
            </div>

            {/* Category and Reminder */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CalendarEventCategory)}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  disabled={loadingCategories}
                >
                  {loadingCategories ? (
                    <option>Loading categories...</option>
                  ) : dynamicCategories.length > 0 ? (
                    dynamicCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))
                  ) : (
                    // Fallback to hardcoded categories if dynamic fetch fails
                    Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Reminder
                </label>
                <select
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  <option value={0}>No reminder</option>
                  <option value={15}>15 minutes before</option>
                  <option value={30}>30 minutes before</option>
                  <option value={60}>1 hour before</option>
                  <option value={1440}>1 day before</option>
                </select>
              </div>
            </div>

            {/* Location or Travel details */}
            {category !== 'travel' ? (
              <div className="relative">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Location
                </label>
                <AddressAutocomplete
                  value={location}
                  onChange={setLocation}
                  placeholder="Enter location or address"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">Airline
                  <ContactAutocomplete
                    value={airline}
                    onChange={setAirline}
                    filterType="airline"
                    placeholder="Start typing airline..."
                    className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary"
                  />
                </label>
                <label className="block text-sm">Flight #
                  <input
                    value={flightNumber}
                    onChange={e=>setFlightNumber(e.target.value)}
                    className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary"
                  />
                </label>
                <label className="block text-sm">Departure Airport
                  <AirportAutocomplete
                    value={departureAirport}
                    onChange={setDepartureAirport}
                    placeholder="Search departure airport (JFK, LAX, etc.)"
                    className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary"
                  />
                </label>
                <label className="block text-sm">Arrival Airport
                  <AirportAutocomplete
                    value={arrivalAirport}
                    onChange={setArrivalAirport}
                    placeholder="Search arrival airport"
                    className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary"
                  />
                </label>
              </div>
            )}

            {/* Virtual Meeting (hidden for travel) */}
            {category !== 'travel' && (
              <>
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isVirtual}
                      onChange={(e) => setIsVirtual(e.target.checked)}
                      className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
                    />
                    <span className="text-sm text-text-primary">Add Zoom Meeting</span>
                  </label>
                </div>
                {isVirtual && (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Meeting Link (Zoom, Google Meet, etc.)
                    </label>
                    <input
                      type="url"
                      value={zoomLink}
                      onChange={(e) => setZoomLink(e.target.value)}
                      placeholder="https://zoom.us/j/..."
                      className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                    />
                  </div>
                )}
              </>
            )}

            {/* Travel documents (manual upload like Transportation modal) */}
            {category === 'travel' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => manualFileInputRef.current?.click()}
                    className="px-4 py-2 bg-background-primary border border-gray-600/40 rounded-xl text-text-primary hover:bg-gray-700/30"
                  >
                    Choose File
                  </button>
                  <input
                    ref={manualFileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/jpg,.eml,.msg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const defaultTitle = file.name.replace(/\.[^/.]+$/, '');
                      setPendingFiles(prev => [...prev, { file, title: defaultTitle, category: '' }]);
                      if (manualFileInputRef.current) manualFileInputRef.current.value = '';
                    }}
                  />
                  {/* Smart Upload retained */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      uploadingFile ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {uploadingFile ? 'Processing…' : (
                      <span className="inline-flex items-center gap-2"><Upload className="w-4 h-4"/> Smart Travel Upload</span>
                    )}
                  </button>
                </div>
                {/* Pending files editor */}
                {pendingFiles.length > 0 && (
                  <div className="space-y-2">
                    {pendingFiles.map((item, idx) => (
                      <div key={idx} className="p-3 bg-background-primary/40 rounded-md border border-gray-600/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <label className="text-xs text-text-muted">Document Title
                            <input value={item.title} onChange={e=>{
                              const v=e.target.value; setPendingFiles(p=>{ const copy=[...p]; copy[idx]={...copy[idx], title:v}; return copy; });
                            }} className="mt-1 w-full px-2 py-1.5 bg-background-primary border border-gray-600/30 rounded-md text-text-primary" />
                          </label>
                          <label className="text-xs text-text-muted">Document Category
                            <select value={item.category} onChange={e=>{
                              const v=e.target.value; setPendingFiles(p=>{ const copy=[...p]; copy[idx]={...copy[idx], category:v}; return copy; });
                            }} className="mt-1 w-full px-2 py-1.5 bg-background-primary border border-gray-600/30 rounded-md text-text-primary">
                              <option value="">Select a category...</option>
                              {docCategories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                            </select>
                          </label>
                        </div>
                        <div className="mt-2 text-right">
                          <button type="button" onClick={()=> setPendingFiles(p=> p.filter((_,i)=> i!==idx))} className="text-sm text-text-muted hover:text-text-primary">Remove</button>
                        </div>
                      </div>
                    ))}
                    <div className="text-xs text-text-muted">Documents upload after you click “Create Event”.</div>
                  </div>
                )}
              </div>
            )}

            {/* Attendees / Travelers */}
            {category === 'travel' ? (
              <TravelersPicker selectedIds={travelers} onChange={setTravelers} includePets includeExtended title='Travelers' />
            ) : (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Attendees</label>
                <div className="grid grid-cols-2 gap-1 p-3 bg-background-primary border border-gray-600/30 rounded-md">
                  {users.length === 0 ? (
                    <div>
                      <p className="text-sm text-text-muted mb-2">Loading users...</p>
                      <button type="button" onClick={() => fetchUsers()} className="text-xs text-blue-400 hover:text-blue-300 underline">Retry loading users</button>
                    </div>
                  ) : (
                    [...users].sort((a, b) => a.name.localeCompare(b.name)).map((user) => (
                      <label key={user.id} className="flex items-center gap-2 cursor-pointer p-1 rounded">
                        <input
                          type="checkbox"
                          value={user.id}
                          checked={attendees.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) setAttendees([...attendees, user.id]);
                            else setAttendees(attendees.filter(id => id !== user.id));
                          }}
                          className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-text-primary">{user.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Additional Attendees */}
            <div className="space-y-2">
              <RecentContactsAutocomplete
                value={additionalAttendees}
                onChange={(value) => {
                  console.log('[CreateEventModal] ===== onChange START =====');
                  console.log('[CreateEventModal] Received value:', value);
                  console.log('[CreateEventModal] Value type:', typeof value);
                  console.log('[CreateEventModal] Value length:', value?.length);
                  console.log('[CreateEventModal] Current state before update:', additionalAttendees);
                  console.log('[CreateEventModal] Current ref before update:', additionalAttendeesRef.current);
                  
                  const normalized = Array.isArray(value) ? value.join(', ') : value;
                  setAdditionalAttendees(normalized);
                  additionalAttendeesRef.current = normalized; // Update ref immediately
                  
                  console.log('[CreateEventModal] Ref immediately after update:', additionalAttendeesRef.current);
                  
                  // Force a re-render to ensure state is updated
                  setTimeout(() => {
                    console.log('[CreateEventModal] State after timeout:', additionalAttendees);
                    console.log('[CreateEventModal] Ref after timeout:', additionalAttendeesRef.current);
                    console.log('[CreateEventModal] ===== onChange END =====');
                  }, 0);
                }}
                placeholder={"Enter additional attendee's email (press enter to add)"}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
              {/* Invite toggle */}
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={doNotSendInvite}
                  onChange={(e) => setDoNotSendInvite(e.target.checked)}
                  className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
                />
                Do not send invite
              </label>
            </div>

            {/* Recurring Pattern (label removed) */}
            <div>
              <select
                value={recurringPattern}
                onChange={(e) => setRecurringPattern(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            {/* Google Calendar Selection */}
            {googleCalendars.length > 0 && !saveLocalOnly && (
              <CalendarSelector
                calendars={googleCalendars}
                selectedCalendarId={selectedCalendarId}
                onCalendarChange={setSelectedCalendarId}
                disabled={saveLocalOnly}
              />
            )}

            {/* Local Save Only */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={saveLocalOnly}
                  onChange={(e) => {
                    setSaveLocalOnly(e.target.checked);
                    if (e.target.checked) {
                      setSelectedCalendarId(null);
                    }
                  }}
                  className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
                />
                <span className="text-sm text-text-primary">Save locally only</span>
              </label>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading || !title}
                className="flex-1 py-2 px-4 bg-button-create hover:bg-button-create/90 disabled:bg-button-create/50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
              >
                {loading ? 'Creating...' : 'Create Event'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 bg-background-primary hover:bg-background-primary/80 text-text-primary font-medium rounded-xl border border-gray-600/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
