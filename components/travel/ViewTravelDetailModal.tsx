import { Plane, Train, Car, Ship, Globe, Ticket, X, Calendar, Clock, MapPin, Users } from 'lucide-react';
import type { TravelDetail, TravelTrip } from '@/types/travel';
import { formatTimeOnly, resolveTravelDateTimes, toDateTime } from '@/lib/travel-date-helpers';

export type GoogleCalendarSummary = {
  google_calendar_id?: string | null;
  id?: string | null;
  name?: string | null;
};

export type TravelDetailExtended = TravelDetail & {
  departure_date?: string | null;
  departure_datetime?: string | null;
  arrival_date?: string | null;
  arrival_datetime?: string | null;
  seat?: string | null;
  cabin_class?: string | null;
  travel_class?: string | null;
  metadata?: Record<string, unknown> | null;
  calendar_event?: {
    google_calendar_id?: string | null;
  } | null;
  google_calendar_id?: string | null;
  googleCalendarId?: string | null;
  origin?: string | null;
  destination?: string | null;
};

export interface ViewTravelDetailModalProps {
  detail: TravelDetailExtended;
  trips: TravelTrip[];
  travelerNames: string[];
  googleCalendars?: GoogleCalendarSummary[];
  onClose: () => void;
}

export function ViewTravelDetailModal({
  detail,
  trips,
  travelerNames,
  googleCalendars = [],
  onClose,
}: ViewTravelDetailModalProps) {
  const relatedTrip = trips.find(t => t.id === detail.trip_id);
  const typeLabel = (detail.type || 'Travel').replace(/_/g, ' ');
  const { departureDate, departureTime, arrivalDate, arrivalTime } = resolveTravelDateTimes(detail as any);

  const formatDateTimeLong = (date?: string | null, time?: string | null) => {
    if (!date && !time) return '';
    if (date && time) {
      const dt = toDateTime(date, time);
      if (dt) {
        let formatted = new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        }).format(dt);
        formatted = formatted.replace(' AM', 'AM').replace(' PM', 'PM');
        return formatted;
      }
    }
    if (date) {
      const dt = toDateTime(date, null);
      if (dt) {
        return new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).format(dt);
      }
      return date;
    }
    return formatTimeOnly(undefined, time, true);
  };

  const departureLocation = detail.departure_airport || detail.departure_location || detail.origin || '';
  const arrivalLocation = detail.arrival_airport || detail.arrival_location || detail.destination || '';
  const departureDisplay = formatDateTimeLong(departureDate, departureTime);
  const arrivalDisplay = formatDateTimeLong(arrivalDate, arrivalTime);

  const summaryTitle = (() => {
    const airline = detail.airline ? detail.airline.trim() : '';
    const flight = detail.flight_number ? String(detail.flight_number).toUpperCase() : '';
    if (airline || flight) return `${airline}${airline && flight ? ' ' : ''}${flight}`.trim();
    if (detail.provider) return detail.provider;
    if (departureLocation && arrivalLocation) return `${departureLocation} → ${arrivalLocation}`;
    return `${typeLabel} Detail`;
  })();

  const metadata = detail.metadata && typeof detail.metadata === 'object' ? detail.metadata as Record<string, unknown> : undefined;
  const calendarEvent = detail.calendar_event && typeof detail.calendar_event === 'object'
    ? detail.calendar_event
    : undefined;

  let calendarId: string | null = null;
  if (typeof detail.google_calendar_id === 'string' && detail.google_calendar_id) {
    calendarId = detail.google_calendar_id;
  } else if (typeof detail.googleCalendarId === 'string' && detail.googleCalendarId) {
    calendarId = detail.googleCalendarId;
  } else if (metadata) {
    const metaCal = metadata['google_calendar_id'];
    if (typeof metaCal === 'string' && metaCal) {
      calendarId = metaCal;
    }
  }
  if (!calendarId && calendarEvent) {
    const eventCal = calendarEvent.google_calendar_id;
    if (typeof eventCal === 'string' && eventCal) {
      calendarId = eventCal;
    }
  }

  const calendarDisplayName = calendarId
    ? (() => {
        const match = googleCalendars.find(cal => (cal.google_calendar_id || cal.id) === calendarId);
        return match?.name || 'Google Calendar';
      })()
    : null;

  const infoItems = [
    { label: 'Travel Type', value: typeLabel },
    relatedTrip ? { label: 'Trip', value: relatedTrip.destination } : null,
    detail.confirmation_number ? { label: 'Confirmation', value: detail.confirmation_number } : null,
    detail.provider ? { label: 'Provider', value: detail.provider } : null,
    detail.seat ? { label: 'Seat', value: detail.seat } : null,
    detail.cabin_class || detail.travel_class
      ? { label: 'Class', value: detail.cabin_class || detail.travel_class }
      : null,
    travelerNames.length > 0
      ? { label: 'Assigned To', value: travelerNames.join(', ') }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const TypeIcon = ({ large }: { large?: boolean }) => {
    const size = large ? 'h-6 w-6' : 'h-5 w-5';
    const t = (detail.type || '').toLowerCase();
    if (t === 'flight' || t === 'helicopter') return <Plane className={`${size} text-blue-300`} />;
    if (t === 'train') return <Train className={`${size} text-blue-300`} />;
    if (t === 'car_rental' || t === 'private_driver') return <Car className={`${size} text-blue-300`} />;
    if (t === 'ferry') return <Ship className={`${size} text-blue-300`} />;
    return <Globe className={`${size} text-blue-300`} />;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-background-secondary rounded-2xl w-full max-w-3xl border border-gray-600/30 overflow-hidden" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-600/30 bg-background-secondary">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/10 text-blue-300 p-3"><TypeIcon large /></div>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">{summaryTitle}</h2>
              {(departureDisplay || arrivalDisplay) && (
                <p className="text-sm text-text-muted">
                  {departureDisplay ? `Departs ${departureDisplay}` : 'Schedule forthcoming'}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-text-muted hover:text-text-primary hover:bg-gray-700/30 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-500/10 text-blue-300 p-2">
                <Ticket className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-text-muted uppercase tracking-wide">Overview</p>
                <p className="text-sm text-text-primary mt-1">
                  {departureLocation && arrivalLocation
                    ? `${departureLocation} → ${arrivalLocation}`
                    : travellerOrType(typeLabel, travelerNames)}
                </p>
              </div>
            </div>
            {infoItems.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3 text-sm">
                {infoItems.map(item => (
                  <div key={item.label}>
                    <p className="text-xs uppercase tracking-wide text-text-muted">{item.label}</p>
                    <p className="text-text-primary mt-1 break-words">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                <p className="text-xs text-text-muted uppercase">Calendar Sync</p>
                <p className="text-sm text-text-primary mt-1">
                  {calendarId ? calendarDisplayName : 'Not synced to Google Calendar'}
                </p>
              </div>
              {calendarId && (
                <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                  <p className="text-xs text-text-muted uppercase">Calendar ID</p>
                  <p className="text-xs text-text-muted mt-1 break-all">{calendarId}</p>
                </div>
              )}
            </div>
          </div>

          {(departureDisplay || arrivalDisplay) && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-300" /> Schedule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {departureDisplay && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                    <p className="text-xs text-text-muted uppercase flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-300" /> Departure
                    </p>
                    <p className="mt-2 text-sm text-text-primary font-medium">{departureLocation || 'TBD'}</p>
                    <p className="text-xs text-text-muted mt-1">{departureDisplay}</p>
                  </div>
                )}
                {arrivalDisplay && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                    <p className="text-xs text-text-muted uppercase flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-300" /> Arrival
                    </p>
                    <p className="mt-2 text-sm text-text-primary font-medium">{arrivalLocation || 'TBD'}</p>
                    <p className="text-xs text-text-muted mt-1">{arrivalDisplay}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {travelerNames.length > 0 && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-300" /> Assigned To
              </h3>
              <div className="flex flex-wrap gap-2">
                {travelerNames.map(name => (
                  <span key={name} className="px-3 py-1 text-sm rounded-full bg-[#2A2A28] border border-[#3A3A38] text-text-primary">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {detail.notes && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Notes</h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{detail.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function travellerOrType(defaultLabel: string, names: string[]) {
    if (names.length === 0) return defaultLabel;
    if (names.length === 1) return `${names[0]}'s ${defaultLabel}`;
    if (names.length === 2) return `${names[0]} & ${names[1]} — ${defaultLabel}`;
    return `${names[0]}, ${names[1]} +${names.length - 2} — ${defaultLabel}`;
  }
}
