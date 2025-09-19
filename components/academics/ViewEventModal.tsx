'use client';

import { useState } from 'react';
import { X, Calendar, MapPin, Users, BookOpen, Edit2, Trash2, GraduationCap, Mail } from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import { usePreferences } from '@/contexts/preferences-context';
import { toInstantFromNaive, formatInstantInTimeZone } from '@/lib/utils/date-utils';

interface ViewEventModalProps {
  event: any;
  children: { id: string; name: string }[];
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Helper function to get first name from full name
const getFirstName = (fullName: string) => {
  return fullName.split(' ')[0];
};

export function ViewEventModal({
  event,
  children,
  isOpen,
  onClose,
  onEdit,
  onDelete
}: ViewEventModalProps) {
  const { user } = useUser();
  const { preferences } = usePreferences();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen || !event) return null;

  const eventDate = event.event_date ? toInstantFromNaive(event.event_date, preferences.timezone) : null;
  
  const attendeeNames = event.attendees?.map((id: string) => {
    const child = children.find(c => c.id === id);
    return child ? getFirstName(child.name) : null;
  }).filter(Boolean) || [];

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'Meeting': return 'bg-blue-600/20 text-blue-400';
      case 'Conference': return 'bg-purple-600/20 text-purple-400';
      case 'Field Trip': return 'bg-green-600/20 text-green-400';
      case 'Performance': return 'bg-pink-600/20 text-pink-400';
      case 'Sports': return 'bg-orange-600/20 text-orange-400';
      case 'Test': return 'bg-red-600/20 text-red-400';
      case 'Deadline': return 'bg-yellow-600/20 text-yellow-400';
      default: return 'bg-gray-600/20 text-gray-400';
    }
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete();
      onClose();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  const metadata = (event.metadata || {}) as Record<string, unknown>;
  const additionalAttendees: string[] = Array.isArray((event as any).additional_attendees)
    ? ((event as any).additional_attendees as string[])
    : Array.isArray(metadata.additional_attendees)
      ? (metadata.additional_attendees as string[])
      : typeof metadata.additional_attendees === 'string'
        ? (metadata.additional_attendees as string).split(',').map(v => v.trim()).filter(Boolean)
        : [];

  const scheduleDate = eventDate
    ? formatInstantInTimeZone(eventDate, preferences.timezone, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const scheduleTime = eventDate
    ? (() => {
        const label = formatInstantInTimeZone(eventDate, preferences.timezone, { hour: 'numeric', minute: '2-digit', hour12: true });
        return /12:00 AM/.test(label) ? null : label;
      })()
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-600/30 bg-background-secondary">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/10 text-blue-300 p-3">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">{event.event_title || 'Academic Event'}</h2>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${getEventTypeColor(event.event_type || 'Other')}`}>
                  {event.event_type || 'Event'}
                </span>
                {scheduleDate && (
                  <span className="text-xs text-text-muted">
                    {scheduleDate}
                    {scheduleTime ? ` • ${scheduleTime}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-text-muted hover:text-text-primary hover:bg-gray-700/30 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4 space-y-4">
            <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3 flex items-start gap-3">
              <Calendar className="h-5 w-5 text-blue-300 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Schedule</p>
                <p className="text-sm text-text-primary mt-1">
                  {scheduleDate || 'Date to be determined'}
                  {scheduleTime ? ` at ${scheduleTime}` : ''}
                </p>
              </div>
            </div>

            {event.location && (
              <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3 flex items-start gap-3">
                <MapPin className="h-5 w-5 text-blue-300 mt-0.5" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-muted">Location</p>
                  <p className="text-sm text-text-primary mt-1">{event.location}</p>
                </div>
              </div>
            )}

            {attendeeNames.length > 0 && (
              <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-300" /> Attendees
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {attendeeNames.map((name: string) => (
                    <span key={name} className="px-3 py-1 text-xs rounded-full bg-[#30302E] border border-[#3A3A38] text-text-primary">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {additionalAttendees.length > 0 && (
              <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-300" /> Email Invites
                </p>
                <p className="text-sm text-text-primary mt-1">{additionalAttendees.join(', ')}</p>
              </div>
            )}
          </div>

          {event.description && (
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-300" /> Notes
              </h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-600/30 bg-background-secondary">
          {user?.role === 'admin' ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  onEdit();
                  onClose();
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-button-create text-white text-sm font-medium hover:bg-button-create/90 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
                Edit Event
              </button>
              <button
                onClick={handleDelete}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showDeleteConfirm
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-background-primary border border-gray-600/40 text-text-primary hover:bg-background-primary/70'
                }`}
              >
                <Trash2 className="h-4 w-4" />
                {showDeleteConfirm ? 'Confirm Delete' : 'Delete'}
              </button>
            </div>
          ) : (
            <button
              onClick={onClose}
              className="w-full inline-flex items-center justify-center px-4 py-2 rounded-lg bg-background-primary border border-gray-600/40 text-sm font-medium text-text-primary hover:bg-background-primary/70 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
