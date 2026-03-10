import { publicConfig, serverConfig } from '@/lib/env';

// Supabase Configuration
export const supabaseConfig = {
  url: publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRoleKey: serverConfig.SUPABASE_SERVICE_ROLE_KEY,
} as const;

// Mux Configuration
export const muxConfig = {
  tokenId: serverConfig.MUX_TOKEN_ID,
  tokenSecret: serverConfig.MUX_TOKEN_SECRET,
} as const;
