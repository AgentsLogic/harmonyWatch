import { serverConfig } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

/**
 * YouTube Membership Service
 * Handles OAuth, channel ID resolution, and membership verification
 */

const YOUTUBE_CLIENT_ID = serverConfig.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = serverConfig.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_CHANNEL_ID = serverConfig.YOUTUBE_CHANNEL_ID;
const YOUTUBE_REFRESH_TOKEN = serverConfig.YOUTUBE_REFRESH_TOKEN;
const ENCRYPTION_KEY = serverConfig.LINKED_ACCOUNT_ENCRYPTION_KEY;

// YouTube API endpoints
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

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
export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    throw new Error('YouTube OAuth is not configured');
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange YouTube OAuth code: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600, // Default to 1 hour
  };
}

/**
 * Refresh YouTube OAuth access token using refresh token
 */
export async function refreshYouTubeToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    throw new Error('YouTube OAuth is not configured');
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh YouTube token: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
  };
}

/**
 * Get user's YouTube channel ID from their OAuth token
 */
export async function getYouTubeChannelId(accessToken: string): Promise<string> {
  const response = await fetch(
    `${YOUTUBE_API_BASE}/channels?part=id&mine=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get YouTube channel ID: ${error}`);
  }

  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('User does not have a YouTube channel');
  }

  return data.items[0].id;
}

/**
 * Check if channel IDs are members of the YouTube channel
 * Uses filterByMemberChannelId parameter (max 100 channel IDs per call)
 * Returns a Set of channel IDs that are active members
 */
export async function filterByMemberChannelId(
  channelIds: string[]
): Promise<Set<string>> {
  if (!YOUTUBE_CHANNEL_ID || !YOUTUBE_REFRESH_TOKEN) {
    throw new Error('YouTube channel owner credentials are not configured');
  }

  if (channelIds.length === 0) {
    return new Set();
  }

  if (channelIds.length > 100) {
    throw new Error('Cannot check more than 100 channel IDs at once');
  }

  // Get fresh access token for channel owner
  const { access_token } = await refreshYouTubeToken(YOUTUBE_REFRESH_TOKEN);

  // Call members.list with filterByMemberChannelId
  // part=snippet is REQUIRED by the YouTube Members API
  const filterParam = channelIds.join(',');
  const apiUrl = `${YOUTUBE_API_BASE}/members?part=snippet&filterByMemberChannelId=${filterParam}`;
  console.log('[YouTube Members] Checking channel IDs:', channelIds);
  
  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  console.log('[YouTube Members] API response status:', response.status);

  if (!response.ok) {
    const error = await response.text();
    console.error('[YouTube Members] API error response:', error);
    throw new Error(`Failed to check YouTube members: ${error}`);
  }

  const data = await response.json();
  
  // Extract channel IDs from response
  const memberChannelIds = new Set<string>();
  if (data.items) {
    for (const item of data.items) {
      if (item.snippet?.memberDetails?.channelId) {
        memberChannelIds.add(item.snippet.memberDetails.channelId);
      }
    }
  }

  return memberChannelIds;
}

/**
 * Batch check multiple channel IDs (handles >100 IDs by splitting into batches)
 * Returns a Set of channel IDs that are active members
 */
export async function batchFilterByMemberChannelId(
  channelIds: string[]
): Promise<Set<string>> {
  if (channelIds.length === 0) {
    return new Set();
  }

  const allMemberIds = new Set<string>();
  const batchSize = 100;

  // Process in batches of 100
  for (let i = 0; i < channelIds.length; i += batchSize) {
    const batch = channelIds.slice(i, i + batchSize);
    const batchResults = await filterByMemberChannelId(batch);
    batchResults.forEach((id) => allMemberIds.add(id));
  }

  return allMemberIds;
}

/**
 * Store or update linked YouTube account in database
 */
export async function storeLinkedYouTubeAccount(params: {
  userId: string;
  channelId: string;
  channelUsername?: string;
  channelEmail?: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
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
        platform: 'youtube',
        external_user_id: params.channelId,
        external_username: params.channelUsername,
        external_email: params.channelEmail,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: expiresAt.toISOString(),
        status: 'active',
        last_verified_at: new Date().toISOString(),
        metadata: {
          channel_id: params.channelId,
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,platform',
      }
    );

  if (error) {
    throw new Error(`Failed to store linked YouTube account: ${error.message}`);
  }
}

/**
 * Get and refresh stored YouTube tokens for a user
 */
export async function getYouTubeTokens(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('linked_accounts')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('platform', 'youtube')
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
    const refreshed = await refreshYouTubeToken(refreshToken);
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
      .eq('platform', 'youtube');

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
