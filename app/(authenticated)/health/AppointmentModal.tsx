import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { DateDisplay } from '@/components/ui/date-display';
import { TimeInput } from '@/components/ui/time-input';
import { CalendarSelector, type GoogleCalendar as CalendarOption } from '@/components/calendar/CalendarSelector';
import { RecentContactsAutocomplete } from '@/components/ui/recent-contacts-autocomplete';
import { createClient } from '@/lib/supabase/client';
import ApiClient from '@/lib/api/api-client';
import type { AppointmentFormState, AppointmentSavePayload, ReminderOption } from './types';

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  address?: string;
  phone?: string;
}

interface FamilyMember {
  id: string;
  name: string;
}

export function AppointmentModal({ 
  doctors, 
  familyMembers,
  onClose, 
  onSave 
}: { 
  doctors: Doctor[];
  familyMembers: FamilyMember[];
  onClose: () => void; 
  onSave: (appointment: AppointmentSavePayload) => void;
}) {
  const supabase = createClient();
  const [googleCalendars, setGoogleCalendars] = useState<CalendarOption[]>([]);
  const [formData, setFormData] = useState<AppointmentFormState>({
    title: '',
    doctor: '',
    doctor_id: '',
    doctor_phone: '',
    patient_names: [] as string[], // Keep for display purposes
    patient_ids: [] as string[], // Store IDs for API
    appointment_date: '',
    appointment_time: '',
    duration: '60', // minutes
    location: '',
    appointment_type: 'checkup',
    notes: '',
    reminder: '1-day', // 1-day, 1-week, none
    google_calendar_id: '',
    google_sync_enabled: true, // Default to sync with Google Calendar
    additional_attendees: '',
    notify_attendees: true,
  });

  const [loading, setLoading] = useState(false);

  const appointmentTypes = [
    { value: 'checkup', label: 'Checkup' },
    { value: 'follow-up', label: 'Follow-up' },
    { value: 'procedure', label: 'Procedure' },
    { value: 'consultation', label: 'Consultation' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'other', label: 'Other' },
  ];

  const reminderOptions: Array<{ value: ReminderOption; label: string }> = [
    { value: 'none', label: 'No reminder' },
    { value: '1-hour', label: '1 hour before' },
    { value: '1-day', label: '1 day before' },
    { value: '1-week', label: '1 week before' },
  ];

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
            type CalendarRow = {
              google_calendar_id: string | null;
              name: string | null;
              background_color: string | null;
              foreground_color: string | null;
              is_primary: boolean | null;
              can_write?: boolean | null;
            };

            const typedCalendars = (calendars as CalendarRow[]).reduce<CalendarOption[]>((acc, calendar) => {
              if (!calendar.google_calendar_id) return acc;
              acc.push({
                google_calendar_id: calendar.google_calendar_id,
                name: calendar.name ?? 'Google Calendar',
                background_color: calendar.background_color ?? '#6366f1',
                foreground_color: calendar.foreground_color ?? '#ffffff',
                is_primary: Boolean(calendar.is_primary),
                can_write: calendar.can_write ?? true,
              });
              return acc;
            }, []);

            if (typedCalendars.length > 0) {
              setGoogleCalendars(typedCalendars);
              const primaryCalendar = typedCalendars.find(cal => cal.is_primary);
              const defaultCalendar = primaryCalendar ?? typedCalendars[0];
              if (defaultCalendar) {
                setFormData(prev => ({
                  ...prev,
                  google_calendar_id: defaultCalendar.google_calendar_id,
                  google_sync_enabled: true,
                }));
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching Google calendars:', error);
      }
    };

    fetchGoogleCalendars();
  }, []);

  const handleDoctorChange = (doctorId: string) => {
    const selectedDoctor = doctors.find(d => d.id === doctorId);
    if (selectedDoctor) {
      setFormData({
        ...formData,
        doctor_id: doctorId,
        doctor: selectedDoctor.name,
        doctor_phone: selectedDoctor.phone || '',
        location: selectedDoctor.address || '',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Combine date and time
      let appointmentDateTime: Date;
      if (formData.appointment_date && formData.appointment_time) {
        const dateTimeString = `${formData.appointment_date}T${formData.appointment_time}`;
        appointmentDateTime = new Date(dateTimeString);
      } else {
        appointmentDateTime = new Date();
      }
      
      // Calculate end time based on duration
      const endDateTime = new Date(appointmentDateTime.getTime() + parseInt(formData.duration) * 60 * 1000);

      const appointmentData: AppointmentSavePayload = {
        ...formData,
        appointment_date: appointmentDateTime.toISOString(),
        appointment_datetime: appointmentDateTime.toISOString(), // Keep for compatibility
        end_time: endDateTime.toISOString(),
      };

      await onSave(appointmentData);
      
      // Save additional attendees to recent contacts if they exist
      if (formData.additional_attendees) {
        const emails = formData.additional_attendees.split(',').map(email => email.trim()).filter(email => email);
        if (emails.length > 0) {
          ApiClient.post('/api/recent-contacts/add', { emails }).catch(err => console.error('Failed to save recent contacts:', err));
        }
      }
    } catch (error) {
      console.error('Failed to save appointment:', error);
      alert('Failed to save appointment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-text-primary">Add Health Appointment</h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Appointment Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Annual Checkup, Dental Cleaning"
                required
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Doctor/Provider
              </label>
              <select
                value={formData.doctor_id}
                onChange={(e) => handleDoctorChange(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                <option value="">Select a doctor or enter new</option>
                {doctors.map(doctor => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name} - {doctor.specialty}
                  </option>
                ))}
              </select>
              {!formData.doctor_id && (
                <input
                  type="text"
                  value={formData.doctor}
                  onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
                  placeholder="Or enter doctor name"
                  className="w-full mt-2 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Attendees
              </label>
              <div className="flex flex-wrap gap-2">
                {familyMembers
                  .filter(member => !['Colleen Russell', 'Kate McLaren'].includes(member.name))
                  .map(member => {
                    const isSelected = formData.patient_ids.includes(member.id);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setFormData(prev => {
                            const alreadySelected = prev.patient_ids.includes(member.id);
                            if (alreadySelected) {
                              return {
                                ...prev,
                                patient_ids: prev.patient_ids.filter(id => id !== member.id),
                                patient_names: prev.patient_names.filter(name => name !== member.name)
                              };
                            }
                            return {
                              ...prev,
                              patient_ids: [...prev.patient_ids, member.id],
                              patient_names: [...prev.patient_names, member.name]
                            };
                          });
                        }}
                        className={`px-3.5 py-1.5 text-sm rounded-full border transition-colors whitespace-nowrap ${
                          isSelected
                            ? 'bg-[#3b4e76] border-[#3b4e76] text-white'
                            : 'bg-[#2a2a2a] border-gray-600/40 text-text-primary hover:border-[#3b4e76]'
                        }`}
                      >
                        {member.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Date *
                </label>
                <DateDisplay
                  label=""
                  date={formData.appointment_date}
                  onChange={(value) => setFormData({ ...formData, appointment_date: value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Time *
                </label>
                <TimeInput
                  value={formData.appointment_time}
                  onChange={(value) => setFormData({ ...formData, appointment_time: value })}
                  placeholder="Select time"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Duration (minutes)
              </label>
              <input
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                min="15"
                step="15"
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Location
              </label>
              <AddressAutocomplete
                value={formData.location}
                onChange={(value) => setFormData({ ...formData, location: value })}
                placeholder="Doctor's office address"
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Appointment Type
              </label>
              <select
                value={formData.appointment_type}
                onChange={(e) => setFormData({ ...formData, appointment_type: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                {appointmentTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional details, prep instructions, etc."
                rows={3}
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
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, notify_attendees: !prev.notify_attendees }))}
                aria-pressed={!formData.notify_attendees}
                className={`w-full px-4 py-2 rounded-full border transition-colors text-sm ${
                  !formData.notify_attendees
                    ? 'border-[#9b3a3a] bg-[#9b3a3a] text-white'
                    : 'bg-[#2a2a2a] border-gray-600/40 text-text-primary hover:border-[#9b3a3a]'
                }`}
              >
                Don’t send email invite
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Reminder
              </label>
              <select
                value={formData.reminder}
                onChange={(e) => setFormData({ ...formData, reminder: e.target.value as ReminderOption })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                {reminderOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {/* Google Calendar Sync */}
            {googleCalendars.length > 0 && (
              <div className="space-y-2">
                {formData.google_sync_enabled && (
                  <CalendarSelector
                    calendars={googleCalendars}
                    selectedCalendarId={formData.google_calendar_id}
                    onCalendarChange={(calendarId) => setFormData({ ...formData, google_calendar_id: calendarId })}
                    label="Select Calendar"
                  />
                )}
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="save-local-only"
                    checked={!formData.google_sync_enabled}
                    onChange={(e) => setFormData({ ...formData, google_sync_enabled: !e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="save-local-only" className="text-sm font-medium text-text-primary">
                    Save locally only (don&apos;t sync to Google)
                  </label>
                </div>

              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 bg-background-primary hover:bg-background-primary/80 text-text-primary font-medium rounded-md border border-gray-600/30 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.title || formData.patient_names.length === 0 || !formData.appointment_date || !formData.appointment_time}
                className="flex-1 py-2 px-4 bg-button-create hover:bg-button-create/90 disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
              >
                {loading ? 'Saving...' : 'Save Appointment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
