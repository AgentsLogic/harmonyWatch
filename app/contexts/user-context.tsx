"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import { publicConfig } from '@/lib/env';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

export interface UserSubscription {
  id: string;
  status: string;
  plan: 'monthly' | 'yearly' | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  cancel_at_period_end?: boolean;
  is_active: boolean;
  management_url?: string | null; // RevenueCat customer portal URL for Web Billing subscriptions
  store?: 'app_store' | 'play_store' | 'stripe' | 'rc_billing' | 'promotional' | 'youtube' | 'patreon' | null; // Subscription store type
  has_billing_issue?: boolean; // Indicates if subscription has a billing issue (grace period)
  grace_period_expires_at?: string | null; // When grace period expires (if applicable)
}

export interface User {
  id: string;
  email: string;
  user_type: 'free' | 'subscriber' | 'admin' | 'staff';
  signup_status: 'pending' | 'complete';
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  created_at: string;
  last_login?: string;
  subscription: UserSubscription | null;
  subscription_error?: string | null;
}

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  register: (email: string, password: string, userType?: 'free' | 'subscriber') => Promise<{ success: boolean; error?: string; needsEmailVerification?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  supabaseUser: SupabaseUser | null;
  hasActiveSubscription: boolean;
  hasPlan: boolean;
  getSessionToken: () => Promise<string | null>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'harmony_user';

// Helper functions for localStorage
function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<User>;
    return {
      ...parsed,
      subscription: parsed.subscription ?? null,
    } as User;
  } catch {
    return null;
  }
}

function setStoredUser(user: User | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  // Always initialize with null to match server render (prevents hydration mismatch)
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  // Load from localStorage immediately after mount (before first paint to prevent flash)
  useEffect(() => {
    setHasMounted(true);
    // Load stored user immediately to prevent flash
    const storedUser = getStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }
  }, []);

  // Update localStorage whenever user changes (but only after mount)
  useEffect(() => {
    if (hasMounted) {
      setStoredUser(user);
    }
  }, [user, hasMounted]);

  // Check if user is logged in on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check Supabase session first (faster than API call)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (session?.user && !sessionError) {
          // We have a Supabase session - verify with API to get full profile
          setSupabaseUser(session.user);
          await fetchUserProfile(session.user.id);
        } else {
          // No Supabase session - check API as fallback
          await checkAuthStatus();
        }
      } catch (error) {
        console.error('Auth init error:', error);
        // Fallback to API check
        await checkAuthStatus();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        if (event === 'SIGNED_IN' && session?.user) {
          setSupabaseUser(session.user);
          await fetchUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setSupabaseUser(null);
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Use the API route to check auth status consistently
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        // Set a mock supabase user for compatibility
        setSupabaseUser({
          id: data.user.id,
          email: data.user.email,
          created_at: data.user.created_at,
          last_sign_in_at: data.user.last_login,
        } as SupabaseUser);
      } else if (response.status === 401) {
        // 401 means not logged in or session expired
        const data = await response.json().catch(() => ({}));
        if (data.expired) {
          // Session expired - clear user state only if confirmed expired
          setUser(null);
          setSupabaseUser(null);
        } else {
          // Not logged in - only clear if we don't have optimistic state
          // This prevents flash when user is actually logged in but API is slow
          if (!user) {
            setUser(null);
            setSupabaseUser(null);
          }
        }
      } else if (response.status === 503) {
        // Service unavailable (network/DNS error) - don't clear user, just log
        console.warn('Authentication service temporarily unavailable');
        // Keep optimistic state
      } else {
        console.error('Error checking auth status:', response.status);
        // Only clear if we don't have optimistic state
        if (!user) {
          setUser(null);
          setSupabaseUser(null);
        }
      }
    } catch (error) {
      // Only log non-network errors
      if (error instanceof Error && !error.message.includes('fetch failed')) {
        console.error('Error checking auth status:', error);
      }
      // Don't clear user state on network errors - might be temporary
      // Keep optimistic state from localStorage
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else if (response.status === 401) {
        // 401 means not logged in or session expired
        const data = await response.json().catch(() => ({}));
        if (data.expired) {
          // Session expired - clear user state
          setUser(null);
          setSupabaseUser(null);
        } else {
          // Not logged in - only clear if we don't have optimistic state
          if (!user) {
            setUser(null);
            setSupabaseUser(null);
          }
        }
      } else if (response.status === 503) {
        // Service unavailable - don't clear user on network errors
        console.warn('Authentication service temporarily unavailable');
        // Keep optimistic state
      } else {
        console.error('Failed to fetch user profile:', response.status);
        // Only clear if we don't have optimistic state
        if (!user) {
          setUser(null);
        }
      }
    } catch (error) {
      // Only log non-network errors
      if (error instanceof Error && !error.message.includes('fetch failed')) {
        console.error('Error fetching user profile:', error);
      }
      // Don't clear user state on network errors - might be temporary
      // Keep optimistic state from localStorage
    }
  };

  const hasActiveSubscription = useMemo(
    () => Boolean(user?.subscription?.is_active || user?.user_type === 'admin' || user?.user_type === 'staff'),
    [user]
  );

  const hasPlan = useMemo(() => {
    if (!user) return false;
    const isFreeUser = user.user_type === 'free';
    const isAdmin = user.user_type === 'admin';
    const isStaff = user.user_type === 'staff';
    const hasActive = user.subscription?.is_active === true;
    return isFreeUser || isAdmin || isStaff || hasActive;
  }, [user]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Update user state
        setUser(data.user);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error occurred' };
    }
  };

  const register = async (
    email: string, 
    password: string, 
    userType: 'free' | 'subscriber' = 'free'
  ): Promise<{ success: boolean; error?: string; needsEmailVerification?: boolean }> => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, userType }),
      });

      const data = await response.json();

      if (response.ok) {
        // If user was created and session exists, update user state
        if (data.user && !data.needsEmailVerification) {
          setUser(data.user);
          
          // Set Supabase session if tokens are provided
          if (data.session?.access_token && data.session?.refresh_token) {
            try {
              const { error: sessionError } = await supabase.auth.setSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              });
              if (sessionError) {
                console.error('Failed to set Supabase session:', sessionError);
              }
            } catch (sessionSetError) {
              console.error('Error setting session:', sessionSetError);
            }
          }
        }
        return { 
          success: true, 
          needsEmailVerification: data.needsEmailVerification 
        };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Network error occurred' };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Call logout API to clear server-side session
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Clear user state
      // The homepage component will handle redirect to landing when user becomes null
      setUser(null);
      setSupabaseUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state
      setUser(null);
      setSupabaseUser(null);
    }
  };

  const refreshUser = useCallback(async (): Promise<void> => {
    await checkAuthStatus();
  }, []); // checkAuthStatus doesn't depend on any props/state that changes

  const getSessionToken = async (): Promise<string | null> => {
    try {
      let { data: { session }, error } = await supabase.auth.getSession();
      
      // If session is expired or invalid, try to refresh it
      // But only if we have a refresh token (session exists but access token is expired)
      if ((error || !session?.access_token) && session?.refresh_token) {
        console.log('[getSessionToken] Session invalid, attempting refresh');
        try {
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshedSession?.access_token) {
            session = refreshedSession;
            error = null;
          } else if (refreshError) {
            // Refresh failed - token might be invalid or already used
            console.warn('[getSessionToken] Token refresh failed:', refreshError.message);
            // Clear invalid session
            await supabase.auth.signOut();
            return null;
          }
        } catch (refreshErr) {
          // Refresh threw an error - likely no valid refresh token
          console.warn('[getSessionToken] Token refresh error:', refreshErr);
          return null;
        }
      }
      
      if (error || !session?.access_token) {
        // No session or no access token - user is not logged in
        return null;
      }
      
      return session.access_token;
    } catch (error) {
      console.error('Error getting session token:', error);
      return null;
    }
  };

  const value: UserContextType = {
    user,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
    supabaseUser,
    hasActiveSubscription,
    hasPlan,
    getSessionToken,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}