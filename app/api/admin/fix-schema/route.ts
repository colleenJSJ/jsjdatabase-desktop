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
    
    // Check if column already exists
    const { data: checkResult, error: checkError } = await supabase
      .rpc('to_regclass', { entity: 'users' })
      .single();

    // Try to add the column
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = 'is_active'
          ) THEN
            ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
            UPDATE users SET is_active = true WHERE is_active IS NULL;
          END IF;
        END $$;
      `
    });

    if (alterError) {
      // If the above fails, try a simpler approach

      // Just try to update all users with is_active = true
      // This will fail if column doesn't exist, but that's ok
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_active: true })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (updateError && updateError.message.includes('does not exist')) {
        return NextResponse.json({
          error: 'Column is_active does not exist',
          solution: 'Please run the migration: 20240815000000_add_is_active_to_users.sql',
          details: updateError.message
        }, { status: 400 });
      }
    }

    // Verify the update
    const { data: users, error: verifyError } = await supabase
      .from('users')
      .select('id, name, email, is_active');

    if (verifyError) {
      return NextResponse.json({
        error: 'Failed to verify update',
        details: verifyError.message,
        hint: 'The is_active column may not exist. Please run the migration.'
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Schema fixed and all users set to active',
      users
    });
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
