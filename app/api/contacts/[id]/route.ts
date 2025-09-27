import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/app/api/_helpers/auth';
import { sanitizeContactPayload } from '@/app/api/_helpers/contact-normalizer';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    // Fetch contact by ID from unified table
    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }
      console.error('Error fetching contact:', error);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error, endpoint: `/api/contacts/${id}`, entityType: 'contact', entityId: id, page: 'household' });
      } catch {}
      return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Error in GET /api/contacts/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    const body = await request.json();
    const sanitized = sanitizeContactPayload(body);

    const updateData: Record<string, unknown> = {
      name: sanitized.name,
      company: sanitized.company,
      category: sanitized.category ?? 'Other',
      contact_subtype: sanitized.contact_subtype,
      emails: sanitized.emails,
      email: sanitized.email,
      phones: sanitized.phones,
      phone: sanitized.phone,
      addresses: sanitized.addresses,
      address: sanitized.address,
      tags: sanitized.tags,
      related_to: sanitized.related_to,
      assigned_entities: sanitized.assigned_entities,
      pets: sanitized.pets,
      trip_id: sanitized.trip_id,
      source_type: sanitized.source_type ?? 'other',
      source_page: sanitized.source_page ?? 'contacts',
      source_id: sanitized.source_id,
      notes: sanitized.notes,
      website: sanitized.website,
      portal_url: sanitized.portal_url,
      portal_username: sanitized.portal_username,
      is_emergency: sanitized.is_emergency,
      is_preferred: sanitized.is_preferred,
      is_favorite: sanitized.is_favorite,
      is_archived: sanitized.is_archived,
      updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, 'portal_password')) {
      if (!sanitized.portal_password) {
        updateData.portal_password = null;
      } else {
        const { encrypt } = await import('@/lib/encryption');
        updateData.portal_password = await encrypt(sanitized.portal_password);
      }
    }

    // Update contact in unified table
    const { data: contact, error } = await supabase
      .from('contacts_unified')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }
      console.error('Error updating contact:', error);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error, endpoint: `/api/contacts/${id}`, entityType: 'contact', entityId: id, page: 'household' });
      } catch {}
      return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Error in PUT /api/contacts/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const authResult = await getAuthenticatedUser();
    if ('error' in authResult) {
      return authResult.error;
    }

    const { user, supabase } = authResult;

    // Check if user is admin or creator
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user role:', userError);
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 });
    }

    // Get the contact to check creator from unified table
    const { data: contact, error: fetchError } = await supabase
      .from('contacts_unified')
      .select('created_by')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
    }

    // Check permissions
    if (userRecord.role !== 'admin' && contact.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete contact from unified table
    const { error } = await supabase
      .from('contacts_unified')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting contact:', error);
      try {
        const { logRlsDenied } = await import('@/lib/utils/db-telemetry');
        await logRlsDenied({ userId: user.id, error, endpoint: `/api/contacts/${id}`, entityType: 'contact', entityId: id, page: 'household' });
      } catch {}
      return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/contacts/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
