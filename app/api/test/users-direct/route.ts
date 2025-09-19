import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServiceClient();
    
    // Query 1: Get all users without any filters
    const { data: allUsers, error: allError } = await supabase
      .from('users')
      .select('*');

    // Query 2: Search for Susan specifically
    const { data: susanSearch, error: susanError } = await supabase
      .from('users')
      .select('*')
      .ilike('name', '%susan%');

    // Query 3: Get user by ID
    const { data: susanById, error: idError } = await supabase
      .from('users')
      .select('*')
      .eq('id', '6f0ddcb5-fff8-4c35-aacb-ef60f575cf0c')
      .single();

    return NextResponse.json({
      allUsers: allUsers || [],
      susanSearch: susanSearch || [],
      susanById,
      userCount: allUsers?.length || 0,
      userNames: allUsers?.map(u => u.name) || [],
      errors: {
        allError,
        susanError,
        idError
      }
    });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}