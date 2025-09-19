'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Calendar, MapPin, Users, BookOpen } from 'lucide-react';
import { DateDisplay } from '@/components/ui/date-display';
import { TimeInput } from '@/components/ui/time-input';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { CalendarSelector } from '@/components/calendar/CalendarSelector';
import { RecentContactsAutocomplete } from '@/components/ui/recent-contacts-autocomplete';
import { createClient } from '@/lib/supabase/client';
import ApiClient from '@/lib/api/api-client';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  editingEvent?: any;
  children: { id: string; name: string }[];
  selectedChild: string;
}

// Helper function to get first name from full name
const getFirstName = (fullName: string) => {
  return fullName.split(' ')[0];
};

export function EventModal({
  isOpen,
  onClose,
  onSubmit,
  editingEvent,
  children,
  selectedChild
}: EventModalProps) {
  const supabase = createClient();
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
  const kidOptions = useMemo(() => {
    return children.filter((child) => {
      const first = getFirstName(child.name).toLowerCase();
      return first === 'auggie' || first === 'claire' || first === 'blossom';
    });
  }, [children]);
  const kidOptionIds = useMemo(() => new Set(kidOptions.map(child => child.id)), [kidOptions]);
  const [formData, setFormData] = useState({
    event_title: '',
    event_date: '',
    event_time: '',
    location: '',
    description: '',
    attendees: [] as string[],
    google_calendar_id: '' as string,
    google_sync_enabled: true, // Default to sync with Google Calendar
    additional_attendees: '',
    notify_attendees: true
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Google calendars on mount
  useEffect(() => {
    const fetchGoogleCalendars = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: calendars } = await supabase
            .from('google_calendars')
            .select('*')
            .eq('user_id', user.id)
            .order('is_primary', { ascending: false });
          
          if (calendars && calendars.length > 0) {
            setGoogleCalendars(calendars);
            // Auto-select J3 calendar first, then primary, then first available if this is a new event
            if (!editingEvent) {
              const j3Calendar = calendars.find((cal: any) => 
                cal.name?.toLowerCase().includes('j3') || 
                cal.name?.toLowerCase().includes('academics') ||
                cal.name?.toLowerCase().includes('school')
              );
              const primaryCalendar = calendars.find((cal: any) => cal.is_primary);
              const defaultCalendar = j3Calendar || primaryCalendar || calendars[0];
              if (defaultCalendar) {
                setFormData(prev => ({ 
                  ...prev, 
                  google_calendar_id: defaultCalendar.google_calendar_id,
                  google_sync_enabled: true 
                }));
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching Google calendars:', error);
      }
    };

    if (isOpen) {
      fetchGoogleCalendars();
    }
  }, [isOpen, editingEvent]);
      

  useEffect(() => {
    if (editingEvent) {
      let eventDate = '';
      let eventTime = '';
      
      if (editingEvent.event_date) {
        const dateObj = new Date(editingEvent.event_date);
        eventDate = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
        eventTime = dateObj.toISOString().slice(11, 16); // HH:mm
      }
      
      setFormData({
        event_title: editingEvent.event_title || '',
        event_date: eventDate,
        event_time: eventTime,
        location: editingEvent.location || '',
        description: editingEvent.description || '',
        attendees: (editingEvent.attendees || []).filter((id: string) => kidOptionIds.has(id)),
        google_calendar_id: editingEvent.google_calendar_id || '',
        google_sync_enabled: editingEvent.google_sync_enabled || false,
        additional_attendees: '',
        notify_attendees: false
      });
    } else {
      // Set default values for new event
      const defaultAttendees = selectedChild !== 'all' && kidOptionIds.has(selectedChild) ? [selectedChild] : [];
      setFormData({
        event_title: '',
        event_date: '',
        event_time: '',
        location: '',
        description: '',
        attendees: defaultAttendees,
        google_calendar_id: '',
        google_sync_enabled: true, // Default to sync with Google
        additional_attendees: '',
        notify_attendees: true
      });
    }
  }, [editingEvent, selectedChild, googleCalendars.length, kidOptionIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (formData.attendees.length === 0) {
        alert('Select at least one child to attend the event');
        return;
      }

      const additionalEmails = formData.additional_attendees
        ? formData.additional_attendees.split(',').map(email => email.trim()).filter(email => email)
        : [];

      // Combine date and time
      let eventDateTime = '';
      if (formData.event_date && formData.event_time) {
        eventDateTime = `${formData.event_date}T${formData.event_time}`;
      }
      
      // Always sync J3 Academics events to calendar
      await onSubmit({ 
        ...formData, 
        event_date: eventDateTime, // Keep as event_date for compatibility
        syncToCalendar: true,
        send_invites: formData.notify_attendees && additionalEmails.length > 0,
        additional_attendees_emails: additionalEmails
      });
      
      // Save additional attendees to recent contacts if they exist
      if (additionalEmails.length > 0) {
        ApiClient.post('/api/recent-contacts/add', { emails: additionalEmails })
          .catch(err => console.error('Failed to save recent contacts:', err));
      }
      
      onClose();
    } catch (error) {
      console.error('Error submitting event:', error);
      alert('Failed to save event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttendeeChange = (childId: string, checked: boolean) => {
    if (checked) {
      setFormData({ ...formData, attendees: [...formData.attendees, childId] });
    } else {
      setFormData({ 
        ...formData, 
        attendees: formData.attendees.filter(id => id !== childId) 
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {editingEvent ? 'Edit Academic Event' : 'Add Academic Event'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Event Title *
              </label>
              <input
                type="text"
                value={formData.event_title}
                onChange={(e) => setFormData({ ...formData, event_title: e.target.value })}
                required
                placeholder="e.g., Parent-Teacher Conference"
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            {/* Event Type removed per request */}

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Date *
                </label>
                <DateDisplay
                  label=""
                  date={formData.event_date}
                  onChange={(value) => setFormData({ ...formData, event_date: value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Time *
                </label>
                <TimeInput
                  value={formData.event_time}
                  onChange={(value) => setFormData({ ...formData, event_time: value })}
                  placeholder="Select time"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Location
              </label>
              <AddressAutocomplete
                value={formData.location}
                onChange={(value) => setFormData({ ...formData, location: value })}
                placeholder="e.g., School Auditorium, Room 201"
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Kids *
              </label>
              <div className="space-y-2">
                {kidOptions.map((child) => (
                    <label key={child.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        value={child.id}
                        checked={formData.attendees.includes(child.id)}
                        onChange={(e) => handleAttendeeChange(child.id, e.target.checked)}
                        className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-text-primary">{getFirstName(child.name)}</span>
                    </label>
                  ))}
                {kidOptions.length === 0 && (
                  <p className="text-xs text-text-muted">No kids available — please add them first.</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Notes
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Additional details about the event..."
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            {/* Additional Attendees */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary">
                Additional Attendees
              </label>
              <RecentContactsAutocomplete
                value={formData.additional_attendees}
                onChange={(value) => setFormData({ ...formData, additional_attendees: Array.isArray(value) ? value.join(', ') : value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="academics-no-email"
                  checked={!formData.notify_attendees}
                  onChange={(e) => setFormData({ ...formData, notify_attendees: !e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="academics-no-email" className="text-sm font-medium text-text-primary">
                  Don’t send email invite
                </label>
              </div>
            </div>

            {/* Google Calendar Sync */}
            {googleCalendars.length > 0 && (
              <div className="space-y-2">
                {formData.google_sync_enabled && (() => {
                  // Prefer a calendar with J3/Academics/School in name; fallback to primary; else first
                  const preferred = googleCalendars.find((cal: any) => {
                    const n = (cal.name || '').toLowerCase();
                    return n.includes('j3') || n.includes('academics') || n.includes('school');
                  }) || googleCalendars.find((cal: any) => cal.is_primary) || googleCalendars[0];
                  const effectiveCalendarId = formData.google_calendar_id || preferred?.google_calendar_id || preferred?.id || null;
                  return (
                    <CalendarSelector
                      calendars={googleCalendars}
                      selectedCalendarId={effectiveCalendarId}
                      onCalendarChange={(calendarId) => setFormData({ ...formData, google_calendar_id: calendarId })}
                      label="Select Calendar"
                    />
                  );
                })()}
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="save-local-only-academic"
                    checked={!formData.google_sync_enabled}
                    onChange={(e) => setFormData({ ...formData, google_sync_enabled: !e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="save-local-only-academic" className="text-sm font-medium text-text-primary">
                    Save locally only (don't sync to Google)
                  </label>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={isSubmitting || !formData.event_title || !formData.event_date || !formData.event_time || formData.attendees.length === 0}
                className="flex-1 py-2 px-4 bg-button-create hover:bg-button-create/90 disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 bg-background-primary hover:bg-background-primary/80 text-text-primary font-medium rounded-md border border-gray-600/30 transition-colors"
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
