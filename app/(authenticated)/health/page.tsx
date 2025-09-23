'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/contexts/user-context';
import { createClient } from '@/lib/supabase/client';
import { 
  Calendar, Pill, FileText, Plus, 
  Clock, Phone, Globe, MapPin, X,
  Eye, EyeOff, Copy, Mail, Lock, KeyRound, Edit2, Trash2, Upload, Stethoscope
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { Task } from '@/lib/supabase/types';
import DocumentUploadModal from '@/components/documents/document-upload-modal';
import { DocumentList } from '@/components/documents/document-list';
import { AppointmentModal } from './AppointmentModal';
import { ViewEditAppointmentModal } from './ViewEditAppointmentModal';
import { normalizeUrl } from '@/lib/utils/url';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { usePreferences } from '@/contexts/preferences-context';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { toInstantFromNaive, formatInstantInTimeZone, getEventTimeZone } from '@/lib/utils/date-utils';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import ApiClient from '@/lib/api/api-client';
import { PasswordCard } from '@/components/passwords/PasswordCard';
import { Category } from '@/lib/categories/categories-client';
import { Password } from '@/lib/services/password-service-interface';
import { getPasswordStrength } from '@/lib/passwords/utils';
import { Modal, ModalBody, ModalCloseButton, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { CredentialFormField } from '@/components/credentials/CredentialFormField';
import { Slider } from '@/components/ui/slider';
import { smartUrlComplete } from '@/lib/utils/url-helper';

const TravelSearchFilter = dynamic(() => import('@/components/travel/TravelSearchFilter').then(m => m.TravelSearchFilter), { ssr: false });

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  prescribing_doctor?: string;
  for_user: string;
  refill_reminder_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  portal_url?: string;
  portal_username?: string;
  portal_password?: string;
  patients: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface FamilyMember {
  id: string;
  name: string;
  email?: string;
  is_child: boolean;
  created_at: string;
}

interface MedicalPortal {
  id: string;
  name: string;
  portal_url?: string;
  doctor_id?: string;
  username?: string;
  password?: string;
  notes?: string;
  patient_ids: string[];
  last_accessed?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  doctor?: {
    id: string;
    name: string;
    specialty: string;
  };
}

// Helper function to get first name from full name
const getFirstName = (fullName: string) => {
  return fullName.split(' ')[0];
};

// Helper function to generate appointment title (similar to travel cards)
const generateAppointmentTitle = (appointment: any) => {
  const appointmentType = appointment.appointment_type || 'Appointment';
  const doctor = appointment.doctor || 'Doctor';
  return `${appointmentType.charAt(0).toUpperCase() + appointmentType.slice(1)} with Dr. ${doctor}`;
};

// Helper function to generate appointment summary sentence
const generateAppointmentSummary = (appointment: any, displayTz: string, eventTz?: string) => {
  const patientName = appointment.assigned_users?.[0]?.name || 'Patient';
  const doctor = appointment.doctor || 'the doctor';
  const location = appointment.location;
  const appointmentType = appointment.appointment_type || 'appointment';
  
  let sentence = `${patientName} will be going to `;
  
  // Add doctor name
  if (doctor && doctor !== 'the doctor') {
    sentence += doctor.toLowerCase().includes('dr.') || doctor.toLowerCase().includes('doctor') 
      ? doctor 
      : `Dr. ${doctor}`;
  } else {
    sentence += 'the doctor';
  }
  
  // Add location
  if (location) {
    sentence += ` located at ${location}`;
  }
  
  // Add date and time
  if (appointment.due_date) {
    const evTz = eventTz || displayTz;
    const inst = toInstantFromNaive(appointment.due_date, evTz);
    const dateStr = formatInstantInTimeZone(inst, displayTz, { weekday: 'short', month: 'long', day: 'numeric' });
    sentence += ` on ${dateStr}`;
    const timeStr = formatInstantInTimeZone(inst, displayTz, { hour: 'numeric', minute: '2-digit', hour12: true });
    if (!/12:00 AM/.test(timeStr)) sentence += ` at ${timeStr.toLowerCase()}`;
  }
  
  // Add appointment type
  sentence += ` for `;
  
  if (appointmentType.toLowerCase() === 'checkup' || appointmentType.toLowerCase() === 'check-up') {
    sentence += 'a checkup';
  } else if (appointmentType.toLowerCase() === 'physical') {
    sentence += 'a physical';
  } else if (appointmentType.toLowerCase() === 'follow-up') {
    sentence += 'a follow-up';
  } else if (appointmentType.toLowerCase() === 'consultation') {
    sentence += 'a consultation';
  } else if (appointmentType.toLowerCase() === 'procedure') {
    sentence += 'a procedure';
  } else if (appointmentType.toLowerCase() === 'emergency') {
    sentence += 'an emergency appointment';
  } else {
    sentence += appointmentType.toLowerCase().includes('appointment') 
      ? `an ${appointmentType.toLowerCase()}` 
      : `a ${appointmentType.toLowerCase()}`;
  }
  
  sentence += '.';
  
  return sentence;
};

export default function HealthPage() {
  const { user } = useUser();
  const supabase = createClient();
  const { preferences } = usePreferences();
  const { calendars } = useGoogleCalendars();
  const { selectedPersonId, setSelectedPersonId } = usePersonFilter();
  const [activeTab, setActiveTab] = useState<'appointments' | 'medications' | 'doctors' | 'portals' | 'records'>('appointments');
  const [refreshDocuments, setRefreshDocuments] = useState(0);
  const [appointments, setAppointments] = useState<Task[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const hiddenFilterNames = new Set(['Colleen Russell', 'Kate McLaren']);
  const selectedPerson = selectedPersonId ?? 'all';
  const filteredSelectedPerson = selectedPerson !== 'all' && hiddenFilterNames.has(
    familyMembers.find(m => m.id === selectedPerson)?.name ?? ''
  )
    ? 'all'
    : selectedPerson;
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showMedicationModal, setShowMedicationModal] = useState(false);
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<{ appointment: Task; startInEdit: boolean } | null>(null);
  const [portals, setPortals] = useState<MedicalPortal[]>([]);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [editingPortal, setEditingPortal] = useState<MedicalPortal | null>(null);
  const [showDocumentUploadModal, setShowDocumentUploadModal] = useState(false);

  const portalUsers = useMemo(() => {
    const base = familyMembers.map(member => ({
      id: member.id,
      email: member.email ?? '',
      name: member.name,
    }));
    return [...base, { id: 'shared', email: '', name: 'Shared' }];
  }, [familyMembers]);

  // Define the order for family members
  const familyMemberOrder = ['John', 'Susan', 'Claire', 'Auggie', 'Blossom'];

  // Sort family members based on the defined order
  const sortFamilyMembers = (members: FamilyMember[]) => {
    return members.sort((a, b) => {
      const aFirstName = getFirstName(a.name);
      const bFirstName = getFirstName(b.name);
      const aIndex = familyMemberOrder.indexOf(aFirstName);
      const bIndex = familyMemberOrder.indexOf(bFirstName);
      
      // If both are in the order list, sort by their position
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one is in the order list, it comes first
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // Otherwise, sort alphabetically
      return aFirstName.localeCompare(bFirstName);
    });
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch family members first since we need them to map attendees
      const members = await fetchFamilyMembers();
      // Then fetch health data which depends on family members
      await fetchHealthData(members);
    } finally {
      setLoading(false);
    }
  };

  const fetchFamilyMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*');
      
      if (error) throw error;
      if (data) {
        // Filter out pets - only include human family members
        const humanMembers = data.filter(member => {
          const firstName = getFirstName(member.name);
          return !['Daisy', 'Jack', 'Kiki'].includes(firstName);
        });
        const sortedMembers = sortFamilyMembers(humanMembers);
        setFamilyMembers(sortedMembers);
        return sortedMembers;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch family members:', error);
      return [];
    }
  };

  const fetchHealthData = async (members?: FamilyMember[]) => {
    try {
      // Use passed members or fall back to state
      const membersList = members || familyMembers;
      
      // Fetch medical appointments from calendar events
      const calendarResponse = await fetch('/api/calendar-events?category=medical');
      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();
        // Convert calendar events to task-like format for display
        const medicalAppointments = calendarData.events
          .filter((event: any) => {
            // Only show future events
            const eventDate = new Date(event.start_time);
            return eventDate >= new Date();
          })
          .map((event: any) => {
            const evTz = getEventTimeZone(event, calendars as any);
            // Parse doctor info from description
            let doctor = '';
            let doctorPhone = '';
            let appointmentNotes = '';
            
            if (event.description) {
              const lines = event.description.split('\n');
              lines.forEach((line: string) => {
                if (line.startsWith('Doctor:')) {
                  doctor = line.replace('Doctor:', '').trim();
                } else if (line.startsWith('Phone:')) {
                  doctorPhone = line.replace('Phone:', '').trim();
                } else if (line.trim()) {
                  appointmentNotes = line.trim();
                }
              });
            }
            
            return {
              id: event.id,
              title: event.title,
              description: event.description || '',
              category: 'medical' as const,
              status: 'active' as const,
              priority: 'medium' as const,
              due_date: event.start_time,
              timezone: evTz,
              assigned_to: event.attendees || [],
              location: event.location || '',
              doctor: doctor || event.title.replace(/^(Checkup|Physical|Follow-up|Consultation|Procedure|Emergency|Appointment)( with Dr\. | with | - )?/i, '').trim(),
              doctor_phone: doctorPhone,
              appointment_type: event.title.toLowerCase().includes('checkup') ? 'checkup' :
                               event.title.toLowerCase().includes('physical') ? 'physical' :
                               event.title.toLowerCase().includes('follow-up') ? 'follow-up' :
                               event.title.toLowerCase().includes('consultation') ? 'consultation' :
                               event.title.toLowerCase().includes('procedure') ? 'procedure' :
                               event.title.toLowerCase().includes('emergency') ? 'emergency' : 'appointment',
              notes: appointmentNotes,
              // Map attendee IDs to user objects for display
              assigned_users: event.attendees?.map((attendeeId: string) => {
                const member = membersList.find(m => m.id === attendeeId);
                return member ? { id: member.id, name: member.name } : null;
              }).filter(Boolean) || [],
              calendar_event_id: event.id,
              google_calendar_id: event.google_calendar_id || event.metadata?.google_calendar_id || null,
              metadata: event.metadata || {}
            };
          })
          .sort((a: any, b: any) => 
            new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          );
        setAppointments(medicalAppointments);
      }

      // Fetch medications
      const medsResponse = await fetch('/api/medications');
      if (medsResponse.ok) {
        const medsData = await medsResponse.json();
        setMedications(medsData.medications || []);
      }

      // Fetch doctors
      const docsResponse = await fetch('/api/doctors');
      if (docsResponse.ok) {
        const docsData = await docsResponse.json();
        setDoctors(docsData.doctors || []);
      }

      // Fetch medical portals
      const portalsResponse = await fetch('/api/medical-portals');
      if (portalsResponse.ok) {
        const portalsData = await portalsResponse.json();
        setPortals(portalsData.portals || []);
      }
    } catch (error) {
      console.error('Failed to fetch health data:', error);
    }
  };

  const handleDeleteMedication = async (id: string) => {
    if (!confirm('Are you sure you want to delete this medication?')) return;

    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.delete(`/api/medications/${id}`);
      if (response.success) {
        setMedications(medications.filter(m => m.id !== id));
      }
    } catch (error) {

    }
  };

  const handleDeleteDoctor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this doctor?')) return;

    try {
      const response = await ApiClient.delete(`/api/doctors/${id}`);
      if (response.success) {
        setDoctors(doctors.filter(d => d.id !== id));
      }
    } catch (error) {

    }
  };

  const handleSaveAppointment = async (appointmentData: any) => {
    try {
      // Validate user is authenticated (would return 401)
      if (!user?.id) {
        console.error('[Health] User not authenticated');
        alert('You must be logged in to create appointments');
        return;
      }

      // Validate required fields (would return 400)
      if (!appointmentData.appointment_date || !appointmentData.doctor) {
        console.error('[Health] Missing required fields:', {
          hasDate: !!appointmentData.appointment_date,
          hasDoctor: !!appointmentData.doctor
        });
        alert('Please provide appointment date and doctor');
        return;
      }

      // Use patient_ids directly from the appointment data
      const patientIds = appointmentData.patient_ids || [];
      
      // Validate that we have at least one patient (would return 400)
      if (patientIds.length === 0) {
        console.error('[Health] No patients selected');
        alert('Please select at least one patient for the appointment');
        return;
      }

      // Format the title to include appointment type
      const appointmentTypeLabel = appointmentData.appointment_type || 'appointment';
      const title = appointmentData.title || 
                   `${appointmentTypeLabel.charAt(0).toUpperCase() + appointmentTypeLabel.slice(1)} with Dr. ${appointmentData.doctor}`;
      
      // First create the calendar event using the API for proper Google sync
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
      const selectedTz = (preferences && preferences.timezone) ? preferences.timezone : browserTz;

      const calendarEventData = {
        event: {
          title: title,
          start_time: appointmentData.appointment_date,
          end_time: appointmentData.end_time || new Date(new Date(appointmentData.appointment_date).getTime() + 60 * 60 * 1000).toISOString(),
          all_day: false,
          category: 'medical' as const,
          location: appointmentData.location || '',
          description: `Doctor: ${appointmentData.doctor}\n${appointmentData.doctor_phone ? `Phone: ${appointmentData.doctor_phone}\n` : ''}${appointmentData.notes || ''}`,
          // Use attendee_ids for internal patients (UUIDs)
          attendee_ids: patientIds,
          google_calendar_id: appointmentData.google_calendar_id || null,
          google_sync_enabled: appointmentData.google_sync_enabled || false,
          is_virtual: false,
          // Ensure external attendees receive ICS emails similar to Calendar modal
          send_invites: appointmentData.notify_attendees !== false,
          reminder_minutes: appointmentData.reminder === '1-day' ? 1440 : 
                            appointmentData.reminder === '1-hour' ? 60 : 
                            appointmentData.reminder === '1-week' ? 10080 : null,
          metadata: {
            doctor_id: appointmentData.doctor_id,
            appointment_type: appointmentData.appointment_type,
            doctor_phone: appointmentData.doctor_phone,
            notify_attendees: appointmentData.notify_attendees !== false,
            // Provide timezone for consistent rendering and Google sync timezone hints
            timezone: selectedTz,
            // External email attendees
            additional_attendees: appointmentData.additional_attendees ? 
              appointmentData.additional_attendees.split(',').map((email: string) => email.trim()).filter((email: string) => email && email.includes('@')) 
              : []
          }
        }
      };

      console.log('Creating calendar event with data:', calendarEventData);

      const calendarResponse = await ApiClient.post('/api/calendar-events', calendarEventData);

      if (!calendarResponse.success) {
        console.error('Failed to create calendar event:', calendarResponse.error);
        throw new Error(calendarResponse.error || 'Failed to create appointment');
      }

      const calendarPayload = calendarResponse.data as any;
      const calendarEvent = (calendarPayload?.event) ? calendarPayload.event : calendarPayload;

      // Now create the medical appointment record
      const medicalAppointmentData = {
        calendar_event_id: calendarEvent.id,
        doctor_id: appointmentData.doctor_id || null,
        patient_ids: patientIds,
        appointment_type: appointmentData.appointment_type,
        insurance_info: appointmentData.insurance_info || null
      };

      const { error: appointmentError } = await supabase
        .from('medical_appointments')
        .insert(medicalAppointmentData);

      if (appointmentError) {
        console.error('Failed to create medical appointment record:', appointmentError);
        // Try to clean up the calendar event
        await supabase.from('calendar_events').delete().eq('id', calendarEvent.id);
        throw new Error(`Failed to save appointment details: ${appointmentError.message}`);
      }

      console.log('Medical appointment created successfully');
      alert('Appointment successfully saved!');
      
      // Refresh the appointments list to show the new event
      await fetchHealthData(familyMembers);
    } catch (error) {
      console.error('Failed to save appointment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save appointment';
      alert(errorMessage);
    }
  };

  // Filter functions
  const filterAppointments = (appointments: Task[]) => {
    if (selectedPerson === 'all') return appointments;
    
    const selectedMember = familyMembers.find(m => m.id === selectedPerson);
    if (!selectedMember) return appointments;
    
    // Filter by assigned_to array or description containing the person's name
    return appointments.filter(task => {
      // Check if assigned_to is an array or single value
      if (Array.isArray(task.assigned_to)) {
        return task.assigned_to.includes(selectedPerson);
      }
      // Also check assigned_users array
      if (task.assigned_users && Array.isArray(task.assigned_users)) {
        return task.assigned_users.some(user => user.id === selectedPerson);
      }
      // Fallback to checking if it's a single value
      return task.assigned_to === selectedPerson ||
        task.title?.toLowerCase().includes(selectedMember.name.toLowerCase()) ||
        task.description?.toLowerCase().includes(selectedMember.name.toLowerCase());
    });
  };

  const filterMedications = (medications: Medication[]) => {
    if (selectedPerson === 'all') return medications;
    
    return medications.filter(med => 
      med.for_user === selectedPerson
    );
  };

  const filterDoctors = (doctors: Doctor[]) => {
    if (selectedPerson === 'all') return doctors;
    
    return doctors.filter(doc => 
      doc.patients.includes(selectedPerson)
    );
  };

  const filterPortals = (portals: MedicalPortal[]) => {
    if (filteredSelectedPerson === 'all') return portals;

    return portals.filter(portal => Array.isArray(portal.patient_ids) && portal.patient_ids.includes(filteredSelectedPerson));
  };

  const handleDeletePortal = async (id: string) => {
    if (!confirm('Are you sure you want to delete this portal? The password entry will also be removed.')) return;

    try {
      const response = await ApiClient.delete(`/api/medical-portals/${id}`);
      if (response.success) {
        setPortals(portals.filter(p => p.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete portal:', error);
    }
  };

  const handlePortalOpen = async (id?: string) => {
    if (!id) return;
    try {
      await fetch(`/api/medical-portals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_accessed: new Date().toISOString() })
      });
    } catch (error) {
      console.error('Failed to update portal access time:', error);
    }
  };

  const handleDeleteAppointment = async (appointmentId: string) => {
    if (!confirm('Are you sure you want to delete this appointment? This will also remove it from your calendar.')) {
      return;
    }

    try {
      const appointment = appointments.find(a => a.id === appointmentId);
      if (!appointment) {
        console.error('Appointment not found');
        return;
      }

      // Delete all related records in order
      const deleteOperations = [];
      
      // 1. Delete from medical_appointments table if there's a calendar event
      if ((appointment as any).calendar_event_id) {
        deleteOperations.push(
          supabase
            .from('medical_appointments')
            .delete()
            .eq('calendar_event_id', (appointment as any).calendar_event_id)
        );
      }

      // 2. Delete calendar event (this will sync with Google)
      if ((appointment as any).calendar_event_id) {
        deleteOperations.push(
          (async () => {
            const ApiClient = (await import('@/lib/api/api-client')).default;
            const res = await ApiClient.delete(`/api/calendar-events/${(appointment as any).calendar_event_id}`);
            if (!res.success) {
              console.error('Failed to delete calendar event');
              throw new Error('Failed to delete calendar event');
            }
            return res;
          })()
        );
      }

      // 3. Delete the task itself
      deleteOperations.push(
        (async () => {
          const ApiClient = (await import('@/lib/api/api-client')).default;
          const res = await ApiClient.delete(`/api/tasks/${appointmentId}`);
          if (!res.success) {
            console.error('Failed to delete task');
            throw new Error('Failed to delete task');
          }
          return res;
        })()
      );

      // Execute all deletions
      await Promise.all(deleteOperations);

      // Update local state only after successful deletion
      setAppointments(appointments.filter(a => a.id !== appointmentId));
      
      // Show success message (optional)
      console.log('Appointment deleted successfully');
    } catch (error) {
      console.error('Failed to delete appointment:', error);
      alert('Failed to delete appointment. Please try again.');
    }
  };

  // Apply filters
  const term = search.trim().toLowerCase();
  const filteredAppointments = filterAppointments(appointments).filter(a => {
    if (!term) return true;
    return (
      (a.title||'').toLowerCase().includes(term) ||
      (a.description||'').toLowerCase().includes(term) ||
      ((a as any).doctor||'').toLowerCase().includes(term) ||
      (((a as any).location)||'').toLowerCase().includes(term)
    );
  });
  const filteredMedications = filterMedications(medications);
  const filteredDoctors = filterDoctors(doctors).filter(d => {
    if (!term) return true;
    return (
      (d.name||'').toLowerCase().includes(term) ||
      (d.specialty||'').toLowerCase().includes(term) ||
      (d.address||'').toLowerCase().includes(term)
    );
  });
  const filteredPortals = filterPortals(portals).filter(p => {
    if (!term) return true;
    return (
      (p.name||'').toLowerCase().includes(term) ||
      (p.portal_url||'').toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Health</h1>
        </div>
      </div>

      {/* Search + Family filter (match Travel styling) */}
      <TravelSearchFilter
        onSearchChange={setSearch}
        placeholder="Search health for appointments, medications, doctors..."
        includePetsOption={false}
        customOptions={familyMembers
          .filter(member => !hiddenFilterNames.has(member.name))
          .map(member => ({
            id: member.id,
            label: getFirstName(member.name),
          }))}
        selectedOption={filteredSelectedPerson}
        onOptionChange={(value) => {
          if (value === 'all') {
            setSelectedPersonId(null);
          } else {
            setSelectedPersonId(value);
          }
        }}
      />

      {/* Tabs (match Travel sizing/styling) */}
      <div className="flex items-center gap-2 border-b border-gray-600/30">
        {([
          { k: 'appointments', label: 'Appointments' },
          { k: 'medications', label: 'Medications' },
          { k: 'doctors', label: 'Doctors' },
            { k: 'portals', label: 'Passwords & Portals' },
          { k: 'records', label: 'Documents' },
        ] as const).map(t => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k)}
            className={`px-3 py-2 text-sm border-b-2 ${activeTab===t.k ? 'border-primary-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'appointments' && (
        <section className="bg-background-secondary border border-gray-600/30 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-text-primary">
                {selectedPerson !== 'all' ? `${familyMembers.find(m => m.id === selectedPerson)?.name}'s ` : ''}Medical Appointments
              </h2>
              <span className="text-xs text-text-muted">{filteredAppointments.length} items</span>
            </div>
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowAppointmentModal(true)}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/95 text-white rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Appointment
              </button>
            )}
          </div>

          {filteredAppointments.length === 0 ? (
            <div className="bg-background-primary border border-gray-600/30 rounded-xl p-6 text-center">
              <p className="text-text-muted">No upcoming medical appointments{selectedPerson !== 'all' && ` for ${familyMembers.find(m => m.id === selectedPerson)?.name}`}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredAppointments.map((appointment) => {
                const appointmentDate = appointment.due_date ? toInstantFromNaive(appointment.due_date, (appointment as any).timezone || preferences.timezone) : null;
                
                return (
                  <div 
                    key={appointment.id} 
                    className="bg-background-primary border border-gray-600/30 rounded-xl p-4 cursor-pointer hover:border-gray-500 transition-colors"
                    onClick={() => setSelectedAppointment({ appointment, startInEdit: false })}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Calendar className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          {/* Simple Title with Date/Time */}
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-sm font-medium text-text-primary">
                              {generateAppointmentTitle(appointment)}
                            </h3>
                            {appointmentDate && (
                              <span className="text-xs text-text-muted whitespace-nowrap ml-2">
                                {formatInstantInTimeZone(appointmentDate, preferences.timezone, { month: 'short', day: 'numeric' })}
                                {(() => { const t = formatInstantInTimeZone(appointmentDate, preferences.timezone, { hour: 'numeric', minute: '2-digit', hour12: true }); return /12:00 AM/.test(t) ? '' : ` at ${t.toLowerCase()}`; })()}
                              </span>
                            )}
                          </div>
                          
                          {/* Natural Language Summary */}
                          <p className="text-sm text-text-muted">
                            {generateAppointmentSummary(appointment, preferences.timezone, (appointment as any).timezone)}
                          </p>
                          
                          {/* Additional Notes */}
                          {appointment.notes && (
                            <p className="text-xs text-text-muted/70 mt-1">
                              {appointment.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Admin Controls */}
                      {user?.role === 'admin' && (
                        <div className="flex items-center gap-1 ml-3">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppointment({ appointment, startInEdit: true });
                            }}
                            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAppointment(appointment.id);
                            }}
                            className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
            })}
          </div>
        )}
      </section>
    )}

      {activeTab === 'medications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-primary">
              {selectedPerson !== 'all' ? `${familyMembers.find(m => m.id === selectedPerson)?.name}'s ` : ''}Medications
            </h2>
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowMedicationModal(true)}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Medication
              </button>
            )}
          </div>
          
          {filteredMedications.length === 0 ? (
            <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-6 text-center">
              <p className="text-text-muted">No medications tracked{selectedPerson !== 'all' && ` for ${familyMembers.find(m => m.id === selectedPerson)?.name}`}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredMedications.map((medication) => (
                <MedicationCard
                  key={medication.id}
                  medication={medication}
                  familyMembers={familyMembers}
                  doctors={doctors}
                  onEdit={() => setEditingMedication(medication)}
                  onDelete={() => handleDeleteMedication(medication.id)}
                  isAdmin={user?.role === 'admin'}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'doctors' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-primary">
              {selectedPerson !== 'all' ? `${familyMembers.find(m => m.id === selectedPerson)?.name}'s ` : ''}Doctors
            </h2>
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowDoctorModal(true)}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Doctor
              </button>
            )}
          </div>
          
          {filteredDoctors.length === 0 ? (
            <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-6 text-center">
              <p className="text-text-muted">No doctors in directory{selectedPerson !== 'all' && ` for ${familyMembers.find(m => m.id === selectedPerson)?.name}`}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredDoctors.map((doctor) => (
                <DoctorCard
                  key={doctor.id}
                  doctor={doctor}
                  familyMembers={familyMembers}
                  onEdit={() => setEditingDoctor(doctor)}
                  onDelete={() => handleDeleteDoctor(doctor.id)}
                  isAdmin={user?.role === 'admin'}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'portals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-primary">
              {selectedPerson !== 'all' ? `${familyMembers.find(m => m.id === selectedPerson)?.name}'s ` : ''}Medical Portals
            </h2>
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowPortalModal(true)}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Portal
              </button>
            )}
          </div>
          
          {filteredPortals.length === 0 ? (
            <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-6 text-center">
              <p className="text-text-muted">No medical portals{selectedPerson !== 'all' && ` for ${familyMembers.find(m => m.id === selectedPerson)?.name}`}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filteredPortals.map((portal, index) => {
                const portalId = portal.id ?? `portal-${index}`;
                const portalName = portal.name || 'Portal';
                const patientIds = Array.isArray(portal.patient_ids) ? portal.patient_ids : [];
                const patientNames = patientIds
                  .map(patientId => familyMembers.find(m => m.id === patientId)?.name)
                  .filter((name): name is string => Boolean(name));
                const assignedLabel = patientNames.length > 0 ? patientNames.join(', ') : 'Shared';

                const passwordRecord: Password = {
                  id: portalId,
                  service_name: portalName,
                  username: portal.username || '',
                  password: portal.password || '',
                  url: portal.portal_url || undefined,
                  category: 'medical-portal',
                  notes: portal.notes,
                  owner_id: patientIds[0] ?? 'shared',
                  shared_with: patientIds,
                  is_favorite: false,
                  is_shared: patientIds.length > 1,
                  last_changed: portal.updated_at ? new Date(portal.updated_at) : new Date(),
                  strength: undefined,
                  created_at: portal.created_at ? new Date(portal.created_at) : new Date(),
                  updated_at: portal.updated_at ? new Date(portal.updated_at) : new Date(),
                  source_page: 'health',
                };

                const portalCategory: Category = {
                  id: 'medical-portal',
                  name: portal.doctor?.specialty || 'Medical Portal',
                  color: '#38bdf8',
                  module: 'passwords',
                  created_at: '1970-01-01T00:00:00Z',
                  updated_at: '1970-01-01T00:00:00Z',
                  icon: undefined,
                };

                const lastAccessDisplay = portal.last_accessed
                  ? formatInstantInTimeZone(
                      toInstantFromNaive(portal.last_accessed, preferences.timezone),
                      preferences.timezone,
                      { month: 'short', day: 'numeric', year: 'numeric' }
                    )
                  : null;

                const extraContent = (
                  <div className="space-y-1 text-xs text-text-muted">
                    {portal.doctor && (
                      <p className="flex items-center gap-2 text-text-muted">
                        <Stethoscope className="h-3.5 w-3.5" />
                        <span>
                          {portal.doctor.name}
                          {portal.doctor.specialty ? ` • ${portal.doctor.specialty}` : ''}
                        </span>
                      </p>
                    )}
                    {portal.notes && (
                      <p className="italic text-text-muted/80">{portal.notes}</p>
                    )}
                  </div>
                );

                const footerContent = lastAccessDisplay ? (
                  <span>Last accessed: {lastAccessDisplay}</span>
                ) : undefined;

                return (
                  <PasswordCard
                    key={portalId}
                    password={passwordRecord}
                    categories={[portalCategory]}
                    users={portalUsers}
                    sourceLabel="Health"
                    assignedToLabel={assignedLabel}
                    subtitle={portal.doctor?.name || 'Healthcare Portal'}
                    extraContent={extraContent}
                    footerContent={footerContent}
                    showFavoriteToggle={false}
                    strengthOverride={getPasswordStrength(portal.password || '')}
                    canManage={user?.role === 'admin'}
                    onEdit={() => setEditingPortal(portal)}
                    onDelete={() => handleDeletePortal(portal.id)}
                    onOpenUrl={() => handlePortalOpen(portal.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'records' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-primary">
              {selectedPerson !== 'all' ? `${familyMembers.find(m => m.id === selectedPerson)?.name}'s ` : ''}Documents
            </h2>
            {user?.role === 'admin' && (
              <>
                <button
                  onClick={() => setShowDocumentUploadModal(true)}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Upload Health Doc
                </button>
                {showDocumentUploadModal && (
                  <DocumentUploadModal
                    onClose={() => setShowDocumentUploadModal(false)}
                    onUploadComplete={() => {
                      setShowDocumentUploadModal(false);
                      setRefreshDocuments(prev => prev + 1);
                    }}
                    sourcePage="health"
                    defaultCategory="Health"
                    initialRelatedTo={selectedPerson !== 'all' ? [selectedPerson] : []}
                    excludedPersonNames={['Colleen Russell', 'Kate McLaren']}
                    hideAssignInfo
                    titleOverride="Upload Health Doc"
                  />
                )}
              </>
            )}
          </div>
          <DocumentList 
            sourcePage="Health" 
            key={refreshDocuments}
            selectedPerson={selectedPerson !== 'all' ? familyMembers.find(m => m.id === selectedPerson)?.name : undefined}
            filterFn={(doc) => {
              const category = doc.category?.toLowerCase();
              return category === 'health' || category === 'medical';
            }}
          />
        </div>
      )}

      {/* Modals */}
      {(showMedicationModal || editingMedication) && (
        <MedicationModal
          medication={editingMedication}
          familyMembers={familyMembers}
          doctors={doctors}
          onClose={() => {
            setShowMedicationModal(false);
            setEditingMedication(null);
          }}
          onSave={(savedMedication) => {
            if (editingMedication) {
              setMedications(medications.map(m => 
                m.id === savedMedication.id ? savedMedication : m
              ));
            } else {
              setMedications([...medications, savedMedication]);
            }
            setShowMedicationModal(false);
            setEditingMedication(null);
          }}
        />
      )}

      {(showDoctorModal || editingDoctor) && (
        <DoctorModal
          doctor={editingDoctor}
          familyMembers={familyMembers}
          onClose={() => {
            setShowDoctorModal(false);
            setEditingDoctor(null);
          }}
          onSave={async (savedDoctor) => {
            if (editingDoctor) {
              setDoctors(doctors.map(d => 
                d.id === savedDoctor.id ? savedDoctor : d
              ));
            } else {
              setDoctors([...doctors, savedDoctor]);
            }
            setShowDoctorModal(false);
            setEditingDoctor(null);
            // Refresh doctors list to ensure it's up to date
            await fetchHealthData();
          }}
        />
      )}

      {showAppointmentModal && (
        <AppointmentModal
          doctors={doctors}
          familyMembers={familyMembers}
          onClose={() => setShowAppointmentModal(false)}
          onSave={async (appointmentData) => {
            // Save appointment and create calendar event
            await handleSaveAppointment(appointmentData);
            setShowAppointmentModal(false);
            await fetchHealthData(); // Refresh appointments
          }}
        />
      )}

      {(showPortalModal || editingPortal) && (
        <PortalModal
          portal={editingPortal}
          familyMembers={familyMembers}
          doctors={doctors}
          onClose={() => {
            setShowPortalModal(false);
            setEditingPortal(null);
          }}
          onSave={async (savedPortal) => {
            if (editingPortal) {
              setPortals(portals.map(p => 
                p.id === savedPortal.id ? savedPortal : p
              ));
            } else {
              setPortals([...portals, savedPortal]);
            }
            setShowPortalModal(false);
            setEditingPortal(null);
            // Refresh portals list
            await fetchHealthData();
          }}
        />
      )}

      {selectedAppointment && (
        <ViewEditAppointmentModal
          appointment={selectedAppointment.appointment}
          doctors={doctors}
          familyMembers={familyMembers}
          googleCalendars={calendars}
          startInEditMode={selectedAppointment.startInEdit}
          onClose={() => setSelectedAppointment(null)}
          onAppointmentUpdated={(updatedAppointment) => {
            setAppointments(appointments.map(a => 
              a.id === updatedAppointment.id ? updatedAppointment : a
            ));
            setSelectedAppointment(null);
          }}
          onAppointmentDeleted={(appointmentId) => {
            setAppointments(appointments.filter(a => a.id !== appointmentId));
            setSelectedAppointment(null);
          }}
        />
      )}
    </div>
  );
}

function MedicationCard({ 
  medication, 
  familyMembers,
  doctors,
  onEdit, 
  onDelete, 
  isAdmin 
}: { 
  medication: Medication; 
  familyMembers: FamilyMember[];
  doctors: Doctor[];
  onEdit: () => void; 
  onDelete: () => void;
  isAdmin?: boolean;
}) {
  const memberName = familyMembers.find(m => m.id === medication.for_user)?.name || medication.for_user;
  const doctorName = medication.prescribing_doctor ? 
    doctors.find(d => d.id === medication.prescribing_doctor)?.name || medication.prescribing_doctor 
    : null;
  const { preferences } = usePreferences();
  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Pill className="h-4 w-4 text-medical" />
            {medication.name}
          </h3>
          <p className="text-sm text-text-muted mt-1">{medication.dosage} - {medication.frequency}</p>
          {doctorName && (
            <p className="text-sm text-text-muted mt-1">Prescribed by: {doctorName}</p>
          )}
          <p className="text-sm text-text-muted mt-2">For: {memberName}</p>
          {medication.refill_reminder_date && (() => { const inst = toInstantFromNaive(`${medication.refill_reminder_date}T00:00:00`, preferences.timezone); return (
            <p className="text-sm text-yellow-500 mt-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Refill by {formatInstantInTimeZone(inst, preferences.timezone, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          ); })()}
          {medication.notes && (
            <p className="text-sm text-text-muted/70 mt-2 italic">{medication.notes}</p>
          )}
        </div>
        
        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <FileText className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="text-text-muted hover:text-urgent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DoctorCard({ 
  doctor, 
  familyMembers,
  onEdit, 
  onDelete, 
  isAdmin 
}: { 
  doctor: Doctor; 
  familyMembers: FamilyMember[];
  onEdit: () => void; 
  onDelete: () => void;
  isAdmin?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  
  const patientNames = doctor.patients.map(patientId => {
    const member = familyMembers.find(m => m.id === patientId);
    return member ? member.name : patientId;
  });
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  return (
    <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-text-primary">{doctor.name}</h3>
          <p className="text-sm text-text-muted">{doctor.specialty}</p>
          
          <div className="mt-3 space-y-1">
            {doctor.phone && (
              <p className="text-sm text-text-muted flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {doctor.phone}
              </p>
            )}
            {doctor.email && (
              <p className="text-sm text-text-muted flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {doctor.email}
              </p>
            )}
            {doctor.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(doctor.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-text-muted hover:text-primary-400 flex items-center gap-1 transition-colors"
              >
                <MapPin className="h-3 w-3" />
                {doctor.address}
              </a>
            )}
            {doctor.website && (
              <a
                href={doctor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                <Globe className="h-3 w-3" />
                Website
              </a>
            )}
            {doctor.portal_url && (
              <a
                href={doctor.portal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                <Globe className="h-3 w-3" />
                Patient Portal
              </a>
            )}
          </div>
          
          {/* Portal Credentials */}
          {(doctor.portal_username || doctor.portal_password) && (
            <div className="mt-3 p-3 bg-background-primary rounded-md border border-gray-600/30">
              <p className="text-xs text-text-muted mb-2 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Portal Credentials
              </p>
              {doctor.portal_username && (
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-text-primary flex items-center gap-1">
                    <KeyRound className="h-3 w-3" />
                    <span className="font-mono">{doctor.portal_username}</span>
                  </p>
                  <button
                    onClick={() => copyToClipboard(doctor.portal_username!)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                    title="Copy username"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
              {doctor.portal_password && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-primary flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    <span className="font-mono">
                      {showPassword ? doctor.portal_password : '••••••••'}
                    </span>
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-text-muted hover:text-text-primary transition-colors"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(doctor.portal_password!)}
                      className="text-text-muted hover:text-text-primary transition-colors"
                      title="Copy password"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <p className="text-sm text-text-muted mt-3">
            Patients: {patientNames.join(', ')}
          </p>
        </div>
        
        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <FileText className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="text-text-muted hover:text-urgent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MedicationModal({ 
  medication, 
  familyMembers,
  doctors,
  onClose, 
  onSave 
}: { 
  medication: Medication | null; 
  familyMembers: FamilyMember[];
  doctors: Doctor[];
  onClose: () => void; 
  onSave: (medication: Medication) => void;
}) {
  const [formData, setFormData] = useState({
    name: medication?.name || '',
    dosage: medication?.dosage || '',
    frequency: medication?.frequency || '',
    prescribing_doctor: medication?.prescribing_doctor || '',
    for_user: medication?.for_user || '',
    refill_reminder_date: medication?.refill_reminder_date || '',
    notes: medication?.notes || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = medication ? `/api/medications/${medication.id}` : '/api/medications';
      const response = await fetch(url, {
        method: medication ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        onSave(data.medication);
      } else {
        const errorData = await response.json();
        console.error('Failed to save medication:', errorData);
        alert(errorData.error || 'Failed to save medication');
      }
    } catch (error) {
      console.error('Error saving medication:', error);
      alert('Failed to save medication. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {medication ? 'Edit Medication' : 'Add Medication'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Medication Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Dosage *
                </label>
                <input
                  type="text"
                  value={formData.dosage}
                  onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                  required
                  placeholder="e.g., 10mg"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Frequency *
                </label>
                <input
                  type="text"
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  required
                  placeholder="e.g., Twice daily"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Prescribing Doctor
              </label>
              <select
                value={formData.prescribing_doctor}
                onChange={(e) => setFormData({ ...formData, prescribing_doctor: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                <option value="">Select doctor</option>
                {doctors.map(doctor => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name} - {doctor.specialty}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                For Family Member *
              </label>
              <select
                value={formData.for_user}
                onChange={(e) => setFormData({ ...formData, for_user: e.target.value })}
                required
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              >
                <option value="">Select person</option>
                {familyMembers.map(member => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Refill Reminder Date
              </label>
              <input
                type="date"
                value={formData.refill_reminder_date}
                onChange={(e) => setFormData({ ...formData, refill_reminder_date: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading || !formData.name || !formData.dosage || !formData.frequency || !formData.for_user}
                className="flex-1 py-2 px-4 bg-button-create hover:bg-button-create/90 disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
              >
                {loading ? 'Saving...' : 'Save'}
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


function DoctorModal({ 
  doctor, 
  familyMembers,
  onClose, 
  onSave 
}: { 
  doctor: Doctor | null; 
  familyMembers: FamilyMember[];
  onClose: () => void; 
  onSave: (doctor: Doctor) => void;
}) {
  const [formData, setFormData] = useState({
    name: doctor?.name || '',
    specialty: doctor?.specialty || '',
    phone: doctor?.phone || '',
    email: doctor?.email || '',
    address: doctor?.address || '',
    website: doctor?.website || '',
    portal_url: doctor?.portal_url || '',
    portal_username: doctor?.portal_username || '',
    portal_password: doctor?.portal_password || '',
    patients: doctor?.patients || [],
    notes: doctor?.notes || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = doctor ? `/api/doctors/${doctor.id}` : '/api/doctors';
      const response = await fetch(url, {
        method: doctor ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          website: formData.website ? normalizeUrl(formData.website) : null,
          portal_url: formData.portal_url ? normalizeUrl(formData.portal_url) : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Auto-save portal credentials to passwords if provided
        if (formData.portal_username && formData.portal_password && formData.portal_url) {
          try {
            await fetch('/api/passwords', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: `${formData.name} - Patient Portal`,
                username: formData.portal_username,
                password: formData.portal_password,
                url: formData.portal_url,
                category: 'medical',
                notes: `Portal for Dr. ${formData.name} (${formData.specialty})\nPatients: ${formData.patients.map(id => familyMembers.find(m => m.id === id)?.name || id).join(', ')}`,
                is_shared: true
              })
            });
          } catch (passwordError) {
            console.error('Failed to save portal credentials to passwords:', passwordError);
            // Don't fail the doctor save if password save fails
          }
        }
        
        onSave(data.doctor);
      } else {
        const errorData = await response.json();
        console.error('Failed to save doctor:', errorData);
        alert(errorData.error || 'Failed to save doctor');
      }
    } catch (error) {
      console.error('Error saving doctor:', error);
      alert('Failed to save doctor. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {doctor ? 'Edit Doctor' : 'Add Doctor'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Doctor Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Specialty *
                </label>
                <input
                  type="text"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  required
                  placeholder="e.g., Primary Care"
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Address
              </label>
              <AddressAutocomplete
                value={formData.address}
                onChange={(value) => setFormData({ ...formData, address: value })}
                placeholder="Start typing address..."
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Website
              </label>
              <input
                type="text"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="example.com or www.example.com"
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Patient Portal URL
              </label>
              <input
                type="text"
                value={formData.portal_url}
                onChange={(e) => setFormData({ ...formData, portal_url: e.target.value })}
                placeholder="portal.example.com"
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Portal Username
              </label>
              <input
                type="text"
                value={formData.portal_username}
                onChange={(e) => setFormData({ ...formData, portal_username: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Portal Password
              </label>
              <input
                type="password"
                value={formData.portal_password}
                onChange={(e) => setFormData({ ...formData, portal_password: e.target.value })}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Patients *
              </label>
              <div className="space-y-2">
                {familyMembers.map(member => (
                  <label key={member.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      value={member.id}
                      checked={formData.patients.includes(member.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, patients: [...formData.patients, member.id] });
                        } else {
                          setFormData({ ...formData, patients: formData.patients.filter(p => p !== member.id) });
                        }
                      }}
                      className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-text-primary">{getFirstName(member.name)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading || !formData.name || !formData.specialty || formData.patients.length === 0}
                className="flex-1 py-2 px-4 bg-button-create hover:bg-button-create/90 disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
              >
                {loading ? 'Saving...' : 'Save'}
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

function PortalModal({ 
  portal, 
  familyMembers,
  doctors,
  onClose, 
  onSave 
}: { 
  portal: MedicalPortal | null; 
  familyMembers: FamilyMember[];
  doctors: Doctor[];
  onClose: () => void; 
  onSave: (portal: MedicalPortal) => void;
}) {
  const [formData, setFormData] = useState({
    title: portal?.name || '',
    doctorId: portal?.doctor_id || '',
    username: portal?.username || '',
    password: portal?.password || '',
    url: portal?.portal_url || '',
    notes: portal?.notes || '',
    patientIds: portal?.patient_ids || [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLength, setPasswordLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);

  useEffect(() => {
    if (portal) {
      setFormData({
        title: portal.name || '',
        doctorId: portal.doctor_id || '',
        username: portal.username || '',
        password: portal.password || '',
        url: portal.portal_url || '',
        notes: portal.notes || '',
        patientIds: portal.patient_ids || [],
      });
    } else {
      setFormData({
        title: '',
        doctorId: '',
        username: '',
        password: '',
        url: '',
        notes: '',
        patientIds: familyMembers.length === 1 ? [familyMembers[0].id] : [],
      });
    }
  }, [portal, familyMembers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const endpoint = portal ? `/api/medical-portals/${portal.id}` : '/api/medical-portals';
      const response = await fetch(endpoint, {
        method: portal ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          doctorId: formData.doctorId,
          username: formData.username,
          password: formData.password,
          url: formData.url,
          notes: formData.notes,
          patientIds: formData.patientIds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save portal');
      }

      const data = await response.json();
      onSave(data.portal);
      onClose();
    } catch (error) {
      console.error('Error saving portal:', error);
      alert('Failed to save portal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePatientToggle = (patientId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      patientIds: checked
        ? [...prev.patientIds, patientId]
        : prev.patientIds.filter(id => id !== patientId),
    }));
  };

  const generatePassword = () => {
    let charset = '';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) {
      charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    }

    let password = '';
    for (let i = 0; i < passwordLength; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setFormData(prev => ({ ...prev, password }));
  };

  const passwordStrength = getPasswordStrength(formData.password || '');

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" ariaLabel="Medical portal form">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <ModalHeader>
          <div className="flex w-full items-start justify-between gap-4">
            <ModalTitle>{portal ? 'Edit Medical Portal' : 'Add Medical Portal'}</ModalTitle>
            <ModalCloseButton onClose={onClose} />
          </div>
        </ModalHeader>

        <ModalBody className="space-y-5">
          <CredentialFormField id="medical-portal-title" label="Title" required>
            <input
              id="medical-portal-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="e.g., MyChart Portal"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="medical-portal-doctor" label="Associated Doctor">
            <select
              id="medical-portal-doctor"
              value={formData.doctorId}
              onChange={(e) => setFormData({ ...formData, doctorId: e.target.value })}
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            >
              <option value="">Select doctor (optional)</option>
              {doctors.map(doctor => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name} {doctor.specialty ? `- ${doctor.specialty}` : ''}
                </option>
              ))}
            </select>
          </CredentialFormField>

          <CredentialFormField id="medical-portal-username" label="Username">
            <input
              id="medical-portal-username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Username or email"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField id="medical-portal-password" label="Password">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="medical-portal-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Password"
                  className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 pr-10 text-white focus:outline-none focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={generatePassword}
                className="rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white transition-colors hover:bg-neutral-600"
              >
                Generate
              </button>
            </div>
          </CredentialFormField>

          <div className="space-y-3 rounded-xl border border-neutral-600 bg-neutral-800/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-300">Password Length: {passwordLength}</span>
              <Slider
                value={passwordLength}
                onValueChange={(value) => setPasswordLength(value[0])}
                min={8}
                max={32}
                step={1}
                className="w-32"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeUppercase}
                  onCheckedChange={(checked) => setIncludeUppercase(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Uppercase</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeLowercase}
                  onCheckedChange={(checked) => setIncludeLowercase(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Lowercase</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeNumbers}
                  onCheckedChange={(checked) => setIncludeNumbers(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Numbers</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeSymbols}
                  onCheckedChange={(checked) => setIncludeSymbols(Boolean(checked))}
                />
                <span className="text-sm text-neutral-300">Symbols</span>
              </label>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-neutral-300">Strength:</span>
                <span
                  className={`text-sm capitalize ${
                    passwordStrength === 'strong'
                      ? 'text-green-500'
                      : passwordStrength === 'medium'
                      ? 'text-yellow-500'
                      : 'text-red-500'
                  }`}
                >
                  {passwordStrength}
                </span>
              </div>
              <div className="h-2 w-full rounded bg-neutral-600">
                <div
                  className={`h-full rounded transition-all ${
                    passwordStrength === 'strong'
                      ? 'w-full bg-green-500'
                      : passwordStrength === 'medium'
                      ? 'w-2/3 bg-yellow-500'
                      : 'w-1/3 bg-red-500'
                  }`}
                />
              </div>
            </div>
          </div>

          <CredentialFormField
            id="medical-portal-url"
            label="URL"
            helperText={formData.url ? `Will be saved as: ${smartUrlComplete(formData.url)}` : undefined}
          >
            <input
              id="medical-portal-url"
              type="text"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="example.com or https://example.com"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>

          <CredentialFormField
            id="medical-portal-patients"
            label={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Associated Patients</span>}
          >
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-neutral-600 bg-neutral-700 p-3">
              {familyMembers.map(member => (
                <label key={member.id} className="flex items-center gap-2 rounded p-1 transition hover:bg-neutral-600">
                  <Checkbox
                    id={`medical-patient-${member.id}`}
                    checked={formData.patientIds.includes(member.id)}
                    onCheckedChange={(checked) => handlePatientToggle(member.id, Boolean(checked))}
                  />
                  <span className="text-sm text-neutral-200">{getFirstName(member.name)}</span>
                </label>
              ))}
            </div>
          </CredentialFormField>

          <CredentialFormField id="medical-portal-notes" label="Notes">
            <textarea
              id="medical-portal-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Any additional information about this portal"
              className="w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-white focus:outline-none focus:border-primary-500"
            />
          </CredentialFormField>
        </ModalBody>

        <ModalFooter className="gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-md border border-neutral-600 bg-neutral-700 px-4 py-2 text-white transition-colors hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-70 sm:flex-initial"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !formData.title || formData.patientIds.length === 0}
            className="flex-1 rounded-md bg-button-create px-4 py-2 text-white transition-colors hover:bg-button-create/90 disabled:cursor-not-allowed disabled:bg-neutral-600 sm:flex-initial"
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
