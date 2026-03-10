import { createClient } from '@supabase/supabase-js';
import { publicConfig } from '@/lib/env';

// Initialize Supabase client for client-side operations
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

/**
 * Check if should save progress (>5% watched)
 */
export function shouldSaveProgress(currentTime: number, duration: number): boolean {
  if (duration === 0) return false;
  const percentage = (currentTime / duration) * 100;
  return percentage >= 5;
}

/**
 * Check if video is completed (>95% watched)
 */
export function isVideoCompleted(currentTime: number, duration: number): boolean {
  if (duration === 0) return false;
  const percentage = (currentTime / duration) * 100;
  return percentage >= 95;
}

/**
 * Throttle progress saves (every 15 seconds)
 */
export function createProgressThrottle(callback: Function, delay: number = 15000) {
  let lastCall = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      callback(...args);
    }
  };
}

/**
 * Get current user's session token for API calls
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Fetch progress from API (returns 0 if not logged in)
 */
export async function fetchVideoProgress(contentId: string): Promise<number> {
  try {
    console.log('[Progress] Fetching progress for contentId:', contentId);

    const response = await fetch(`/api/video-progress?contentId=${contentId}`, {
      credentials: 'include', // Ensure cookies are sent
    });

    console.log('[Progress] API response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('[Progress] API response data:', data);
      return data.currentTime || 0;
    }
    
    // If 401 (not authenticated), return 0 silently
    if (response.status === 401) {
      console.log('[Progress] 401 Unauthorized - user not authenticated');
      return 0;
    }
  } catch (error) {
    console.error('Error fetching video progress:', error);
  }
  return 0;
}

/**
 * Save progress to API (no-op if not logged in)
 */
export async function saveVideoProgress(
  contentId: string, 
  currentTime: number, 
  duration: number
): Promise<void> {
  if (!shouldSaveProgress(currentTime, duration)) {
    console.log('[Progress] Not saving - below 5% threshold:', (currentTime / duration) * 100);
    return; // Don't save if less than 5%
  }
  
  try {
    console.log('[Progress] Saving progress for contentId:', contentId);
    console.log('[Progress] Current time:', currentTime, 'Duration:', duration);

    const response = await fetch('/api/video-progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include', // Ensure cookies are sent
      body: JSON.stringify({ contentId, currentTime, duration }),
    });

    console.log('[Progress] Save response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[Progress] Save successful:', data);
    } else {
      const errorData = await response.text();
      console.log('[Progress] Save failed:', errorData);
    }
  } catch (error) {
    console.error('Error saving video progress:', error);
  }
}

/**
 * Clear progress from API (no-op if not logged in)
 */
export async function clearVideoProgress(contentId: string): Promise<void> {
  try {
    await fetch(`/api/video-progress?contentId=${contentId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Ensure cookies are sent
    });
    // Silently ignore 401 errors (not logged in)
  } catch (error) {
    console.error('Error clearing video progress:', error);
  }
}

/**
 * Save progress immediately (for pause/unmount events)
 */
export async function saveProgressImmediately(
  contentId: string,
  currentTime: number,
  duration: number
): Promise<void> {
  try {
    const token = await getAuthToken();
    
    if (!token) {
      // User not logged in, silently ignore
      return;
    }

    // Save immediately regardless of percentage (for pause/unmount)
    await fetch('/api/video-progress', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contentId, currentTime, duration }),
    });
  } catch (error) {
    console.error('Error saving video progress immediately:', error);
  }
}
