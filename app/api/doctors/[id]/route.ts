import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, requireAdmin } from '@/app/api/_helpers/auth';
import { encrypt, decrypt } from '@/lib/encryption';
import { syncDoctorToContacts, removeUnifiedContact } from '@/app/api/_helpers/contact-sync';
import { ensurePortalAndPassword } from '@/lib/services/portal-password-sync';

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
    const data = await request.json();
    
    const { data: doctor, error } = await supabase
      .from('doctors')
      .update({
        name: data.name,
        specialty: data.specialty,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        website: data.website || null,
        portal_url: data.portal_url || null,
        portal_username: data.portal_username || null,
        portal_password: data.portal_password ? encrypt(data.portal_password) : null,
        patients: data.patients || [],
        notes: data.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update doctor' },
        { status: 500 }
      );
    }

    // Sync to unified contacts table
    await syncDoctorToContacts({
      ...doctor,
      portal_password: data.portal_password // Use original unencrypted password
    });

    // Sync portal and password if portal credentials provided
    if (data.portal_url && data.portal_username && data.portal_password) {
      console.log('[Doctors API PUT] Syncing portal and password');
      
      // Import person resolver to convert family member IDs to user IDs
      const { resolveFamilyMemberToUser } = await import('@/app/api/_helpers/person-resolver');
      
      // Determine owner and shared_with from patients array
      const patients = data.patients || [];
      
      // Convert family member IDs to user IDs
      let ownerId = user.id; // Default to current user
      let sharedWith: string[] = [];
      
      console.log('[Doctors API PUT] Patients array:', patients);
      console.log('[Doctors API PUT] Current user ID:', user.id);
      
      if (patients.length > 0) {
        // Convert first patient (family member ID) to user ID for owner
        console.log('[Doctors API PUT] Converting first patient to owner:', patients[0]);
        const firstPatientUserId = await resolveFamilyMemberToUser(patients[0]);
        console.log('[Doctors API PUT] Resolved patient user ID:', firstPatientUserId);
        
        if (firstPatientUserId) {
          ownerId = firstPatientUserId;
          console.log('[Doctors API PUT] Set owner ID to patient:', ownerId);
        } else {
          console.log('[Doctors API PUT] Could not resolve patient to user, using current user as owner');
        }
        
        // Convert remaining patients to user IDs for shared_with
        for (const patientId of patients.slice(1)) {
          const userId = await resolveFamilyMemberToUser(patientId);
          if (userId) {
            sharedWith.push(userId);
          }
        }
      } else {
        console.log('[Doctors API PUT] No patients specified, using current user as owner');
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
        console.error('[Doctors API PUT] Portal sync failed:', syncResult.error);
        // Don't fail the whole request, just log the error
      } else {
        console.log('[Doctors API PUT] Portal sync successful:', {
          portalId: syncResult.portal?.id,
          passwordId: syncResult.password?.id
        });
      }
    }

    // Decrypt password before returning
    const decryptedDoctor = {
      ...doctor,
      portal_password: doctor.portal_password ? decrypt(doctor.portal_password) : null
    };
    
    return NextResponse.json({ doctor: decryptedDoctor });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
    
    console.log('[Doctors API DELETE] Starting deletion for doctor:', id);
    
    // Import the cleanup function
    const { deletePortalAndPassword } = await import('@/lib/services/portal-password-sync');
    
    // Delete associated portals and passwords
    const cleanupResult = await deletePortalAndPassword('medical', id);
    
    if (!cleanupResult.success) {
      console.error('[Doctors API DELETE] Portal/password cleanup failed:', cleanupResult.error);
      // Continue with doctor deletion even if cleanup partially fails
    } else {
      console.log('[Doctors API DELETE] Cleanup successful:', {
        portals: cleanupResult.deletedPortals,
        passwords: cleanupResult.deletedPasswords
      });
    }
    
    // Remove from unified contacts
    await removeUnifiedContact('health', id);

    // Finally, delete the doctor
    console.log('[Doctors API DELETE] Deleting doctor:', id);
    const { error } = await supabase
      .from('doctors')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Doctors API DELETE] Failed to delete doctor:', error);
      return NextResponse.json(
        { error: 'Failed to delete doctor' },
        { status: 500 }
      );
    }

    console.log('[Doctors API DELETE] Successfully deleted doctor and related records');
    return NextResponse.json({ success: true });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}