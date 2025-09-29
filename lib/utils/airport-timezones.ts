// Minimal IATA -> IANA timezone mapping with sensible defaults
// Extend as needed; unknown codes fall back to America/New_York
const IATA_TZ: Record<string, string> = {
  JFK: 'America/New_York', LGA: 'America/New_York', EWR: 'America/New_York',
  BOS: 'America/New_York', PHL: 'America/New_York', MIA: 'America/New_York',
  ORD: 'America/Chicago', MDW: 'America/Chicago', DFW: 'America/Chicago', IAH: 'America/Chicago',
  DEN: 'America/Denver', PHX: 'America/Phoenix', SLC: 'America/Denver',
  LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SAN: 'America/Los_Angeles', SEA: 'America/Los_Angeles', PDX: 'America/Los_Angeles',
  LAS: 'America/Los_Angeles', HNL: 'Pacific/Honolulu', ANC: 'America/Anchorage',
  LHR: 'Europe/London', CDG: 'Europe/Paris', FRA: 'Europe/Berlin', AMS: 'Europe/Amsterdam',
  NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', ICN: 'Asia/Seoul', SIN: 'Asia/Singapore',
  DXB: 'Asia/Dubai', DOH: 'Asia/Qatar', SYD: 'Australia/Sydney', AKL: 'Pacific/Auckland'
};

export function getTimezoneForAirport(input: string): string {
  if (!input) return 'America/New_York';
  // Accept code like "JFK" or strings like "New York (JFK)"
  const codeMatch = input.match(/\b([A-Z]{3})\b/);
  const code = (codeMatch ? codeMatch[1] : input).toUpperCase();
  return IATA_TZ[code] || 'America/New_York';
}

