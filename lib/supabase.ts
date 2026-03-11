import { createClient } from '@supabase/supabase-js'
import { publicConfig, serverConfig } from '@/lib/env'

const supabaseUrl = publicConfig.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create clients without strict Database typing to avoid TypeScript conflicts
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// For server-side operations that need elevated permissions.
// Guarded so the service role key is never evaluated in the client bundle.
export const supabaseAdmin = typeof window === 'undefined'
	? createClient(
		supabaseUrl,
		serverConfig.SUPABASE_SERVICE_ROLE_KEY,
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		}
	)
	: null as never;

/**
 * Look up a Supabase auth user by email using the Admin REST API.
 * The Supabase JS SDK (v2) does not expose getUserByEmail — this uses fetch directly.
 * Server-only: requires SUPABASE_SERVICE_ROLE_KEY.
 */
export async function adminGetUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
	const supabaseAdminUrl = serverConfig.SUPABASE_URL;
	const serviceRoleKey = serverConfig.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseAdminUrl || !serviceRoleKey) return null;

	try {
		const response = await fetch(
			`${supabaseAdminUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=10`,
			{
				headers: {
					Authorization: `Bearer ${serviceRoleKey}`,
					apikey: serviceRoleKey,
				},
			}
		);
		if (!response.ok) return null;
		const data = await response.json();
		const users: { id: string; email: string }[] = data.users || [];
		return users.find((u) => u.email === email) ?? null;
	} catch {
		return null;
	}
}
