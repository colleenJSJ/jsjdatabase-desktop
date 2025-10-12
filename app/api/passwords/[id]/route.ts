import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { SupabasePasswordService } from '@/lib/services/supabase-password-service';
import { deletePortalById } from '@/lib/services/portal-password-sync';
import { enforceCSRF } from '@/lib/security/csrf';
import { setEncryptionSessionToken } from '@/lib/encryption/context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    setEncryptionSessionToken(session?.access_token ?? null);
    const passwordService = new SupabasePasswordService(session?.access_token ?? null);
    const password = await passwordService.getPassword(id, user.id);
    
    return NextResponse.json(password);
  } catch (error) {
    console.error('[API/passwords/[id]] Error fetching password:', error);
    return NextResponse.json(
      { error: 'Password not found' },
      { status: 404 }
    );
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
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    const updateData: any = {};
    if (body.service_name !== undefined || body.title !== undefined) {
      updateData.service_name = body.service_name || body.title;
    }
    if (body.username !== undefined) updateData.username = body.username;
    if (body.password !== undefined) updateData.password = body.password;
    if (body.url !== undefined || body.website_url !== undefined) {
      updateData.url = body.url || body.website_url;
    }
    if (body.category !== undefined) updateData.category = body.category;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.is_favorite !== undefined) updateData.is_favorite = body.is_favorite;
    if (body.is_shared !== undefined) updateData.is_shared = body.is_shared;
    if (body.shared_with !== undefined) updateData.shared_with = body.shared_with;

    setEncryptionSessionToken(session?.access_token ?? null);
    const passwordService = new SupabasePasswordService(session?.access_token ?? null);
    const updatedPassword = await passwordService.updatePassword(id, user.id, updateData);

    return NextResponse.json(updatedPassword);
  } catch (error) {
    console.error('[API/passwords/[id]] Error updating password:', error);
    return NextResponse.json(
      { error: 'Failed to update password' },
      { status: 500 }
    );
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
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceSupabase = await createServiceClient();
    const { data: existingPassword } = await serviceSupabase
      .from('passwords')
      .select('id, source_page, source_reference')
      .eq('id', id)
      .maybeSingle();

    setEncryptionSessionToken(session?.access_token ?? null);
    const passwordService = new SupabasePasswordService(session?.access_token ?? null);
    await passwordService.deletePassword(id, user.id);

    if (existingPassword?.source_reference) {
      const sourcePage = (existingPassword.source_page || '').toLowerCase();
      const shouldSync = ['health', 'pets', 'j3-academics', 'j3_academics'].includes(sourcePage);

      if (shouldSync) {
        try {
          await deletePortalById(existingPassword.source_reference);
        } catch (error) {
          console.warn('[Passwords API] Failed to delete linked portal:', error);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API/passwords/[id]] Error deleting password:', error);
    return NextResponse.json(
      { error: 'Failed to delete password' },
      { status: 500 }
    );
  }
}
