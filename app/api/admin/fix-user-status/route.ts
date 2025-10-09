import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/app/api/_helpers/auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    
    if ('error' in authResult) {
      return authResult.error;
    }

    const supabase = await createServiceClient();
    
    // First, check current status
    const { data: currentUsers, error: checkError } = await supabase
      .from('users')
      .select('id, name, email, is_active');

    if (checkError) {

      return NextResponse.json(
        { error: 'Failed to check users', details: checkError.message },
        { status: 500 }
      );
    }

    // Update all users to active - using a simpler approach
    const userIds = currentUsers?.map(u => u.id) || [];
    
    if (userIds.length === 0) {
      return NextResponse.json(
        { error: 'No users found to update' },
        { status: 400 }
      );
    }

    // Update each user individually to avoid potential issues
    for (const userId of userIds) {
      const { error } = await supabase
        .from('users')
        .update({ is_active: true })
        .eq('id', userId);
      
      if (error) {
        console.error(`[Fix User Status] Error updating user ${userId}:`, error);
        return NextResponse.json(
          { error: `Failed to update user ${userId}`, details: error.message },
          { status: 500 }
        );
      }
    }

    // Verify the update
    const { data: updatedUsers, error: verifyError } = await supabase
      .from('users')
      .select('id, name, email, is_active');

    if (verifyError) {

      return NextResponse.json(
        { error: 'Failed to verify update', details: verifyError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: 'All users have been set to active',
      users: updatedUsers
    });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
