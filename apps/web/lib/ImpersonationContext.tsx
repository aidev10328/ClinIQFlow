'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

export interface ImpersonatedUser {
  id: string;
  email: string;
  fullName?: string;
  role?: string;
  hospitalId?: string;
  hospitalName?: string;
}

interface ImpersonationContextShape {
  isImpersonating: boolean;
  impersonatedUser: ImpersonatedUser | null;
  originalUserId: string | null;
  // Start impersonating a user
  startImpersonation: (user: ImpersonatedUser) => void;
  // Stop impersonating and return to admin view
  stopImpersonation: () => void;
  // Get the impersonation header for API calls
  getImpersonationHeader: () => Record<string, string>;
}

const ImpersonationContext = createContext<ImpersonationContextShape | undefined>(undefined);

const STORAGE_KEY = 'clinqflow_impersonation';

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);
  const [originalUserId, setOriginalUserId] = useState<string | null>(null);

  // Restore impersonation state from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          setImpersonatedUser(data.impersonatedUser);
          setOriginalUserId(data.originalUserId);
        } catch (e) {
          console.error('Failed to restore impersonation state:', e);
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  }, []);

  // Save impersonation state to sessionStorage
  const saveState = useCallback((user: ImpersonatedUser | null, originalId: string | null) => {
    if (typeof window !== 'undefined') {
      if (user && originalId) {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ impersonatedUser: user, originalUserId: originalId })
        );
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const startImpersonation = useCallback((user: ImpersonatedUser) => {
    // Get current user ID from localStorage or auth (we'll set originalUserId when starting)
    const currentUserId = originalUserId || 'admin'; // This will be set properly from auth
    setImpersonatedUser(user);
    setOriginalUserId(currentUserId);
    saveState(user, currentUserId);

    // Reload the page to re-fetch all data with impersonation context
    window.location.href = '/hospital';
  }, [originalUserId, saveState]);

  const stopImpersonation = useCallback(() => {
    setImpersonatedUser(null);
    setOriginalUserId(null);
    saveState(null, null);

    // Clear hospital selection since we're returning to admin
    if (typeof window !== 'undefined') {
      localStorage.removeItem('clinqflow_hospital_id');
    }

    // Redirect to admin dashboard
    window.location.href = '/admin/dashboard';
  }, [saveState]);

  const getImpersonationHeader = useCallback((): Record<string, string> => {
    if (impersonatedUser) {
      return { 'X-Impersonate-User-Id': impersonatedUser.id };
    }
    return {};
  }, [impersonatedUser]);

  const isImpersonating = impersonatedUser !== null;

  const contextValue = useMemo(() => ({
    isImpersonating,
    impersonatedUser,
    originalUserId,
    startImpersonation,
    stopImpersonation,
    getImpersonationHeader,
  }), [isImpersonating, impersonatedUser, originalUserId, startImpersonation, stopImpersonation, getImpersonationHeader]);

  return (
    <ImpersonationContext.Provider value={contextValue}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) {
    throw new Error('useImpersonation must be used within ImpersonationProvider');
  }
  return ctx;
}
