import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { enforceCSRF } from '@/lib/security/csrf';

// GET all permissions (admin only)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: any) {
            cookieStore.delete(name)
          },
        },
      }
    );

    // Check if user is authenticated and admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, role')
      .order('name');

    if (usersError) {
      throw usersError;
    }

    // Get all calendars
    const { data: calendars, error: calendarsError } = await supabase
      .from('google_calendars')
      .select('*')
      .order('name');

    if (calendarsError) {
      throw calendarsError;
    }

    // Get all permissions
    const { data: permissions, error: permissionsError } = await supabase
      .from('calendar_permissions')
      .select('*');

    if (permissionsError) {
      throw permissionsError;
    }

    // Create a permission matrix
    const permissionMatrix = users?.map(user => {
      const userPermissions = permissions?.filter(p => p.user_id === user.id) || [];
      const calendarPermissions = calendars?.map(calendar => {
        const permission = userPermissions.find(p => p.google_calendar_id === calendar.google_calendar_id);
        return {
          google_calendar_id: calendar.google_calendar_id,
          calendar_name: calendar.name,
          can_read: permission?.can_read || false,
          can_write: permission?.can_write || false,
          permission_id: permission?.id
        };
      });

      return {
        user_id: user.id,
        user_email: user.email,
        user_name: user.name || user.email,
        user_role: user.role,
        calendars: calendarPermissions
      };
    });

    return NextResponse.json({
      users,
      calendars,
      permissions: permissionMatrix
    });

  } catch (error) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch permissions' },
      { status: 500 }
    );
  }
}

// POST create or update permissions
export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: any) {
            cookieStore.delete(name)
          },
        },
      }
    );

    // Check if user is authenticated and admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, google_calendar_id, can_read, can_write } = body;

    if (!user_id || !google_calendar_id) {
      return NextResponse.json(
        { error: 'user_id and google_calendar_id are required' },
        { status: 400 }
      );
    }

    // If both can_read and can_write are false, delete the permission
    if (!can_read && !can_write) {
      const { error: deleteError } = await supabase
        .from('calendar_permissions')
        .delete()
        .eq('user_id', user_id)
        .eq('google_calendar_id', google_calendar_id);

      if (deleteError) {
        throw deleteError;
      }

      return NextResponse.json({ message: 'Permission removed' });
    }

    // Otherwise, upsert the permission
    const { data, error } = await supabase
      .from('calendar_permissions')
      .upsert({
        user_id,
        google_calendar_id,
        can_read: can_read || false,
        can_write: can_write || false,
        created_by: user.id,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,google_calendar_id'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ 
      message: 'Permission updated',
      permission: data 
    });

  } catch (error) {
    console.error('Error updating permission:', error);
    return NextResponse.json(
      { error: 'Failed to update permission' },
      { status: 500 }
    );
  }
}

// DELETE remove permission
export async function DELETE(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: any) {
            cookieStore.delete(name)
          },
        },
      }
    );

    // Check if user is authenticated and admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const permissionId = searchParams.get('id');

    if (!permissionId) {
      return NextResponse.json(
        { error: 'Permission ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('calendar_permissions')
      .delete()
      .eq('id', permissionId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ message: 'Permission removed' });

  } catch (error) {
    console.error('Error deleting permission:', error);
    return NextResponse.json(
      { error: 'Failed to delete permission' },
      { status: 500 }
    );
  }
}