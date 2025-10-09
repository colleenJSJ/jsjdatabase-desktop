"use client";

import { useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/contexts/preferences-context";

// Lightweight set of common timezones; users can still type any IANA tz string
const COMMON_TZS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Hong_Kong",
  "Asia/Singapore",
];

function tzAbbrev(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return name;
  } catch {
    return tz;
  }
}

function formatNowInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }).format(new Date());
  } catch {
    return "--:--";
  }
}

export function TimezoneSelector() {
  const { preferences, updatePreferences } = usePreferences();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState<string>("");
  const [dismissedMismatch, setDismissedMismatch] = useState<boolean>(false);
  const [browserTz, setBrowserTz] = useState<string | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Set client signals only after mount to prevent hydration mismatches
    setMounted(true);
    try {
      setBrowserTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Update immediately when timezone changes, then refresh every 15s
    setNow(formatNowInTz(preferences.timezone));
    const i = setInterval(() => setNow(formatNowInTz(preferences.timezone)), 15_000);
    return () => clearInterval(i);
  }, [preferences.timezone, mounted]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMON_TZS;
    return COMMON_TZS.filter((z) => z.toLowerCase().includes(q));
  }, [query]);

  const currentAbbrev = tzAbbrev(preferences.timezone);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-700/50 text-text-primary"
        title="Change display timezone"
      >
        <span className="text-sm font-medium" suppressHydrationWarning>{mounted ? now : ''}</span>
        <span className="text-xs text-text-muted" suppressHydrationWarning>({currentAbbrev})</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-background-secondary border border-gray-600/30 rounded-md shadow-lg z-50 p-2">
          <div className="mb-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search timezone (e.g., New_York)"
              className="w-full px-2 py-1 text-sm bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {list.map((tz) => (
              <button
                key={tz}
                className={`w-full text-left px-2 py-1 rounded hover:bg-gray-700/50 text-sm ${
                  tz === preferences.timezone ? "bg-gray-700/40" : ""
                }`}
                onClick={async () => {
                  await updatePreferences({ timezone: tz });
                  setOpen(false);
                }}
                title={tz}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-primary truncate">{tz}</span>
                  <span className="text-text-muted text-xs whitespace-nowrap">{tzAbbrev(tz)}</span>
                </div>
              </button>
            ))}
            {list.length === 0 && (
              <div className="text-xs text-text-muted px-2 py-4">No matches</div>
            )}
          </div>
          <div className="mt-2 text-right">
            <button
              className="text-xs text-text-muted hover:text-text-primary"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Mismatch nudge when selected display tz != browser tz */}
      {browserTz && browserTz !== preferences.timezone && !dismissedMismatch && (
        <div className="absolute right-0 mt-2 w-[22rem] bg-background-secondary border border-gray-600/60 rounded-md shadow-lg z-40 p-3">
          <div className="text-sm text-text-primary">
            Your display timezone ({tzAbbrev(preferences.timezone)}) may not match your current location ({tzAbbrev(browserTz)}).
          </div>
          <div className="mt-3 flex items-center gap-3 justify-end">
            <button
              className="px-3 py-1.5 text-xs rounded bg-green-600 hover:bg-green-500 text-white"
              onClick={async () => { await updatePreferences({ timezone: browserTz }); setDismissedMismatch(true); }}
            >
              Switch to {browserTz}
            </button>
            <button
              className="px-2 py-1 text-xs rounded text-red-400 hover:text-red-300"
              onClick={() => setDismissedMismatch(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
