'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { CalendarEvent, CalendarEventCategory } from '@/lib/supabase/types';
import { Category } from '@/lib/categories/categories-client';
import { ViewEditEventModal } from './ViewEditEventModal';
import { calculateTooltipPosition } from '@/lib/utils/tooltip';
import { getEventColor } from '@/lib/utils/event-colors';

interface EventItemProps {
  event: CalendarEvent;
  time: string;
  categories: Category[];
  googleCalendars?: any[];
  onEventsChange: () => void;
}

export function EventItem({ event, time, categories, googleCalendars = [], onEventsChange }: EventItemProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Smart positioning for tooltip
  const updateTooltipPosition = useCallback((event: React.MouseEvent) => {
    if (!tooltipRef.current) {
      if (process.env.NODE_ENV !== 'production') console.debug('[EventItem] No tooltip ref available');
      return;
    }

    const target = event.currentTarget as HTMLElement;
    if (!target) {
      if (process.env.NODE_ENV !== 'production') console.debug('[EventItem] No target element available');
      return;
    }
    
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    // Get current mouse position from the event
    const currentMousePosition = { x: event.clientX, y: event.clientY };
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[EventItem] Mouse position:', currentMousePosition);
      console.debug('[EventItem] Target rect:', targetRect);
      console.debug('[EventItem] Tooltip rect:', tooltipRect);
    }
    
    const position = calculateTooltipPosition({
      targetRect,
      tooltipRect,
      mousePosition: currentMousePosition,
      preferredPlacement: 'auto',
      gap: 8
    });
    
    if (process.env.NODE_ENV !== 'production') console.debug('[EventItem] Calculated tooltip position:', position);
    setTooltipPosition(position);
  }, []);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const currentTarget = e.currentTarget;
    if (process.env.NODE_ENV !== 'production') console.debug('[EventItem] Mouse enter at:', { mouseX, mouseY });
    
    setShowTooltip(true);
    setMousePosition({ x: mouseX, y: mouseY });
    
    // Set initial position at mouse cursor
    setTooltipPosition({
      left: mouseX + 10,
      top: mouseY + 10
    });
    
    // Then calculate proper position after tooltip renders
    // Create a synthetic event with the needed properties
    requestAnimationFrame(() => {
      if (!currentTarget) return;
      
      const syntheticEvent = {
        clientX: mouseX,
        clientY: mouseY,
        currentTarget: currentTarget
      } as React.MouseEvent;
      
      updateTooltipPosition(syntheticEvent);
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    setMousePosition({ x: mouseX, y: mouseY });
    
    if (showTooltip && tooltipRef.current) {
      const tooltipWidth = 256; // w-64 = 16rem = 256px
      const tooltipHeight = tooltipRef.current.offsetHeight || 150; // estimate if not available
      const gap = 10;
      
      let left = mouseX + gap;
      let top = mouseY + gap;
      
      // Check right boundary
      if (left + tooltipWidth > window.innerWidth - gap) {
        left = mouseX - tooltipWidth - gap;
      }
      
      // Check bottom boundary
      if (top + tooltipHeight > window.innerHeight - gap) {
        top = mouseY - tooltipHeight - gap;
      }
      
      // Check left boundary
      if (left < gap) {
        left = gap;
      }
      
      // Check top boundary
      if (top < gap) {
        top = gap;
      }
      
      if (process.env.NODE_ENV !== 'production') console.debug('[EventItem] Setting tooltip position:', { left, top });
      setTooltipPosition({ left, top });
    }
  };

  const calById = useMemo(() => {
    const m = new Map<string, any>();
    (googleCalendars || []).forEach((c: any) => m.set(c.google_calendar_id || c.id, c));
    return m;
  }, [googleCalendars]);

  return (
    <>
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div
          onClick={() => setEditModalOpen(true)}
          className="cursor-pointer text-xs px-1 py-0.5 rounded text-white truncate hover:opacity-90 transition-opacity"
          style={{ backgroundColor: getEventColor(event, googleCalendars, calById) }}
        >
          <span className="hidden lg:inline font-medium">{time} - </span>
          <span className="text-[0.65rem] sm:text-xs">{event.title}</span>
        </div>
        
        {showTooltip && (
          <div 
            ref={tooltipRef}
            className="fixed z-[100] w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none"
            style={{
              position: 'fixed',
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              visibility: tooltipPosition.top === 0 && tooltipPosition.left === 0 ? 'hidden' : 'visible'
            }}
          >
            <h4 className="font-medium text-white mb-1">{event.title}</h4>
            {event.description && (
              <p className="text-sm text-gray-300 mb-2">{event.description}</p>
            )}
            <div className="space-y-1 text-xs text-gray-400">
              <div>Time: {time}</div>
              <div>
                Calendar: {(() => {
                  const cal = event.google_calendar_id ? calById.get(event.google_calendar_id) : undefined;
                  return cal?.name || 'Not synced';
                })()}
              </div>
              {event.location && (
                <div>Location: {event.location}</div>
              )}
              {event.attendees && event.attendees.length > 0 && (
                <div>Attendees: {event.attendees.length} people</div>
              )}
            </div>
            <button
              onClick={() => setEditModalOpen(true)}
              className="mt-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors pointer-events-auto"
            >
              Edit
            </button>
          </div>
        )}
      </div>
      
      {editModalOpen && (
        <ViewEditEventModal
          event={event}
          categories={categories}
          onClose={() => setEditModalOpen(false)}
          onEventUpdated={() => {
            setEditModalOpen(false);
            onEventsChange();
          }}
          onEventsChange={onEventsChange}
        />
      )}
    </>
  );
}
