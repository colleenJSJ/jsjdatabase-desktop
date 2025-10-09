import type { Task } from '@/lib/supabase/types';

export type ReminderOption = 'none' | '1-hour' | '1-day' | '1-week';

export interface AppointmentFormState {
  title: string;
  doctor: string;
  doctor_id: string;
  doctor_phone: string;
  patient_names: string[];
  patient_ids: string[];
  appointment_date: string;
  appointment_time: string;
  duration: string;
  location: string;
  appointment_type: string;
  notes: string;
  reminder: ReminderOption;
  google_calendar_id: string;
  google_sync_enabled: boolean;
  additional_attendees: string;
  notify_attendees: boolean;
  insurance_info?: string | null;
}

export interface AppointmentSavePayload extends AppointmentFormState {
  appointment_datetime: string;
  end_time: string;
}

export interface AppointmentMetadata {
  provider_id?: string | null;
  provider_name?: string | null;
  appointment_type?: string | null;
  duration?: number | string | null;
  is_virtual?: boolean | null;
  virtual_link?: string | null;
  google_calendar_id?: string | null;
  patient_ids?: string[];
  notify_attendees?: boolean;
  timezone?: string | null;
  doctor_id?: string | null;
  doctor_phone?: string | null;
  [key: string]: unknown;
}

export interface HealthAppointment extends Task {
  doctor?: string | null;
  doctor_id?: string | null;
  doctor_phone?: string | null;
  location?: string | null;
  appointment_type?: string | null;
  notes?: string;
  patient_names?: string[];
  patient_ids?: string[];
  appointment_date?: string;
  appointment_time?: string;
  duration?: string | number | null;
  google_sync_enabled?: boolean;
  google_calendar_id?: string | null;
  calendar_event_id?: string | null;
  metadata?: AppointmentMetadata | null;
  timezone?: string | null;
  additional_attendees?: string[] | string;
  reminder?: ReminderOption | null;
  start_time?: string | null;
  end_time?: string | null;
}
