'use client';

import { useEffect, useState } from 'react';
import { Mail, User, Users } from 'lucide-react';
import { formatAttendeesForDisplay } from '@/lib/utils/google-sync-helpers';

interface FamilyMember {
  id: string;
  name: string;
  email?: string | null;
  sync_to_google?: boolean;
  is_child?: boolean;
}

interface AttendeeSyncDisplayProps {
  familyMembers: FamilyMember[];
  selectedAttendees: string[];
  showDetails?: boolean;
}

export function AttendeeSyncDisplay({ 
  familyMembers, 
  selectedAttendees,
  showDetails = true 
}: AttendeeSyncDisplayProps) {
  const [syncInfo, setSyncInfo] = useState<{
    googleInvites: FamilyMember[];
    internalOnly: FamilyMember[];
  }>({ googleInvites: [], internalOnly: [] });

  useEffect(() => {
    const info = formatAttendeesForDisplay(familyMembers, selectedAttendees);
    setSyncInfo(info);
  }, [familyMembers, selectedAttendees]);

  if (selectedAttendees.length === 0) {
    return null;
  }

  const getFirstName = (name: string) => name.split(' ')[0];

  return (
    <div className="space-y-2">
      {/* Summary counts */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-text-muted">
          <Users className="h-4 w-4" />
          <span>{selectedAttendees.length} attendee{selectedAttendees.length !== 1 ? 's' : ''}</span>
        </div>
        
        {syncInfo.googleInvites.length > 0 && (
          <div className="flex items-center gap-1.5 text-green-400">
            <Mail className="h-4 w-4" />
            <span>{syncInfo.googleInvites.length} will get Google invite{syncInfo.googleInvites.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        
        {syncInfo.internalOnly.length > 0 && (
          <div className="flex items-center gap-1.5 text-gray-400">
            <User className="h-4 w-4" />
            <span>{syncInfo.internalOnly.length} internal only</span>
          </div>
        )}
      </div>

      {/* Detailed breakdown if requested */}
      {showDetails && (syncInfo.googleInvites.length > 0 || syncInfo.internalOnly.length > 0) && (
        <div className="bg-background-primary/50 rounded-md p-2 space-y-1.5 text-xs">
          {syncInfo.googleInvites.length > 0 && (
            <div className="space-y-1">
              <div className="text-green-400 font-medium flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Google Calendar invites:
              </div>
              <div className="ml-4 text-text-secondary">
                {syncInfo.googleInvites.map(member => (
                  <div key={member.id} className="flex items-center gap-2">
                    <span>{getFirstName(member.name)}</span>
                    <span className="text-text-muted">({member.email})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {syncInfo.internalOnly.length > 0 && (
            <div className="space-y-1">
              <div className="text-gray-400 font-medium flex items-center gap-1">
                <User className="h-3 w-3" />
                Internal tracking only:
              </div>
              <div className="ml-4 text-text-secondary">
                {syncInfo.internalOnly.map(member => (
                  <div key={member.id}>
                    {getFirstName(member.name)}
                    {member.is_child && <span className="text-text-muted ml-1">(child)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}