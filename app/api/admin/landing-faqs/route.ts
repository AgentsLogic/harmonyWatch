import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// GET - Fetch all landing page FAQs
export async function GET(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

    const { data: faqs, error } = await supabase
      .from('landing_page_faqs')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching landing page FAQs:', error);
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { 
            error: 'Database table not found. Please run the migration: database-migrations/add-landing-page-faqs.sql'
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to fetch landing page FAQs'},
        { status: 500 }
      );
    }

    return NextResponse.json({ faqs: faqs || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching landing page FAQs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch landing page FAQs' },
      { status: 500 }
    );
  }
}

// POST - Add a FAQ to landing page
export async function POST(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { question, answer, sort_order } = body;

    if (!question || !answer) {
      return NextResponse.json(
        { error: 'question and answer are required' },
        { status: 400 }
      );
    }

    // Get max sort_order to append at end if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const { data: maxOrder } = await supabase
        .from('landing_page_faqs')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();
      
      finalSortOrder = maxOrder ? (maxOrder.sort_order + 1) : 0;
    }

    const { data: newFaq, error } = await supabase
      .from('landing_page_faqs')
      .insert({
        question,
        answer,
        sort_order: finalSortOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating FAQ:', error);
      return NextResponse.json(
        { error: 'Failed to create FAQ'},
        { status: 500 }
      );
    }

    return NextResponse.json({ faq: newFaq }, { status: 201 });
  } catch (error) {
    console.error('Error creating FAQ:', error);
    return NextResponse.json(
      { error: 'Failed to create FAQ' },
      { status: 500 }
    );
  }
}
