/**
 * AuthContext - Authentication state management
 *
 * Provides current user info and auth state to the app.
 * Fetches user from /api/me on mount.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signOut: () => void;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
  });

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch('/api/me');
      const data = await response.json() as { success: boolean; data?: User; error?: { message: string } };

      if (data.success && data.data) {
        setState({ user: data.data, isLoading: false, error: null });
      } else {
        setState({
          user: null,
          isLoading: false,
          error: data.error?.message || 'Authentication required',
        });
      }
    } catch (err) {
      setState({
        user: null,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch user',
      });
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const signOut = useCallback(() => {
    if (state.user?.logoutUrl) {
      // Redirect to Cloudflare Access logout
      window.location.href = state.user.logoutUrl;
    } else {
      // In dev mode, just clear the user state
      setState({ user: null, isLoading: false, error: null });
    }
  }, [state.user?.logoutUrl]);

  const value: AuthContextValue = {
    ...state,
    signOut,
    refetchUser: fetchUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
