import { NextRequest } from 'next/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { encrypt, decrypt } from '@/lib/encryption';
import { syncDoctorToContacts } from '@/app/api/_helpers/contact-sync';
import { ensurePortalAndPassword } from '@/lib/services/portal-password-sync';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    console.log('[Doctors API] Starting GET request');
    
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      console.log('[Doctors API] Authentication failed');
      return authResult;
    }

    const { user, supabase } = authResult;
    console.log('[Doctors API] Authenticated user:', user.id, user.email);
    
    const { data: doctors, error } = await supabase
      .from('doctors')
      .select('*')
      .order('name');

    console.log('[Doctors API] Query result:', { doctorsCount: doctors?.length, error });

    if (error) {
      console.error('[Doctors API] Database error:', error);
      return jsonError('Failed to fetch doctors', {
        status: 500,
        meta: { message: error.message },
      });
    }

    // Decrypt passwords for each doctor
    console.log('[Doctors API] Decrypting portal passwords');
    const decryptedDoctors = await Promise.all(
      (doctors || []).map(async (doctor) => {
        try {
          return {
            ...doctor,
            portal_password: doctor.portal_password ? await decrypt(doctor.portal_password) : null,
          };
        } catch (decryptError) {
          console.error('[Doctors API] Error decrypting password for doctor:', doctor.id, decryptError);
          return {
            ...doctor,
            portal_password: null,
          };
        }
      })
    );

    console.log('[Doctors API] Returning doctors:', decryptedDoctors.length);
    return jsonSuccess({ doctors: decryptedDoctors }, {
      legacy: { doctors: decryptedDoctors },
    });
  } catch (error) {
    console.error('[Doctors API] Unexpected error:', error);
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
    console.log('[Doctors API POST] Starting request');
    
    const authResult = await requireUser(request, { enforceCsrf: false, role: 'admin' });
    if (authResult instanceof Response) {
      console.log('[Doctors API POST] Authentication failed');
      return authResult;
    }

    const { user, supabase } = authResult;
    console.log('[Doctors API POST] Authenticated user:', user.id, user.email);
    
    const data = await request.json();
    console.log('[Doctors API POST] Request data:', {
      ...data,
      portal_password: data.portal_password ? '[REDACTED]' : null
    });
    
    const { data: doctor, error } = await supabase
      .from('doctors')
      .insert({
        name: data.name,
        specialty: data.specialty,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        website: data.website || null,
        portal_url: data.portal_url || null,
        portal_username: data.portal_username || null,
        portal_password: data.portal_password ? await encrypt(data.portal_password) : null,
        patients: data.patients || [],
        notes: data.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Doctors API POST] Database error:', error);
      return jsonError('Failed to create doctor', {
        status: 500,
        meta: { message: error.message },
      });
    }

    console.log('[Doctors API POST] Successfully created doctor:', doctor.id);

    // Sync to unified contacts table
    await syncDoctorToContacts({
      ...doctor,
      portal_password: data.portal_password // Use original unencrypted password
    });

    // Sync portal and password if portal credentials provided
    if (data.portal_url && data.portal_username && data.portal_password) {
      console.log('[Doctors API POST] Syncing portal and password');
      
      // Import person resolver to convert family member IDs to user IDs
      const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');
      
      // Determine owner and shared_with from patients array
      const patients = data.patients || [];
      
      // Convert family member IDs to user IDs
      let ownerId = user.id; // Default to current user
      let sharedWith: string[] = [];
      
      console.log('[Doctors API POST] Patients array:', patients);
      console.log('[Doctors API POST] Current user ID:', user.id);
      
      if (patients.length > 0) {
        // Convert first patient (family member ID) to user ID for owner
        console.log('[Doctors API POST] Converting first patient to owner:', patients[0]);
        const firstPatientUserId = await resolveFamilyMemberToUser(patients[0]);
        console.log('[Doctors API POST] Resolved patient user ID:', firstPatientUserId);
        
        if (firstPatientUserId) {
          ownerId = firstPatientUserId;
          console.log('[Doctors API POST] Set owner ID to patient:', ownerId);
        } else {
          console.log('[Doctors API POST] Could not resolve patient to user, using current user as owner');
        }
        
        // Convert remaining patients to user IDs for shared_with
        for (const patientId of patients.slice(1)) {
          const userId = await resolveFamilyMemberToUser(patientId);
          if (userId) {
            sharedWith.push(userId);
          }
        }
      } else {
        console.log('[Doctors API POST] No patients specified, using current user as owner');
      }
      
      const syncResult = await ensurePortalAndPassword({
        providerType: 'medical',
        providerId: doctor.id,
        providerName: data.name,
        portal_url: data.portal_url,
        portal_username: data.portal_username,
        portal_password: data.portal_password,
        ownerId,
        sharedWith,
        createdBy: user.id,
        notes: `Portal credentials for Dr. ${data.name}`,
        source: 'medical'
      });
      
      if (!syncResult.success) {
        console.error('[Doctors API POST] Portal sync failed:', syncResult.error);
        // Don't fail the whole request, just log the error
      } else {
        console.log('[Doctors API POST] Portal sync successful:', {
          portalId: syncResult.portal?.id,
          passwordId: syncResult.password?.id
        });
      }
    }

    // Decrypt password before returning
    const decryptedDoctor = {
      ...doctor,
      portal_password: doctor.portal_password ? await decrypt(doctor.portal_password) : null,
    };
    
    return jsonSuccess({ doctor: decryptedDoctor }, {
      status: 201,
      legacy: { doctor: decryptedDoctor },
    });
  } catch (error) {
    console.error('[Doctors API POST] Unexpected error:', error);
    return jsonError('Internal server error', {
      status: 500,
      meta: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
