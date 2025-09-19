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
  destination: z.string().min(1, 'Destination is required'),
  start_date: z.string().datetime().or(z.date()),
  end_date: z.string().datetime().or(z.date()),
  status: TripStatusSchema.default('planning'),
  budget: z.number().positive().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  created_by: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Travel Detail schema
export const TravelDetailSchema = z.object({
  id: z.string().uuid().optional(),
  trip_id: z.string().uuid().nullable().optional(),
  transport_type: TransportTypeSchema,
  departure_location: z.string().min(1, 'Departure location is required'),
  arrival_location: z.string().min(1, 'Arrival location is required'),
  departure_time: z.string().datetime().or(z.date()),
  arrival_time: z.string().datetime().or(z.date()).optional().nullable(),
  carrier: z.string().max(100).optional().nullable(),
  flight_number: z.string().max(20).optional().nullable(),
  train_number: z.string().max(20).optional().nullable(),
  booking_reference: z.string().max(50).optional().nullable(),
  seat_number: z.string().max(10).optional().nullable(),
  cost: z.number().positive().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  status: z.enum(['booked', 'confirmed', 'cancelled', 'completed']).default('booked'),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Travel Accommodation schema
export const TravelAccommodationSchema = z.object({
  id: z.string().uuid().optional(),
  trip_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Accommodation name is required'),
  address: z.string().min(1, 'Address is required'),
  check_in_date: z.string().datetime().or(z.date()),
  check_out_date: z.string().datetime().or(z.date()),
  booking_reference: z.string().max(50).optional().nullable(),
  room_type: z.string().max(50).optional().nullable(),
  cost_per_night: z.number().positive().optional().nullable(),
  total_cost: z.number().positive().optional().nullable(),
  amenities: z.array(z.string()).optional().default([]),
  notes: z.string().max(500).optional().nullable(),
  status: z.enum(['booked', 'confirmed', 'cancelled', 'completed']).default('booked'),
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
  user_id: z.string().uuid().optional(),
  family_member_id: z.string().uuid().optional().nullable(),
  passport_number: z.string().max(20).optional().nullable(),
  passport_expiry: z.string().datetime().or(z.date()).optional().nullable(),
  tsa_precheck: z.string().max(20).optional().nullable(),
  global_entry: z.string().max(20).optional().nullable(),
  seat_preference: z.enum(['window', 'aisle', 'middle', 'no_preference']).optional().nullable(),
  meal_preference: z.string().max(100).optional().nullable(),
  airline_memberships: z.array(z.object({
    airline: z.string(),
    number: z.string(),
    status: z.string().optional(),
  })).optional().default([]),
  hotel_memberships: z.array(z.object({
    chain: z.string(),
    number: z.string(),
    status: z.string().optional(),
  })).optional().default([]),
  medical_conditions: z.string().max(500).optional().nullable(),
  emergency_contact_name: z.string().max(100).optional().nullable(),
  emergency_contact_phone: z.string().max(20).optional().nullable(),
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