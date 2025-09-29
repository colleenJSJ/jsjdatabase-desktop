'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';

interface DateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function DateTimeInput({ 
  value, 
  onChange, 
  placeholder = 'Select date and time',
  required = false,
  className = ''
}: DateTimeInputProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const [tempDate, setTempDate] = useState('');
  const [tempTime, setTempTime] = useState('');
  const [manualValue, setManualValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      // Keep as string to preserve local time
      if (value.includes('T')) {
        // Format: YYYY-MM-DDTHH:mm or with seconds/timezone
        const cleanValue = value.replace(/(Z|[+-]\d{2}:?\d{2})$/, ''); // Strip timezone
        const [dateStr, timeWithExtra] = cleanValue.split('T');
        const timeStr = timeWithExtra ? timeWithExtra.slice(0, 5) : ''; // Just HH:mm
        setTempDate(dateStr);
        setTempTime(timeStr);
        setManualValue(`${dateStr} ${timeStr}`);
      } else if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Just a date
        setTempDate(value);
        setTempTime('');
        setManualValue(value);
      } else if (value.match(/^\d{2}:\d{2}/)) {
        // Just a time
        setTempDate('');
        setTempTime(value.slice(0, 5));
        setManualValue(value.slice(0, 5));
      } else {
        // Reset if unexpected format
        setTempDate('');
        setTempTime('');
        setManualValue('');
      }
    } else {
      // Reset if no value
      setTempDate('');
      setTempTime('');
      setManualValue('');
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPicker]);

  // Focus correct control when picker opens or mode changes
  useEffect(() => {
    if (!showPicker) return;
    const openNativePicker = (el: HTMLInputElement | null) => {
      if (!el) return;
      el.focus();
      // Prefer native showPicker if available
      // @ts-ignore
      if (typeof el.showPicker === 'function') {
        try {
          // @ts-ignore
          el.showPicker();
          return;
        } catch {}
      }
      // Fallback: simulate a click to open native UI (not guaranteed in all browsers)
      try { el.click(); } catch {}
    };

    if (mode === 'date') {
      setTimeout(() => openNativePicker(dateInputRef.current), 0);
    } else if (mode === 'time') {
      setTimeout(() => openNativePicker(timeInputRef.current), 0);
    }
  }, [mode, showPicker]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setTempDate(newDate);
    
    // Auto-advance to time selection
    setMode('time');
    // Attempt to immediately open time picker
    setTimeout(() => {
      const el = timeInputRef.current;
      if (!el) return;
      el.focus();
      // @ts-ignore
      if (typeof el.showPicker === 'function') {
        try { /* @ts-ignore */ el.showPicker(); } catch {}
      } else {
        try { el.click(); } catch {}
      }
    }, 0);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTempTime(newTime);
    
    // Combine date and time and update parent
    if (tempDate && newTime) {
      const combined = `${tempDate}T${newTime}`;
      onChange(combined);
      setShowPicker(false);
      setManualValue(`${tempDate} ${newTime}`);
    }
  };

  const formatDisplay = () => {
    if (!value) return placeholder;
    // Parse the string directly to avoid timezone issues
    if (value.includes('T')) {
      const cleanValue = value.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
      const [dateStr, timeStr] = cleanValue.split('T');
      if (dateStr && timeStr) {
        const [year, month, day] = dateStr.split('-');
        const [hour, minute] = timeStr.split(':');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[parseInt(month) - 1];
        const h = parseInt(hour);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${monthName} ${parseInt(day)}, ${year}, ${displayHour}:${minute} ${ampm}`;
      }
    }
    return value; // Return as-is if we can't format it
  };

  // Parse common manual formats to ISO-like value the app expects
  const parseManual = (raw: string): string | null => {
    const s = raw.trim();
    if (!s) return null;
    // Already ISO-ish
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s;
    // Convert "YYYY-MM-DD HH:mm" to "YYYY-MM-DDTHH:mm"
    const ymdHm = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
    if (ymdHm) return `${ymdHm[1]}T${ymdHm[2]}`;
    // Handle MM/DD/YYYY HH:mm or with AM/PM
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (us) {
      let [_, m, d, y, hh, mm, ap] = us;
      let H = parseInt(hh, 10);
      if (ap) {
        const ampm = ap.toUpperCase();
        if (ampm === 'PM' && H !== 12) H += 12;
        if (ampm === 'AM' && H === 12) H = 0;
      }
      const month = m.padStart(2, '0');
      const day = d.padStart(2, '0');
      const hour = String(H).padStart(2, '0');
      const minute = mm;
      return `${y}-${month}-${day}T${hour}:${minute}`;
    }
    // Time-only HH:mm (keep as-is for server to combine with date if needed)
    if (/^\d{2}:\d{2}$/.test(s)) return s;
    // Don't use Date parsing as fallback to avoid timezone issues
    // If we can't parse it with our known formats, return null
    return null;
  };

  const handleManualCommit = () => {
    const parsed = parseManual(manualValue);
    if (parsed) {
      onChange(parsed);
      // Update temp states to keep picker in sync
      const [d, t] = parsed.includes('T') ? parsed.split('T') : ['', parsed];
      if (d) setTempDate(d);
      if (t) setTempTime(t.slice(0,5));
    }
  };

  // No custom quick-pick grid; rely on native time picker for simplicity

  return (
    <div className="relative" ref={containerRef}>
      <div className={`px-2 py-1.5 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus-within:border-blue-500 flex items-center justify-between ${className}`}>
        <input
          type="text"
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
          onBlur={handleManualCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleManualCommit();
            }
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm px-1 placeholder:text-text-muted"
        />
        <button
          type="button"
          onClick={() => {
            setShowPicker(true);
            setMode('date');
          }}
          aria-label="Open date picker"
          className="p-1 hover:bg-gray-700/50 rounded transition-colors"
        >
          <Calendar className="h-4 w-4 text-white" />
        </button>
      </div>

      {showPicker && (
        <div className="absolute z-50 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
          {mode === 'date' ? (
            <div className="p-3">
              <input
                type="date"
                value={tempDate}
                onChange={handleDateChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                required={required}
                ref={dateInputRef}
              />
            </div>
          ) : (
            <div className="p-3">
              <div className="text-sm text-text-muted mb-2">
                {tempDate && new Date(tempDate).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
              </div>
              <input
                type="time"
                step={900}
                value={tempTime}
                onChange={handleTimeChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                ref={timeInputRef}
              />
            </div>
          )}

          <div className="flex justify-between items-center px-3 pb-3">
            <button
              type="button"
              onClick={() => {
                setTempDate('');
                setTempTime('');
                onChange('');
                setShowPicker(false);
                setManualValue('');
              }}
              className="text-sm text-text-muted hover:text-white"
            >
              Clear
            </button>
            {mode === 'date' && (
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="text-sm text-text-muted hover:text-white"
              >
                Cancel
              </button>
            )}
            {mode === 'time' && (
              <button
                type="button"
                onClick={() => setMode('date')}
                className="text-sm text-text-muted hover:text-white"
              >
                Back to Date
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
