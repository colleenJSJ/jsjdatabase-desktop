export function validateTravelSegment(fields: {
  departureAirport?: string;
  arrivalAirport?: string;
  endDate?: string;
  endTime?: string;
}): { valid: boolean; error?: string } {
  const dep = (fields.departureAirport || '').trim();
  const arr = (fields.arrivalAirport || '').trim();
  if (!dep || !arr) {
    return { valid: false, error: 'Please select both departure and arrival airports' };
  }
  // End time is required in our travel flows
  const et = (fields.endTime || '').trim();
  if (!et) {
    return { valid: false, error: 'Travel events require an end time' };
  }
  return { valid: true };
}

