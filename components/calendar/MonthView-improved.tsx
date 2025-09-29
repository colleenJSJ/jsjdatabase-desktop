'use client';

import { useState, useRef, useMemo } from 'react';
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

interface EventSegment {
  event: CalendarEvent;
  startDay: number; // 0-6 within the week
  endDay: number;   // 0-6 within the week
  row: number;      // vertical position within the week
  isStart: boolean; // true if this is the start of the event
  isEnd: boolean;   // true if this is the end of the event
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
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + i);
    days.push(day);
  }

  // Process events into week segments for continuous display
  const weekSegments = useMemo(() => {
    const weeks: EventSegment[][] = [];
    
    // Process each week
    for (let weekIdx = 0; weekIdx < 6; weekIdx++) {
      const weekStart = days[weekIdx * 7];
      const weekEnd = days[weekIdx * 7 + 6];
      const weekSegments: EventSegment[] = [];
      
      // Find all events that overlap this week
      events.forEach(event => {
        const eventStart = parseLocalDate(event.start_time);
        const eventEnd = parseLocalDate(event.end_time);
        
        // Set to start of day for proper comparison
        eventStart.setHours(0, 0, 0, 0);
        eventEnd.setHours(23, 59, 59, 999);
        
        // Check if event overlaps with this week
        if (eventEnd >= weekStart && eventStart <= weekEnd) {
          // Calculate the segment within this week
          const segmentStart = eventStart < weekStart ? weekStart : eventStart;
          const segmentEnd = eventEnd > weekEnd ? weekEnd : eventEnd;
          
          // Calculate day indices within the week (0-6)
          const startDayIdx = Math.max(0, Math.floor((segmentStart.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000)));
          const endDayIdx = Math.min(6, Math.floor((segmentEnd.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000)));
          
          weekSegments.push({
            event,
            startDay: startDayIdx,
            endDay: endDayIdx,
            row: 0, // Will be calculated next
            isStart: eventStart >= weekStart,
            isEnd: eventEnd <= weekEnd
          });
        }
      });
      
      // Sort segments by start day, then by duration (longer events first)
      weekSegments.sort((a, b) => {
        if (a.startDay !== b.startDay) return a.startDay - b.startDay;
        return (b.endDay - b.startDay) - (a.endDay - a.startDay);
      });
      
      // Assign rows to avoid overlaps
      const occupiedSlots: boolean[][] = [];
      weekSegments.forEach(segment => {
        let row = 0;
        
        // Find the first available row
        while (true) {
          if (!occupiedSlots[row]) {
            occupiedSlots[row] = new Array(7).fill(false);
          }
          
          // Check if this row is available for the segment
          let available = true;
          for (let day = segment.startDay; day <= segment.endDay; day++) {
            if (occupiedSlots[row][day]) {
              available = false;
              break;
            }
          }
          
          if (available) {
            // Mark the slots as occupied
            for (let day = segment.startDay; day <= segment.endDay; day++) {
              occupiedSlots[row][day] = true;
            }
            segment.row = row;
            break;
          }
          
          row++;
        }
      });
      
      weeks.push(weekSegments);
    }
    
    return weeks;
  }, [events, days]);

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === month;
  };

  const getCategoryColor = (categoryValue: CalendarEventCategory) => {
    const category = categories.find(c => c.name?.toLowerCase() === String(categoryValue).toLowerCase());
    return category?.color || '#6B7280';
  };

  const handleDragStart = (event: CalendarEvent, e: React.DragEvent) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
    setDragOverDate(null);
  };

  const handleDragOver = (date: Date, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = async (date: Date, e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedEvent) return;
    
    // Calculate the day difference
    const originalStart = new Date(draggedEvent.start_time);
    const originalEnd = new Date(draggedEvent.end_time);
    const dayDiff = Math.floor((date.getTime() - originalStart.getTime()) / (1000 * 60 * 60 * 24));
    
    // Update the event dates
    const newStart = new Date(originalStart);
    newStart.setDate(originalStart.getDate() + dayDiff);
    
    const newEnd = new Date(originalEnd);
    newEnd.setDate(originalEnd.getDate() + dayDiff);
    
    // Update the event in the database
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.patch(`/api/calendar-events/${draggedEvent.id}`, {
        start_time: formatDateForStorage(newStart),
        end_time: formatDateForStorage(newEnd)
      });
      if (response.success) {
        onEventsChange();
      }
    } catch (error) {
      console.error('Failed to update event:', error);
    }
    
    handleDragEnd();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0 border-b border-gray-600">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center py-2 text-xs font-medium text-gray-400">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid - 6 weeks */}
      <div className="flex-1 relative">
        {[0, 1, 2, 3, 4, 5].map(weekIdx => {
          const weekStartIdx = weekIdx * 7;
          const segments = weekSegments[weekIdx] || [];
          const maxRow = Math.max(0, ...segments.map(s => s.row));
          const eventHeight = 22; // Height of each event bar in pixels
          const weekHeight = Math.max(100, 40 + (maxRow + 1) * (eventHeight + 2)); // Min height with dynamic expansion
          
          return (
            <div key={weekIdx} className="relative border-b border-gray-600" style={{ height: `${weekHeight}px` }}>
              {/* Day cells */}
              <div className="absolute inset-0 grid grid-cols-7">
                {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
                  const day = days[weekStartIdx + dayIdx];
                  const isCurrentMonthDay = isCurrentMonth(day);
                  const isTodayDate = isToday(day);
                  const isDragOver = dragOverDate?.toDateString() === day.toDateString();
                  
                  return (
                    <div
                      key={dayIdx}
                      className={`relative border-r border-gray-600 ${dayIdx === 6 ? 'border-r-0' : ''}`}
                      style={{
                        backgroundColor: isDragOver ? 'rgba(30, 58, 138, 0.2)' : (!isCurrentMonthDay ? '#30302e' : '#575553')
                      }}
                      onDragOver={(e) => handleDragOver(day, e)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(day, e)}
                    >
                      <div className="flex items-start justify-between p-1">
                        <span className={`text-xs font-medium ${
                          isTodayDate 
                            ? 'text-blue-500 font-bold' 
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
                            className="p-0.5 hover:bg-gray-700/30 rounded transition-colors group opacity-0 hover:opacity-100"
                            title="Add event"
                          >
                            <Plus className="h-3 w-3 text-gray-400 group-hover:text-white" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Event bars - positioned absolutely across the week */}
              <div className="absolute inset-x-0 top-8 px-0.5" style={{ pointerEvents: 'none' }}>
                {segments.map((segment, segmentIdx) => {
                  const leftPercent = (segment.startDay / 7) * 100;
                  const widthPercent = ((segment.endDay - segment.startDay + 1) / 7) * 100;
                  const topPosition = segment.row * (eventHeight + 2);
                  const categoryColor = getCategoryColor(segment.event.category);
                  
                  return (
                    <div
                      key={`${segment.event.id}-${segmentIdx}`}
                      className="absolute"
                      style={{
                        left: `${leftPercent}%`,
                        width: `calc(${widthPercent}% - 4px)`,
                        top: `${topPosition}px`,
                        height: `${eventHeight}px`,
                        pointerEvents: 'auto',
                        marginLeft: segment.isStart ? '2px' : '0',
                        marginRight: segment.isEnd ? '2px' : '0'
                      }}
                      draggable={user?.role === 'admin'}
                      onDragStart={(e) => handleDragStart(segment.event, e)}
                      onDragEnd={handleDragEnd}
                    >
                      <div 
                        className={`h-full px-1 text-xs text-white flex items-center cursor-pointer hover:opacity-90 transition-opacity ${
                          !segment.isStart ? 'rounded-l-none' : 'rounded-l'
                        } ${
                          !segment.isEnd ? 'rounded-r-none' : 'rounded-r'
                        } ${
                          draggedEvent?.id === segment.event.id ? 'opacity-50' : ''
                        }`}
                        style={{
                          backgroundColor: categoryColor,
                          borderLeft: !segment.isStart ? 'none' : undefined,
                          borderRight: !segment.isEnd ? 'none' : undefined
                        }}
                        title={`${segment.event.title}${segment.event.location ? ` - ${segment.event.location}` : ''}`}
                      >
                        <span className="truncate font-medium">
                          {segment.isStart ? (
                            <>
                              {!segment.event.all_day && (
                                <span className="mr-1 opacity-75">
                                  {new Date(segment.event.start_time).toLocaleTimeString('en-US', { 
                                    hour: 'numeric', 
                                    minute: '2-digit',
                                    hour12: true 
                                  })}
                                </span>
                              )}
                              {segment.event.title}
                            </>
                          ) : (
                            <span className="opacity-75">← {segment.event.title}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
