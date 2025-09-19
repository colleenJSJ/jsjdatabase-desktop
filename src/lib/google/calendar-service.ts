import { google } from 'googleapis';
import { CalendarEvent } from '../supabase/types';
import { filterAttendeesForGoogleSync } from '@/lib/utils/google-sync-helpers';

export interface GoogleCalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  recurrence?: string[];
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
      label?: string;
    }>;
  };
}

export class GoogleCalendarService {
  private calendar: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor(credentials: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    auth.setCredentials(credentials);
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  /**
   * Convert our CalendarEvent to Google Calendar API format
   * @param event - The calendar event to convert
   * @param googleAttendeeEmails - Pre-filtered email addresses of attendees who should receive Google invites
   */
  private convertToGoogleEvent(event: CalendarEvent, googleAttendeeEmails?: string[]): GoogleCalendarEvent {
    const googleEvent: GoogleCalendarEvent = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {},
      end: {},
    };

    // Resolve timezone (allow metadata override)
    const tz = (event as any)?.metadata?.timezone || (event as any)?.timezone || 'America/New_York';

    // Handle all-day events
    if (event.all_day) {
      const startDate = new Date(event.start_time);
      const endDate = new Date(event.end_time);
      
      googleEvent.start.date = startDate.toISOString().split('T')[0];
      googleEvent.end.date = new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else {
      const startTime = new Date(event.start_time);
      let endTime = event.end_time ? new Date(event.end_time) : new Date(startTime.getTime() + 60000);
      
      // Handle point-in-time events (where end_time === start_time)
      // Google Calendar requires end time to be after start time
      if (endTime <= startTime) {
        // Add 1 minute to ensure valid event
        endTime = new Date(startTime.getTime() + 60000); // 60000ms = 1 minute
      }
      
      // Keep datetime strings as local time (no conversion) and specify timezone
      // This prevents double timezone conversion issues
      googleEvent.start.dateTime = event.start_time.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
      googleEvent.end.dateTime = (endTime.getTime() === startTime.getTime() + 60000) 
        ? event.start_time.replace(/(Z|[+-]\d{2}:?\d{2})$/, '') // For point-in-time events
        : event.end_time.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
      googleEvent.start.timeZone = tz;
      googleEvent.end.timeZone = tz;
    }

    // Add reminders
    if (event.reminder_minutes) {
      googleEvent.reminders = {
        useDefault: false,
        overrides: [{
          method: 'popup',
          minutes: event.reminder_minutes
        }]
      };
    }

    // Add conference data for virtual meetings
    if (event.is_virtual && event.zoom_link) {
      googleEvent.conferenceData = {
        entryPoints: [{
          entryPointType: 'video',
          uri: event.zoom_link,
          label: 'Join Video Call'
        }]
      };
    }

    // Handle recurring events
    if (event.recurring_pattern) {
      const rrule = this.convertToRRule(event.recurring_pattern, event.start_time);
      if (rrule) {
        googleEvent.recurrence = [rrule];
      }
    }

    // Add attendees (only those with emails who should get Google invites)
    if (googleAttendeeEmails && googleAttendeeEmails.length > 0) {
      googleEvent.attendees = googleAttendeeEmails.map(email => ({
        email,
        responseStatus: 'needsAction'
      }));
    }

    return googleEvent;
  }

  /**
   * Convert recurring pattern to RRULE format
   */
  private convertToRRule(pattern: string, startTime: string): string | null {
    const startDate = new Date(startTime);
    
    switch (pattern) {
      case 'daily':
        return 'RRULE:FREQ=DAILY';
      case 'weekly':
        return 'RRULE:FREQ=WEEKLY';
      case 'monthly':
        return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${startDate.getDate()}`;
      case 'yearly':
        return `RRULE:FREQ=YEARLY;BYMONTH=${startDate.getMonth() + 1};BYMONTHDAY=${startDate.getDate()}`;
      default:
        return null;
    }
  }

  /**
   * Create an event in Google Calendar
   */
  async createEvent(event: CalendarEvent, calendarId: string = 'primary'): Promise<{ id: string }> {
    // Filter attendees to only include those who should get Google invites
    let googleAttendeeEmails: string[] = [];
    if (event.attendees && event.attendees.length > 0) {
      const { googleAttendees } = await filterAttendeesForGoogleSync(event.attendees);
      googleAttendeeEmails = googleAttendees;
      console.log(`Creating Google event with ${googleAttendeeEmails.length} email invites out of ${event.attendees.length} total attendees`);
    }
    
    const googleEvent = this.convertToGoogleEvent(event, googleAttendeeEmails);
    
    const response = await this.calendar.events.insert({
      calendarId,
      requestBody: googleEvent,
      conferenceDataVersion: event.is_virtual ? 1 : 0,
      sendNotifications: googleAttendeeEmails.length > 0 // Send email invites if there are attendees
    });

    return { id: response.data.id };
  }

  /**
   * Update an event in Google Calendar
   */
  async updateEvent(eventId: string, event: CalendarEvent, calendarId: string = 'primary'): Promise<void> {
    // Filter attendees to only include those who should get Google invites
    let googleAttendeeEmails: string[] = [];
    if (event.attendees && event.attendees.length > 0) {
      const { googleAttendees } = await filterAttendeesForGoogleSync(event.attendees);
      googleAttendeeEmails = googleAttendees;
      console.log(`Updating Google event with ${googleAttendeeEmails.length} email invites out of ${event.attendees.length} total attendees`);
    }
    
    const googleEvent = this.convertToGoogleEvent(event, googleAttendeeEmails);
    
    await this.calendar.events.update({
      calendarId,
      eventId,
      requestBody: googleEvent,
      conferenceDataVersion: event.is_virtual ? 1 : 0,
      sendUpdates: googleAttendeeEmails.length > 0 ? 'all' : 'none' // Send updates if there are attendees
    });
  }

  /**
   * Delete an event from Google Calendar
   */
  async deleteEvent(eventId: string, calendarId: string = 'primary'): Promise<void> {
    await this.calendar.events.delete({
      calendarId,
      eventId
    });
  }

  /**
   * Get user's Google Calendar list
   */
  async getCalendarList(): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const response = await this.calendar.calendarList.list();
    return response.data.items || [];
  }
}
