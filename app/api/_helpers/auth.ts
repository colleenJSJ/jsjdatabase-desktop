import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Get full user data
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (userError || !userData) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  return { user: userData, supabase };
}

export async function requireAdmin() {
  const result = await getAuthenticatedUser();
  
  if ('error' in result) {
    return result;
  }

  if (result.user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return result;
}