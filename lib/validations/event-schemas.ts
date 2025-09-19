import { z } from 'zod';

// Helper to validate datetime strings
const datetimeString = z.string().refine((val) => {
  const date = new Date(val);
  return !isNaN(date.getTime());
}, { message: 'Invalid datetime string' });

// Base event schema
export const BaseEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  allDay: z.boolean().default(false),
  location: z.string().max(500).optional(),
  isVirtual: z.boolean().default(false),
  virtualLink: z.string().url('Invalid URL').optional().nullable(),
  attendees: z.array(z.string().uuid()).optional().default([]),
  googleCalendarId: z.string().nullable().optional(),
  reminderMinutes: z.number().min(0).max(10080).default(15), // Max 1 week
  category: z.enum([
    'medical', 'personal', 'work', 'family', 'travel', 
    'school', 'education', 'pets', 'financial', 'household', 
    'legal', 'administrative', 'other'
  ]).optional()
}).refine((data) => {
  // Ensure end date is not before start date
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end >= start;
}, {
  message: 'End date must be after or equal to start date',
  path: ['endDate']
}).refine((data) => {
  // For same-day events, ensure end time is after start time
  if (data.startDate === data.endDate && !data.allDay) {
    const startMinutes = parseInt(data.startTime.split(':')[0]) * 60 + parseInt(data.startTime.split(':')[1]);
    const endMinutes = parseInt(data.endTime.split(':')[0]) * 60 + parseInt(data.endTime.split(':')[1]);
    return endMinutes > startMinutes;
  }
  return true;
}, {
  message: 'End time must be after start time for same-day events',
  path: ['endTime']
});

// Travel event schema
export const TravelEventSchema = BaseEventSchema.extend({
  airline: z.string().max(100).optional(),
  flightNumber: z.string().max(20).optional(),
  departureAirport: z.string().max(10).optional(),
  arrivalAirport: z.string().max(10).optional(),
  confirmationNumber: z.string().max(50).optional(),
  travelers: z.array(z.string()).optional(),
  vehicleType: z.enum(['flight', 'car', 'train', 'other']).optional(),
  accommodationName: z.string().max(255).optional(),
  accommodationType: z.string().max(100).optional()
}).refine((data) => {
  // If vehicle type is flight, require airline and flight number
  if (data.vehicleType === 'flight') {
    return !!data.airline && !!data.flightNumber;
  }
  return true;
}, {
  message: 'Airline and flight number are required for flights',
  path: ['airline']
});

// Health event schema
export const HealthEventSchema = BaseEventSchema.extend({
  providerId: z.string().uuid().optional(),
  providerName: z.string().max(255).optional(),
  appointmentType: z.enum(['checkup', 'consultation', 'followup', 'procedure', 'test']).optional(),
  patientIds: z.array(z.string().uuid()).optional(),
  duration: z.number().min(15).max(480).default(60), // 15 minutes to 8 hours
  notes: z.string().max(1000).optional()
}).refine((data) => {
  // Require at least provider ID or name
  return !!data.providerId || !!data.providerName;
}, {
  message: 'Provider information is required',
  path: ['providerName']
});

// Pets event schema
export const PetsEventSchema = BaseEventSchema.extend({
  petIds: z.array(z.string().uuid()).min(1, 'At least one pet must be selected'),
  appointmentType: z.enum(['checkup', 'vaccination', 'grooming', 'surgery', 'other']).default('checkup'),
  vetId: z.string().uuid().optional(),
  vetName: z.string().max(255).optional(),
  notes: z.string().max(1000).optional()
});

// Academic event schema
export const AcademicsEventSchema = BaseEventSchema.extend({
  eventType: z.enum(['parent-teacher', 'school-event', 'exam', 'assignment', 'other']).default('school-event'),
  studentIds: z.array(z.string().uuid()).optional(),
  schoolName: z.string().max(255).optional(),
  notes: z.string().max(1000).optional()
});

// Unified event schema (discriminated union)
export const UnifiedEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('general') }).merge(BaseEventSchema),
  z.object({ type: z.literal('travel') }).merge(TravelEventSchema),
  z.object({ type: z.literal('health') }).merge(HealthEventSchema),
  z.object({ type: z.literal('pets') }).merge(PetsEventSchema),
  z.object({ type: z.literal('academics') }).merge(AcademicsEventSchema)
]);

// Type exports
export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type TravelEvent = z.infer<typeof TravelEventSchema>;
export type HealthEvent = z.infer<typeof HealthEventSchema>;
export type PetsEvent = z.infer<typeof PetsEventSchema>;
export type AcademicsEvent = z.infer<typeof AcademicsEventSchema>;
export type UnifiedEvent = z.infer<typeof UnifiedEventSchema>;

// Validation helpers
export function validateEvent(data: unknown, type: 'general' | 'travel' | 'health' | 'pets' | 'academics') {
  const baseData = (typeof data === 'object' && data !== null) ? data as Record<string, unknown> : {};
  const dataWithType = { ...baseData, type };
  return UnifiedEventSchema.safeParse(dataWithType);
}

export function validateBaseEvent(data: unknown) {
  return BaseEventSchema.safeParse(data);
}

// API payload validation schemas (for incoming requests)
export const CalendarEventCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  start_time: datetimeString,
  end_time: datetimeString,
  all_day: z.boolean().default(false),
  location: z.string().optional(),
  is_virtual: z.boolean().default(false),
  virtual_link: z.string().url().optional().nullable(),
  category: z.string().optional(),
  source: z.string().optional(),
  source_reference: z.string().optional(),
  attendees: z.array(z.string().uuid()).optional(),
  google_calendar_id: z.string().nullable().optional(),
  reminder_minutes: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  due_date: datetimeString.optional(),
  status: z.enum(['active', 'draft', 'completed']).default('active'),
  assigned_to: z.array(z.string().uuid()).optional(),
  document_ids: z.array(z.string().uuid()).optional(),
  links: z.array(z.string().url()).optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export const PasswordCreateSchema = z.object({
  name: z.string().min(1).max(255),
  website: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
  category: z.string(),
  source: z.string(),
  source_reference: z.string(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});
