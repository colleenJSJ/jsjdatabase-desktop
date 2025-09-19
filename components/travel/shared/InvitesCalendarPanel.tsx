'use client';

export function InvitesCalendarPanel({
  doNotSendInvite,
  onDoNotSendInviteChange,
  googleCalendars,
  selectedCalendarId,
  onCalendarChange,
  saveLocalOnly,
  onSaveLocalOnlyChange,
}: {
  doNotSendInvite: boolean;
  onDoNotSendInviteChange: (v: boolean) => void;
  googleCalendars: any[];
  selectedCalendarId: string | null;
  onCalendarChange: (v: string) => void;
  saveLocalOnly: boolean;
  onSaveLocalOnlyChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <input type="checkbox" className="mr-2" checked={doNotSendInvite} onChange={e=>onDoNotSendInviteChange(e.target.checked)} /> Do not send invite
      </label>
      {googleCalendars.length > 0 && !saveLocalOnly && (
        <label className="block text-sm">Google Calendar
          <select value={selectedCalendarId || ''} onChange={e=>onCalendarChange(e.target.value)} className="mt-1 w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded text-text-primary">
            {googleCalendars.map((c: any) => (
              <option key={c.google_calendar_id || c.id} value={c.google_calendar_id || c.id}>{c.summary || c.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <input type="checkbox" className="mr-2" checked={saveLocalOnly} onChange={e=>onSaveLocalOnlyChange(e.target.checked)} /> Save locally only
      </label>
    </div>
  );
}

