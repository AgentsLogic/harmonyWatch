import { NextResponse } from 'next/server';
import { publicConfig } from '@/lib/env';

/**
 * Debug endpoint to check environment variables
 * Only available in development or with special header
 */
export async function GET(request: Request) {
  // Only allow in development or with debug header
  const debugHeader = request.headers.get('x-debug-env');
  const isDev = process.env.NODE_ENV === 'development';
  
  if (!isDev && debugHeader !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  return NextResponse.json({
    revenueCatApiKey: {
      fromPublicConfig: publicConfig.NEXT_PUBLIC_REVENUECAT_API_KEY ? 'SET' : 'NOT SET',
      preview: publicConfig.NEXT_PUBLIC_REVENUECAT_API_KEY 
        ? `${publicConfig.NEXT_PUBLIC_REVENUECAT_API_KEY.substring(0, 8)}...`
        : null,
      length: publicConfig.NEXT_PUBLIC_REVENUECAT_API_KEY?.length || 0,
    },
    buildTime: {
      // Check if available at build time (this is what gets embedded)
      processEnv: process.env.NEXT_PUBLIC_REVENUECAT_API_KEY ? 'SET' : 'NOT SET',
      preview: process.env.NEXT_PUBLIC_REVENUECAT_API_KEY
        ? `${process.env.NEXT_PUBLIC_REVENUECAT_API_KEY.substring(0, 8)}...`
        : null,
    },
    note: 'NEXT_PUBLIC_* variables are embedded at build time. If variable was added after build, redeploy is required.',
  });
}

