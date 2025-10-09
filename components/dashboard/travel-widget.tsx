'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { TravelTrip, TravelDetail } from '@/types/travel';
import { useUser } from '@/contexts/user-context';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { Plane, Hotel, CheckCircle, ChevronDown, ChevronUp, X, Train, Car, Ship, Globe, Copy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFamilyMembers } from '@/hooks/use-family-members';
import { usePreferences } from '@/contexts/preferences-context';
import { toInstantFromNaive, formatInstantInTimeZone } from '@/lib/utils/date-utils';
import { ViewTravelDetailModal } from '@/components/travel/ViewTravelDetailModal';
import { formatDateTime as formatTransportDateTime, formatTimeOnly as formatTransportTimeOnly, resolveTravelDateTimes } from '@/lib/travel-date-helpers';

const AIRPORT_TIMEZONE_MAP: Record<string, string> = {
  JFK: 'America/New_York', LGA: 'America/New_York', EWR: 'America/New_York',
  BOS: 'America/New_York', BWI: 'America/New_York', DCA: 'America/New_York',
  MIA: 'America/New_York', FLL: 'America/New_York', ATL: 'America/New_York',
  ORD: 'America/Chicago', DFW: 'America/Chicago', IAH: 'America/Chicago', AUS: 'America/Chicago',
  DEN: 'America/Denver', PHX: 'America/Phoenix',
  LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SAN: 'America/Los_Angeles', SEA: 'America/Los_Angeles',
  HNL: 'Pacific/Honolulu', ANC: 'America/Anchorage',
  LHR: 'Europe/London', LGW: 'Europe/London',
  CDG: 'Europe/Paris', AMS: 'Europe/Amsterdam', FRA: 'Europe/Berlin', MUC: 'Europe/Berlin',
  MAD: 'Europe/Madrid', BCN: 'Europe/Madrid', FCO: 'Europe/Rome',
};

function airportToTimezone(code?: string | null): string | undefined {
  if (!code) return undefined;
  return AIRPORT_TIMEZONE_MAP[code.toUpperCase()];
}

function formatTravelDateTime(
  date?: string | null,
  time?: string | null,
  airport?: string | null,
  viewerTimezone: string = 'UTC'
): string {
  if (!date && !time) return 'N/A';

  if (date && time) {
    const eventTz = airportToTimezone(airport) || viewerTimezone;
    const instant = toInstantFromNaive(`${date}T${time}`, eventTz);
    return formatInstantInTimeZone(instant, viewerTimezone, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  if (date) {
    const instant = toInstantFromNaive(`${date}T00:00:00`, viewerTimezone);
    return formatInstantInTimeZone(instant, viewerTimezone, {
      month: 'short',
      day: 'numeric',
    });
  }

  if (time) {
    const instant = toInstantFromNaive(`1970-01-01T${time}`, viewerTimezone);
    return formatInstantInTimeZone(instant, viewerTimezone, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  return 'N/A';
}

const transportTypeIcons: Record<string, LucideIcon> = {
  flight: Plane,
  train: Train,
  car_rental: Car,
  ferry: Ship,
  private_driver: Car,
  helicopter: Plane,
  other: Globe
};

export function TravelWidget() {
  const { user } = useUser();
  const { selectedPersonId, isLoading: personFilterLoading } = usePersonFilter();
  const [trips, setTrips] = useState<TravelTrip[]>([]);
  const [travelDetails, setTravelDetails] = useState<TravelDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<TravelTrip | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showDetailViewModal, setShowDetailViewModal] = useState(false);
  const [viewingDetail, setViewingDetail] = useState<TravelDetail | null>(null);
  
  // Get family members for resolving traveler names
  const { members: familyMembers } = useFamilyMembers({ includePets: true, includeExtended: true });
  const { preferences } = usePreferences();

  useEffect(() => {
    if (!user || personFilterLoading) return;

    fetchData();

    const interval = setInterval(() => {
      fetchData();
    }, 60000);

    return () => clearInterval(interval);
  }, [user, selectedPersonId, personFilterLoading]);

  const withSelectedPerson = (base: string) => {
    if (!selectedPersonId || selectedPersonId === 'all') return base;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}selected_person=${encodeURIComponent(selectedPersonId)}`;
  };

  const fetchData = async () => {
    try {
      const [tripsResponse, detailsResponse] = await Promise.all([
        fetch(withSelectedPerson('/api/trips')),
        fetch(withSelectedPerson('/api/travel-details'))
      ]);
      
      if (tripsResponse.ok) {
        const data = await tripsResponse.json();
        const upcomingTrips = data.trips.filter((trip: TravelTrip) => 
          new Date(trip.end_date) >= new Date() && !trip.is_archived
        );
        setTrips(upcomingTrips);
      }
      
      if (detailsResponse.ok) {
        const data = await detailsResponse.json();
        setTravelDetails(data.details || []);
      }
    } catch (error) {
      console.error('Failed to fetch travel data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUpcomingTravelDetails = () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // Today in YYYY-MM-DD format
    return travelDetails
      .filter(detail => {
        if (!detail.travel_date) return false;
        // Compare dates as strings to avoid timezone issues
        return detail.travel_date >= todayStr;
      })
      .sort((a, b) => {
        // Sort by string comparison which works for YYYY-MM-DD format
        return a.travel_date!.localeCompare(b.travel_date!);
      });
  };

  const getDaysUntilDetail = (detail: TravelDetail) => {
    if (!detail.travel_date) return null;
    const viewerTz = preferences.timezone;
    const todayInst = new Date();
    const detailInst = toInstantFromNaive(`${detail.travel_date}T00:00:00`, viewerTz);
    // Compare whole days in viewer TZ
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: viewerTz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const toYmd = (d: Date) => {
      const parts = formatter.formatToParts(d).reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') {
          acc[part.type] = part.value;
        }
        return acc;
      }, {});
      const year = parts.year ?? '0000';
      const month = parts.month ?? '00';
      const day = parts.day ?? '00';
      return `${year}-${month}-${day}`;
    };
    const ymdToday = toYmd(todayInst);
    const ymdDetail = toYmd(detailInst);
    const dateToday = new Date(ymdToday + 'T00:00:00');
    const dateDetail = new Date(ymdDetail + 'T00:00:00');
    const diffMs = dateDetail.getTime() - dateToday.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  // Helper function to format time string (HH:MM:SS) to readable format
  const formatTimeString = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Helper to format traveler names nicely
  const formatTravelerNames = (names: string[]): string => {
    if (!names || names.length === 0) return 'Travelers';
    const validNames = names.filter(name => name && name.trim());
    if (validNames.length === 0) return 'Travelers';
    if (validNames.length === 1) return validNames[0];
    if (validNames.length === 2) return `${validNames[0]} and ${validNames[1]}`;
    return `${validNames.slice(0, -1).join(', ')}, and ${validNames[validNames.length - 1]}`;
  };

  const resolveTravelerNames = (detail: TravelDetail): string[] => {
    if (detail.traveler_names && detail.traveler_names.length > 0) {
      return detail.traveler_names;
    }
    if (detail.travelers && detail.travelers.length > 0 && familyMembers) {
      return detail.travelers
        .map(uuid => familyMembers.find(member => member.id === uuid)?.name)
        .filter((name): name is string => Boolean(name && name.trim()));
    }
    return [];
  };

  // Generate simple title for travel detail
  const generateTravelTitle = (detail: TravelDetail): string => {
    const destination = detail.arrival_airport || 
                       detail.arrival_location || 
                       detail.departure_location ||
                       detail.departure_airport ||
                       'Destination';
                       
    switch (detail.type) {
      case 'flight':
        return `Flight to ${destination}`;
      case 'train':
        return `Train to ${destination}`;
      case 'car_rental':
        return `Car Rental in ${detail.departure_location || 'Location'}`;
      case 'ferry':
        return `Ferry to ${destination}`;
      case 'private_driver':
        return `Private Driver to ${destination}`;
      case 'helicopter':
        return `Helicopter to ${destination}`;
      case 'other':
        return `Travel to ${destination}`;
    }
  };

  // Generate natural language summary for travel detail
  const generateTravelSummary = (detail: TravelDetail): string => {
    const travelerNamesList = resolveTravelerNames(detail);

    const travelers = travelerNamesList.length > 0 
      ? formatTravelerNames(travelerNamesList)
      : 'Travelers';
      
    // Format date and time properly
    let departureDateTime = '';
    let arrivalDateTime = '';
    
    if (detail.travel_date) {
      const disp = formatTravelDateTime(detail.travel_date, detail.departure_time || null, detail.departure_airport || null, preferences.timezone);
      departureDateTime = disp ? `on ${disp}` : '';
    } else {
      // Without a date we cannot safely convert timezones; show raw time
      departureDateTime = detail.departure_time ? `at ${formatTimeString(detail.departure_time)}` : '';
    }
    
    if (detail.travel_date && detail.arrival_time) {
      const dispArr = formatTravelDateTime(detail.travel_date, detail.arrival_time, detail.arrival_airport || null, preferences.timezone);
      // Only show time portion for arrival
      const parts = dispArr.split(' ');
      arrivalDateTime = `at ${parts.slice(-2).join(' ')}`;
    }

    switch (detail.type) {
      case 'flight':
        const airline = detail.airline || 'the airline';
        const flightNum = detail.flight_number ? `Flight ${detail.flight_number}` : '';
        const fromAirport = detail.departure_airport || 'departure';
        const toAirport = detail.arrival_airport || 'destination';
        
        return `${travelers} will be flying on ${airline} ${flightNum} ${departureDateTime} from ${fromAirport} to ${toAirport}${arrivalDateTime ? `, landing ${arrivalDateTime}` : ''}`.trim();
        
      case 'car_rental':
        const vehicle = detail.vehicle_info || 'a vehicle';
        const provider = detail.provider || 'the rental company';
        const location = detail.departure_location || 'the rental location';
        
        return `${travelers} will pick up ${vehicle} from ${provider} ${departureDateTime} in ${location}`.trim();
        
      case 'train':
        const trainProvider = detail.provider || 'the train';
        const trainNum = detail.train_number ? `Train ${detail.train_number}` : '';
        const fromStation = detail.departure_location || 'departure';
        const toStation = detail.arrival_location || 'destination';
        
        return `${travelers} will be taking ${trainProvider} ${trainNum} ${departureDateTime} from ${fromStation} to ${toStation}${arrivalDateTime ? `, arriving ${arrivalDateTime}` : ''}`.trim();
        
      default:
        return `${travelers} will be traveling ${departureDateTime}`;
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl p-6" style={{ backgroundColor: '#2a2a29' }}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-600 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-600 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const upcomingDetails = getUpcomingTravelDetails();
  const displayedDetails = expanded ? upcomingDetails.slice(0, 5) : upcomingDetails.slice(0, 3);
  const hasMoreDetails = upcomingDetails.length > 3;

  if (upcomingDetails.length === 0) {
    return (
      <div className="rounded-xl p-6" style={{ backgroundColor: '#2a2a29' }}>
        <div className="flex items-center gap-2 mb-4">
          <Plane className="h-5 w-5 text-text-muted" />
          <h3 className="font-medium text-text-primary">Upcoming Travel</h3>
        </div>
        <p className="text-text-muted text-sm">No upcoming travel details</p>
      </div>
    );
  }

  const handleDetailClick = (detail: TravelDetail) => {
    setViewingDetail(detail);
    setShowDetailViewModal(true);
  };

  return (
    <div className="rounded-xl p-6" style={{ backgroundColor: '#2a2a29' }}>
      <div className="flex items-center gap-2 mb-4">
        <Plane className="h-5 w-5 text-text-muted" />
        <h3 className="font-medium text-text-primary">Upcoming Travel</h3>
      </div>

      {!collapsed && (
        <div className="space-y-3">
          {displayedDetails.map((detail) => {
            const relatedTrip = trips.find(t => t.id === detail.trip_id);
            const daysUntil = getDaysUntilDetail(detail);
            const { departureDate, departureTime, arrivalDate, arrivalTime } = resolveTravelDateTimes(detail as any);
            const badgeDate = departureDate ?? detail.travel_date ?? undefined;
            const badgeTime = departureTime ?? detail.departure_time ?? undefined;
            const departureBadge = formatTransportDateTime(badgeDate, badgeTime, {
              connector: '@',
              includeTimeZone: Boolean(badgeTime),
              timeZone: preferences.timezone,
            });

            const scheduleSegments: string[] = [];

            const departureLabel = departureTime
              ? formatTransportTimeOnly(departureDate, departureTime, false, preferences.timezone)
              : badgeDate
              ? formatTransportDateTime(badgeDate, null, { includeTimeZone: false, timeZone: preferences.timezone })
              : '';

            let arrivalLabel = '';
            if (arrivalTime) {
              const showFullDate = arrivalDate && departureDate && arrivalDate !== departureDate;
              arrivalLabel = showFullDate
                ? formatTransportDateTime(arrivalDate, arrivalTime, {
                    connector: 'at',
                    includeTimeZone: false,
                    timeZone: preferences.timezone,
                  })
                : formatTransportTimeOnly(arrivalDate, arrivalTime, false, preferences.timezone);
            } else if (arrivalDate && departureDate && arrivalDate !== departureDate) {
              arrivalLabel = formatTransportDateTime(arrivalDate, null, {
                includeTimeZone: false,
                timeZone: preferences.timezone,
              });
            }

            const includeDepartureSegment = Boolean(arrivalLabel) || !badgeTime;
            if (includeDepartureSegment && departureLabel) {
              scheduleSegments.push(`Depart ${departureLabel}`);
            }
            if (arrivalLabel) {
              scheduleSegments.push(`Arrive ${arrivalLabel}`);
            }

            const scheduleLine = scheduleSegments.length > 0 ? scheduleSegments.join(' • ') : null;

            const countdownLabel = daysUntil !== null && daysUntil >= 0
              ? daysUntil === 0
                ? 'Today'
                : daysUntil === 1
                  ? 'Tomorrow'
                  : `${daysUntil} days`
              : null;

            const contextLabels: Array<{ key: string; content: string; highlight?: boolean }> = [];
            if (relatedTrip) {
              contextLabels.push({ key: 'trip', content: `${relatedTrip.destination} Trip` });
            }
            if (countdownLabel) {
              contextLabels.push({ key: 'countdown', content: countdownLabel, highlight: true });
            }

            const contextNodes: ReactNode[] = [];
            contextLabels.forEach((label, index) => {
              if (index > 0) {
                contextNodes.push(
                  <span key={`sep-${label.key}`} className="text-xs text-text-muted/60">
                    •
                  </span>
                );
              }
              contextNodes.push(
                <span
                  key={label.key}
                  className={`text-xs ${label.highlight ? 'text-travel font-semibold' : 'text-text-muted/70'}`}
                >
                  {label.content}
                </span>
              );
            });
            
            return (
              <div 
                key={detail.id} 
                className="bg-background-secondary border border-gray-600/30 rounded-xl p-4 cursor-pointer hover:border-gray-500 transition-colors"
                onClick={() => handleDetailClick(detail)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Title with Date/Time aligned to the right */}
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-medium text-text-primary">
                        {generateTravelTitle(detail)}
                      </h3>
                      {departureBadge && (
                        <span className="text-xs text-text-muted whitespace-nowrap ml-2">
                          {departureBadge}
                        </span>
                      )}
                    </div>
                    {/* Natural Language Summary */}
                    <p className="text-sm text-text-muted">
                      {generateTravelSummary(detail)}
                    </p>
                    {scheduleLine && (
                      <div className="mt-2 text-xs text-text-muted">
                        {scheduleLine}
                      </div>
                    )}
                    {/* Context Information */}
                    {contextNodes.length > 0 && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {contextNodes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      <div className="flex items-center justify-between mt-4">
        {!collapsed && hasMoreDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                +{Math.min(2, upcomingDetails.length - 3)} more
              </>
            )}
          </button>
        )}
        
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors ml-auto"
        >
          {collapsed ? (
            <>
              <ChevronDown className="w-3 h-3" />
              Show travel
            </>
          ) : (
            <>
              <ChevronUp className="w-3 h-3" />
              Hide travel
            </>
          )}
        </button>
      </div>

      {/* Trip Details Modal */}
      {showTripModal && selectedTrip && (
        <TripDetailsModal
          trip={selectedTrip}
          travelDetails={travelDetails.filter(d => d.trip_id === selectedTrip.id)}
          onClose={() => {
            setShowTripModal(false);
            setSelectedTrip(null);
          }}
        />
      )}

      {/* View Travel Detail Modal */}
      {showDetailViewModal && viewingDetail && (
        <ViewTravelDetailModal
          detail={viewingDetail}
          trips={trips}
          travelerNames={resolveTravelerNames(viewingDetail)}
          googleCalendars={[]}
          onClose={() => {
            setShowDetailViewModal(false);
            setViewingDetail(null);
          }}
        />
      )}
    </div>
  );
}

// Trip Details Modal Component
function TripDetailsModal({ 
  trip, 
  travelDetails, 
  onClose 
}: { 
  trip: TravelTrip;
  travelDetails: TravelDetail[];
  onClose: () => void;
}) {
  const { preferences } = usePreferences();
  const formatDate = (dateString: string) => {
    const inst = toInstantFromNaive(`${dateString}T00:00:00`, preferences.timezone);
    return formatInstantInTimeZone(inst, preferences.timezone, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-600/30 sticky top-0 bg-background-secondary flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Plane className="w-8 h-8 text-blue-500" />
            <h2 className="text-xl font-semibold text-text-primary">
              Trip Details
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Trip Information Card */}
          <div className="bg-background-primary rounded-lg p-4">
            <h3 className="text-lg font-medium text-text-primary mb-3">Trip Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-text-muted">Destination</p>
                <p className="text-text-primary">{trip.destination}</p>
              </div>
              <div>
                <p className="text-sm text-text-muted">Trip Dates</p>
                <p className="text-text-primary">
                  {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                </p>
              </div>
              {trip.purpose && (
                <div>
                  <p className="text-sm text-text-muted">Purpose</p>
                  <p className="text-text-primary">{trip.purpose}</p>
                </div>
              )}
              {trip.status && (
                <div>
                  <p className="text-sm text-text-muted">Status</p>
                  <p className="text-text-primary capitalize flex items-center gap-1">
                    {trip.status === 'confirmed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {trip.status}
                  </p>
                </div>
              )}
              {trip.hotel_name && (
                <div className="col-span-2">
                  <p className="text-sm text-text-muted">Hotel</p>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(trip.hotel_name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                  >
                    <Hotel className="h-4 w-4" />
                    {trip.hotel_name}
                  </a>
                  {trip.hotel_confirmation && (
                    <p className="text-xs text-text-muted mt-1">
                      Confirmation: {trip.hotel_confirmation}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Transportation Details Card */}
          {travelDetails.length > 0 && (
            <div className="bg-background-primary rounded-xl p-4">
              <h3 className="text-lg font-medium text-text-primary mb-3">Transportation</h3>
              <div className="space-y-3">
                {travelDetails.map(detail => {
                  const Icon = transportTypeIcons[detail.type] || Globe;
                  return (
                    <div key={detail.id} className="border-l-2 border-blue-500/50 pl-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-text-primary capitalize">
                          {detail.type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {detail.type === 'flight' && (
                          <>
                            {detail.airline && (
                              <div>
                                <p className="text-xs text-text-muted">Airline</p>
                                <p className="text-text-primary">{detail.airline} {detail.flight_number || ''}</p>
                              </div>
                            )}
                            {detail.departure_airport && (
                              <div>
                                <p className="text-xs text-text-muted">Route</p>
                                <p className="text-text-primary">
                                  {detail.departure_airport} → {detail.arrival_airport || 'TBD'}
                                </p>
                              </div>
                            )}
                            {(detail.departure_time || detail.travel_date) && (
                              <div>
                                <p className="text-xs text-text-muted">Departure</p>
                                <p className="text-text-primary">
                                  {formatTravelDateTime(detail.travel_date, detail.departure_time, detail.departure_airport, preferences.timezone)}
                                </p>
                              </div>
                            )}
                            {detail.arrival_time && (
                              <div>
                                <p className="text-xs text-text-muted">Arrival</p>
                                <p className="text-text-primary">
                                  {formatTravelDateTime(detail.travel_date, detail.arrival_time, detail.arrival_airport, preferences.timezone)}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                        
                        {detail.type !== 'flight' && detail.provider && (
                          <div>
                            <p className="text-xs text-text-muted">Provider</p>
                            <p className="text-text-primary">{detail.provider}</p>
                          </div>
                        )}
                        
                        {detail.confirmation_number && (
                          <div>
                            <p className="text-xs text-text-muted">Confirmation</p>
                            <div className="flex items-center gap-2">
                              <p className="text-text-primary">{detail.confirmation_number}</p>
                              <button
                                onClick={() => navigator.clipboard.writeText(detail.confirmation_number || '')}
                                className="p-1 hover:bg-gray-700 rounded transition-colors"
                                title="Copy confirmation number"
                              >
                                <Copy className="w-3 h-3 text-text-muted" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Travelers Card */}
          {trip.traveler_names && trip.traveler_names.length > 0 && (
            <div className="bg-background-primary rounded-xl p-4">
              <h3 className="text-lg font-medium text-text-primary mb-3">Travelers</h3>
              <div className="flex flex-wrap gap-2">
                {trip.traveler_names.map((name, index) => (
                  <span key={index} className="px-3 py-1.5 bg-background-secondary border border-gray-600/30 rounded text-sm text-text-primary">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes Card */}
          {trip.notes && (
            <div className="bg-background-primary rounded-xl p-4">
              <h3 className="text-lg font-medium text-text-primary mb-3">Notes</h3>
              <p className="text-text-muted whitespace-pre-wrap">{trip.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
