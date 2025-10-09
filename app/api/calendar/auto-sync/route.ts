import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    const data = await request.json();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { error } = await supabase
      .from('calendar_events')
      .insert({
        title: data.title,
        start_date: data.start_date,
        end_date: data.end_date || data.start_date,
        category: 'academic',
        assigned_to: data.assigned_to,
        location: data.location,
        description: data.description,
        source: 'j3_academics',
        source_reference: `j3_academics:${data.source_id}`,
        color: data.color,
        created_by: user.id,
        created_at: new Date().toISOString()
      });
      
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Calendar auto-sync error:', error);
    return NextResponse.json({ error: 'Failed to sync event' }, { status: 500 });
  }
}
