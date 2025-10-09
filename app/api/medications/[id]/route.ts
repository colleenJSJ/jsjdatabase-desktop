import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';
import { resolveFamilyMemberToUser, resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';

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

    const data = await request.json();

    const originalForUser = data.for_user;
    let forUserId: string | null = null;

    if (originalForUser) {
      const resolvedUserId = await resolveFamilyMemberToUser(originalForUser);

      if (resolvedUserId) {
        forUserId = resolvedUserId;
      } else {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', originalForUser)
          .maybeSingle();

        if (existingUser?.id) {
          forUserId = existingUser.id;
        } else {
          return jsonError('Selected family member is not linked to a user account', { status: 400 });
        }
      }
    }

    if (!forUserId) {
      return jsonError('A valid family member must be selected', { status: 400 });
    }

    const { data: medication, error } = await supabase
      .from('medications')
      .update({
        name: data.name,
        dosage: data.dosage,
        frequency: data.frequency,
        prescribing_doctor: data.prescribing_doctor || null,
        for_user: forUserId,
        refill_reminder_date: data.refill_reminder_date || null,
        notes: data.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return jsonError('Failed to update medication', {
        status: 500,
        meta: { message: error.message },
      });
    }

    let responseMedication = medication;
    if (medication?.for_user) {
      const familyMemberId = await resolveCurrentUserToFamilyMember(medication.for_user);
      responseMedication = {
        ...medication,
        for_user: familyMemberId ?? originalForUser ?? medication.for_user,
      };
    }

    return jsonSuccess({ medication: responseMedication }, { legacy: { medication: responseMedication } });
  } catch (error) {
    return jsonError('Internal server error', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
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
    
    const { error } = await supabase
      .from('medications')
      .delete()
      .eq('id', id);

    if (error) {
      return jsonError('Failed to delete medication', {
        status: 500,
        meta: { message: error.message },
      });
    }

    return jsonSuccess({ deleted: true }, {
      legacy: { success: true },
    });
  } catch (error) {
    return jsonError('Internal server error', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
