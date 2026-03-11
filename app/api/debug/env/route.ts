import { NextRequest, NextResponse } from 'next/server';
import { publicConfig } from '@/lib/env';
import { verifyAdmin } from '@/lib/utils/admin-auth';

/**
 * Debug endpoint to check environment variables
 * Restricted to admin users only
 */
export async function GET(request: NextRequest) {
  const { error, status } = await verifyAdmin(request);
  if (error) {
    return NextResponse.json({ error }, { status });
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
      processEnv: process.env.NEXT_PUBLIC_REVENUECAT_API_KEY ? 'SET' : 'NOT SET',
      preview: process.env.NEXT_PUBLIC_REVENUECAT_API_KEY
        ? `${process.env.NEXT_PUBLIC_REVENUECAT_API_KEY.substring(0, 8)}...`
        : null,
    },
    note: 'NEXT_PUBLIC_* variables are embedded at build time. If variable was added after build, redeploy is required.',
  });
}
