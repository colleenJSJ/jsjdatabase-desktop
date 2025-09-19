'use client';

import { useState, useEffect } from 'react';
import { X, Edit, Trash2, Calendar, Clock, MapPin, User, FileText, AlertCircle, Phone, Users, Plane } from 'lucide-react';
import { usePreferences } from '@/contexts/preferences-context';
import { toInstantFromNaive, formatInstantInTimeZone } from '@/lib/utils/date-utils';
import { Task } from '@/lib/supabase/types';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';

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

interface ViewEditAppointmentModalProps {
  appointment: Task;
  doctors: Doctor[];
  familyMembers: FamilyMember[];
  onClose: () => void;
  onAppointmentUpdated: (appointment: Task) => void;
  onAppointmentDeleted: (appointmentId: string) => void;
  startInEditMode?: boolean;
  googleCalendars?: Array<{ google_calendar_id?: string; id?: string; name?: string }>;
}

export function ViewEditAppointmentModal({
  appointment,
  doctors,
  familyMembers,
  onClose,
  onAppointmentUpdated,
  onAppointmentDeleted,
  startInEditMode = false,
  googleCalendars = [],
}: ViewEditAppointmentModalProps) {
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { preferences } = usePreferences();
  
  // Parse appointment details from the task
  const [appointmentData, setAppointmentData] = useState(() => {
    // Extract doctor info from description or title
    const doctorMatch = appointment.description?.match(/Doctor:\s*([^\n]+)/);
    const doctorName = doctorMatch ? doctorMatch[1] : '';
    const doctor = doctors.find(d => d.name === doctorName || appointment.title?.includes(d.name));
    
    // Extract phone from description
    const phoneMatch = appointment.description?.match(/Phone:\s*([^\n]+)/);
    const doctorPhone = phoneMatch ? phoneMatch[1] : doctor?.phone || '';
    
    // Extract location from description
    const locationMatch = appointment.description?.match(/Location:\s*([^\n]+)/);
    const location = locationMatch ? locationMatch[1] : doctor?.address || '';
    
    // Extract appointment type from description
    const typeMatch = appointment.description?.match(/Type:\s*([^\n]+)/);
    const appointmentType = typeMatch ? typeMatch[1] : 'checkup';
    
    // Extract duration from description
    const durationMatch = appointment.description?.match(/Duration:\s*(\d+)\s*minutes/);
    const duration = durationMatch ? durationMatch[1] : '60';
    
    const appointmentDate = appointment.due_date ? new Date(appointment.due_date) : new Date();
    
    return {
      title: appointment.title || '',
      doctor: doctorName || doctor?.name || '',
      doctor_id: doctor?.id || '',
      doctor_phone: doctorPhone,
      patient_names: appointment.assigned_users?.map(u => u.name) || [appointment.assigned_to || ''],
      appointment_date: appointmentDate.toISOString().split('T')[0],
      appointment_time: appointmentDate.toTimeString().slice(0, 5),
      duration: duration,
      location: location,
      appointment_type: appointmentType,
      notes: appointment.description?.replace(/Doctor:.*?\n/g, '')
        .replace(/Phone:.*?\n/g, '')
        .replace(/Location:.*?\n/g, '')
        .replace(/Type:.*?\n/g, '')
        .replace(/Duration:.*?\n/g, '')
        .trim() || '',
    };
  });

  const appointmentTypes = [
    { value: 'checkup', label: 'Checkup' },
    { value: 'follow-up', label: 'Follow-up' },
    { value: 'procedure', label: 'Procedure' },
    { value: 'consultation', label: 'Consultation' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'other', label: 'Other' },
  ];

  const handleDoctorChange = (doctorId: string) => {
    const selectedDoctor = doctors.find(d => d.id === doctorId);
    if (selectedDoctor) {
      setAppointmentData({
        ...appointmentData,
        doctor_id: doctorId,
        doctor: selectedDoctor.name,
        doctor_phone: selectedDoctor.phone || '',
        location: selectedDoctor.address || '',
      });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Format date and time properly without timezone conversion
      const startDateTime = `${appointmentData.appointment_date}T${appointmentData.appointment_time}:00`;
      
      // Calculate end time based on duration
      const [year, month, day] = appointmentData.appointment_date.split('-');
      const [hours, minutes] = appointmentData.appointment_time.split(':');
      const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
      endDate.setMinutes(endDate.getMinutes() + parseInt(appointmentData.duration));
      const endDateTime = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`;
      
      // Build description with metadata
      let description = '';
      if (appointmentData.doctor) {
        description += `Doctor: ${appointmentData.doctor}\n`;
      }
      if (appointmentData.doctor_phone) {
        description += `Phone: ${appointmentData.doctor_phone}\n`;
      }
      if (appointmentData.location) {
        description += `Location: ${appointmentData.location}\n`;
      }
      description += `Type: ${appointmentData.appointment_type}\n`;
      description += `Duration: ${appointmentData.duration} minutes\n`;
      if (appointmentData.notes) {
        description += `\n${appointmentData.notes}`;
      }

      // Get patient IDs from names
      const patientIds = appointmentData.patient_names
        .map(name => familyMembers.find(m => m.name === name)?.id)
        .filter(id => id);

      // Check if appointment has a calendar event
      if ((appointment as any).calendar_event_id) {
        // Update via calendar-events API for proper Google sync
        const calendarEventPayload = {
          event: {
            title: appointmentData.title,
            description: description.trim(),
            start_time: startDateTime,
            end_time: endDateTime,
            location: appointmentData.location,
            category: 'medical',
            attendees: patientIds,
            metadata: {
              doctor: appointmentData.doctor,
              appointment_type: appointmentData.appointment_type
            }
          }
        };

        const ApiClient = (await import('@/lib/api/api-client')).default;
        const response = await ApiClient.put(`/api/calendar-events/${(appointment as any).calendar_event_id}`, calendarEventPayload);
        if (!response.success) {
          throw new Error('Failed to update calendar event');
        }
      }

      // Also update the task record
      const updatedTask = {
        title: appointmentData.title,
        description: description.trim(),
        due_date: startDateTime,
        assigned_to: patientIds,
      };

      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.put(`/api/tasks/${appointment.id}`, updatedTask);

      if (response.success) {
        const data: any = response.data;
        onAppointmentUpdated(data?.task || data);
        setIsEditing(false);
        onClose();
      } else {
        console.error('Error updating appointment:', response.error);
        alert('Failed to update appointment');
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('Failed to update appointment');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    
    setDeleting(true);
    try {
      // If appointment has a calendar event, delete via calendar-events API
      const ApiClient = (await import('@/lib/api/api-client')).default;
      if ((appointment as any).calendar_event_id) {
        const calendarResponse = await ApiClient.delete(`/api/calendar-events/${(appointment as any).calendar_event_id}`);
        if (!calendarResponse.success) {
          console.error('Failed to delete calendar event');
        }
      } else {
        // Fallback to direct task deletion
        const response = await ApiClient.delete(`/api/tasks/${appointment.id}`);
        if (!response.success) {
          console.error('Error deleting appointment:', response.error);
          alert('Failed to delete appointment');
          return;
        }
      }

      onAppointmentDeleted(appointment.id);
      onClose();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      alert('Failed to delete appointment');
    } finally {
      setDeleting(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const inst = toInstantFromNaive(dateString, preferences.timezone);
    const dateStr = formatInstantInTimeZone(inst, preferences.timezone, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = formatInstantInTimeZone(inst, preferences.timezone, { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dateStr}${/12:00 AM/.test(timeStr) ? '' : ` ${timeStr}`}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-secondary rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-600/30 sticky top-0 bg-background-secondary flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-500" />
            <h2 className="text-xl font-semibold text-text-primary">
              {isEditing ? 'Edit Appointment' : 'Appointment Details'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-text-muted hover:text-text-primary transition-colors"
                  title="Edit"
                >
                  <Edit className="h-5 w-5" />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="p-2 text-text-muted hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="p-6">

          {isEditing ? (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Appointment Title *
                </label>
                <input
                  type="text"
                  value={appointmentData.title}
                  onChange={(e) => setAppointmentData({ ...appointmentData, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Doctor/Provider
                </label>
                <select
                  value={appointmentData.doctor_id}
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
                {!appointmentData.doctor_id && (
                  <input
                    type="text"
                    value={appointmentData.doctor}
                    onChange={(e) => setAppointmentData({ ...appointmentData, doctor: e.target.value })}
                    placeholder="Or enter doctor name"
                    className="w-full mt-2 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Doctor Phone
                </label>
                <input
                  type="tel"
                  value={appointmentData.doctor_phone}
                  onChange={(e) => setAppointmentData({ ...appointmentData, doctor_phone: e.target.value })}
                  placeholder="Doctor's phone number"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Who is this appointment for? *
                </label>
                <div className="space-y-2">
                  {familyMembers.map(member => (
                    <label key={member.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        value={member.name}
                        checked={appointmentData.patient_names.includes(member.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAppointmentData({ ...appointmentData, patient_names: [...appointmentData.patient_names, member.name] });
                          } else {
                            setAppointmentData({ ...appointmentData, patient_names: appointmentData.patient_names.filter(p => p !== member.name) });
                          }
                        }}
                        className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-text-primary">{member.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={appointmentData.appointment_date}
                    onChange={(e) => setAppointmentData({ ...appointmentData, appointment_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Time *
                  </label>
                  <input
                    type="time"
                    value={appointmentData.appointment_time}
                    onChange={(e) => setAppointmentData({ ...appointmentData, appointment_time: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={appointmentData.duration}
                    onChange={(e) => setAppointmentData({ ...appointmentData, duration: e.target.value })}
                    min="15"
                    step="15"
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Appointment Type
                  </label>
                  <select
                    value={appointmentData.appointment_type}
                    onChange={(e) => setAppointmentData({ ...appointmentData, appointment_type: e.target.value })}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    {appointmentTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Location
                </label>
                <AddressAutocomplete
                  value={appointmentData.location}
                  onChange={(value) => setAppointmentData({ ...appointmentData, location: value })}
                  placeholder="Doctor's office address"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Notes
                </label>
                <textarea
                  value={appointmentData.notes}
                  onChange={(e) => setAppointmentData({ ...appointmentData, notes: e.target.value })}
                  placeholder="Additional details, prep instructions, etc."
                  rows={3}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !appointmentData.title || appointmentData.patient_names.length === 0}
                  className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-700/80 disabled:bg-gray-700/50 disabled:cursor-not-allowed text-text-primary font-medium rounded-md transition-colors"
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
            <div className="space-y-3">
              {(() => {
                const metadata = (appointment as any)?.metadata || {};
                const fallbackTravelerNames = (() => {
                  const raw = Array.isArray(appointment.assigned_to)
                    ? appointment.assigned_to
                    : appointment.assigned_to
                      ? [appointment.assigned_to]
                      : [];
                  return raw
                    .map(id => familyMembers.find(member => member.id === id)?.name)
                    .filter(Boolean) as string[];
                })();
                const travelerList: string[] = (appointment.assigned_users?.map(u => u.name).filter(Boolean) || []).concat(
                  fallbackTravelerNames.filter(name => !(appointment.assigned_users || []).some(user => user.name === name))
                );
                const travelers = Array.from(new Set(travelerList));
                const additionalTravelers: string[] = Array.isArray(metadata.additional_attendees)
                  ? (metadata.additional_attendees as string[])
                  : typeof metadata.additional_attendees === 'string'
                    ? metadata.additional_attendees.split(',').map((x: string) => x.trim()).filter(Boolean)
                    : [];
                const departureAirport = metadata.departure_airport || metadata.departureAirport || metadata.origin_airport;
                const arrivalAirport = metadata.arrival_airport || metadata.arrivalAirport || metadata.destination_airport;
                const normalizeAirportLink = (code: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${code} airport`)}`;

                return (
                  <>
                    {/* Summary */}
                    <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-medical/20 p-2 text-medical">
                            <Calendar className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-text-primary mb-1">{appointment.title}</h3>
                            <p className="text-sm text-text-muted">
                              {appointment.due_date ? formatDateTime(appointment.due_date) : 'Not scheduled'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-text-muted">Type</p>
                          <p className="text-sm text-text-primary capitalize">{appointmentData.appointment_type || 'Appointment'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-text-muted">Duration</p>
                          <p className="text-sm text-text-primary">{appointmentData.duration || '60'} minutes</p>
                        </div>
                      </div>
                      {(appointment as any).google_calendar_id || metadata.google_calendar_id ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                            <p className="text-xs uppercase tracking-wide text-text-muted">Calendar Sync</p>
                            <p className="text-sm text-text-primary mt-1">
                              {(() => {
                                const calendarId = (appointment as any).google_calendar_id || metadata.google_calendar_id;
                                if (!calendarId) return 'Not synced to Google Calendar';
                                const match = googleCalendars.find(cal => (cal.google_calendar_id || cal.id) === calendarId);
                                return match?.name || 'Google Calendar';
                              })()}
                            </p>
                          </div>
                          {(() => {
                            const calendarId = (appointment as any).google_calendar_id || metadata.google_calendar_id;
                            return calendarId ? (
                              <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                                <p className="text-xs uppercase tracking-wide text-text-muted">Calendar ID</p>
                                <p className="text-xs text-text-muted mt-1 break-all">{calendarId}</p>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      ) : (
                        <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                          <p className="text-xs uppercase tracking-wide text-text-muted">Calendar Sync</p>
                          <p className="text-sm text-text-muted mt-1">Not synced to Google Calendar</p>
                        </div>
                      )}
                    </div>

                    {/* Provider Details */}
                    {(appointmentData.doctor || appointmentData.doctor_phone) && (
                      <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                          <User className="h-4 w-4 text-medical" /> Provider
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {appointmentData.doctor && (
                            <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                              <p className="text-xs text-text-muted uppercase">Doctor/Provider</p>
                              <p className="text-sm text-text-primary mt-1">{appointmentData.doctor}</p>
                            </div>
                          )}
                          {appointmentData.doctor_phone && (
                            <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                              <p className="text-xs text-text-muted uppercase">Phone</p>
                              <a
                                href={`tel:${appointmentData.doctor_phone}`}
                                className="text-sm text-primary-400 hover:text-primary-300 transition-colors mt-1 inline-flex items-center gap-1"
                              >
                                <Phone className="h-4 w-4" />
                                {appointmentData.doctor_phone}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Patients */}
                    {(travelers.length > 0 || additionalTravelers.length > 0) && (
                      <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide flex items-center gap-2">
                          <Users className="h-4 w-4 text-medical" /> Patients
                        </h3>
                        {travelers.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {travelers.map(person => (
                              <span key={person} className="px-3 py-1 text-xs rounded-full bg-[#2A2A28] border border-[#3A3A38] text-text-primary">
                                {person}
                              </span>
                            ))}
                          </div>
                        )}
                        {additionalTravelers.length > 0 && (
                          <div>
                            <p className="text-xs text-text-muted uppercase mb-2">Additional Patients</p>
                            <div className="flex flex-wrap gap-2">
                              {additionalTravelers.map(person => (
                                <span key={`extra-${person}`} className="px-3 py-1 text-xs rounded-full bg-[#2A2A28] border border-[#3A3A38] text-text-muted">
                                  {person}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Location & Airports */}
                    {(appointmentData.location || departureAirport || arrivalAirport) && (
                      <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-medical" /> Location
                        </h3>
                        {appointmentData.location && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointmentData.location)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
                          >
                            <MapPin className="h-4 w-4" />
                            {appointmentData.location}
                          </a>
                        )}
                        {(departureAirport || arrivalAirport) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {departureAirport && (
                              <a
                                href={normalizeAirportLink(departureAirport)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3 text-sm text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-2"
                              >
                                <Plane className="h-4 w-4" />
                                Departure: {String(departureAirport).toUpperCase()}
                              </a>
                            )}
                            {arrivalAirport && (
                              <a
                                href={normalizeAirportLink(arrivalAirport)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3 text-sm text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-2"
                              >
                                <Plane className="h-4 w-4 rotate-45" />
                                Arrival: {String(arrivalAirport).toUpperCase()}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {appointmentData.notes && (
                      <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-2 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-medical" /> Notes
                        </h3>
                        <p className="text-sm text-text-primary whitespace-pre-wrap bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                          {appointmentData.notes}
                        </p>
                      </div>
                    )}

                    {appointment.status === 'active' && appointment.due_date && (
                      <div className="flex items-center gap-2 p-3 bg-medical/10 border border-medical/30 rounded-md">
                        <AlertCircle className="h-4 w-4 text-medical" />
                        <span className="text-sm text-medical">
                          Upcoming appointment
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
