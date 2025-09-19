/**
 * Shared hook for fetching and caching family members
 * Prevents multiple components from fetching the same family member data
 * Now integrated with PersonService for consistent UUID handling
 */

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import ApiClient from '@/lib/api/api-client';
import { personService, Person } from '@/lib/services/person.service';

export interface FamilyMember {
  id: string;
  name: string;
  email?: string;
  is_child: boolean;
  relationship?: string;
  birth_date?: string;
  created_at: string;
  updated_at?: string;
  type?: 'human' | 'pet';
  role?: string;
  display_name?: string;
}

// Global cache for family members
let familyMembersCache: FamilyMember[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

interface UseFamilyMembersResult {
  familyMembers: FamilyMember[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFamilyMembers(): UseFamilyMembersResult {
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(familyMembersCache || []);
  const [loading, setLoading] = useState(!familyMembersCache);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchFamilyMembers = async (force = false) => {
    // Check cache validity
    if (!force && familyMembersCache && cacheTimestamp) {
      const cacheAge = Date.now() - cacheTimestamp;
      if (cacheAge < CACHE_DURATION) {
        setFamilyMembers(familyMembersCache);
        setLoading(false);
        return;
      }
    }

    // Prevent duplicate fetches
    if (isFetchingRef.current && !force) {
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: supabaseError } = await supabase
        .from('family_members')
        .select('*')
        .order('name', { ascending: true });

      if (supabaseError) {
        throw new Error(supabaseError.message);
      }

      const members = data || [];
      
      // Update global cache
      familyMembersCache = members;
      cacheTimestamp = Date.now();
      
      setFamilyMembers(members);
      setError(null);
    } catch (err) {
      console.error('[useFamilyMembers] Error fetching family members:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch family members');
      
      // Use cached data if available on error
      if (familyMembersCache) {
        setFamilyMembers(familyMembersCache);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchFamilyMembers();
  }, []);

  const refresh = async () => {
    await fetchFamilyMembers(true);
  };

  return { familyMembers, loading, error, refresh };
}

// Helper hook to get a specific family member
export function useFamilyMember(memberId: string | null | undefined): FamilyMember | undefined {
  const { familyMembers } = useFamilyMembers();
  return memberId ? familyMembers.find(m => m.id === memberId) : undefined;
}

// Helper hook to get family member by email
export function useFamilyMemberByEmail(email: string | null | undefined): FamilyMember | undefined {
  const { familyMembers } = useFamilyMembers();
  return email ? familyMembers.find(m => m.email?.toLowerCase() === email.toLowerCase()) : undefined;
}

// Helper hook to get family member by name
export function useFamilyMemberByName(name: string | null | undefined): FamilyMember | undefined {
  const { familyMembers } = useFamilyMembers();
  if (!name) return undefined;
  
  const nameLower = name.toLowerCase();
  return familyMembers.find(m => {
    const memberNameLower = m.name.toLowerCase();
    // Check full name or first name match
    return memberNameLower === nameLower || 
           memberNameLower.split(' ')[0] === nameLower;
  });
}

// Helper to get sorted family members with custom order
export function useSortedFamilyMembers(customOrder?: string[]): FamilyMember[] {
  const { familyMembers } = useFamilyMembers();
  
  if (!customOrder || customOrder.length === 0) {
    return familyMembers;
  }
  
  return [...familyMembers].sort((a, b) => {
    const aFirstName = a.name.split(' ')[0];
    const bFirstName = b.name.split(' ')[0];
    const aIndex = customOrder.indexOf(aFirstName);
    const bIndex = customOrder.indexOf(bFirstName);
    
    // If both are in custom order, sort by that
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    // If only one is in custom order, it comes first
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    // Otherwise sort alphabetically
    return aFirstName.localeCompare(bFirstName);
  });
}

// Clear the cache (useful for logout or data refresh)
export function clearFamilyMembersCache() {
  familyMembersCache = null;
  cacheTimestamp = null;
  // Also clear PersonService cache
  personService.clearCache();
}

// Helper to resolve person references (names or IDs) to UUIDs
export async function resolvePersonReference(ref: string | string[]): Promise<string | string[] | null> {
  await personService.initialize();
  return personService.resolvePersonReference(ref);
}

// Helper to expand UUIDs to full person objects
export async function expandPersonReferences(ids: string | string[]): Promise<Person | Person[] | null> {
  await personService.initialize();
  return personService.expandPersonReferences(ids);
}

// Helper to convert names to IDs
export async function convertNameToId(name: string): Promise<string | null> {
  await personService.initialize();
  return personService.convertNameToId(name);
}

// Helper to convert IDs to names
export async function convertIdToName(id: string): Promise<string | null> {
  await personService.initialize();
  return personService.convertIdToName(id);
}