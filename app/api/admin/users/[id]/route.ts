import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const supabase = await createClient();
    
    // Get the current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the current user's data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { role, user_status, name, email, password } = body;

    // supabase client already created above

    // First, let's check if this user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('id', resolvedParams.id)
      .single();

    if (checkError) {
      console.error(`[Admin Users API] User ${resolvedParams.id} not found:`, checkError);
      return NextResponse.json(
        { error: 'User not found', details: checkError.message, userId: resolvedParams.id },
        { status: 404 }
      );
    }

    // Prevent editing other admins (only allow self-edit for admins)
    if (existingUser.role === 'admin' && existingUser.id !== user.id) {
      return NextResponse.json(
        { error: 'Cannot edit other admin users' },
        { status: 403 }
      );
    }

    // Build update object
    const updateData: any = {
      role,
      user_status,
      updated_at: new Date().toISOString()
    };

    // Only update name and email if provided
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', resolvedParams.id)
      .select()
      .single();

    if (error) {
      console.error(`[Admin Users API] Error updating user ${resolvedParams.id}:`, {
        error,
        userId: resolvedParams.id,
        attemptedUpdate: { role }
      });
      return NextResponse.json(
        { error: 'Failed to update user', details: error.message, code: error.code, hint: error.hint },
        { status: 500 }
      );
    }

    // Update password if provided (requires admin client)
    if (password) {
      const adminClient = await createServiceClient();
      const { error: authError } = await adminClient.auth.admin.updateUserById(
        resolvedParams.id,
        { password }
      );
      
      if (authError) {
        console.error(`[Admin Users API] Error updating password for user ${resolvedParams.id}:`, authError);
        return NextResponse.json(
          { error: 'Failed to update password', details: authError.message },
          { status: 500 }
        );
      }
    }

    // Update email in auth if changed
    if (email && email !== existingUser.email) {
      const adminClient = await createServiceClient();
      const { error: authError } = await adminClient.auth.admin.updateUserById(
        resolvedParams.id,
        { email }
      );
      
      if (authError) {
        console.error(`[Admin Users API] Error updating auth email for user ${resolvedParams.id}:`, authError);
        // Revert database changes if auth update fails
        await supabase
          .from('users')
          .update({ email: existingUser.email })
          .eq('id', resolvedParams.id);
        
        return NextResponse.json(
          { error: 'Failed to update email', details: authError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
