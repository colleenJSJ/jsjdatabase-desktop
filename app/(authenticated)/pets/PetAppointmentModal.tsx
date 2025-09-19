'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, PawPrint, Clock, CalendarDays, MapPin, Activity } from 'lucide-react';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { TimeInput } from '@/components/ui/time-input';
import { CalendarSelector, GoogleCalendar } from '@/components/calendar/CalendarSelector';
import { RecentContactsAutocomplete } from '@/components/ui/recent-contacts-autocomplete';
import { createClient } from '@/lib/supabase/client';

interface PetSummary {
  id: string;
  name: string;
}

interface VetContact {
  id: string;
  name?: string;
  clinic_name?: string;
  practice?: string;
  phone?: string;
  address?: string;
}

interface PetAppointmentModalProps {
  pets: PetSummary[];
  vets: VetContact[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const reminderOptions = [
  { value: 'none', label: 'No reminder' },
  { value: '1-hour', label: '1 hour before' },
  { value: '1-day', label: '1 day before' },
  { value: '1-week', label: '1 week before' },
];

const defaultDurationMinutes = 60;

const addMinutes = (naive: string, minutes: number) => {
  if (!naive) return naive;
  const [datePart, timePart = '00:00:00'] = naive.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh, mm, ss);
  dt.setMinutes(dt.getMinutes() + minutes);
  const yy = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const hours = String(dt.getHours()).padStart(2, '0');
  const minutesStr = String(dt.getMinutes()).padStart(2, '0');
  const secondsStr = String(dt.getSeconds()).padStart(2, '0');
  return `${yy}-${month}-${day}T${hours}:${minutesStr}:${secondsStr}`;
};

export default function PetAppointmentModal({ pets, vets, onClose, onSaved }: PetAppointmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);
  const supabase = useMemo(() => createClient(), []);

  const [formData, setFormData] = useState({
    title: '',
    pet_ids: [] as string[],
    appointment_date: '',
    appointment_time: '',
    duration: String(defaultDurationMinutes),
    vet_id: '',
    vet_name: '',
    vet_phone: '',
    location: '',
    notes: '',
    reminder: '1-day',
    google_calendar_id: '',
    google_sync_enabled: true,
    notify_attendees: true,
    additional_attendees: '',
  });

  useEffect(() => {
    const fetchCalendars = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: calendars } = await supabase
          .from('google_calendars')
          .select('*')
          .eq('user_id', user.id)
          .order('is_primary', { ascending: false });
        if (calendars && calendars.length > 0) {
          const typedCalendars = (calendars as Array<Record<string, unknown>>).map((calendar) => ({
            google_calendar_id: String(calendar.google_calendar_id ?? ''),
            name: String(calendar.name ?? calendar.summary ?? 'Calendar'),
            background_color: String(calendar.background_color ?? '#6366f1'),
            foreground_color: String(calendar.foreground_color ?? '#ffffff'),
            is_primary: Boolean(calendar.is_primary),
            can_write: calendar.can_write !== false,
          }));
          setGoogleCalendars(typedCalendars);
          const primary = typedCalendars.find((calendar) => calendar.is_primary) || typedCalendars[0];
          if (primary && primary.google_calendar_id) {
            setFormData(prev => ({
              ...prev,
              google_calendar_id: primary.google_calendar_id,
              google_sync_enabled: true,
            }));
          }
        }
      } catch (error) {
        console.error('[Pets] Failed to load Google calendars', error);
      }
    };
    fetchCalendars();
  }, [supabase]);

  const selectedVet = useMemo(() => vets.find(vet => vet.id === formData.vet_id), [vets, formData.vet_id]);

  useEffect(() => {
    if (selectedVet) {
      setFormData(prev => ({
        ...prev,
        vet_name: selectedVet.name || selectedVet.clinic_name || '',
        vet_phone: selectedVet.phone || '',
        location: selectedVet.address || prev.location,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVet?.id]);

  const togglePet = (petId: string) => {
    setFormData(prev => ({
      ...prev,
      pet_ids: prev.pet_ids.includes(petId)
        ? prev.pet_ids.filter(id => id !== petId)
        : [...prev.pet_ids, petId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.pet_ids.length) {
      alert('Select at least one pet');
      return;
    }
    if (!formData.appointment_date || !formData.appointment_time) {
      alert('Select a date and time');
      return;
    }

    try {
      setLoading(true);
      const startNaive = `${formData.appointment_date}T${formData.appointment_time}:00`;
      const duration = parseInt(formData.duration || `${defaultDurationMinutes}`, 10) || defaultDurationMinutes;
      const endNaive = addMinutes(startNaive, duration);

      const shouldSync = formData.google_sync_enabled && !!formData.google_calendar_id;
      const additionalAttendees = (formData.additional_attendees || '')
        .split(',')
        .map(email => email.trim())
        .filter(email => email && email.includes('@'));
      const shouldSendInvites = additionalAttendees.length > 0 && formData.notify_attendees;

      const payload = {
        pet_ids: formData.pet_ids,
        title: formData.title || `Appointment for ${formData.pet_ids.length > 1 ? 'pets' : 'pet'}`,
        appointment_type: 'appointment',
        appointment_date: startNaive,
        end_time: endNaive,
        vet_id: formData.vet_id || null,
        vet_name: formData.vet_name || selectedVet?.name || null,
        vet_phone: formData.vet_phone || null,
        location: formData.location || null,
        description: formData.notes || null,
        sync_to_calendar: shouldSync,
        google_calendar_id: shouldSync ? formData.google_calendar_id : null,
        reminder: formData.reminder,
        notify_attendees: formData.notify_attendees,
        send_invites: shouldSendInvites,
        additional_attendees: additionalAttendees,
      };

      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.post('/api/pets/appointments', payload);

      if (!response.success) {
        throw new Error(response.error || 'Failed to create appointment');
      }

      if (additionalAttendees.length > 0) {
        ApiClient.post('/api/recent-contacts/add', { emails: additionalAttendees })
          .catch(err => console.error('[Pets] Failed to save recent contacts', err));
      }

      await onSaved();
    } catch (error) {
      console.error('[Pets] Failed to create appointment', error);
      alert(error instanceof Error ? error.message : 'Failed to create appointment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-600/30 bg-background-secondary shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-600/40 px-6 py-4">
          <div className="flex items-center gap-2">
            <PawPrint className="h-5 w-5 text-pink-400" />
            <h2 className="text-lg font-semibold text-text-primary">Add Pet Appointment</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-text-muted transition hover:bg-gray-700/40 hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[80vh] space-y-6 overflow-y-auto px-6 py-6">
          <div className="space-y-5">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                <PawPrint className="h-4 w-4" /> Pets *
              </label>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-600/30 bg-background-primary p-3">
                {pets.map((pet) => (
                  <label key={pet.id} className="flex items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      className="rounded border-gray-600 bg-gray-800 text-primary-400 focus:ring-primary-400"
                      checked={formData.pet_ids.includes(pet.id)}
                      onChange={() => togglePet(pet.id)}
                    />
                    {pet.name}
                  </label>
                ))}
                {pets.length === 0 && <p className="col-span-2 text-xs text-text-muted">No pets available.</p>}
              </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Appointment Title</label>
            <input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Eg. Bella’s annual checkup"
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-text-primary">Date *</label>
              <input
                type="date"
                  value={formData.appointment_date}
                  onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-primary">Time *</label>
                <TimeInput
                  value={formData.appointment_time}
                  onChange={(value) => setFormData({ ...formData, appointment_time: value })}
                  placeholder="Choose time"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-text-primary">Duration (minutes)</label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-primary">Reminder</label>
                <select
                  value={formData.reminder}
                  onChange={(e) => setFormData({ ...formData, reminder: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  {reminderOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Share prep instructions, medications to bring, etc."
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Activity className="h-4 w-4" /> Vet
              </label>
              <select
                value={formData.vet_id}
                onChange={(e) => setFormData({ ...formData, vet_id: e.target.value })}
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                <option value="">Select a vet or enter manually</option>
                {vets.map((vet) => (
                  <option key={vet.id} value={vet.id}>
                    {vet.name || vet.clinic_name}
                  </option>
                ))}
              </select>
              {!formData.vet_id && (
                <input
                  value={formData.vet_name}
                  onChange={(e) => setFormData({ ...formData, vet_name: e.target.value })}
                  placeholder="Vet name"
                  className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              )}
              <input
                value={formData.vet_phone}
                onChange={(e) => setFormData({ ...formData, vet_phone: e.target.value })}
                placeholder="Vet phone"
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <MapPin className="h-4 w-4" /> Location
              </label>
              <AddressAutocomplete
                value={formData.location}
                onChange={(value) => setFormData({ ...formData, location: value })}
                placeholder="Clinic address"
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <CalendarDays className="h-4 w-4" /> Calendar Sync
              </label>
              {googleCalendars.length > 0 && formData.google_sync_enabled && (
                <CalendarSelector
                  calendars={googleCalendars}
                  selectedCalendarId={formData.google_calendar_id}
                  onCalendarChange={(id) => setFormData({ ...formData, google_calendar_id: id })}
                  label="Select Calendar"
                />
              )}
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={!formData.google_sync_enabled}
                  onChange={(e) => setFormData({ ...formData, google_sync_enabled: !e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800 text-primary-400 focus:ring-primary-400"
                />
                Save locally only (don’t sync to Google)
              </label>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Clock className="h-4 w-4" /> Share with others
              </label>
              <RecentContactsAutocomplete
                value={formData.additional_attendees}
                onChange={(value) => setFormData({ ...formData, additional_attendees: Array.isArray(value) ? value.join(', ') : value })}
                placeholder="Email addresses to invite"
                className="w-full rounded-lg border border-gray-600/30 bg-background-primary px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={!formData.notify_attendees}
                  onChange={(e) => setFormData({ ...formData, notify_attendees: !e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800 text-primary-400 focus:ring-primary-400"
                />
                Don’t send email invite
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-600/30 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-600/40 bg-background-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-background-primary/70"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-button-create px-4 py-2 text-sm font-semibold text-white transition hover:bg-button-create/90 disabled:cursor-not-allowed disabled:bg-gray-700"
            >
              {loading ? 'Saving…' : 'Save Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
