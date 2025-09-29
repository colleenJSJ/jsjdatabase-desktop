/**
 * Event adapters for different domain types
 * Each adapter handles the mapping between the unified modal and domain-specific APIs
 */

import { CalendarEventCategory } from '@/lib/supabase/types';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

// Client-safe datetime formatter
export function formatEventDateTime(date: string, time: string, isAllDay: boolean, isEnd: boolean = false): string {
  if (isAllDay) {
    const d = new Date(date);
    if (isEnd) {
      // For all-day events, end is exclusive (next day at 00:00)
      d.setDate(d.getDate() + 1);
      return `${d.toISOString().split('T')[0]}T00:00:00`;
    } else {
      return `${date}T00:00:00`;
    }
  } else {
    return `${date}T${time}:00`;
  }
}

export type EventType = 'general' | 'travel' | 'health' | 'pets' | 'academics';

export interface BaseEventData {
  title: string;
  description?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  location?: string;
  isVirtual?: boolean;
  virtualLink?: string;
  attendees?: string[] | string;
  googleCalendarId?: string | null;
  reminderMinutes?: number;
  category?: CalendarEventCategory;
}

function normalizeAttendeeInput(attendees?: string[] | string): string[] {
  if (!attendees) return [];
  if (Array.isArray(attendees)) {
    return attendees.map(entry => entry.trim()).filter(Boolean);
  }
  return attendees
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

export interface TravelEventData extends BaseEventData {
  airline?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDate?: string;
  departureTime?: string;
  returnDate?: string;
  returnTime?: string;
  confirmationNumber?: string;
  travelers?: string[];  // Array of family_members.id (UUIDs)
  otherTravelers?: string;  // Additional external travelers as comma-separated emails
  vehicleType?: 'flight' | 'train' | 'car_rental' | 'ferry' | 'private_driver' | 'helicopter' | 'other';
  accommodationName?: string;
  accommodationType?: string;
}

export interface HealthEventData extends BaseEventData {
  providerId?: string;
  providerName?: string;
  appointmentType?: string;
  patientIds?: string[];
  parentAttendeeIds?: string[]; // Parent/guardian IDs to notify
  duration?: number;
  notes?: string;
}

export interface PetsEventData extends BaseEventData {
  petIds?: string[];
  appointmentType?: 'checkup' | 'vaccination' | 'grooming' | 'surgery' | 'other';
  vetId?: string;
  vetName?: string;
  ownerAttendeeIds?: string[]; // Pet owner IDs to notify
  notes?: string;
}

export interface AcademicsEventData extends BaseEventData {
  eventType?: 'parent-teacher' | 'school-event' | 'exam' | 'assignment' | 'other';
  studentIds?: string[];
  parentIds?: string[];
  otherParticipants?: string;
  schoolName?: string;
  notes?: string;
}

export interface EventAdapterResult {
  success: boolean;
  domainId?: string;
  calendarEventId?: string;
  error?: string;
  googleSynced?: boolean;
}

export interface EventAdapter<T extends BaseEventData> {
  type: EventType;
  label: string;
  icon?: string;
  validateFields(data: T): { valid: boolean; errors?: string[] };
  mapToApiPayload(data: T): any;
  createEvent(data: T): Promise<EventAdapterResult>;
  rollback?(result: Partial<EventAdapterResult>): Promise<void>;
}

/**
 * General calendar event adapter (default)
 */
export class GeneralEventAdapter implements EventAdapter<BaseEventData> {
  type: EventType = 'general';
  label = 'General Event';
  
  validateFields(data: BaseEventData) {
    const errors: string[] = [];
    if (!data.title?.trim()) errors.push('Title is required');
    if (!data.startDate) errors.push('Start date is required');
    if (!data.endDate) errors.push('End date is required');
    
    return { valid: errors.length === 0, errors };
  }
  
  mapToApiPayload(data: BaseEventData) {
    const startDateTime = formatEventDateTime(data.startDate, data.startTime, data.allDay, false);
    const endDateTime = formatEventDateTime(data.endDate, data.endTime, data.allDay, true);
    
    // Check if we have participant IDs (UUIDs)
    const generalData = data as any;
    const participantIds = generalData.participantIds || [];
    
    // External attendees come in as emails via data.attendees (string[] or comma-separated)
    const externalEmails = normalizeAttendeeInput(data.attendees);
    
    // Compute notify flag: default true unless explicitly false
    const notifyAttendees = (
      (data as any).notifyAttendees !== undefined ? (data as any).notifyAttendees :
      (data as any).notify_attendees !== undefined ? (data as any).notify_attendees :
      (data as any).metadata?.notify_attendees
    );

    return {
      title: data.title,
      description: data.description,
      start_time: startDateTime,
      end_time: endDateTime,
      all_day: data.allDay,
      location: data.location,
      is_virtual: data.isVirtual,
      virtual_link: data.virtualLink,
      // UUIDs for internal attendees
      attendee_ids: participantIds,
      // External emails for invitations (place into metadata for Google push)
      attendees: externalEmails, // keep for compatibility (not used by API for emails)
      google_calendar_id: data.googleCalendarId,
      reminder_minutes: data.reminderMinutes,
      category: data.category || 'other',
      source: 'calendar',
      sync_to_google: !!(data.googleCalendarId),
      metadata: {
        additional_attendees: externalEmails,
        ...(notifyAttendees !== undefined ? { notify_attendees: !!notifyAttendees } : {})
      }
    };
  }
  
  async createEvent(data: BaseEventData): Promise<EventAdapterResult> {
    try {
      const payload: any = this.mapToApiPayload(data);
      const response = await fetch('/api/calendar-events', {
        method: 'POST',
        headers: addCSRFToHeaders({
          'Content-Type': 'application/json',
          'x-request-id': crypto.randomUUID()
        }),
        body: JSON.stringify({ event: payload })
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to create event' };
      }
      
      const result = await response.json();
      return {
        success: true,
        calendarEventId: result.event?.id,
        domainId: result.event?.id
      };
    } catch (error) {
      console.error('Error creating general event:', error);
      return { success: false, error: 'Failed to create event' };
    }
  }
}

/**
 * Travel event adapter
 */
export class TravelEventAdapter implements EventAdapter<TravelEventData> {
  type: EventType = 'travel';
  label = 'Travel';
  
  validateFields(data: TravelEventData) {
    const errors: string[] = [];
    if (!data.title?.trim()) errors.push('Title is required');
    // Use specialized leg fields; return is optional
    if (!data.departureDate) errors.push('Departure date is required');
    if (!data.departureTime) errors.push('Departure time is required');
    
    // Travel-specific validation
    if (data.vehicleType === 'flight') {
      if (!data.airline) errors.push('Airline is required for flights');
      if (!data.flightNumber) errors.push('Flight number is required');
      if (!data.departureAirport) errors.push('Departure airport is required');
      if (!data.arrivalAirport) errors.push('Arrival airport is required');
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  mapToApiPayload(data: TravelEventData) {
    // Build outbound leg payload using specific fields
    const startDateTime = `${data.departureDate}T${(data.departureTime || '00:00')}:00`;
    const endDateTime = data.returnDate && data.returnTime ? `${data.returnDate}T${data.returnTime}:00` : undefined as unknown as string;
    
    // Parse external travelers from otherTravelers string (should be emails)
    const externalEmails: string[] = [];
    if (data.otherTravelers) {
      const emails = data.otherTravelers
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);
      externalEmails.push(...emails);
    }
    
    // Add any additional external attendees from base data
    const baseAttendees = normalizeAttendeeInput(data.attendees);
    if (baseAttendees.length > 0) {
      externalEmails.push(...baseAttendees);
    }
    
    return {
      title: data.title,
      description: data.description,
      type: data.vehicleType || 'other',  // Changed from travel_type to type
      departure_time: startDateTime,
      // For one-way we omit arrival_time; API tolerates missing end for calendar
      arrival_time: endDateTime,
      airline: data.airline,
      flight_number: data.flightNumber,
      departure_airport: data.departureAirport,
      arrival_airport: data.arrivalAirport,
      confirmation_number: data.confirmationNumber,
      // UUIDs for internal travelers
      attendee_ids: data.travelers || [],  // Array of family_members.id (UUIDs)
      travelers: data.travelers || [],     // Keep for backward compatibility
      // External emails for invitations
      attendees: externalEmails,           // External email addresses only
      additional_attendees: externalEmails, // Also store in metadata for travel-details
      // Other fields
      accommodation_name: data.accommodationName,
      accommodation_type: data.accommodationType,
      location: data.location,
      notes: data.description,
      // Calendar sync
      google_sync_enabled: !!data.googleCalendarId,
      google_calendar_id: data.googleCalendarId,
      send_invites: (data as any).send_invites === true,
      notify_attendees: (data as any).notify_attendees
    };
  }
  
  async createEvent(data: TravelEventData): Promise<EventAdapterResult> {
    try {
      const payload = this.mapToApiPayload(data);
      // Attach airport timezones
      const { getTimezoneForAirport } = await import('@/lib/utils/airport-timezones');
      (payload as any).departure_timezone = getTimezoneForAirport(payload.departure_airport || '');
      (payload as any).arrival_timezone = getTimezoneForAirport(payload.arrival_airport || '');
      const response = await fetch('/api/travel-details', {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to create travel event' };
      }
      
      const result = await response.json();
      const firstId = result.detail?.id || result.travelDetail?.id || result.travelDetailId;
      const firstCal = result.calendarEventId || result.calendarEvent?.id;
      
      // Optional return leg
      if (data.returnDate && data.returnTime) {
        const inbound = {
          ...payload,
          departure_airport: payload.arrival_airport,
          arrival_airport: payload.departure_airport,
          departure_time: `${data.returnDate}T${data.returnTime}:00`,
        } as any;
        inbound.departure_timezone = getTimezoneForAirport(inbound.departure_airport || '');
        inbound.arrival_timezone = getTimezoneForAirport(inbound.arrival_airport || '');
        await fetch('/api/travel-details', {
          method: 'POST',
          headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(inbound)
        });
      }
      return { success: true, domainId: firstId, calendarEventId: firstCal };
    } catch (error) {
      console.error('Error creating travel event:', error);
      return { success: false, error: 'Failed to create travel event' };
    }
  }
  
  async rollback(result: Partial<EventAdapterResult>) {
    if (result.domainId) {
      try {
        await fetch(`/api/travel-details/${result.domainId}`, {
          method: 'DELETE',
          headers: addCSRFToHeaders(),
        });
      } catch (error) {
        console.error('Error rolling back travel event:', error);
      }
    }
  }
}

/**
 * Pets event adapter
 */
export class PetsEventAdapter implements EventAdapter<PetsEventData> {
  type: EventType = 'pets';
  label = 'Pet Appointment';
  
  validateFields(data: PetsEventData) {
    const errors: string[] = [];
    if (!data.title?.trim()) errors.push('Title is required');
    if (!data.startDate) errors.push('Start date is required');
    if (!data.petIds || data.petIds.length === 0) errors.push('Please select at least one pet');
    
    return { valid: errors.length === 0, errors };
  }
  
  mapToApiPayload(data: PetsEventData) {
    const startDateTime = formatEventDateTime(data.startDate, data.startTime, data.allDay, false);
    const endDateTime = formatEventDateTime(data.endDate, data.endTime, data.allDay, true);
    
    return {
      pet_ids: data.petIds,
      appointment_type: data.appointmentType || 'checkup',
      vet_id: data.vetId,
      vet_name: data.vetName,
      title: data.title,
      description: data.notes || data.description,
      appointment_date: startDateTime,
      end_time: endDateTime,
      location: data.location,
      attendee_ids: (data as any).parentAttendeeIds || [],
      // Calendar sync
      sync_to_calendar: true,
      google_calendar_id: data.googleCalendarId,
      send_invites: (data as any).send_invites === true,
      additional_attendees_emails: normalizeAttendeeInput(data.attendees),
      notify_attendees: (data as any).notify_attendees
    };
  }
  
  async createEvent(data: PetsEventData): Promise<EventAdapterResult> {
    try {
      const payload = this.mapToApiPayload(data);
      // Use a composite endpoint that creates both task and calendar event
      const response = await fetch('/api/pets/appointments', {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to create pet appointment' };
      }
      
      const result = await response.json();
      return {
        success: true,
        domainId: result.taskId,
        calendarEventId: result.calendarEventId,
        googleSynced: !!result.googleSync?.ok
      };
    } catch (error) {
      console.error('Error creating pet appointment:', error);
      return { success: false, error: 'Failed to create pet appointment' };
    }
  }
}

/**
 * Health event adapter
 */
export class HealthEventAdapter implements EventAdapter<HealthEventData> {
  type: EventType = 'health';
  label = 'Medical Appointment';
  
  validateFields(data: HealthEventData) {
    const errors: string[] = [];
    if (!data.title?.trim()) errors.push('Title is required');
    if (!data.startDate) errors.push('Start date is required');
    if (!data.providerName && !data.providerId) errors.push('Please select a healthcare provider');
    
    return { valid: errors.length === 0, errors };
  }
  
  mapToApiPayload(data: HealthEventData) {
    const startDateTime = formatEventDateTime(data.startDate, data.startTime, data.allDay, false);
    const endDateTime = formatEventDateTime(data.endDate, data.endTime, data.allDay, true);
    
    return {
      provider_id: data.providerId,
      provider_name: data.providerName,
      appointment_type: data.appointmentType || 'checkup',
      patient_ids: data.patientIds || [],
      attendee_ids: data.parentAttendeeIds || [],
      title: data.title,
      description: data.notes || data.description,
      appointment_date: startDateTime,
      end_time: endDateTime,
      duration: data.duration || 60,
      location: data.location,
      is_virtual: data.isVirtual,
      virtual_link: data.virtualLink,
      // Calendar sync
      sync_to_calendar: true,
      google_calendar_id: data.googleCalendarId,
      send_invites: (data as any).send_invites === true,
      additional_attendees_emails: normalizeAttendeeInput(data.attendees),
      notify_attendees: (data as any).notify_attendees
    };
  }
  
  async createEvent(data: HealthEventData): Promise<EventAdapterResult> {
    try {
      const payload = this.mapToApiPayload(data);
      const response = await fetch('/api/health/appointments', {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to create medical appointment' };
      }
      
      const result = await response.json();
      return {
        success: true,
        domainId: result.appointmentId,
        calendarEventId: result.calendarEventId,
        googleSynced: !!result.googleSync?.ok
      };
    } catch (error) {
      console.error('Error creating medical appointment:', error);
      return { success: false, error: 'Failed to create medical appointment' };
    }
  }
}

/**
 * Academics event adapter
 */
export class AcademicsEventAdapter implements EventAdapter<AcademicsEventData> {
  type: EventType = 'academics';
  label = 'School Event';
  
  validateFields(data: AcademicsEventData) {
    const errors: string[] = [];
    if (!data.title?.trim()) errors.push('Title is required');
    if (!data.startDate) errors.push('Start date is required');
    
    return { valid: errors.length === 0, errors };
  }
  
  mapToApiPayload(data: AcademicsEventData) {
    const startDateTime = formatEventDateTime(data.startDate, data.startTime, data.allDay, false);
    const endDateTime = formatEventDateTime(data.endDate, data.endTime, data.allDay, true);
    
    // Parse external attendees from otherParticipants string (should be emails)
    const externalEmails: string[] = [];
    if (data.otherParticipants) {
      const emails = data.otherParticipants
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);
      externalEmails.push(...emails);
    }
    
    // Add any additional external attendees from base data
    const attendeeEmails = normalizeAttendeeInput(data.attendees);
    if (attendeeEmails.length > 0) {
      externalEmails.push(...attendeeEmails);
    }
    
    return {
      // Map to the correct field names expected by the API
      event_title: data.title,  // Changed from 'title' to 'event_title'
      notes: data.notes || data.description, // Changed from 'description' to 'notes'
      event_type: data.eventType || 'Meeting',
      event_date: startDateTime,
      location: data.location || data.schoolName || '',
      // Student attendees (UUIDs)
      attendees: data.studentIds || [], // This is for j3_academics_event_students
      // Parent attendees (UUIDs)
      parent_ids: data.parentIds || [],
      // External email attendees as comma-separated string
      additional_attendees: externalEmails.join(','),
      // Calendar sync
      syncToCalendar: true, // Changed from 'sync_to_calendar' to 'syncToCalendar'
      google_calendar_id: data.googleCalendarId || null,
      google_sync_enabled: true,
      notify_attendees: (data as any).notify_attendees
    };
  }
  
  async createEvent(data: AcademicsEventData): Promise<EventAdapterResult> {
    try {
      const payload = this.mapToApiPayload(data);
      const response = await fetch('/api/academic-events', {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to create academic event' };
      }
      
      const result = await response.json();
      return {
        success: true,
        domainId: result.event?.id,
        calendarEventId: result.calendarEvent?.id
      };
    } catch (error) {
      console.error('Error creating academic event:', error);
      return { success: false, error: 'Failed to create academic event' };
    }
  }
}

/**
 * Factory to get the appropriate adapter
 */
export function getEventAdapter(type: EventType): EventAdapter<any> {
  switch (type) {
    case 'travel':
      return new TravelEventAdapter();
    case 'health':
      return new HealthEventAdapter();
    case 'pets':
      return new PetsEventAdapter();
    case 'academics':
      return new AcademicsEventAdapter();
    case 'general':
    default:
      return new GeneralEventAdapter();
  }
}
