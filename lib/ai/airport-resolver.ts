/**
 * Airport IATA code to full name resolver
 * Provides full airport names for autocomplete compatibility
 */

// Common airports with full names and IATA codes
const AIRPORT_DATABASE: Record<string, { name: string; city: string; country: string }> = {
  // North America - USA
  JFK: { name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA' },
  LGA: { name: 'LaGuardia Airport', city: 'New York', country: 'USA' },
  EWR: { name: 'Newark Liberty International Airport', city: 'Newark', country: 'USA' },
  LAX: { name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA' },
  SFO: { name: 'San Francisco International Airport', city: 'San Francisco', country: 'USA' },
  ORD: { name: "O'Hare International Airport", city: 'Chicago', country: 'USA' },
  MDW: { name: 'Chicago Midway International Airport', city: 'Chicago', country: 'USA' },
  ATL: { name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', country: 'USA' },
  DFW: { name: 'Dallas/Fort Worth International Airport', city: 'Dallas', country: 'USA' },
  DEN: { name: 'Denver International Airport', city: 'Denver', country: 'USA' },
  SEA: { name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'USA' },
  BOS: { name: 'Logan International Airport', city: 'Boston', country: 'USA' },
  MIA: { name: 'Miami International Airport', city: 'Miami', country: 'USA' },
  MCO: { name: 'Orlando International Airport', city: 'Orlando', country: 'USA' },
  LAS: { name: 'Harry Reid International Airport', city: 'Las Vegas', country: 'USA' },
  PHX: { name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', country: 'USA' },
  IAH: { name: 'George Bush Intercontinental Airport', city: 'Houston', country: 'USA' },
  PHL: { name: 'Philadelphia International Airport', city: 'Philadelphia', country: 'USA' },
  SAN: { name: 'San Diego International Airport', city: 'San Diego', country: 'USA' },
  TPA: { name: 'Tampa International Airport', city: 'Tampa', country: 'USA' },
  PDX: { name: 'Portland International Airport', city: 'Portland', country: 'USA' },
  MSP: { name: 'Minneapolis-Saint Paul International Airport', city: 'Minneapolis', country: 'USA' },
  DTW: { name: 'Detroit Metropolitan Wayne County Airport', city: 'Detroit', country: 'USA' },
  SLC: { name: 'Salt Lake City International Airport', city: 'Salt Lake City', country: 'USA' },
  DCA: { name: 'Ronald Reagan Washington National Airport', city: 'Washington', country: 'USA' },
  IAD: { name: 'Washington Dulles International Airport', city: 'Washington', country: 'USA' },
  BWI: { name: 'Baltimore/Washington International Thurgood Marshall Airport', city: 'Baltimore', country: 'USA' },
  
  // Canada
  YYZ: { name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'Canada' },
  YVR: { name: 'Vancouver International Airport', city: 'Vancouver', country: 'Canada' },
  YUL: { name: 'Montreal-Pierre Elliott Trudeau International Airport', city: 'Montreal', country: 'Canada' },
  YYC: { name: 'Calgary International Airport', city: 'Calgary', country: 'Canada' },
  
  // Mexico
  MEX: { name: 'Mexico City International Airport', city: 'Mexico City', country: 'Mexico' },
  CUN: { name: 'Cancún International Airport', city: 'Cancún', country: 'Mexico' },
  GDL: { name: 'Miguel Hidalgo y Costilla Guadalajara International Airport', city: 'Guadalajara', country: 'Mexico' },
  
  // Central America
  SJO: { name: 'Juan Santamaría International Airport', city: 'San José', country: 'Costa Rica' },
  PTY: { name: 'Tocumen International Airport', city: 'Panama City', country: 'Panama' },
  GUA: { name: 'La Aurora International Airport', city: 'Guatemala City', country: 'Guatemala' },
  
  // Caribbean
  SJU: { name: 'Luis Muñoz Marín International Airport', city: 'San Juan', country: 'Puerto Rico' },
  MBJ: { name: 'Sangster International Airport', city: 'Montego Bay', country: 'Jamaica' },
  PUJ: { name: 'Punta Cana International Airport', city: 'Punta Cana', country: 'Dominican Republic' },
  NAS: { name: 'Lynden Pindling International Airport', city: 'Nassau', country: 'Bahamas' },
  
  // Europe
  LHR: { name: 'Heathrow Airport', city: 'London', country: 'UK' },
  LGW: { name: 'Gatwick Airport', city: 'London', country: 'UK' },
  CDG: { name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France' },
  ORY: { name: 'Orly Airport', city: 'Paris', country: 'France' },
  FRA: { name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany' },
  MUC: { name: 'Munich Airport', city: 'Munich', country: 'Germany' },
  AMS: { name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'Netherlands' },
  MAD: { name: 'Adolfo Suárez Madrid-Barajas Airport', city: 'Madrid', country: 'Spain' },
  BCN: { name: 'Barcelona-El Prat Airport', city: 'Barcelona', country: 'Spain' },
  FCO: { name: 'Leonardo da Vinci-Fiumicino Airport', city: 'Rome', country: 'Italy' },
  MXP: { name: 'Milan Malpensa Airport', city: 'Milan', country: 'Italy' },
  ZRH: { name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland' },
  VIE: { name: 'Vienna International Airport', city: 'Vienna', country: 'Austria' },
  CPH: { name: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark' },
  OSL: { name: 'Oslo Airport', city: 'Oslo', country: 'Norway' },
  ARN: { name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'Sweden' },
  HEL: { name: 'Helsinki-Vantaa Airport', city: 'Helsinki', country: 'Finland' },
  DUB: { name: 'Dublin Airport', city: 'Dublin', country: 'Ireland' },
  LIS: { name: 'Humberto Delgado Airport', city: 'Lisbon', country: 'Portugal' },
  ATH: { name: 'Athens International Airport', city: 'Athens', country: 'Greece' },
  IST: { name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey' },
  
  // Asia
  NRT: { name: 'Narita International Airport', city: 'Tokyo', country: 'Japan' },
  HND: { name: 'Haneda Airport', city: 'Tokyo', country: 'Japan' },
  KIX: { name: 'Kansai International Airport', city: 'Osaka', country: 'Japan' },
  ICN: { name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea' },
  PEK: { name: 'Beijing Capital International Airport', city: 'Beijing', country: 'China' },
  PVG: { name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'China' },
  HKG: { name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong' },
  TPE: { name: 'Taiwan Taoyuan International Airport', city: 'Taipei', country: 'Taiwan' },
  SIN: { name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore' },
  BKK: { name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand' },
  KUL: { name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia' },
  CGK: { name: 'Soekarno-Hatta International Airport', city: 'Jakarta', country: 'Indonesia' },
  MNL: { name: 'Ninoy Aquino International Airport', city: 'Manila', country: 'Philippines' },
  DEL: { name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'India' },
  BOM: { name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India' },
  
  // Middle East
  DXB: { name: 'Dubai International Airport', city: 'Dubai', country: 'UAE' },
  AUH: { name: 'Abu Dhabi International Airport', city: 'Abu Dhabi', country: 'UAE' },
  DOH: { name: 'Hamad International Airport', city: 'Doha', country: 'Qatar' },
  TLV: { name: 'Ben Gurion Airport', city: 'Tel Aviv', country: 'Israel' },
  LOS: { name: 'Murtala Muhammed International Airport', city: 'Lagos', country: 'Nigeria' },
  
  // Oceania
  SYD: { name: 'Sydney Airport', city: 'Sydney', country: 'Australia' },
  MEL: { name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia' },
  BNE: { name: 'Brisbane Airport', city: 'Brisbane', country: 'Australia' },
  AKL: { name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand' },
  
  // South America
  GRU: { name: 'São Paulo–Guarulhos International Airport', city: 'São Paulo', country: 'Brazil' },
  GIG: { name: 'Rio de Janeiro–Galeão International Airport', city: 'Rio de Janeiro', country: 'Brazil' },
  EZE: { name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', country: 'Argentina' },
  SCL: { name: 'Arturo Merino Benítez International Airport', city: 'Santiago', country: 'Chile' },
  BOG: { name: 'El Dorado International Airport', city: 'Bogotá', country: 'Colombia' },
  LIM: { name: 'Jorge Chávez International Airport', city: 'Lima', country: 'Peru' },
  
  // Africa
  JNB: { name: 'O.R. Tambo International Airport', city: 'Johannesburg', country: 'South Africa' },
  CPT: { name: 'Cape Town International Airport', city: 'Cape Town', country: 'South Africa' },
  CAI: { name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt' },
  NBO: { name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country: 'Kenya' },
  ADD: { name: 'Addis Ababa Bole International Airport', city: 'Addis Ababa', country: 'Ethiopia' },
};

/**
 * Convert IATA code to full airport name for autocomplete
 * Returns format: "Airport Name (IATA)" or just the code if not found
 */
export function resolveAirportCode(iataCode: string): string {
  if (!iataCode) return '';
  
  const code = iataCode.toUpperCase().trim();
  const airport = AIRPORT_DATABASE[code];
  
  if (airport) {
    // Format for Google Maps autocomplete: "Airport Name"
    // Some autocompletes prefer the full name without the code
    return airport.name;
  }
  
  // If not found, return the code as-is
  return code;
}

/**
 * Check if a string is likely an IATA code (3 uppercase letters)
 */
export function isIATACode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.toUpperCase().trim());
}

/**
 * Process airport field value for form filling
 * If it's an IATA code, resolve to full name
 * Otherwise, return as-is
 */
export function processAirportValue(value: string | undefined): string {
  if (!value) return '';
  
  // Check if it looks like an IATA code
  if (isIATACode(value)) {
    return resolveAirportCode(value);
  }
  
  // Already a full name or description
  return value;
}
