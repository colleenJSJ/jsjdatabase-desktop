'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useUser } from '@/contexts/user-context';

interface PersonFilterContextType {
  selectedPersonId: string | null;
  setSelectedPersonId: (id: string | null) => void;
  isLoading: boolean;
}

const PersonFilterContext = createContext<PersonFilterContextType>({
  selectedPersonId: null,
  setSelectedPersonId: () => {},
  isLoading: true,
});

export function PersonFilterProvider({ children }: { children: ReactNode }) {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: userLoading } = useUser();

  // Initialise from localStorage or user defaults
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (userLoading) return;

    const stored = localStorage.getItem('selectedPersonId');

    if (user?.role === 'admin') {
      if (stored !== null) {
        localStorage.removeItem('selectedPersonId');
      }
      setSelectedPersonId(null);
      setIsLoading(false);
      return;
    }

    if (stored !== null) {
      setSelectedPersonId(stored === 'null' ? null : stored);
      setIsLoading(false);
      return;
    }

    if (user) {
      setSelectedPersonId(user.family_member_id ?? null);
    } else {
      setSelectedPersonId(null);
    }
    setIsLoading(false);
  }, [user, userLoading]);
  
  // Persist changes to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !isLoading) {
      if (user?.role === 'admin') {
        localStorage.removeItem('selectedPersonId');
        return;
      }

      if (selectedPersonId) {
        localStorage.setItem('selectedPersonId', selectedPersonId);
      } else {
        localStorage.removeItem('selectedPersonId');
      }
    }
  }, [selectedPersonId, isLoading, user?.role]);
  
  return (
    <PersonFilterContext.Provider value={{ 
      selectedPersonId, 
      setSelectedPersonId,
      isLoading 
    }}>
      {children}
    </PersonFilterContext.Provider>
  );
}

export const usePersonFilter = () => {
  if (typeof window === 'undefined') {
    return {
      selectedPersonId: null,
      setSelectedPersonId: () => {},
      isLoading: true,
    } satisfies PersonFilterContextType;
  }
  return useContext(PersonFilterContext);
};
