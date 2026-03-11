import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Access environment variables directly (Edge Runtime compatible)
// These must be set in Vercel environment variables (or .env.local for local dev)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

// Edge Runtime compatible helper functions using REST API
async function getUserFromToken(accessToken: string) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    
    if (!response.ok) {
      return { user: null, error: 'Failed to get user' };
    }
    
    const user = await response.json();
    return { user, error: null };
  } catch (error) {
    return { user: null, error: 'Auth error' };
  }
}

async function getProfileFromDB(userId: string) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=user_type,signup_status`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      return { data: null, error: 'Failed to fetch profile' };
    }
    
    const data = await response.json();
    return { data: data[0] || null, error: null };
  } catch (error) {
    return { data: null, error: 'Database error' };
  }
}

async function getSubscriptionFromDB(userId: string) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&status=in.(active,trialing,canceled,past_due)&order=provider.asc&limit=1&select=status,expires_at,current_period_end`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      return { data: null, error: 'Failed to fetch subscription' };
    }
    
    const data = await response.json();
    return { data: data[0] || null, error: null };
  } catch (error) {
    return { data: null, error: 'Database error' };
  }
}

const PENDING_ALLOWED_PREFIXES = [
  '/signup',
  '/login',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/update-user-type',
  '/api/auth/abort-signup',
  '/api/auth/me',  // Allow auth check endpoint
  '/api/payments',
  '/landing',
  '/forgot-password',
  '/reset-password',
  '/password-reset',
];

const PROTECTED_ROUTES = ['/admin', '/settings'];
const ADMIN_ROUTES = ['/admin'];

function isPathAllowed(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;

  const accessToken = request.cookies.get('sb-access-token')?.value;
  
  // Redirect unauthenticated users from homepage to landing page
  if (!accessToken && pathname === '/') {
    return NextResponse.redirect(new URL('/landing', request.url));
  }
  
  if (!accessToken) {
    return NextResponse.next();
  }

  try {
    const { user, error } = await getUserFromToken(accessToken);

    if (error || !user) {
      return NextResponse.next();
    }

    let profileUser: {
      user_type?: string;
      signup_status?: string;
      subscription?: {
        is_active?: boolean;
      };
    } | null = null;

    // Try to fetch profile from database directly (more reliable)
    try {
      // Run profile and subscription lookups in parallel — ~30–50% faster per authenticated request
      const [{ data: profileData, error: profileError }, { data: subscriptionData }] = await Promise.all([
        getProfileFromDB(user.id),
        getSubscriptionFromDB(user.id),
      ]);

      if (!profileError && profileData) {
        // Check for active subscription using unified table
        // Include 'canceled' and 'past_due' to handle subscriptions that are canceled but not expired

        // Check if subscription is active and not expired
        // This matches the logic in getActiveSubscription
        let hasActiveSubscription = false;
        if (subscriptionData) {
          const now = Date.now();
          const expiresAt = subscriptionData.expires_at ? new Date(subscriptionData.expires_at).getTime() : null;
          const periodEnd = subscriptionData.current_period_end ? new Date(subscriptionData.current_period_end).getTime() : null;
          const expirationDate = expiresAt || periodEnd;
          
          // If no expiration date, only 'active' and 'trialing' grant access
          if (!expirationDate) {
            hasActiveSubscription = subscriptionData.status === 'active' || subscriptionData.status === 'trialing';
          } else if (expirationDate > now) {
            // Not expired - check status
            // 'active' and 'trialing' always grant access if not expired
            if (subscriptionData.status === 'active' || subscriptionData.status === 'trialing') {
              hasActiveSubscription = true;
            }
            // 'canceled' status: grant access if not expired (user paid until period end)
            else if (subscriptionData.status === 'canceled') {
              hasActiveSubscription = true;
            }
            // 'past_due' status: grant access if not expired (grace period)
            else if (subscriptionData.status === 'past_due') {
              hasActiveSubscription = true;
            }
          }
          // If expired (expirationDate <= now), hasActiveSubscription remains false
        }

        profileUser = {
          user_type: profileData.user_type,
          signup_status: profileData.signup_status,
          subscription: {
            is_active: hasActiveSubscription || false,
          },
        };
      }
    } catch (profileError) {
      console.error('Profile fetch in middleware failed:', profileError);
      // Fallback: try API endpoint if direct DB query fails
      try {
        const profileResponse = await fetch(`${origin}/api/auth/me`, {
          headers: {
            cookie: request.headers.get('cookie') || '',
          },
        });

        if (profileResponse.ok) {
          const data = await profileResponse.json();
          profileUser = data.user ?? null;
        }
      } catch (apiError) {
        console.error('API fallback in middleware failed:', apiError);
      }
    }

    // Removed abort-signup functionality - users can navigate freely during signup

    const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
    const isAdminRoute = ADMIN_ROUTES.some(route => pathname.startsWith(route));

    // Prioritize subscription object over user_type for access checks
    // Subscription object is the source of truth (checked against expiration dates)
    // user_type is used as fallback for display purposes
    const hasActiveSubscription = Boolean(profileUser?.subscription?.is_active);
    const isSubscriber =
      hasActiveSubscription || // Primary check: subscription object
      profileUser?.user_type === 'subscriber' || // Fallback: user_type (may be stale)
      profileUser?.user_type === 'admin' ||
      profileUser?.user_type === 'staff';

    const isFreeUser = profileUser?.user_type === 'free';
    const isAdmin = profileUser?.user_type === 'admin';
    const isStaff = profileUser?.user_type === 'staff';
    const isPending = profileUser?.signup_status === 'pending';
    
    // User has a valid account if they have free, subscriber, admin, or staff account type OR have an active subscription
    // BUT: Pending users (signup_status === 'pending') should never see the homepage, even if they have user_type === 'free'
    // This ensures users who haven't completed signup are always redirected to landing page
    const hasValidAccount = (isFreeUser || isSubscriber || isAdmin || isStaff || hasActiveSubscription) && !isPending;

    // Block homepage access if user doesn't have a valid account OR is pending
    // Users who don't have a valid account type or are pending can access:
    // - /landing (to see "Finish sign-up" button)
    // - /settings (to see "Finish signing up" messaging)
    // - /signup/* (to complete signup)
    // - /login
    // But NOT the homepage (/)
    if (pathname === '/' && !hasValidAccount) {
      return NextResponse.redirect(new URL('/landing', request.url));
    }

    // Note: Video content access is now checked at the component level
    // Free users can access video routes, but premium content will be blocked
    // with an upgrade prompt in the VideoModal/ContentModal components
    // This allows free users to browse and see premium badges, but prevents playback
    // of premium content without a subscription

    if (!isProtectedRoute) {
      return NextResponse.next();
    }

    // For protected routes, ensure user still valid (token already checked above)
    // Admin routes are accessible to both admin and staff users
    if (isAdminRoute) {
      if (profileUser?.user_type !== 'admin' && profileUser?.user_type !== 'staff') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
