'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface PasswordSecurityContextType {
  isLocked: boolean;
  lastActivity: Date;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  updateActivity: () => void;
  sessionTimeout: number;
}

const PasswordSecurityContext = createContext<PasswordSecurityContextType | undefined>(undefined);

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds

export function PasswordSecurityProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [lastActivity, setLastActivity] = useState(new Date());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const updateActivity = useCallback(() => {
    setLastActivity(new Date());
  }, []);

  const lock = useCallback(() => {
    setIsLocked(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    try {
      // Verify user's password with the auth service
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        setIsLocked(false);
        updateActivity();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to verify password:', error);
      return false;
    }
  }, [updateActivity]);

  // Set up auto-lock timer
  useEffect(() => {
    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        lock();
      }, SESSION_TIMEOUT);
    };

    // Activity listeners
    const handleActivity = () => {
      if (!isLocked) {
        updateActivity();
        resetTimer();
      }
    };

    // Add event listeners for user activity
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);

    // Start the timer
    resetTimer();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [isLocked, lock, updateActivity]);

  return (
    <PasswordSecurityContext.Provider value={{
      isLocked,
      lastActivity,
      unlock,
      lock,
      updateActivity,
      sessionTimeout: SESSION_TIMEOUT
    }}>
      {children}
    </PasswordSecurityContext.Provider>
  );
}

export function usePasswordSecurity() {
  const context = useContext(PasswordSecurityContext);
  if (!context) {
    throw new Error('usePasswordSecurity must be used within a PasswordSecurityProvider');
  }
  return context;
}

const FALLBACK_SECURITY_CONTEXT: PasswordSecurityContextType = {
  isLocked: false,
  lastActivity: new Date(0),
  unlock: async () => true,
  lock: () => {},
  updateActivity: () => {},
  sessionTimeout: SESSION_TIMEOUT,
};

/**
 * Same as usePasswordSecurity but safe to call when the provider is missing.
 * Useful for places that only need the updateActivity helper and don't require
 * the full lock/unlock experience.
 */
export function usePasswordSecurityOptional() {
  return useContext(PasswordSecurityContext) ?? FALLBACK_SECURITY_CONTEXT;
}
