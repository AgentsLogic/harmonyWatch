import { serverConfig } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

/**
 * Patreon Membership Service
 * Handles OAuth, identity checks, webhook verification, and campaign member fetching
 * 
 * IMPORTANT: All Patreon API calls MUST include:
 * - User-Agent: HarmonyWatch/1.0 header
 * - Explicit fields[resource_type] parameters (V2 returns no data attributes by default)
 */

const PATREON_CLIENT_ID = serverConfig.PATREON_CLIENT_ID;
const PATREON_CLIENT_SECRET = serverConfig.PATREON_CLIENT_SECRET;
const PATREON_CAMPAIGN_ID = serverConfig.PATREON_CAMPAIGN_ID;
const PATREON_CREATOR_ACCESS_TOKEN = serverConfig.PATREON_CREATOR_ACCESS_TOKEN;
const PATREON_WEBHOOK_SECRET = serverConfig.PATREON_WEBHOOK_SECRET;
const ENCRYPTION_KEY = serverConfig.LINKED_ACCOUNT_ENCRYPTION_KEY;

// Patreon API endpoints
const PATREON_TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';
const PATREON_API_BASE = 'https://www.patreon.com/api/oauth2/v2';

// Required User-Agent header for all Patreon API calls
const USER_AGENT = 'HarmonyWatch/1.0';

/**
 * Encrypt OAuth token for storage
 */
function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('LINKED_ACCOUNT_ENCRYPTION_KEY is not configured');
  }
  
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV + encrypted data (IV needed for decryption)
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt OAuth token from storage
 */
function decryptToken(encryptedToken: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('LINKED_ACCOUNT_ENCRYPTION_KEY is not configured');
  }
  
  const [ivHex, encrypted] = encryptedToken.split(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted token format');
  }
  
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = Buffer.from(ivHex, 'hex');
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Exchange OAuth authorization code for access and refresh tokens
 */
export async function exchangePatreonCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET) {
    throw new Error('Patreon OAuth is not configured');
  }

  const response = await fetch(PATREON_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: PATREON_CLIENT_ID,
      client_secret: PATREON_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange Patreon OAuth code: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600,
  };
}

/**
 * Refresh Patreon OAuth access token using refresh token
 */
export async function refreshPatreonToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET) {
    throw new Error('Patreon OAuth is not configured');
  }

  const response = await fetch(PATREON_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: PATREON_CLIENT_ID,
      client_secret: PATREON_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh Patreon token: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
  };
}

/**
 * Get Patreon user identity with membership information
 * Uses explicit fields parameters (V2 API returns no data attributes by default)
 */
export async function getPatreonIdentity(accessToken: string): Promise<{
  user: {
    id: string;
    email: string;
    full_name: string;
    image_url?: string;
  };
  membership: {
    patron_status: string | null;
    currently_entitled_amount_cents: number;
    last_charge_status: string | null;
    last_charge_date: string | null;
    next_charge_date: string | null;
    pledge_cadence: number | null;
    pledge_relationship_start: string | null;
    campaign_lifetime_support_cents: number;
  } | null;
}> {
  // Build URL with explicit fields parameters
  const url = new URL(`${PATREON_API_BASE}/identity`);
  url.searchParams.set('include', 'memberships');
  url.searchParams.set('fields[user]', 'email,full_name,image_url');
  url.searchParams.set(
    'fields[member]',
    'patron_status,currently_entitled_amount_cents,last_charge_status,last_charge_date,next_charge_date,pledge_cadence,pledge_relationship_start,campaign_lifetime_support_cents'
  );

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Patreon identity: ${error}`);
  }

  const data = await response.json();
  
  // Extract user data
  const userData = data.data;
  if (!userData || userData.type !== 'user') {
    throw new Error('Invalid Patreon identity response');
  }

  const user = {
    id: userData.id,
    email: userData.attributes?.email || '',
    full_name: userData.attributes?.full_name || '',
    image_url: userData.attributes?.image_url,
  };

  // Extract membership data (if user is a patron)
  let membership = null;
  if (data.included) {
    const membershipData = data.included.find(
      (item: any) => item.type === 'member'
    );
    
    if (membershipData) {
      membership = {
        patron_status: membershipData.attributes?.patron_status || null,
        currently_entitled_amount_cents:
          membershipData.attributes?.currently_entitled_amount_cents || 0,
        last_charge_status:
          membershipData.attributes?.last_charge_status || null,
        last_charge_date:
          membershipData.attributes?.last_charge_date || null,
        next_charge_date:
          membershipData.attributes?.next_charge_date || null,
        pledge_cadence: membershipData.attributes?.pledge_cadence || null,
        pledge_relationship_start:
          membershipData.attributes?.pledge_relationship_start || null,
        campaign_lifetime_support_cents:
          membershipData.attributes?.campaign_lifetime_support_cents || 0,
      };
    }
  }

  return { user, membership };
}

/**
 * Calculate Patreon subscription expiration based on cancellation data
 * Handles variable billing cycles (pledge_cadence: 1 = monthly, 12 = annual)
 */
export function calculatePatreonExpiresAt(
  nextChargeDate: string | null,
  lastChargeDate: string | null,
  pledgeCadence: number | null // 1 = monthly, 12 = annual
): { status: 'canceled' | 'expired'; expiresAt: string | null } {
  const now = new Date();

  // Priority 1: Use next_charge_date if available and in the future
  if (nextChargeDate) {
    const nextCharge = new Date(nextChargeDate);
    if (nextCharge > now) {
      return { status: 'canceled', expiresAt: nextChargeDate };
    }
    // next_charge_date is in the past → access has ended
    return { status: 'expired', expiresAt: nextChargeDate };
  }

  // Priority 2: Calculate from last_charge_date + pledge_cadence
  if (lastChargeDate && pledgeCadence) {
    const lastCharge = new Date(lastChargeDate);
    const estimatedEnd = new Date(lastCharge);
    estimatedEnd.setMonth(estimatedEnd.getMonth() + pledgeCadence);

    if (estimatedEnd > now) {
      return { status: 'canceled', expiresAt: estimatedEnd.toISOString() };
    }
    // Calculated end is in the past → access has ended
    return { status: 'expired', expiresAt: estimatedEnd.toISOString() };
  }

  // Priority 3: No date info available → expire immediately
  return { status: 'expired', expiresAt: null };
}

/**
 * Verify Patreon webhook signature using HEX(HMAC-MD5)
 * Patreon uses HMAC-MD5, NOT HMAC-SHA256
 */
export function verifyPatreonWebhook(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) {
    throw new Error('Patreon webhook secret is not configured');
  }

  const expected = crypto
    .createHmac('md5', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

/**
 * Get campaign members (for daily backup poll)
 * Uses creator access token which automatically has all V2 scopes
 */
export async function getCampaignMembers(params?: {
  page?: number;
  pageSize?: number;
}): Promise<{
  members: Array<{
    id: string;
    user_id: string; // Patreon user ID from relationships
    patron_status: string | null;
    email: string;
    full_name: string;
    last_charge_status: string | null;
    last_charge_date: string | null;
    next_charge_date: string | null;
    pledge_cadence: number | null;
    pledge_relationship_start: string | null;
  }>;
  hasMore: boolean;
}> {
  if (!PATREON_CAMPAIGN_ID || !PATREON_CREATOR_ACCESS_TOKEN) {
    throw new Error('Patreon campaign credentials are not configured');
  }

  const page = params?.page || 1;
  const pageSize = params?.pageSize || 25;

  // Build URL with explicit fields parameters
  const url = new URL(
    `${PATREON_API_BASE}/campaigns/${PATREON_CAMPAIGN_ID}/members`
  );
  url.searchParams.set('include', 'user');
  url.searchParams.set(
    'fields[member]',
    'patron_status,email,full_name,last_charge_status,last_charge_date,next_charge_date,pledge_cadence,pledge_relationship_start'
  );
  url.searchParams.set('fields[user]', 'email,full_name');
  url.searchParams.set('page[count]', pageSize.toString());
  url.searchParams.set('page[cursor]', page > 1 ? page.toString() : '');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${PATREON_CREATOR_ACCESS_TOKEN}`,
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Patreon campaign members: ${error}`);
  }

  const data = await response.json();

  // Extract members from response
  const members: Array<{
    id: string;
    user_id: string; // Patreon user ID from relationships
    patron_status: string | null;
    email: string;
    full_name: string;
    last_charge_status: string | null;
    last_charge_date: string | null;
    next_charge_date: string | null;
    pledge_cadence: number | null;
    pledge_relationship_start: string | null;
  }> = [];

  if (data.data) {
    for (const memberItem of data.data) {
      if (memberItem.type === 'member') {
        // Extract Patreon user ID from relationships
        const patreonUserId = memberItem.relationships?.user?.data?.id;
        
        // Find associated user data
        const userItem = data.included?.find(
          (item: any) =>
            item.type === 'user' &&
            patreonUserId === item.id
        );

        members.push({
          id: memberItem.id,
          user_id: patreonUserId || '', // Patreon user ID for matching
          patron_status: memberItem.attributes?.patron_status || null,
          email: userItem?.attributes?.email || '',
          full_name: userItem?.attributes?.full_name || '',
          last_charge_status:
            memberItem.attributes?.last_charge_status || null,
          last_charge_date: memberItem.attributes?.last_charge_date || null,
          next_charge_date: memberItem.attributes?.next_charge_date || null,
          pledge_cadence: memberItem.attributes?.pledge_cadence || null,
          pledge_relationship_start:
            memberItem.attributes?.pledge_relationship_start || null,
        });
      }
    }
  }

  // Check if there are more pages
  const hasMore = !!data.meta?.pagination?.cursors?.next;

  return { members, hasMore };
}

/**
 * Store or update linked Patreon account in database
 */
export async function storeLinkedPatreonAccount(params: {
  userId: string;
  patreonUserId: string;
  patreonEmail: string;
  patreonFullName: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  membership?: {
    patron_status: string | null;
    pledge_cadence: number | null;
    next_charge_date: string | null;
  };
}): Promise<void> {
  const expiresAt = new Date(Date.now() + params.expiresIn * 1000);

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(params.accessToken);
  const encryptedRefreshToken = encryptToken(params.refreshToken);

  const { error } = await supabaseAdmin
    .from('linked_accounts')
    .upsert(
      {
        user_id: params.userId,
        platform: 'patreon',
        external_user_id: params.patreonUserId,
        external_username: params.patreonFullName,
        external_email: params.patreonEmail,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: expiresAt.toISOString(),
        status: 'active',
        last_verified_at: new Date().toISOString(),
        metadata: {
          patron_status: params.membership?.patron_status || null,
          pledge_cadence: params.membership?.pledge_cadence || null,
          next_charge_date: params.membership?.next_charge_date || null,
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,platform',
      }
    );

  if (error) {
    throw new Error(`Failed to store linked Patreon account: ${error.message}`);
  }
}

/**
 * Get and refresh stored Patreon tokens for a user
 */
export async function getPatreonTokens(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('linked_accounts')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('platform', 'patreon')
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  // Decrypt tokens
  const accessToken = decryptToken(data.access_token);
  const refreshToken = data.refresh_token ? decryptToken(data.refresh_token) : null;

  if (!refreshToken) {
    return null;
  }

  // Check if access token needs refresh
  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at) : null;
  const now = new Date();
  const needsRefresh = !expiresAt || expiresAt <= now;

  if (needsRefresh) {
    // Refresh the access token
    const refreshed = await refreshPatreonToken(refreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    // Update stored access token
    const encryptedAccessToken = encryptToken(refreshed.access_token);
    await supabaseAdmin
      .from('linked_accounts')
      .update({
        access_token: encryptedAccessToken,
        token_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', 'patreon');

    return {
      accessToken: refreshed.access_token,
      refreshToken,
    };
  }

  return {
    accessToken,
    refreshToken,
  };
}
