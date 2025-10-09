import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { supabase } = authResult;

    const { data: accommodation, error } = await supabase
      .from('travel_accommodations')
      .select(`
        *,
        trip:trips(id, destination, start_date, end_date)
      `)
      .eq('id', id)
      .single();

    if (error || !accommodation) {
      return jsonError('Accommodation not found', { status: 404 });
    }

    return jsonSuccess({ accommodation }, { legacy: { accommodation } });
  } catch (error) {
    console.error('Error in GET /api/travel-accommodations/[id]:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { supabase } = authResult;

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
      return jsonError('Failed to update accommodation', { status: 500 });
    }

    if (!accommodation) {
      return jsonError('Accommodation not found', { status: 404 });
    }

    return jsonSuccess({ accommodation }, { legacy: { accommodation } });
  } catch (error) {
    console.error('Error in PUT /api/travel-accommodations/[id]:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  try {
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { supabase } = authResult;

    const { error: deleteError } = await supabase
      .from('travel_accommodations')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting accommodation:', deleteError);
      return jsonError('Failed to delete accommodation', { status: 500 });
    }

    return jsonSuccess({ deleted: true }, { legacy: { success: true } });
  } catch (error) {
    console.error('Error in DELETE /api/travel-accommodations/[id]:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
