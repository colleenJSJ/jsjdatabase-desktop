import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { syncAcademicContactToUnified } from '@/app/api/_helpers/contact-sync';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { searchParams } = new URL(request.url);
    const childId = searchParams.get('child_id');

    const supabase = await createServiceClient();

    let query = supabase.from('j3_academics_contacts').select('*');

    if (childId && childId !== 'all') {
      query = query.eq('child_id', childId);
    }

    const { data, error } = await query.order('contact_name');

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return jsonSuccess({ contacts: [] }, { legacy: [] });
      }

      console.error('[API/j3-academics/contacts] Error:', error);
      return jsonError('Failed to fetch contacts', {
        status: 500,
        meta: { message: error.message },
      });
    }

    const contacts = data || [];
    return jsonSuccess({ contacts }, { legacy: contacts });
  } catch (error) {
    console.error('[API/j3-academics/contacts] Error:', error);
    return jsonError('Internal server error', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      return authResult;
    }

    const data = await request.json();
    const supabase = await createServiceClient();

    const { data: contact, error } = await supabase
      .from('j3_academics_contacts')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[API/j3-academics/contacts] Error:', error);
      return jsonError('Failed to create contact', {
        status: 500,
        meta: { message: error.message },
      });
    }

    // Sync to unified contacts table
    await syncAcademicContactToUnified(contact);

    return jsonSuccess({ contact }, {
      status: 201,
      legacy: { contact },
    });
  } catch (error) {
    console.error('[API/j3-academics/contacts] Error:', error);
    return jsonError('Internal server error', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
