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
