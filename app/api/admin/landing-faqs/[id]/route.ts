import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// PATCH - Update a landing page FAQ
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { question, answer, sort_order } = body;

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (question !== undefined) updateData.question = question;
    if (answer !== undefined) updateData.answer = answer;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    const { data: updatedFaq, error } = await supabase
      .from('landing_page_faqs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating FAQ:', error);
      return NextResponse.json(
        { error: 'Failed to update FAQ'},
        { status: 500 }
      );
    }

    return NextResponse.json({ faq: updatedFaq }, { status: 200 });
  } catch (error) {
    console.error('Error updating FAQ:', error);
    return NextResponse.json(
      { error: 'Failed to update FAQ' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a FAQ from landing page
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or Staff access required' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const { error } = await supabase
      .from('landing_page_faqs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting FAQ:', error);
      return NextResponse.json(
        { error: 'Failed to delete FAQ'},
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    return NextResponse.json(
      { error: 'Failed to delete FAQ' },
      { status: 500 }
    );
  }
}
