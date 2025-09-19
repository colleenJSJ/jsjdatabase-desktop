import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';

export async function GET() {
  try {
    console.log('[Medications API] Starting GET request');
    
    const authResult = await getAuthenticatedUser();
    console.log('[Medications API] Auth result:', authResult);
    
    if ('error' in authResult) {
      console.log('[Medications API] Authentication failed');
      return authResult.error;
    }

    const { user, supabase } = authResult;
    console.log('[Medications API] Authenticated user:', user.id, user.email);
    
    const { data: medications, error } = await supabase
      .from('medications')
      .select('*')
      .order('name');

    console.log('[Medications API] Query result:', { medicationsCount: medications?.length, error });

    if (error) {
      console.error('[Medications API] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch medications', details: error.message },
        { status: 500 }
      );
    }

    console.log('[Medications API] Returning medications:', medications?.length || 0);
    return NextResponse.json({ medications: medications || [] });
  } catch (error) {
    console.error('[Medications API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Medications API POST] Starting request');
    
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      console.log('[Medications API POST] Authentication failed');
      return authResult.error;
    }

    const { user, supabase } = authResult;
    console.log('[Medications API POST] Authenticated user:', user.id, user.email);
    
    const data = await request.json();
    console.log('[Medications API POST] Request data:', data);
    
    const { data: medication, error } = await supabase
      .from('medications')
      .insert({
        name: data.name,
        dosage: data.dosage,
        frequency: data.frequency,
        prescribing_doctor: data.prescribing_doctor || null,
        for_user: data.for_user,
        refill_reminder_date: data.refill_reminder_date || null,
        notes: data.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Medications API POST] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to create medication', details: error.message },
        { status: 500 }
      );
    }

    console.log('[Medications API POST] Successfully created medication:', medication.id);
    return NextResponse.json({ medication });
  } catch (error) {
    console.error('[Medications API POST] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}