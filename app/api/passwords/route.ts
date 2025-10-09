import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SupabasePasswordService } from '@/lib/services/supabase-password-service';
import { PasswordFilter } from '@/lib/services/password-service-interface';
import { authenticateRequest } from '@/lib/utils/auth-middleware';
import { resolveFamilyMemberToUser, resolveCurrentUserToFamilyMember } from '@/app/api/_helpers/person-resolver';
import { enforceCSRF } from '@/lib/security/csrf';

const passwordService = new SupabasePasswordService();

export async function GET(request: NextRequest) {
  console.log('[API/passwords] GET request received');
  
  try {
    // Use the new auth middleware
    const auth = await authenticateRequest(request, false, { skipCSRF: true });
    console.log('[API/passwords] Auth result:', { authenticated: auth.authenticated, userId: auth.user?.id });
    
    if (!auth.authenticated) {
      console.log('[API/passwords] Authentication failed, returning:', auth.error);
      return auth.response!;
    }
    
    const user = auth.user!;

    const searchParams = request.nextUrl.searchParams;
    const filter: PasswordFilter = {};

    // Handle person filtering
    let selectedPerson = searchParams.get('selected_person');
    if (selectedPerson) {
      // Normalize 'me' to current user's family_member.id
      if (selectedPerson === 'me') {
        const familyMemberId = await resolveCurrentUserToFamilyMember(user.id);
        selectedPerson = familyMemberId;
      }
      
      // Resolve family_member.id to user.id for owner_id filtering
      if (selectedPerson) {
        const userId = await resolveFamilyMemberToUser(selectedPerson);
        if (userId) {
          filter.owner_id = userId;
        }
      }
    }

    if (searchParams.get('category')) {
      filter.category = searchParams.get('category')!;
    }
    if (searchParams.get('owner_id') && !selectedPerson) {
      filter.owner_id = searchParams.get('owner_id')!;
    }
    if (searchParams.get('is_shared')) {
      filter.is_shared = searchParams.get('is_shared') === 'true';
    }
    if (searchParams.get('is_favorite')) {
      filter.is_favorite = searchParams.get('is_favorite') === 'true';
    }
    if (searchParams.get('search')) {
      filter.search = searchParams.get('search')!;
    }
    if (searchParams.get('strength')) {
      filter.strength = searchParams.get('strength') as any;
    }

    const passwords = await passwordService.getPasswords(user.id, filter);
    console.log('[API/passwords] Found', passwords.length, 'passwords for user', user.id);

    return NextResponse.json({
      passwords,
      total: passwords.length,
      source: 'local'
    });
  } catch (error) {
    console.error('[API/passwords] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch passwords' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    // Use the new auth middleware
    const auth = await authenticateRequest(request, false, { skipCSRF: true });
    if (!auth.authenticated) {
      return auth.response!;
    }
    
    const user = auth.user!;

    const body = await request.json();
    
    // Convert family member IDs to user IDs for owner and shared_with
    let ownerId = body.owner_id || user.id;
    let sharedWith: string[] = [];

    // If owner_id is a family member ID, convert to user ID
    if (body.owner_id && body.owner_id !== 'shared') {
      const ownerUserId = await resolveFamilyMemberToUser(body.owner_id);
      ownerId = ownerUserId || user.id;
    }
    
    // Convert shared_with family member IDs to user IDs
    if (body.shared_with && Array.isArray(body.shared_with)) {
      for (const familyMemberId of body.shared_with) {
        const userId = await resolveFamilyMemberToUser(familyMemberId);
        if (userId) {
          sharedWith.push(userId);
        }
      }
    }
    
    const passwordData = {
      title: body.title || body.service_name || 'Untitled',  // Ensure title is always set
      service_name: body.service_name || body.title,
      username: body.username,
      password: body.password,
      url: body.url || body.website_url,
      website_url: body.website_url || body.url,  // Also set website_url
      category: body.category || 'other',
      notes: body.notes,
      tags: body.tags || [],
      owner_id: ownerId,
      is_favorite: body.is_favorite || false,
      is_shared: body.is_shared || body.owner_id === 'shared' || sharedWith.length > 0,
      shared_with: sharedWith
    };
    
    console.log('[API/passwords] Creating password with data:', {
      ...passwordData,
      password: '[REDACTED]',
      notes: passwordData.notes ? '[REDACTED]' : null
    });

    const newPassword = await passwordService.createPassword(passwordData);

    return NextResponse.json(newPassword, { status: 201 });
  } catch (error) {
    console.error('[API/passwords] Error creating password:', error);
    console.error('[API/passwords] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to create password';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
