import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// GET - Fetch landing page FAQs (public endpoint)
export async function GET(request: NextRequest) {
  try {
    const { data: faqs, error } = await supabase
      .from('landing_page_faqs')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching landing page FAQs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch landing page FAQs' },
        { status: 500 }
      );
    }

    // Return empty array if no FAQs configured
    return NextResponse.json({ faqs: faqs || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching landing page FAQs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch landing page FAQs' },
      { status: 500 }
    );
  }
}
