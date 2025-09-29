/**
 * Shared hook for fetching and caching users
 * Prevents multiple components from fetching the same user data
 */

import { useState, useEffect, useRef } from 'react';
import ApiClient from '@/lib/api/api-client';
import { User } from '@/lib/supabase/types';

// Global cache for users
let usersCache: User[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface UseUsersResult {
  users: User[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUsers(): UseUsersResult {
  const [users, setUsers] = useState<User[]>(usersCache || []);
  const [loading, setLoading] = useState(!usersCache);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchUsers = async (force = false) => {
    // Check cache validity
    if (!force && usersCache && cacheTimestamp) {
      const cacheAge = Date.now() - cacheTimestamp;
      if (cacheAge < CACHE_DURATION) {
        setUsers(usersCache);
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
      const response = await ApiClient.get<{ users: User[] }>('/api/auth/users');
      
      if (response.success && response.data) {
        const fetchedUsers = response.data.users || [];
        
        // Update global cache
        usersCache = fetchedUsers;
        cacheTimestamp = Date.now();
        
        setUsers(fetchedUsers);
        setError(null);
      } else {
        throw new Error(response.error || 'Failed to fetch users');
      }
    } catch (err) {
      console.error('[useUsers] Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
      
      // Use cached data if available on error
      if (usersCache) {
        setUsers(usersCache);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const refresh = async () => {
    await fetchUsers(true);
  };

  return { users, loading, error, refresh };
}

// Helper hook to get a specific user
export function useUser(userId: string | null | undefined): User | undefined {
  const { users } = useUsers();
  return userId ? users.find(u => u.id === userId) : undefined;
}

// Helper hook to get current user from users list
export function useCurrentUserFromList(currentUserId: string | null | undefined): User | undefined {
  const { users } = useUsers();
  return currentUserId ? users.find(u => u.id === currentUserId) : undefined;
}

// Clear the cache (useful for logout or data refresh)
export function clearUsersCache() {
  usersCache = null;
  cacheTimestamp = null;
}