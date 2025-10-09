'use client';

import { useState, useEffect, useMemo, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TimeInputProps {
  value?: string; // HH:mm format (24-hour)
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
  label?: string;
  labelClassName?: string;
  required?: boolean;
  onOpenDatePicker?: () => void;
  className?: string;
}

export function TimeInput({
  value = '',
  onChange,
  disabled = false,
  error = false,
  placeholder = 'Select or type time',
  label,
  labelClassName,
  required = false,
  onOpenDatePicker,
  className
}: TimeInputProps) {
  const inputId = useId();
  const [inputValue, setInputValue] = useState('');
  const [showList, setShowList] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Generate 15-minute increment options
  const timeOptions = useMemo(() => {
    const times: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const ampm = h < 12 ? 'AM' : 'PM';
        const minuteStr = m.toString().padStart(2, '0');
        times.push(`${hour12}:${minuteStr} ${ampm}`);
      }
    }
    return times;
  }, []);

  // Convert 24h HH:mm to 12h display format
  const format24to12 = (time24: string): string => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return '';
    
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const ampm = hours < 12 ? 'AM' : 'PM';
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Parse various time input formats to 24h HH:mm
  const parseTimeInput = (input: string): string => {
    if (!input) return '';
    
    // Normalize input
    const normalized = input.trim().toLowerCase();
    
    // Handle special cases
    if (normalized === '2400' || normalized === '24:00') return '00:00';
    if (normalized === '12am' || normalized === '12:00am' || normalized === '12:00 am') return '00:00';
    if (normalized === '12pm' || normalized === '12:00pm' || normalized === '12:00 pm') return '12:00';
    
    // Pattern 1: Just hour number "4" → "04:00"
    const hourOnlyMatch = normalized.match(/^(\d{1,2})$/);
    if (hourOnlyMatch) {
      const hour = parseInt(hourOnlyMatch[1]);
      if (hour >= 0 && hour <= 23) {
        return `${hour.toString().padStart(2, '0')}:00`;
      }
      // Assume AM for 1-12 without meridiem
      if (hour >= 1 && hour <= 12) {
        return `${hour.toString().padStart(2, '0')}:00`;
      }
      return '';
    }
    
    // Pattern 2: Hour with am/pm "4pm" → "16:00"
    const hourAmPmMatch = normalized.match(/^(\d{1,2})\s*(am|pm)$/);
    if (hourAmPmMatch) {
      let hour = parseInt(hourAmPmMatch[1]);
      const meridiem = hourAmPmMatch[2];
      
      if (hour < 1 || hour > 12) return '';
      
      if (meridiem === 'am') {
        if (hour === 12) hour = 0;
      } else {
        if (hour !== 12) hour += 12;
      }
      
      return `${hour.toString().padStart(2, '0')}:00`;
    }
    
    // Pattern 3: 24-hour time "16:30" → "16:30"
    const time24Match = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (time24Match) {
      const hour = parseInt(time24Match[1]);
      const minute = parseInt(time24Match[2]);
      
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
      return '';
    }
    
    // Pattern 4: 12-hour time with am/pm "4:30pm" → "16:30"
    const time12Match = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
    if (time12Match) {
      let hour = parseInt(time12Match[1]);
      const minute = parseInt(time12Match[2]);
      const meridiem = time12Match[3];
      
      if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return '';
      
      if (meridiem === 'am') {
        if (hour === 12) hour = 0;
      } else {
        if (hour !== 12) hour += 12;
      }
      
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
    
    // Pattern 5: Check if it matches our dropdown format
    const dropdownMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (dropdownMatch) {
      return parseTimeInput(`${dropdownMatch[1]}:${dropdownMatch[2]}${dropdownMatch[3]}`);
    }
    
    return '';
  };

  // Initialize input value from prop
  useEffect(() => {
    setInputValue(format24to12(value));
  }, [value]);

  // Handle input changes with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce parsing and onChange
    debounceRef.current = setTimeout(() => {
      const parsed = parseTimeInput(newValue);
      if (parsed || newValue === '') {
        onChange(parsed);
      }
    }, 300);
  };

  // Handle selection from dropdown
  const handleSelect = (timeOption: string) => {
    setInputValue(timeOption);
    const parsed = parseTimeInput(timeOption);
    if (parsed) {
      onChange(parsed);
    }
    setShowList(false);
  };

  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <label htmlFor={inputId} className={cn('block text-sm font-medium text-text-primary', labelClassName)}>
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${inputId}-list`}
          aria-invalid={error}
          aria-label={label || 'Time input'}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={(e) => {
            setShowList(true);
            if (onOpenDatePicker) {
              // Open paired date picker when focusing the time input
              try {
                onOpenDatePicker();
              } catch {}
            }
          }}
          onClick={() => {
            if (onOpenDatePicker) {
              try { onOpenDatePicker(); } catch {}
            }
          }}
          onBlur={() => {
            // Delay to allow click on dropdown items
            setTimeout(() => setShowList(false), 200);
          }}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "w-full px-3 py-2 text-sm bg-background-primary border rounded-md text-text-primary",
            "focus:outline-none focus:ring-2",
            error ? "border-red-500 focus:ring-red-500" : "border-gray-600/30 focus:ring-gray-700",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
        
        {/* Dropdown list */}
        {showList && !disabled && (
          <div
            id={`${inputId}-list`}
            className="absolute z-10 w-full mt-1 bg-background-secondary border border-gray-600/30 rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {timeOptions.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => handleSelect(time)}
                className="w-full px-3 py-2 text-left hover:bg-gray-700/50 focus:bg-gray-700/50 focus:outline-none text-sm text-text-primary"
              >
                {time}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {error && (
        <p className="text-xs text-red-500">Please enter a valid time</p>
      )}
    </div>
  );
}
