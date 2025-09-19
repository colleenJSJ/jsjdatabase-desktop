'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { startOfDay, endOfDay, isBefore, isAfter, isSameDay } from 'date-fns';

export interface DateRange {
  start: Date;
  end: Date;
  isAllDay: boolean;
}

interface UseCalendarRangeSelectionProps {
  onRangeSelect?: (range: DateRange) => void;
  onSelectionCancel?: () => void;
  disabled?: boolean;
  mode?: 'day' | 'hour'; // Support different selection modes
}

export function useCalendarRangeSelection({
  onRangeSelect,
  onSelectionCancel,
  disabled = false,
  mode = 'day'
}: UseCalendarRangeSelectionProps = {}) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [currentHover, setCurrentHover] = useState<Date | null>(null);
  const [selectionStartHour, setSelectionStartHour] = useState<number | null>(null);
  const [selectionEndHour, setSelectionEndHour] = useState<number | null>(null);
  const isDragging = useRef(false);
  const startDate = useRef<Date | null>(null);
  const startHour = useRef<number | null>(null);

  // Calculate the actual range based on start and current hover/end
  const getSelectionRange = useCallback((): DateRange | null => {
    if (!selectionStart) return null;
    
    const endDate = currentHover || selectionEnd || selectionStart;
    let start = isBefore(selectionStart, endDate) ? selectionStart : endDate;
    let end = isBefore(selectionStart, endDate) ? endDate : selectionStart;
    
    // Handle hour-level selection
    if (mode === 'hour' && selectionStartHour !== null) {
      const startDateWithHour = new Date(start);
      startDateWithHour.setHours(selectionStartHour, 0, 0, 0);
      
      const endDateWithHour = new Date(end);
      const endHour = selectionEndHour !== null ? selectionEndHour : selectionStartHour;
      endDateWithHour.setHours(endHour + 1, 0, 0, 0); // End is exclusive
      
      return {
        start: startDateWithHour,
        end: endDateWithHour,
        isAllDay: false
      };
    }
    
    // Day-level selection
    // Default to all-day for day selections (user can uncheck if needed)
    const isAllDay = true;
    
    return {
      start: startOfDay(start),
      end: endOfDay(end),
      isAllDay
    };
  }, [selectionStart, selectionEnd, currentHover, selectionStartHour, selectionEndHour, mode]);

  // Start selection (enhanced to support hour parameter)
  const handleMouseDown = useCallback((date: Date, hourOrIsAllDay?: number | boolean) => {
    if (disabled) return;
    
    // Handle overloaded parameter
    const isHourSelection = mode === 'hour' && typeof hourOrIsAllDay === 'number';
    const hour = isHourSelection ? hourOrIsAllDay : null;
    
    isDragging.current = true;
    startDate.current = date;
    startHour.current = hour;
    setIsSelecting(true);
    setSelectionStart(date);
    setSelectionEnd(null);
    setCurrentHover(null);
    setSelectionStartHour(hour);
    setSelectionEndHour(null);
  }, [disabled, mode]);

  // Update selection during drag (enhanced to support hour parameter)
  const handleMouseEnter = useCallback((date: Date, hour?: number) => {
    if (!isDragging.current || !isSelecting || disabled) return;
    setCurrentHover(date);
    
    if (mode === 'hour' && hour !== undefined) {
      setSelectionEndHour(hour);
    }
  }, [isSelecting, disabled, mode]);

  // End selection
  const handleMouseUp = useCallback((date?: Date) => {
    if (!isSelecting || disabled) return;
    
    isDragging.current = false;
    const endDate = date || currentHover || selectionStart;
    
    if (endDate && selectionStart) {
      setSelectionEnd(endDate);
      const range = getSelectionRange();
      if (range && onRangeSelect) {
        onRangeSelect(range);
      }
    }
    
    // Reset selection state
    setTimeout(() => {
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      setCurrentHover(null);
      startDate.current = null;
    }, 100);
  }, [isSelecting, selectionStart, currentHover, getSelectionRange, onRangeSelect, disabled]);

  // Cancel selection with ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSelecting) {
        isDragging.current = false;
        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        setCurrentHover(null);
        startDate.current = null;
        
        if (onSelectionCancel) {
          onSelectionCancel();
        }
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging.current) {
        handleMouseUp();
      }
    };

    if (isSelecting) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isSelecting, handleMouseUp, onSelectionCancel]);

  // Check if a date is within the current selection
  const isDateInSelection = useCallback((date: Date): boolean => {
    if (!selectionStart) return false;
    
    const endDate = currentHover || selectionEnd || selectionStart;
    const start = isBefore(selectionStart, endDate) ? selectionStart : endDate;
    const end = isBefore(selectionStart, endDate) ? endDate : selectionStart;
    
    // For day-level selection
    const dateDay = startOfDay(date);
    const startDay = startOfDay(start);
    const endDay = startOfDay(end);
    
    return (isSameDay(dateDay, startDay) || isAfter(dateDay, startDay)) && 
           (isSameDay(dateDay, endDay) || isBefore(dateDay, endDay));
  }, [selectionStart, selectionEnd, currentHover]);

  // Check if a date is the start of selection
  const isSelectionStart = useCallback((date: Date): boolean => {
    if (!selectionStart) return false;
    return isSameDay(date, selectionStart);
  }, [selectionStart]);

  // Check if a date is the end of selection
  const isSelectionEnd = useCallback((date: Date): boolean => {
    const endDate = currentHover || selectionEnd;
    if (!endDate) return false;
    return isSameDay(date, endDate);
  }, [selectionEnd, currentHover]);

  // Check if a specific hour cell is in selection (for hour mode)
  const isHourInSelection = useCallback((date: Date, hour: number): boolean => {
    if (!selectionStart || mode !== 'hour') return false;
    
    const endDate = currentHover || selectionEnd || selectionStart;
    const startDay = startOfDay(selectionStart);
    const endDay = startOfDay(endDate);
    const dateDay = startOfDay(date);
    
    // Check if date is in range
    const isDateInRange = (isSameDay(dateDay, startDay) || isAfter(dateDay, startDay)) && 
                         (isSameDay(dateDay, endDay) || isBefore(dateDay, endDay));
    
    if (!isDateInRange) return false;
    
    // Check hour range
    if (selectionStartHour === null) return false;
    
    const startHour = selectionStartHour;
    const endHour = selectionEndHour !== null ? selectionEndHour : startHour;
    
    // If same day selection
    if (isSameDay(startDay, endDay)) {
      const minHour = Math.min(startHour, endHour);
      const maxHour = Math.max(startHour, endHour);
      return hour >= minHour && hour <= maxHour;
    }
    
    // Multi-day selection
    if (isSameDay(dateDay, startDay)) {
      return hour >= startHour;
    } else if (isSameDay(dateDay, endDay)) {
      return hour <= endHour;
    } else {
      return true; // Middle days include all hours
    }
  }, [selectionStart, selectionEnd, currentHover, selectionStartHour, selectionEndHour, mode]);

  return {
    // State
    isSelecting,
    selectionRange: getSelectionRange(),
    
    // Event handlers
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    
    // Helper functions
    isDateInSelection,
    isSelectionStart,
    isSelectionEnd,
    isHourInSelection,
    
    // Control functions
    cancelSelection: () => {
      isDragging.current = false;
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      setCurrentHover(null);
      setSelectionStartHour(null);
      setSelectionEndHour(null);
      startDate.current = null;
      startHour.current = null;
    }
  };
}