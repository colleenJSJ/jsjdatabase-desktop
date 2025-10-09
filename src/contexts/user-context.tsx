'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/lib/supabase/types';
import { useRouter } from 'next/navigation';
import ApiClient from '@/lib/api/api-client';

type UserContextType = {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUser = async () => {
    console.log('[UserContext] Fetching user...');
    try {
      console.log('[UserContext] Calling /api/auth/me');
      const response = await fetch('/api/auth/me');
      console.log('[UserContext] Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('[UserContext] User data received:', data);
        setUser(data.user);
      } else {
        console.log('[UserContext] Response not OK, setting user to null');
        setUser(null);
      }
    } catch (error) {
      console.error('[UserContext] Error fetching user:', error);
      setUser(null);
    } finally {
      console.log('[UserContext] Setting loading to false');
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await ApiClient.post('/api/auth/logout');
      setUser(null);
      router.push('/login');
    } catch (error) {

    }
  };

  const refreshUser = async () => {
    setLoading(true);
    await fetchUser();
  };

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  return (
    <UserContext.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
