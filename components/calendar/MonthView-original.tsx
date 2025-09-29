'use client';

import { useState, useRef } from 'react';
import { CalendarEvent, CalendarEventCategory } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { Plus } from 'lucide-react';
import { parseLocalDate, eventOverlapsDate, formatDateForStorage } from '@/lib/utils/date-utils';
import { EventItem } from './EventItem';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  categories: Category[];
  googleCalendars?: any[];
  user: { role: string } | null;
  setSelectedDate: (date: Date | null) => void;
  setShowCreateModal: (show: boolean) => void;
  onEventsChange: () => void;
}

export function MonthView({
  currentDate,
  events,
  categories,
  googleCalendars = [],
  user,
  setSelectedDate,
  setShowCreateModal,
  onEventsChange
}: MonthViewProps) {
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const draggedElementRef = useRef<HTMLDivElement | null>(null);

  // Calculate month view grid for the current month
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  // Get the first day of the month
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
  
  // Calculate the start date (Sunday of the week containing the 1st)
  const startDate = new Date(firstDay);
  startDate.setDate(1 - firstDayOfWeek);
  
  // Generate 6 weeks (42 days) to ensure we cover all possible month layouts
  const days = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + i);
    days.push(day);
  }
  
  // Debug: Log the date range being displayed
  console.log(`[MonthView] Current date prop:`, currentDate.toISOString());
  console.log(`[MonthView] Showing month:`, month + 1, '/', year);
  console.log(`[MonthView] Showing dates from ${days[0].toISOString().split('T')[0]} to ${days[41].toISOString().split('T')[0]}`);
  console.log(`[MonthView] Total events passed: ${events.length}`);

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const dayEvents = events.filter(event => {
      const eventStart = parseLocalDate(event.start_time);
      const eventEnd = parseLocalDate(event.end_time);
      
      // Check if event spans this day
      const overlaps = eventOverlapsDate(eventStart, eventEnd, date);
      
      // Debug for August dates
      if (dateStr.includes('2025-08')) {
        const eventDateStr = eventStart.toISOString().split('T')[0];
        if (eventDateStr.includes('2025-08-27') || eventDateStr.includes('2025-08-28') || eventDateStr.includes('2025-08-29')) {
          console.log(`[MonthView] Event "${event.title}":`, {
            originalStart: event.start_time,
            parsedStart: eventStart.toISOString(),
            localDateStr: eventDateStr,
            checkingDate: dateStr,
            overlaps: overlaps
          });
        }
      }
      
      return overlaps;
    });
    
    if (dayEvents.length > 0 && dateStr.includes('2025-08')) {
      console.log(`[MonthView] ${dateStr} has ${dayEvents.length} events`);
    }
    
    return dayEvents;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth() && 
           date.getFullYear() === currentDate.getFullYear();
  };

  const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
    if (user?.role !== 'admin') return;
    
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', event.id);
    
    // Create a custom drag image
    if (draggedElementRef.current) {
      e.dataTransfer.setDragImage(draggedElementRef.current, 0, 0);
    }
  };

  const handleDragOver = (date: Date, e: React.DragEvent) => {
    if (!draggedEvent || user?.role !== 'admin') return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = async (date: Date, e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedEvent || user?.role !== 'admin') return;

    // Calculate the time difference
    const originalDate = parseLocalDate(draggedEvent.start_time);
    const timeDiff = date.getTime() - new Date(originalDate.toDateString()).getTime();
    
    // Apply the time difference to both start and end times
    const newStartTime = new Date(parseLocalDate(draggedEvent.start_time).getTime() + timeDiff);
    const newEndTime = new Date(parseLocalDate(draggedEvent.end_time).getTime() + timeDiff);

    try {
      const response = await fetch(`/api/calendar-events/${draggedEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            ...draggedEvent,
            start_time: formatDateForStorage(newStartTime),
            end_time: formatDateForStorage(newEndTime)
          }
        })
      });

      if (response.ok) {
        onEventsChange();
      }
    } catch (error) {
      console.error('Error updating event:', error);
    }

    setDraggedEvent(null);
    setDragOverDate(null);
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
    setDragOverDate(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Hidden drag image element */}
      <div
        ref={draggedElementRef}
        className="fixed pointer-events-none opacity-75"
        style={{ left: '-9999px' }}
      >
        {draggedEvent && (
          <div className="bg-blue-500 text-white px-2 py-1 rounded text-xs">
            {draggedEvent.title}
          </div>
        )}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-600 bg-[#575553] flex-shrink-0">
        {WEEKDAYS.map(day => (
          <div key={day} className="py-0.5 px-1 text-center text-[0.5rem] sm:text-xs font-medium text-white">
            <span className="hidden sm:inline">{day.slice(0, 3)}</span>
            <span className="sm:hidden">{day.charAt(0)}</span>
          </div>
        ))}
      </div>

      {/* Calendar days - expand to fill remaining space */}
      <div className="grid grid-cols-7 flex-1 min-h-0 overflow-auto h-full" style={{ gridTemplateRows: `repeat(${Math.ceil(days.length / 7)}, 1fr)` }}>
        {days.map((day, index) => {
          const dayEvents = getEventsForDate(day);
          const isCurrentMonthDay = isCurrentMonth(day);
          const isTodayDate = isToday(day);
          const isDragOver = dragOverDate?.toDateString() === day.toDateString();

          return (
            <div
              key={index}
              className={`calendar-day flex flex-col relative p-0.5 sm:p-1 border-r border-b border-gray-600 min-h-0 overflow-hidden ${
                index % 7 === 6 ? 'border-r-0' : ''
              } ${
                isTodayDate ? 'is-today' : ''
              }`}
              style={{
                backgroundColor: isDragOver ? 'rgba(30, 58, 138, 0.2)' : (!isCurrentMonthDay ? '#30302e' : '#575553')
              }}
              onDragOver={(e) => handleDragOver(day, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(day, e)}
            >
              <div className="flex items-start justify-between flex-shrink-0">
                <span className={`date-number text-[0.6rem] sm:text-xs font-medium ${
                  isTodayDate 
                    ? 'text-blue-500' 
                    : isCurrentMonthDay 
                      ? 'text-white' 
                      : 'text-neutral-400'
                }`}>
                  {day.getDate()}
                </span>
                {user?.role === 'admin' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDate(day);
                      setShowCreateModal(true);
                    }}
                    className="p-1 hover:bg-gray-700/30 rounded transition-colors group"
                    title="Add event"
                  >
                    <Plus className="h-3 w-3 text-gray-400 group-hover:text-white" />
                  </button>
                )}
              </div>
              
              <div className="overflow-hidden space-y-0.5 mt-1" data-event-count={dayEvents.length}>
                {dayEvents.slice(0, 5).map(event => {
                  const eventStart = new Date(event.start_time);
                  const eventEnd = new Date(event.end_time);
                  const time = eventStart.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                  });
                  
                  // Check if event continues from previous day or to next day
                  const dayStart = new Date(day);
                  dayStart.setHours(0, 0, 0, 0);
                  const dayEnd = new Date(day);
                  dayEnd.setHours(23, 59, 59, 999);
                  const startsBeforeDay = eventStart < dayStart;
                  const endsAfterDay = eventEnd > dayEnd;
                  
                  return (
                    <div
                      key={event.id}
                      draggable={user?.role === 'admin'}
                      onDragStart={(e) => handleDragStart(event, e)}
                      onDragEnd={handleDragEnd}
                      className={`cursor-move ${draggedEvent?.id === event.id ? 'opacity-50' : ''}`}
                    >
                      <div className="relative">
                        {startsBeforeDay && (
                          <span className="absolute left-0 text-[10px] opacity-70">←</span>
                        )}
                        {endsAfterDay && (
                          <span className="absolute right-0 text-[10px] opacity-70">→</span>
                        )}
                        <EventItem
                          event={event}
                          time={time}
                          categories={categories}
                          googleCalendars={googleCalendars}
                          onEventsChange={onEventsChange}
                        />
                      </div>
                    </div>
                  );
                })}
                {dayEvents.length > 5 && (
                  <div className="text-[0.5rem] text-gray-400 px-1">
                    +{dayEvents.length - 5} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}