export interface TravelTrip {
  id: string;
  destination: string;
  start_date: string;
  end_date: string;
  travelers: string[];
  traveler_names: string[];
  hotel_name?: string;
  hotel_confirmation?: string;
  hotel_address?: string;
  hotel_check_in?: string;
  hotel_check_out?: string;
  status: 'planning' | 'confirmed' | 'completed' | 'cancelled';
  total_cost?: number;
  currency: string;
  purpose?: string;
  notes?: string;
  color: string;
  is_archived: boolean;
  google_calendar_id?: string; // Google Calendar to sync trip to
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type TransportType = 'flight' | 'ferry' | 'train' | 'car_rental' | 'private_driver' | 'helicopter' | 'other';

export type ContactType = 'driver' | 'airline' | 'hotel' | 'car_rental' | 'other';

export interface TravelContact {
  id: string;
  name: string;
  contact_type?: ContactType;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  metadata?: Record<string, any>;
  is_preferred?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TravelDetail {
  id: string;
  trip_id?: string;
  type: TransportType;
  travel_date?: string;
  travelers: string[];
  traveler_names: string[];
  provider?: string;
  confirmation_number?: string;
  departure_location?: string;
  arrival_location?: string;
  departure_time?: string;
  arrival_time?: string;
  airline?: string;
  flight_number?: string;
  train_number?: string;
  departure_airport?: string;
  arrival_airport?: string;
  vehicle_info?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TravelDocument {
  id: string;
  user_id: string;
  trip_id?: string;
  document_type: 'passport' | 'visa' | 'ticket' | 'insurance' | 'itinerary' | 'other';
  document_name: string;
  document_number?: string;
  expiry_date?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface TravelPreferences {
  id: string;
  user_id: string;
  seat_preference?: string;
  meal_preference?: string;
  airline_preference?: string;
  hotel_chain_preference?: string;
  loyalty_programs?: Record<string, any>;
  passport_number?: string;
  passport_expiry?: string;
  passport_country?: string;
  airline_programs?: Record<string, any>;
  hotel_programs?: Record<string, any>;
  tsa_precheck?: string;
  global_entry?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  created_at: string;
  updated_at: string;
}

export interface TripWithDetails extends TravelTrip {
  travel_details?: TravelDetail[];
  documents?: TravelDocument[];
}
