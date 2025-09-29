import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the accommodation
    const { data: accommodation, error } = await supabase
      .from('travel_accommodations')
      .select(`
        *,
        trip:trips(id, destination, start_date, end_date)
      `)
      .eq('id', id)
      .single();

    if (error || !accommodation) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }

    return NextResponse.json({ accommodation });
  } catch (error) {
    console.error('Error in GET /api/travel-accommodations/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const body = await request.json();

    // Update accommodation data
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Only update provided fields
    if (body.trip_id !== undefined) updateData.trip_id = body.trip_id;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.confirmation_number !== undefined) updateData.confirmation_number = body.confirmation_number;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.check_in !== undefined) updateData.check_in = body.check_in;
    if (body.check_out !== undefined) updateData.check_out = body.check_out;
    if (body.cost !== undefined) updateData.cost = body.cost;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.room_type !== undefined) updateData.room_type = body.room_type;
    if (body.amenities !== undefined) updateData.amenities = body.amenities;
    if (body.contact_info !== undefined) updateData.contact_info = body.contact_info;
    if (body.notes !== undefined) updateData.notes = body.notes;

    // Update accommodation
    const { data: accommodation, error: updateError } = await supabase
      .from('travel_accommodations')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        trip:trips(id, destination, start_date, end_date)
      `)
      .single();

    if (updateError) {
      console.error('Error updating accommodation:', updateError);
      return NextResponse.json({ error: 'Failed to update accommodation' }, { status: 500 });
    }

    if (!accommodation) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }

    return NextResponse.json({ accommodation });
  } catch (error) {
    console.error('Error in PUT /api/travel-accommodations/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    // Delete the accommodation
    const { error: deleteError } = await supabase
      .from('travel_accommodations')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting accommodation:', deleteError);
      return NextResponse.json({ error: 'Failed to delete accommodation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/travel-accommodations/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}