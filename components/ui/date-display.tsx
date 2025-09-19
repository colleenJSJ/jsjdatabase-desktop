'use client';

import { useState, useRef, useEffect, forwardRef } from 'react';
import { Calendar } from 'lucide-react';

interface DateDisplayProps {
  label: string;
  date: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  minDate?: string;
  disabled?: boolean;
}

export const DateDisplay = forwardRef<HTMLInputElement, DateDisplayProps>(function DateDisplay(
  { label, date, onChange, minDate, disabled = false }: DateDisplayProps,
  forwardedRef
) {
  const [showPicker, setShowPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Select date';
    
    try {
      // Parse the date string and add noon time to avoid timezone issues
      const dateObj = new Date(dateString + 'T12:00:00');
      
      // Check if date is valid
      if (isNaN(dateObj.getTime())) return 'Select date';
      
      // Format as "Tuesday, Sept 9"
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      }).format(dateObj);
    } catch (error) {
      return 'Select date';
    }
  };

  // Handle clicking outside to close picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPicker]);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el || disabled) return;
    try {
      el.focus();
      // @ts-ignore - showPicker may not be in lib DOM yet
      if (typeof (el as any).showPicker === 'function') (el as any).showPicker();
      else el.click();
    } catch {}
  };

  const handleDateClick = () => {
    openPicker();
  };

  return (
    <div className="w-full" ref={containerRef}>
      <label className="block text-sm font-medium text-text-primary mb-1">
        {label}
      </label>
      <div className="relative">
        {/* Clickable display box */}
        <div
          onClick={handleDateClick}
          className={`
            px-3 py-2 
            bg-background-primary 
            border border-gray-600/30 
            rounded-md 
            text-text-primary 
            cursor-pointer
            hover:bg-gray-700/20
            transition-colors
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <span className="block text-sm">
            {formatDate(date)}
          </span>
        </div>

        {/* Invisible but interactive native date input layered over display */}
        <input
          ref={(el) => {
            inputRef.current = el;
            if (typeof forwardedRef === 'function') forwardedRef(el as HTMLInputElement);
            else if (forwardedRef && 'current' in (forwardedRef as any)) (forwardedRef as any).current = el as HTMLInputElement;
          }}
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value)}
          min={minDate}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0"
          onMouseDown={(e) => {
            // Ensure clicking anywhere over the box opens the picker
            e.preventDefault();
            openPicker();
          }}
          aria-label={label}
        />
      </div>
    </div>
  );
});
