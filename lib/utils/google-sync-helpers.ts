/**
 * Helper functions for intelligent Google Calendar sync
 * Filters attendees to only sync those with emails and sync_to_google enabled
 */

import { createClient } from '@/lib/supabase/server';

export interface FamilyMember {
  id: string;
  name: string;
  email?: string | null;
  sync_to_google?: boolean;
  is_child?: boolean;
}

/**
 * Filter attendees for Google Calendar sync
 * Only includes family members with:
 * 1. sync_to_google = true
 * 2. Valid email address
 * 
 * Children and pets are tracked internally but don't get Google invites
 */
export async function filterAttendeesForGoogleSync(
  attendeeIds: string[]
): Promise<{ googleAttendees: string[]; internalAttendees: string[] }> {
  if (!attendeeIds || attendeeIds.length === 0) {
    return { googleAttendees: [], internalAttendees: [] };
  }

  try {
    const supabase = await createClient();
    
    // Fetch family member details for all attendees
    const { data: familyMembers, error } = await supabase
      .from('family_members')
      .select('id, name, email, sync_to_google, is_child')
      .in('id', attendeeIds);

    if (error) {
      console.error('Error fetching family members:', error);
      return { googleAttendees: [], internalAttendees: attendeeIds };
    }

    const googleAttendees: string[] = [];
    const internalAttendees: string[] = [];
    const includeAllWithEmail = String(process.env.GOOGLE_INCLUDE_ALL_FAMILY_WITH_EMAIL || 'false').toLowerCase() === 'true';

    for (const member of familyMembers || []) {
      if (member.email) {
        // If configured, include any family member with an email, else require sync_to_google
        if (includeAllWithEmail || member.sync_to_google) {
          googleAttendees.push(member.email);
        }
      }
      // Everyone is tracked internally
      internalAttendees.push(member.id);
    }

    console.log('Attendee filtering results:', {
      total: attendeeIds.length,
      googleInvites: googleAttendees.length,
      internal: internalAttendees.length
    });

    return { googleAttendees, internalAttendees };
  } catch (error) {
    console.error('Error in filterAttendeesForGoogleSync:', error);
    return { googleAttendees: [], internalAttendees: attendeeIds };
  }
}

/**
 * Get email addresses for family members
 * Used when displaying who will receive Google invites
 */
export async function getFamilyMemberEmails(
  memberIds: string[]
): Promise<Map<string, string | null>> {
  const emailMap = new Map<string, string | null>();
  
  if (!memberIds || memberIds.length === 0) {
    return emailMap;
  }

  try {
    const supabase = await createClient();
    
    const { data: members, error } = await supabase
      .from('family_members')
      .select('id, email')
      .in('id', memberIds);

    if (error) {
      console.error('Error fetching member emails:', error);
      return emailMap;
    }

    for (const member of members || []) {
      emailMap.set(member.id, member.email);
    }

    return emailMap;
  } catch (error) {
    console.error('Error in getFamilyMemberEmails:', error);
    return emailMap;
  }
}

/**
 * Format attendees for display
 * Shows who will get Google invites vs internal tracking
 */
export function formatAttendeesForDisplay(
  familyMembers: FamilyMember[],
  attendeeIds: string[]
): { googleInvites: FamilyMember[]; internalOnly: FamilyMember[] } {
  const googleInvites: FamilyMember[] = [];
  const internalOnly: FamilyMember[] = [];

  for (const id of attendeeIds) {
    const member = familyMembers.find(m => m.id === id);
    if (!member) continue;

    if (member.sync_to_google && member.email) {
      googleInvites.push(member);
    } else {
      internalOnly.push(member);
    }
  }

  return { googleInvites, internalOnly };
}
