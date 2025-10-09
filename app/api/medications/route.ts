import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';
import { resolveFamilyMemberToUser, resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';

export async function GET(request: NextRequest) {
  try {
    console.log('[Medications API] Starting GET request');

    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      console.log('[Medications API] Authentication failed');
      return authResult;
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
      return jsonError('Failed to fetch medications', {
        status: 500,
        meta: { message: error.message },
      });
    }

    const medicationsList = medications || [];

    // Map stored user IDs back to family member IDs for UI compatibility
    let normalizedMedications = medicationsList;
    const userIds = Array.from(
      new Set(
        medicationsList
          .map(med => med.for_user)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (userIds.length > 0) {
      const { data: familyMembers, error: familyMemberError } = await supabase
        .from('family_members')
        .select('id, user_id')
        .in('user_id', userIds);

      if (familyMemberError) {
        console.warn('[Medications API] Failed to resolve family members for medications', familyMemberError);
      } else if (familyMembers) {
        const userToFamily = new Map<string, string>();
        familyMembers.forEach(member => {
          if (member.user_id && member.id) {
            userToFamily.set(member.user_id, member.id);
          }
        });

        normalizedMedications = medicationsList.map(medication => {
          const mappedFamilyId = medication.for_user ? userToFamily.get(medication.for_user) : null;
          return {
            ...medication,
            for_user: mappedFamilyId ?? medication.for_user,
          };
        });
      }
    }

    console.log('[Medications API] Returning medications:', normalizedMedications.length);
    const data = { medications: normalizedMedications };
    return jsonSuccess(data, { legacy: data });
  } catch (error) {
    console.error('[Medications API] Unexpected error:', error);
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
    console.log('[Medications API POST] Starting request');

    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      console.log('[Medications API POST] Authentication failed');
      return authResult;
    }

    const { user, supabase } = authResult;
    console.log('[Medications API POST] Authenticated user:', user.id, user.email);
    
    const data = await request.json();
    console.log('[Medications API POST] Request data:', data);
    
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
      .insert({
        name: data.name,
        dosage: data.dosage,
        frequency: data.frequency,
        prescribing_doctor: data.prescribing_doctor || null,
        for_user: forUserId,
        refill_reminder_date: data.refill_reminder_date || null,
        notes: data.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Medications API POST] Database error:', error);
      return jsonError('Failed to create medication', {
        status: 500,
        meta: { message: error.message },
      });
    }

    console.log('[Medications API POST] Successfully created medication:', medication.id);

    let responseMedication = medication;
    if (medication?.for_user) {
      const familyMemberId = await resolveCurrentUserToFamilyMember(medication.for_user);
      responseMedication = {
        ...medication,
        for_user: familyMemberId ?? originalForUser ?? medication.for_user,
      };
    }

    return jsonSuccess({ medication: responseMedication }, {
      status: 201,
      legacy: { medication: responseMedication },
    });
  } catch (error) {
    console.error('[Medications API POST] Unexpected error:', error);
    return jsonError('Internal server error', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
