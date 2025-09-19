import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { data: devices, error } = await supabase
      .from('trusted_devices')
      .select('*')
      .eq('user_id', user.id)
      .order('last_used_at', { ascending: false });

    if (error) {
      console.error('Error fetching trusted devices:', error);
      return NextResponse.json(
        { error: 'Failed to fetch trusted devices' },
        { status: 500 }
      );
    }

    return NextResponse.json({ devices: devices || [] });
  } catch (error) {
    console.error('Unexpected error in trusted-devices GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}