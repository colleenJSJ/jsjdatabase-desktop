'use client';

import { useState, useEffect } from 'react';
import { X, Edit, Trash2, Lock } from 'lucide-react';
import { CalendarEvent, CalendarEventCategory, User } from '@/lib/supabase/types';
import { Category, CategoriesClient } from '@/lib/categories/categories-client';
import { formatInTimeZone, parseDateFlexible } from '@/lib/utils/date-utils';
import { usePreferences } from '@/contexts/preferences-context';
import { CalendarSelector } from './CalendarSelector';
import { RecentContactsAutocomplete } from '@/components/ui/recent-contacts-autocomplete';
import { DateDisplay } from '@/components/ui/date-display';
import { TimeInput } from '@/components/ui/time-input';
import { LinkifiedText } from '@/components/ui/LinkifiedText';
import { normalizeRichText } from '@/lib/utils/text';

interface ViewEditEventModalProps {
  event: CalendarEvent;
  categories: Category[];
  onClose: () => void;
  onEventUpdated: (event: CalendarEvent) => void;
  onEventsChange: () => void;
}

export function ViewEditEventModal({
  event,
  categories,
  onClose,
  onEventUpdated,
  onEventsChange,
}: ViewEditEventModalProps) {
  const { preferences } = usePreferences();
  const metadataTimezone = typeof event?.metadata?.timezone === 'string'
    ? event.metadata.timezone
    : typeof (event?.metadata as any)?.departure_timezone === 'string'
      ? (event.metadata as any).departure_timezone
      : undefined;

  const eventTimezone = event?.timezone || metadataTimezone || preferences.timezone || 'UTC';
  // Initialize all hooks first (React rules of hooks - must be called in same order every render)
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [category, setCategory] = useState<CalendarEventCategory>(event?.category || 'other');
  const [startDate, setStartDate] = useState(() => {
    if (!event?.start_time) return '';
    const d = parseDateFlexible(event.start_time);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [startTime, setStartTime] = useState(() => {
    if (!event?.start_time || event?.all_day) return '12:00';
    return formatInTimeZone(
      event.start_time,
      eventTimezone,
      { hour: '2-digit', minute: '2-digit', hour12: false }
    );
  });
  const [endDate, setEndDate] = useState(() => {
    if (!event?.end_time) return '';
    const d = parseDateFlexible(event.end_time);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [endTime, setEndTime] = useState(() => {
    if (!event?.end_time || event?.all_day) return '13:00';
    return formatInTimeZone(
      event.end_time,
      eventTimezone,
      { hour: '2-digit', minute: '2-digit', hour12: false }
    );
  });
  const [allDay, setAllDay] = useState(event?.all_day || false);
  const [showTimeInputs, setShowTimeInputs] = useState(!event?.all_day);
  const [location, setLocation] = useState(event?.location || '');
  const [isVirtual, setIsVirtual] = useState(event?.is_virtual || false);
  // Prefer meeting_link (DB) then zoom_link (legacy) then metadata.zoom.join_url
  const initialJoinLink = (event as any)?.meeting_link || (event as any)?.zoom_link || '';
  const [zoomLink, setZoomLink] = useState(initialJoinLink);
  const [attendees, setAttendees] = useState<string[]>(event?.attendees || []);
  const [additionalAttendees, setAdditionalAttendees] = useState<string>('');
  const [reminderMinutes, setReminderMinutes] = useState(event?.reminder_minutes || 15);
  const [recurringPattern, setRecurringPattern] = useState(
    (event as any)?.recurrence_pattern?.pattern || (event as any)?.recurring_pattern || 'none'
  );
  const [saveLocalOnly, setSaveLocalOnly] = useState(event?.google_sync_enabled === false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dynamicCategories, setDynamicCategories] = useState<Category[]>([]);
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(event?.google_calendar_id || null);

  useEffect(() => {
    fetchUsers();
    fetchCategories();
    fetchCalendars();
  }, []);

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

  // Add debugging and null check after hooks
  console.log('[ViewEditEventModal] Received event:', event);
  
  if (!event) {
    console.error('[ViewEditEventModal] No event provided!');
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-background-secondary rounded-xl max-w-2xl w-full p-6 border border-gray-600/30">
          <p className="text-red-500">Error: No event data available</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-700 rounded">Close</button>
        </div>
      </div>
    );
  }

  const fetchCategories = async () => {
    try {
      const cats = await CategoriesClient.getCategories('calendar');
      setDynamicCategories(cats);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/auth/users', {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchCalendars = async () => {
    try {
      const response = await fetch('/api/calendars');
      if (response.ok) {
        const data = await response.json();
        setGoogleCalendars(data.calendars || []);
      }
    } catch (error) {
      console.error('Error fetching calendars:', error);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    console.log('[ViewEditEventModal] Updating event with additional attendees:', additionalAttendees);

    try {
      // Parse additional attendees with proper email validation
      const additionalAttendeesList = additionalAttendees 
        ? additionalAttendees.split(',').map(email => email.trim()).filter(email => email && email.includes('@'))
        : [];
      
      console.log('[ViewEditEventModal] Parsed additional attendees list:', additionalAttendeesList);
      
      // Validate event before submitting
      if (!title.trim()) {
        alert('Title is required');
        setLoading(false);
        return;
      }
      
      if (!allDay) {
        if (!startTime) {
          alert('Start time is required for timed events');
          setLoading(false);
          return;
        }
        
        if (category === 'travel' && !endTime) {
          alert('Travel events require an end time');
          setLoading(false);
          return;
        }
      }
      
      // Calculate times
      // Store wall-clock local times (no timezone) for timed events
      const startDateTime = allDay 
        ? `${startDate}T00:00:00`
        : `${startDate}T${startTime}:00`;
      
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
      
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
      const updatePayload = {
        event: {
          title,
          description,
          category,
          start_time: startDateTime,
          end_time: endDateTime,
          all_day: allDay,
          location,
          is_virtual: isVirtual,
          // Persist meeting link
          meeting_link: isVirtual ? zoomLink : null,
          attendees,
          reminder_minutes: reminderMinutes,
          recurrence_pattern: recurringPattern !== 'none' ? { pattern: recurringPattern } : null,
          is_recurring: recurringPattern !== 'none',
          // Store additional attendees in metadata - always include array
          metadata: {
            additional_attendees: additionalAttendeesList,
            timezone: (event as any)?.metadata?.timezone || browserTz
          },
          // Color determined by Google Calendar
          google_sync_enabled: !saveLocalOnly,
          google_calendar_id: !saveLocalOnly ? selectedCalendarId : null
        }
      };
      
      console.log('[ViewEditEventModal] Sending update payload:', JSON.stringify(updatePayload, null, 2));
      
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.put(`/api/calendar-events/${event.id}`, updatePayload);

      if (response.success) {
        const data: any = response.data;
        onEventUpdated(data?.event || data);
        setIsEditing(false);
        onClose();
      } else {
        console.error('Error updating event:', response.error);
      }
    } catch (error) {
      console.error('Error updating event:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    
    setDeleting(true);
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.delete(`/api/calendar-events/${event.id}`);

      if (response.success) {
        onClose();
        onEventsChange();
      } else {
        console.error('Error deleting event:', response.error);
      }
    } catch (error) {
      console.error('Error deleting event:', error);
    } finally {
      setDeleting(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = parseDateFlexible(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-primary">
              {isEditing ? 'Edit Event' : 'View Event'}
            </h2>
            <div className="flex items-center gap-2">
              {!isEditing && (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-2 hover:bg-gray-700 rounded-md transition-colors"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4 text-text-primary" />
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="p-2 hover:bg-red-900/20 rounded-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-700 rounded-md transition-colors"
              >
                <X className="h-4 w-4 text-text-primary" />
              </button>
            </div>
          </div>

          {isEditing ? (
            <form onSubmit={handleUpdate} className="space-y-4">
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
                  rows={3}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              {/* All Day Checkbox */}
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

              {/* Date and Time Section */}
              <div className="space-y-4">
                {/* Start Date/Time Row */}
                <div className="grid grid-cols-2 gap-4">
                  <DateDisplay
                    label="Start Date"
                    date={startDate}
                    onChange={setStartDate}
                    disabled={!isEditing}
                  />
                  {showTimeInputs ? (
                    <TimeInput
                      label="Start Time"
                      value={startTime}
                      onChange={setStartTime}
                      disabled={!isEditing}
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
                    disabled={!isEditing}
                  />
                  {showTimeInputs ? (
                    <TimeInput
                      label={category === 'travel' ? 'End Time *' : 'End Time'}
                      value={endTime}
                      onChange={setEndTime}
                      disabled={!isEditing}
                      required={category === 'travel'}
                      placeholder={category === 'travel' ? 'Required for travel' : 'Optional'}
                    />
                  ) : (
                    <div /> /* Empty space reserved for time input */
                  )}
                </div>
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
                  >
                    {dynamicCategories.length === 0 ? (
                      // Fallback to hardcoded categories if fetch fails
                      Object.entries({
                        medical: 'Health',
                        personal: 'Personal',
                        work: 'Work',
                        family: 'Family',
                        travel: 'Travel',
                        school: 'School',
                        other: 'Other'
                      }).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))
                    ) : (
                      dynamicCategories.map((cat) => (
                        <option key={cat.id} value={cat.name.toLowerCase()}>
                          {cat.name}
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

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Enter location or address"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              {/* Virtual Meeting */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isVirtual}
                    onChange={(e) => setIsVirtual(e.target.checked)}
                    className="w-4 h-4 text-gray-700 bg-background-primary border-gray-600 rounded focus:ring-gray-700 focus:ring-2"
                  />
                  <span className="text-sm text-text-primary">Virtual meeting</span>
                </label>
              </div>

              {isVirtual && (
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Meeting Link
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

              {/* Attendees */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Family Attendees
                </label>
                <div className="space-y-2 max-h-32 overflow-y-auto p-3 bg-background-primary border border-gray-600/30 rounded-md">
                  {users.length === 0 ? (
                    <p className="text-sm text-text-muted">Loading users...</p>
                  ) : (
                    users.map(user => (
                      <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/20 p-1 rounded">
                        <input
                          type="checkbox"
                          value={user.id}
                          checked={attendees.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAttendees([...attendees, user.id]);
                            } else {
                              setAttendees(attendees.filter(id => id !== user.id));
                            }
                          }}
                          className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-text-primary">{user.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Additional Attendees */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Additional Attendees
                </label>
                <RecentContactsAutocomplete
                  value={additionalAttendees}
                  onChange={(v) => setAdditionalAttendees(Array.isArray(v) ? v.join(', ') : v)}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              {/* Recurring Pattern */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Repeat
                </label>
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
                  label="Add to Calendar"
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
                  <span className="text-sm text-text-primary flex items-center gap-1">
                    <Lock className="h-4 w-4" />
                    Save locally only (don&apos;t sync to Google Calendar)
                  </span>
                </label>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !title}
                  className="flex-1 py-2 px-4 bg-button-create hover:bg-button-create/90 disabled:bg-button-create/50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 px-4 bg-background-primary hover:bg-background-primary/80 text-text-primary font-medium rounded-md border border-gray-600/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Event Information Card */}
              <div className="rounded-xl border border-gray-700/40 p-4" style={{ backgroundColor: '#2a2a29' }}>
                <h3 className="text-lg font-semibold text-text-primary mb-4">Event Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <div className="text-text-muted">Event Title</div>
                    <div className="text-text-primary text-base font-medium">{event.title}</div>
                  </div>
                  <div>
                    <div className="text-text-muted">Date & Time</div>
                    <div className="text-text-primary text-base font-medium">
                      {event.all_day ? 'All day' : formatDateTime(event.start_time)}
                    </div>
                  </div>
                  {(event as any).meeting_link && (
                    <div>
                      <div className="text-text-muted">Join</div>
                      <div className="text-text-primary break-all">
                        <a href={(event as any).meeting_link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                          {(event as any).meeting_link}
                        </a>
                      </div>
                    </div>
                  )}
                  {event.location && (
                    <div>
                      <div className="text-text-muted">Location</div>
                      <div className="text-text-primary">{event.location}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-text-muted">Category</div>
                    <div className="text-text-primary capitalize">{event.category}</div>
                  </div>
                </div>
              </div>

              {/* Description Card */}
              {event.description && (
                <div className="rounded-xl border border-gray-700/40 p-4" style={{ backgroundColor: '#2a2a29' }}>
                  <h3 className="text-lg font-semibold text-text-primary mb-3">Description</h3>
                  <LinkifiedText text={normalizeRichDescription(event.description)} />
                </div>
              )}

              {/* Google Calendar status */}
              <div className="rounded-xl border border-gray-700/40 p-4" style={{ backgroundColor: '#2a2a29' }}>
                <h3 className="text-lg font-semibold text-text-primary mb-3">Google Calendar</h3>
                {event.google_calendar_id ? (
                  <span className="text-green-400 text-sm">
                    {(() => {
                      const cal = (googleCalendars || []).find((c: any) =>
                        (c.google_calendar_id || c.id) === event.google_calendar_id
                      );
                      return cal?.name ? `Synced to ${cal.name}` : 'Synced';
                    })()}
                  </span>
                ) : (
                  <span className="text-text-muted text-sm">Not synced</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
  // Normalize rich descriptions copied from Google (HTML with <br>, <p>, etc.)
  const normalizeRichDescription = normalizeRichText;
