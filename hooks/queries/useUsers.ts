/**
 * React Query hooks for Users
 */

import { useQuery } from '@tanstack/react-query';
import ApiClient from '@/lib/api/api-client';
import { User } from '@/lib/supabase/types';

// Query keys factory
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: () => [...userKeys.lists()] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  current: () => [...userKeys.all, 'current'] as const,
};

// Fetch all users
export function useUsersQuery() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: async () => {
      const response = await ApiClient.get<{ users: User[] }>('/api/auth/users');
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch users');
      }
      return response.data?.users || [];
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}

// Get a specific user
export function useUserQuery(userId: string | null | undefined) {
  const { data: users } = useUsersQuery();
  
  return {
    data: userId ? users?.find(u => u.id === userId) : undefined,
    isLoading: !users,
  };
}

// Get user by email
export function useUserByEmail(email: string | null | undefined) {
  const { data: users } = useUsersQuery();
  
  return {
    data: email ? users?.find(u => u.email?.toLowerCase() === email.toLowerCase()) : undefined,
    isLoading: !users,
  };
}

// Get current user
export function useCurrentUserQuery() {
  return useQuery({
    queryKey: userKeys.current(),
    queryFn: async () => {
      const response = await ApiClient.get<User>('/api/auth/me');
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch current user');
      }
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}