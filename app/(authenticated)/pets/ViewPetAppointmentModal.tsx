"use client";

import { PawPrint, CalendarDays, Clock, MapPin, Activity, Mail, X } from 'lucide-react';

interface PetSummary {
  id: string;
  name: string;
}

interface PetAppointmentDetail {
  id: string;
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  petIds?: string[];
  pets?: string[];
  pet_id?: string;
  appointment_type?: string;
  vet_name?: string | null;
  vet_phone?: string | null;
  additional_attendees?: string[];
  notify_attendees?: boolean;
  google_calendar_id?: string | null;
  google_sync_enabled?: boolean;
}

interface ViewPetAppointmentModalProps {
  appointment: PetAppointmentDetail;
  pets: PetSummary[];
  onClose: () => void;
  googleCalendars?: Array<{ google_calendar_id?: string; id?: string; name?: string }>;
}

export function ViewPetAppointmentModal({ appointment, pets, onClose, googleCalendars = [] }: ViewPetAppointmentModalProps) {
  if (!appointment) return null;

  const petIdList = Array.from(
    new Set([
      ...(Array.isArray(appointment.petIds) ? appointment.petIds : []),
      ...(Array.isArray(appointment.pets) ? appointment.pets : []),
      appointment.pet_id || undefined,
    ].filter(Boolean) as string[])
  );

  const petNames = petIdList
    .map(id => pets.find(p => p.id === id)?.name)
    .filter(Boolean) as string[];

  const additionalAttendees = Array.isArray(appointment.additional_attendees)
    ? appointment.additional_attendees
    : [];

  const notifyAttendees = appointment.notify_attendees !== false;
  const calendarId = appointment.google_calendar_id
    || (appointment as any).calendar_event?.google_calendar_id
    || (appointment as any).metadata?.google_calendar_id
    || null;
  const calendarName = calendarId
    ? (() => {
        const match = googleCalendars.find(cal => (cal.google_calendar_id || cal.id) === calendarId);
        return match?.name || 'Google Calendar';
      })()
    : null;

  const formatDateTime = (input?: string) => {
    if (!input) return null;
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const startDisplay = formatDateTime(appointment.start_time);
  const endDisplay = formatDateTime(appointment.end_time);

  const durationLabel = (() => {
    if (!appointment.start_time || !appointment.end_time) return null;
    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);
    const diffMins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    if (!Number.isFinite(diffMins) || diffMins <= 0) return null;
    if (diffMins < 60) return `${diffMins} minutes`;
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    if (minutes === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours}h ${minutes}m`;
  })();

  const appointmentType = appointment.appointment_type ? appointment.appointment_type.replace(/_/g, ' ') : 'Appointment';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-background-secondary rounded-2xl w-full max-w-2xl border border-gray-600/30 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-600/30 bg-background-secondary">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-pink-500/10 text-pink-300 p-3">
              <PawPrint className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">{appointment.title || 'Pet Appointment'}</h2>
              {startDisplay && (
                <p className="text-sm text-text-muted">Scheduled {startDisplay}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-text-muted hover:text-text-primary hover:bg-gray-700/30 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Appointment Type</p>
                <p className="text-text-primary mt-1 capitalize">{appointmentType}</p>
              </div>
              {durationLabel && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-muted">Duration</p>
                  <p className="text-text-primary mt-1">{durationLabel}</p>
                </div>
              )}
              {petNames.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Pets</p>
                  <p className="text-text-primary mt-1">{petNames.join(', ')}</p>
                </div>
              )}
            </div>

            {appointment.location && (
              <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3 flex items-start gap-3">
                <MapPin className="h-5 w-5 text-pink-300 mt-0.5" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-muted">Location</p>
                  <p className="text-sm text-text-primary mt-1">{appointment.location}</p>
                </div>
              </div>
            )}
          </div>

          {(startDisplay || endDisplay) && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-pink-300" /> Schedule
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {startDisplay && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                    <p className="text-xs text-text-muted uppercase flex items-center gap-2">
                      <Clock className="h-4 w-4 text-pink-300" /> Starts
                    </p>
                    <p className="text-sm text-text-primary mt-2">{startDisplay}</p>
                  </div>
                )}
                {endDisplay && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                    <p className="text-xs text-text-muted uppercase flex items-center gap-2">
                      <Clock className="h-4 w-4 text-pink-300" /> Ends
                    </p>
                    <p className="text-sm text-text-primary mt-2">{endDisplay}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(appointment.vet_name || appointment.vet_phone) && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-pink-300" /> Vet Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {appointment.vet_name && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                    <p className="text-xs text-text-muted uppercase">Veterinarian</p>
                    <p className="text-sm text-text-primary mt-1">{appointment.vet_name}</p>
                  </div>
                )}
                {appointment.vet_phone && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                    <p className="text-xs text-text-muted uppercase">Phone</p>
                    <p className="text-sm text-text-primary mt-1">{appointment.vet_phone}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-pink-300" /> Sharing & Invites
            </h3>
            <div className="space-y-3">
              <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                <p className="text-xs text-text-muted uppercase">Email Invitations</p>
                <p className="text-sm text-text-primary mt-1">
                  {notifyAttendees && additionalAttendees.length > 0
                    ? `Sends to ${additionalAttendees.join(', ')}`
                    : notifyAttendees
                      ? 'No additional attendees provided'
                      : 'Invites are disabled'}
                </p>
              </div>
              {calendarId ? (
                <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                  <p className="text-xs text-text-muted uppercase">Calendar Sync</p>
                  <p className="text-sm text-text-primary mt-1">{calendarName}</p>
                  <p className="text-xs text-text-muted mt-1 break-all">{calendarId}</p>
                </div>
              ) : (
                <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                  <p className="text-xs text-text-muted uppercase">Calendar Sync</p>
                  <p className="text-sm text-text-muted mt-1">Not synced to Google Calendar</p>
                </div>
              )}
            </div>
          </div>

          {appointment.description && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Notes</h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap">
                {appointment.description}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default ViewPetAppointmentModal;
