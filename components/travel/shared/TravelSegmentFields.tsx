'use client';

import { AirportAutocomplete } from '@/components/ui/airport-autocomplete';
import { ContactAutocomplete } from '@/components/ui/contact-autocomplete';

export function TravelSegmentFields({
  airline, setAirline,
  flightNumber, setFlightNumber,
  departureAirport, setDepartureAirport,
  arrivalAirport, setArrivalAirport,
  disabled = false,
}: {
  airline: string;
  setAirline: (v: string) => void;
  flightNumber: string;
  setFlightNumber: (v: string) => void;
  departureAirport: string;
  setDepartureAirport: (v: string) => void;
  arrivalAirport: string;
  setArrivalAirport: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm">Airline
        <ContactAutocomplete
          value={airline}
          onChange={setAirline}
          filterType="airline"
          placeholder="Start typing airline..."
          className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary"
        />
      </label>
      <label className="block text-sm">Flight #
        <input
          disabled={disabled}
          value={flightNumber}
          onChange={e=>setFlightNumber(e.target.value)}
          className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary"
        />
      </label>
      <label className="block text-sm">Departure Airport
        <AirportAutocomplete
          value={departureAirport}
          onChange={setDepartureAirport}
          placeholder="Search departure airport (JFK, LAX, etc.)"
          className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary"
        />
      </label>
      <label className="block text-sm">Arrival Airport
        <AirportAutocomplete
          value={arrivalAirport}
          onChange={setArrivalAirport}
          placeholder="Search arrival airport"
          className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary"
        />
      </label>
    </div>
  );
}

