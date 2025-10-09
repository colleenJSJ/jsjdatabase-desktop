/**
 * Zod validation schemas for Travel data
 */

import { z } from 'zod';

// Transport types enum
export const TransportTypeSchema = z.enum([
  'flight',
  'train',
  'car_rental',
  'ferry',
  'private_driver',
  'helicopter',
  'other',
]);

// Trip status enum
export const TripStatusSchema = z.enum([
  'planning',
  'confirmed',
  'completed',
  'cancelled',
]);

// Contact type enum
export const ContactTypeSchema = z.enum([
  'airline',
  'hotel',
  'car_rental',
  'tour_operator',
  'restaurant',
  'emergency',
  'other',
]);

// Travel Trip schema
export const TravelTripSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Trip name is required').max(100),
  destination: z.string().optional().nullable(),
  start_date: z.string().or(z.date()).optional().nullable(),
  end_date: z.string().or(z.date()).optional().nullable(),
  purpose: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  status: TripStatusSchema.optional(),
  is_archived: z.boolean().optional(),
  total_cost: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  trip_type: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  traveler_names: z.array(z.string()).optional(),
  traveler_ids: z.array(z.string().uuid('Invalid traveler id')).optional(),
  calendar_event_id: z.string().uuid().optional().nullable(),
  google_calendar_id: z.string().optional().nullable(),
  created_by: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Travel Detail schema
export const TravelDetailSchema = z.object({
  id: z.string().uuid().optional(),
  trip_id: z.string().uuid().optional().nullable(),
  type: TransportTypeSchema.optional(),
  travel_date: z.string().or(z.date()),
  departure_time: z.string().optional().nullable(),
  arrival_time: z.string().optional().nullable(),
  confirmation_number: z.string().optional().nullable(),
  details: z.record(z.string(), z.any()).optional().nullable(),
  travelers: z.array(z.string().uuid('Invalid traveler id')).optional(),
  document_ids: z.array(z.string().uuid('Invalid document id')).optional(),
  traveler_names: z.array(z.string()).optional(),
  provider: z.string().optional().nullable(),
  airline: z.string().optional().nullable(),
  flight_number: z.string().optional().nullable(),
  departure_airport: z.string().optional().nullable(),
  arrival_airport: z.string().optional().nullable(),
  departure_location: z.string().optional().nullable(),
  arrival_location: z.string().optional().nullable(),
  seat_assignments: z.record(z.string(), z.any()).optional().nullable(),
  booking_reference: z.string().optional().nullable(),
  cost: z.number().optional().nullable(),
  status: z.string().optional().nullable(),
  vehicle_info: z.record(z.string(), z.any()).optional().nullable(),
  duration_minutes: z.number().optional().nullable(),
  distance_km: z.number().optional().nullable(),
  created_by: z.string().uuid().optional().nullable(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  is_archived: z.boolean().optional(),
});

// Travel Accommodation schema
export const TravelAccommodationSchema = z.object({
  id: z.string().uuid().optional(),
  trip_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1, 'Accommodation name is required'),
  type: z.string().optional().nullable(),
  confirmation_number: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  check_in: z.string().or(z.date()).optional().nullable(),
  check_out: z.string().or(z.date()).optional().nullable(),
  cost: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  room_type: z.string().optional().nullable(),
  amenities: z.record(z.string(), z.any()).optional().nullable(),
  contact_info: z.record(z.string(), z.any()).optional().nullable(),
  notes: z.string().optional().nullable(),
  created_by: z.string().uuid().optional().nullable(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Travel Contact schema
export const TravelContactSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Contact name is required'),
  type: ContactTypeSchema,
  phone: z.string().optional().nullable(),
  email: z.string().email('Invalid email').optional().nullable(),
  website: z.string().url('Invalid URL').optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  is_emergency: z.boolean().default(false),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Travel Preferences schema
export const TravelPreferencesSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  passport_number: z.string().optional().nullable(),
  passport_expiry: z.string().or(z.date()).optional().nullable(),
  tsa_precheck: z.string().optional().nullable(),
  seat_preference: z.string().optional().nullable(),
  meal_preference: z.string().optional().nullable(),
  loyalty_programs: z.record(z.string(), z.any()).optional().nullable(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Document parsing schema (for smart import)
export const ParsedTravelDocumentSchema = z.object({
  type: z.enum(['flight', 'hotel', 'car_rental', 'itinerary', 'other']),
  confidence: z.number().min(0).max(1),
  extracted_data: z.object({
    trips: z.array(TravelTripSchema).optional(),
    details: z.array(TravelDetailSchema).optional(),
    accommodations: z.array(TravelAccommodationSchema).optional(),
    contacts: z.array(TravelContactSchema).optional(),
    raw_text: z.string().optional(),
  }),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

// Validation helpers
export function validateTravelTrip(data: unknown) {
  return TravelTripSchema.safeParse(data);
}

export function validateTravelDetail(data: unknown) {
  return TravelDetailSchema.safeParse(data);
}

export function validateTravelAccommodation(data: unknown) {
  return TravelAccommodationSchema.safeParse(data);
}

export function validateTravelContact(data: unknown) {
  return TravelContactSchema.safeParse(data);
}

export function validateTravelPreferences(data: unknown) {
  return TravelPreferencesSchema.safeParse(data);
}

// Type exports
export type TravelTrip = z.infer<typeof TravelTripSchema>;
export type TravelDetail = z.infer<typeof TravelDetailSchema>;
export type TravelAccommodation = z.infer<typeof TravelAccommodationSchema>;
export type TravelContact = z.infer<typeof TravelContactSchema>;
export type TravelPreferences = z.infer<typeof TravelPreferencesSchema>;
export type ParsedTravelDocument = z.infer<typeof ParsedTravelDocumentSchema>;
