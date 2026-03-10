import { NextRequest, NextResponse } from 'next/server';
import { carouselService } from '@/lib/services/carouselService';

export async function GET(request: NextRequest) {
  try {
    const items = await carouselService.getCarouselItems();
    // Add caching headers for better performance
    // Cache for 5 minutes, but allow revalidation
    const headers = {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    };
    return NextResponse.json({ items }, { status: 200, headers });
  } catch (error) {
    console.error('Error fetching carousel items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch carousel items' },
      { status: 500 }
    );
  }
}

